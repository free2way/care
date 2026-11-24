import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { randomBytes, createHash, scryptSync, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import webpush from "web-push";
import { createDatabase } from "./src/server/database.mjs";
import { readStoredCheckupImage, storeCheckupImage } from "./src/server/storage.mjs";
import {
  SUPPORTED_WEBHOOK_CHANNELS,
  dispatchUrgentSmsGateway,
  maskWebhook,
  normalizeChannelWebhook,
  postWebhookChannel,
} from "./src/server/channels.mjs";
import {
  addDaysToIsoDate,
  analyzeBloodPressure,
  analyzeFraud,
  buildFallbackWeatherCare,
  isAbnormalBloodPressure,
  isMedicationDueOnDate,
  parseLifeEvent,
  weatherCodeLabel,
  weatherGeocodeCandidates,
} from "./src/server/domain-rules.mjs";

export {
  buildFallbackWeatherCare,
  isMedicationDueOnDate,
  normalizeChannelWebhook,
  parseLifeEvent,
  weatherGeocodeCandidates,
};

const root = process.cwd();
const port = Number(process.env.PORT || 5173);
// DB_PATH 优先：测试/脚本可以用它指向独立的库副本，避免污染 data/techguard.db（SQLITE_PATH 保持兼容）
const dbPath = process.env.DB_PATH || process.env.SQLITE_PATH || join(root, "data", "techguard.db");
const feishuWebhookUrl = process.env.FEISHU_WEBHOOK_URL || "";
const feishuAppId = process.env.FEISHU_APP_ID || process.env.care_FEISHU_APP_ID || "";
const feishuAppSecret = process.env.FEISHU_APP_SECRET || process.env.care_FEISHU_APP_SECRET || "";
const feishuReceiveId = process.env.FEISHU_RECEIVE_ID || process.env.care_FEISHU_RECEIVE_ID || "";
const feishuReceiveIdType = process.env.FEISHU_RECEIVE_ID_TYPE || process.env.care_FEISHU_RECEIVE_ID_TYPE || "chat_id";
const openaiApiKey = process.env.OPENAI_API_KEY || "";
const amapApiKey = process.env.AMAP_WEB_SERVICE_KEY || process.env.AMAP_API_KEY || process.env.AMAP_JSAPI_KEY || "";
const cronSecret = process.env.CRON_SECRET || "";
let feishuTenantTokenCache = null;
const defaultCaregiverId = "user-caregiver";
const defaultElderId = "user-elder";
// 第二个演示长辈：让本地打开就能看到家属端的多长辈切换器
const defaultElder2Id = "user-elder2";

// Web Push（VAPID）配置：环境变量优先，环境变量缺失时自动生成并存入数据库（见 initPushConfig）
const vapidSubject = process.env.VAPID_SUBJECT || "mailto:care@techguard.local";
let vapidDetails = null;
// 记录密钥来源（env / database），用于启动告警和线上排查
let vapidKeySource = "none";
let vapidDisabledReason = "";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

// 静态资源白名单：只暴露前端运行必需的文件，避免 /data/techguard.db、/server.mjs、/node_modules 等被未登录者直接下载
const staticScriptStyles = new Set([".js", ".css"]);
const staticImages = new Set([".png", ".jpg", ".jpeg", ".svg", ".webp"]);

// 业务错误：携带 HTTP 状态码，由 appHandler 统一转成对应响应
class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

// 密码哈希参数（顶层常量：initDatabase 在模块初始化阶段就会调用 hashPassword）
const scryptPrefix = "scrypt";
const scryptKeyLength = 64;
const scryptSaltLength = 16;

const db = await createDatabase({ dbPath });
await initDatabase();
// VAPID 密钥依赖 app_settings 表，必须在 initDatabase 之后初始化
await initPushConfig();

export async function appHandler(request, response) {
  try {
    const url = new URL(request.url, "http://127.0.0.1");
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405);
      response.end("Method Not Allowed");
      return;
    }

    serveStatic(request, response, url);
  } catch (error) {
    // 区分业务错误与未预期错误：前者保留中文提示，后者只回通用文案，避免把内部实现细节泄露给前端
    if (error instanceof HttpError) {
      sendJson(response, error.statusCode, { ok: false, message: error.message });
      return;
    }
    console.error("[TechGuard] 未处理的服务器错误:", error);
    sendJson(response, 500, { ok: false, message: "服务器内部错误，请稍后再试" });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  createServer(appHandler).listen(port, () => {
    console.log(`TechGuard is running at http://127.0.0.1:${port}/`);
    console.log(`Database provider: ${db.label}`);
    console.log(feishuWebhookUrl ? "Feishu relay is enabled." : "Feishu relay is not configured.");
    // 手机提醒是否可用直接关系到「老人能不能收到提醒」，启动时必须说清楚密钥来源
    console.log(vapidDetails ? `Web Push (VAPID) is enabled, keys from ${vapidKeySource}.` : `Web Push (VAPID) is disabled: ${vapidDisabledReason || "unknown"}`);
    // 未配置 CRON_SECRET 时定时扫描接口只信任本机回环/Vercel Cron，这里给出明确告警
    if (!cronSecret) {
      console.warn("⚠️  未配置 CRON_SECRET：/api/cron/reminders 仅接受本机回环地址或 vercel-cron 请求，建议设置 CRON_SECRET 启用 Bearer 鉴权。");
    }
  });
}

async function handleApi(request, response, url) {
  const route = `${request.method} ${url.pathname}`;

  if (route === "POST /api/auth/login") return login(request, response);
  if (route === "POST /api/auth/logout") return logout(request, response);
  if (route === "POST /api/auth/register") return registerFamily(request, response);
  if (route === "POST /api/auth/elder-login") return consumeElderLoginLink(request, response);
  if (route === "GET /api/me") return requireUser(request, response, (user) => sendJson(response, 200, { ok: true, user }));
  // 保存联系电话（长辈端「一键联系家人」在飞书不可用时的兜底拨号数据）
  if (route === "POST /api/profile") return requireUser(request, response, (user) => saveProfile(request, response, user));
  // 长辈健康急救卡 + 静默未活跃告警设置
  if (route === "GET /api/elder-profile") return requireUser(request, response, (user) => getElderProfileHandler(response, user));
  if (route === "POST /api/elder-profile") return requireUser(request, response, (user) => saveElderProfile(request, response, user));
  // 当前用户可见的长辈列表：家属拿到全部绑定的长辈，长辈只拿到自己
  if (route === "GET /api/elders") return requireUser(request, response, (user) => eldersList(response, user));
  if (route === "POST /api/elders") return requireUser(request, response, (user) => createElder(request, response, user));
  // 切换当前照护的长辈：写入 users.active_elder_id，后续接口都跟着 getBoundElder 走
  if (route === "POST /api/elders/switch") return requireUser(request, response, (user) => switchElder(request, response, user));
  // 长辈免密绑定链接（24 小时有效、一次性使用、登录后 90 天免密）
  if (route === "POST /api/elder-login-link") return requireUser(request, response, (user) => createElderLoginLink(request, response, user));
  if (route === "GET /api/dashboard") return requireUser(request, response, (user) => dashboard(response, user));
  // 复诊摘要：把用药计划 / 血压 / 漏服 / 身体不适 / 体检报告聚合成一页，供家属带老人复诊时交给医生看。
  // 需要读取 ?days= 时间窗口，所以把已解析的 url 一并传进去。
  if (route === "GET /api/visit-summary") return requireUser(request, response, (user) => visitSummary(response, user, url));
  if (route === "POST /api/medications") return requireUser(request, response, (user) => createMedication(request, response, user));
  // 吃药计划列表：家属和长辈都可读，是 GET 而非写操作，所以走普通登录校验
  if (route === "GET /api/medications") return requireUser(request, response, (user) => medicationList(response, user));
  // 用药库存（余量追踪）：读接口家属和长辈都能看——「妈，降压药还有没有」是全家人都在问的事；
  // 写接口在各自的处理函数里 assertCaregiver。
  if (route === "GET /api/medication-stock") return requireUser(request, response, (user) => medicationStockList(response, user));
  if (route === "POST /api/medication-stock") return requireUser(request, response, (user) => saveMedicationStock(request, response, user));
  if (route === "POST /api/tasks") return requireUser(request, response, (user) => createTask(request, response, user));
  if (route === "POST /api/weather/settings") return requireUser(request, response, (user) => saveWeatherSettings(request, response, user));
  if (route === "GET /api/weather/care") return requireUser(request, response, (user) => weatherCare(response, user));
  if (route === "POST /api/fraud/check") return requireUser(request, response, (user) => fraudCheck(request, response, user));
  if (route === "POST /api/travel/plan") return requireUser(request, response, (user) => travelPlan(request, response, user));
  if (route === "POST /api/blood-pressure") return requireUser(request, response, (user) => createBloodPressure(request, response, user));
  if (route === "GET /api/blood-pressure") return requireUser(request, response, (user) => bloodPressureList(response, user));
  if (route === "POST /api/checkups/analyze") return requireUser(request, response, (user) => analyzeCheckup(request, response, user));
  // 体检指标：家属照着报告录入关键数字（不依赖任何 AI 服务），回答「上次 5.8 这次 5.2 是好是坏」。
  // 读接口家属和长辈都能看（趋势是全家都关心的），写接口在处理函数里 assertCaregiver。
  if (route === "GET /api/checkup-indicators") return requireUser(request, response, (user) => checkupIndicatorList(response, user));
  if (route === "POST /api/checkup-indicators") return requireUser(request, response, (user) => saveCheckupIndicators(request, response, user));
  if (route === "POST /api/feishu/config") return requireUser(request, response, (user) => saveFeishuConfig(request, response, user));
  if (route === "POST /api/feishu/test") return requireUser(request, response, (user) => feishuTest(response, user));
  if (route === "POST /api/feishu/send") return requireUser(request, response, (user) => feishuManualSend(request, response, user));
  // 多通道通知配置：支持飞书 / 企业微信 / 钉钉群机器人
  if (route === "GET /api/channels") return requireUser(request, response, (user) => listNotificationChannels(response, user));
  if (route === "POST /api/channels") return requireUser(request, response, (user) => saveNotificationChannel(request, response, user));
  if (route === "POST /api/channels/test") return requireUser(request, response, (user) => testNotificationChannel(request, response, user));
  if (route === "GET /api/notifications") return requireUser(request, response, (user) => notificationList(response, user));
  if (route === "POST /api/notifications/read") return requireUser(request, response, (user) => markNotificationRead(request, response, user));
  if (route === "POST /api/notifications/preferences") return requireUser(request, response, (user) => saveNotificationPreferences(request, response, user));
  if (route === "GET /api/push/config") return requireUser(request, response, () => pushConfig(response));
  if (route === "POST /api/push/subscribe") return requireUser(request, response, (user) => savePushSubscription(request, response, user));
  if (route === "POST /api/push/unsubscribe") return requireUser(request, response, (user) => deletePushSubscription(request, response, user));
  if (route === "POST /api/help/contact-caregiver") return requireUser(request, response, (user) => contactCaregiver(response, user));
  if (route === "POST /api/help/check-in") return requireUser(request, response, (user) => elderCheckIn(response, user));
  // 生活事件记录：长辈端「提取并记录」真正落库（此前前端只改提示文案，老人说的话会被静默丢弃）
  if (route === "POST /api/life-events") return requireUser(request, response, (user) => createLifeEvent(request, response, user));
  if (route === "GET /api/life-events") return requireUser(request, response, (user) => lifeEventList(response, user));
  // 邀请家属：lookup / accept 免登录——被邀请人此刻还没有账号，正是要让他先看到邀请信息再设置密码；
  // 生成 / 查看 / 撤销必须登录，且只有家属可用（assertCaregiver 在处理函数里判定）。
  if (route === "GET /api/invites/lookup") return inviteLookup(request, response, url);
  if (route === "POST /api/invites/accept") return acceptInvite(request, response);
  if (route === "POST /api/invites") return requireUser(request, response, (user) => createInvite(request, response, user));
  if (route === "GET /api/invites") return requireUser(request, response, (user) => inviteList(response, user));
  if (route === "GET /api/cron/reminders") return scanReminders(request, response);

  const medicationMatch = url.pathname.match(/^\/api\/medications\/([^/]+)\/complete$/);
  if (request.method === "POST" && medicationMatch) {
    return requireUser(request, response, (user) => completeMedication(request, response, user, medicationMatch[1]));
  }

  const taskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/complete$/);
  if (request.method === "POST" && taskMatch) {
    return requireUser(request, response, (user) => completeTask(request, response, user, taskMatch[1]));
  }

  // 修改 / 删除吃药计划：只允许家属操作（assertCaregiver 在处理函数里统一判定），
  // 放在 /complete 之后匹配，避免把 /api/medications/:id/complete 误当成 :id。
  const medicationItemMatch = url.pathname.match(/^\/api\/medications\/([^/]+)$/);
  if (medicationItemMatch) {
    if (request.method === "POST") return requireUser(request, response, (user) => updateMedication(request, response, user, medicationItemMatch[1]));
    if (request.method === "DELETE") return requireUser(request, response, (user) => deleteMedication(request, response, user, medicationItemMatch[1]));
  }

  // 修改 / 删除任务：同样只允许家属操作
  const taskItemMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
  if (taskItemMatch) {
    if (request.method === "POST") return requireUser(request, response, (user) => updateTask(request, response, user, taskItemMatch[1]));
    if (request.method === "DELETE") return requireUser(request, response, (user) => deleteTask(request, response, user, taskItemMatch[1]));
  }

  // 删除生活事件：只允许家属（assertCaregiver 在处理函数里判定）。
  // 用 [^/]+ 匹配单段 id，保证 /api/life-events（无尾段）不会误入这里。
  const lifeEventMatch = url.pathname.match(/^\/api\/life-events\/([^/]+)$/);
  if (lifeEventMatch && request.method === "DELETE") {
    return requireUser(request, response, (user) => deleteLifeEvent(request, response, user, lifeEventMatch[1]));
  }

  // 删除用药库存登记（语义是「不再追踪这个药」，不是把药删掉）：只允许家属（assertCaregiver 在处理函数里判定）
  const medicationStockMatch = url.pathname.match(/^\/api\/medication-stock\/([^/]+)$/);
  if (medicationStockMatch && request.method === "DELETE") {
    return requireUser(request, response, (user) => deleteMedicationStock(request, response, user, medicationStockMatch[1]));
  }

  // 删除某条体检指标：只允许家属（assertCaregiver 在处理函数里判定）。
  // 用 [^/]+ 匹配单段 id，保证 /api/checkup-indicators（无尾段）不会误入这里。
  const checkupIndicatorMatch = url.pathname.match(/^\/api\/checkup-indicators\/([^/]+)$/);
  if (checkupIndicatorMatch && request.method === "DELETE") {
    return requireUser(request, response, (user) => deleteCheckupIndicator(request, response, user, checkupIndicatorMatch[1]));
  }

  // 撤销邀请：只允许家属，且该邀请必须属于当前照护中的长辈（处理函数里校验，非本家的返回 404）
  const inviteMatch = url.pathname.match(/^\/api\/invites\/([^/]+)$/);
  if (inviteMatch && request.method === "DELETE") {
    return requireUser(request, response, (user) => deleteInvite(request, response, user, inviteMatch[1]));
  }

  // 体检报告原图读取（鉴权 + 家庭隔离，支持本地落盘文件、对象存储重定向及历史 base64 兼容）
  const checkupImageMatch = url.pathname.match(/^\/api\/checkups\/([^/]+)\/image$/);
  if (checkupImageMatch && request.method === "GET") {
    return requireUser(request, response, (user) => getCheckupImage(response, user, checkupImageMatch[1]));
  }

  sendJson(response, 404, { ok: false, message: "API not found" });
}

async function login(request, response) {
  const body = await readJson(request);
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  const ip = clientIp(request);

  // 登录失败限流：同一「用户名+IP」连续失败 5 次后锁定 5 分钟，降低口令爆破风险
  const limitMessage = checkLoginRateLimit(username, ip);
  if (limitMessage) {
    sendJson(response, 429, { ok: false, message: limitMessage });
    return;
  }

  const user = await db.prepare("SELECT * FROM users WHERE username = ?").get(username);

  if (!user || !verifyPassword(password, user.password_hash)) {
    recordLoginFailure(username, ip);
    sendJson(response, 401, { ok: false, message: "登录名或密码不正确" });
    return;
  }

  // 登录成功重置失败计数
  clearLoginFailures(username, ip);

  // 兼容旧数据：旧版单轮 sha256 校验通过后，透明升级为带盐 scrypt 存储
  if (!isScryptHash(user.password_hash)) {
    await db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hashPassword(password), user.id);
  }

  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 604_800_000).toISOString();
  const now = nowIso();
  // 顺手清理该用户已过期的历史会话，避免 auth_sessions 无限膨胀
  await db.prepare("DELETE FROM auth_sessions WHERE user_id = ? AND expires_at <= ?").run(user.id, now);
  await db.prepare("INSERT OR REPLACE INTO auth_sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").run(token, user.id, expiresAt, now);
  response.setHeader("Set-Cookie", `tg_session=${token}; ${sessionCookieAttributes(604800)}`);
  sendJson(response, 200, { ok: true, user: publicUser(user) });
}

async function logout(request, response) {
  const token = getCookie(request, "tg_session");
  if (token) await db.prepare("DELETE FROM auth_sessions WHERE token = ?").run(token);
  response.setHeader("Set-Cookie", `tg_session=; ${sessionCookieAttributes(0)}`);
  sendJson(response, 200, { ok: true });
}

async function requireUser(request, response, handler) {
  const token = getCookie(request, "tg_session");
  const session = token ? await db.prepare("SELECT * FROM auth_sessions WHERE token = ? AND expires_at > ?").get(token, nowIso()) : null;
  const userId = session?.user_id;
  if (!userId) {
    sendJson(response, 401, { ok: false, message: "请先登录" });
    return;
  }
  const user = await db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  if (!user) {
    sendJson(response, 401, { ok: false, message: "登录已失效" });
    return;
  }
  return handler(publicUser(user));
}

// 联系电话格式：trim 后 6-20 位，只允许数字、+、-、空格、括号；空字符串表示清除
const phonePattern = /^[0-9+\- ()]+$/;

function normalizePhone(value) {
  if (typeof value !== "string") throw new HttpError(400, "联系电话必须填写为字符串");
  const text = value.trim();
  // 空字符串 = 清除电话，落库为 NULL；dashboard 的紧急联系人会随之消失
  if (!text) return "";
  if (text.length < 6 || text.length > 20) throw new HttpError(400, "联系电话长度应为 6 到 20 位");
  if (!phonePattern.test(text)) throw new HttpError(400, "联系电话只能包含数字、+、-、空格和括号");
  return text;
}

// 保存联系电话：长辈端「一键联系家人」在飞书未配置时没有可靠兜底，
// 所以家属账号要能存电话，再由 dashboard 下发给长辈端直接拨号。
async function saveProfile(request, response, user) {
  const body = await readJson(request);
  const phone = normalizePhone(body.phone);
  await db.prepare("UPDATE users SET phone = ? WHERE id = ?").run(phone || null, user.id);
  sendJson(response, 200, { ok: true, phone });
}

// ---- 家庭自助注册 / 新增照护长辈 / 长辈免密绑定链接 ----

const elderLoginLinkTtlMs = 24 * 60 * 60 * 1000;
const elderSessionTtlSeconds = 90 * 24 * 60 * 60;

async function registerFamily(request, response) {
  const ip = clientIp(request);
  const limitMessage = checkInviteRateLimit(ip);
  if (limitMessage) {
    sendJson(response, 429, { ok: false, message: limitMessage });
    return;
  }

  const body = await readJson(request);
  let caregiverUsername;
  let caregiverPassword;
  let caregiverDisplayName;
  let relation;
  let elderDisplayName;
  let elderUsername;
  let elderPassword;
  try {
    caregiverDisplayName = normalizeInviteDisplayName(body.caregiverDisplayName);
    caregiverUsername = normalizeInviteUsername(body.caregiverUsername);
    caregiverPassword = normalizeInvitePassword(body.caregiverPassword);
    relation = normalizeInviteRelation(body.relation || "家属");
    elderDisplayName = normalizeInviteDisplayName(body.elderDisplayName);
    elderUsername = body.elderUsername ? normalizeInviteUsername(body.elderUsername) : `elder_${randomBytes(4).toString("hex")}`;
    elderPassword = body.elderPassword ? normalizeInvitePassword(body.elderPassword) : randomBytes(12).toString("hex");
    if (caregiverUsername.toLowerCase() === elderUsername.toLowerCase()) {
      throw new HttpError(400, "家属登录名和长辈登录名不能相同");
    }
    const existingCaregiver = await db.prepare("SELECT id FROM users WHERE LOWER(username) = ?").get(caregiverUsername.toLowerCase());
    if (existingCaregiver) throw new HttpError(400, "该家属登录名已被占用，请换一个");
    const existingElder = await db.prepare("SELECT id FROM users WHERE LOWER(username) = ?").get(elderUsername.toLowerCase());
    if (existingElder) throw new HttpError(400, "该长辈登录名已被占用，请换一个");
  } catch (error) {
    recordInviteFailure(ip);
    throw error;
  }

  const caregiverId = createId("user");
  const elderId = createId("user");
  const now = nowIso();
  await db
    .prepare("INSERT INTO users (id, username, password_hash, display_name, role, active_elder_id, created_at) VALUES (?, ?, ?, ?, 'caregiver', ?, ?)")
    .run(caregiverId, caregiverUsername, hashPassword(caregiverPassword), caregiverDisplayName, elderId, now);
  await db
    .prepare("INSERT INTO users (id, username, password_hash, display_name, role, created_at) VALUES (?, ?, ?, ?, 'elder', ?)")
    .run(elderId, elderUsername, hashPassword(elderPassword), elderDisplayName, now);
  await db
    .prepare("INSERT INTO family_links (id, caregiver_id, elder_id, relation) VALUES (?, ?, ?, ?)")
    .run(createId("link"), caregiverId, elderId, relation);

  const sessionToken = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 604_800_000).toISOString();
  await db.prepare("INSERT OR REPLACE INTO auth_sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").run(sessionToken, caregiverId, expiresAt, now);
  response.setHeader("Set-Cookie", `tg_session=${sessionToken}; ${sessionCookieAttributes(604800)}`);
  inviteFailures.delete(ip);

  const createdCaregiver = await db.prepare("SELECT * FROM users WHERE id = ?").get(caregiverId);
  const createdElder = await db.prepare("SELECT * FROM users WHERE id = ?").get(elderId);
  sendJson(response, 200, { ok: true, user: publicUser(createdCaregiver), elder: publicUser(createdElder) });
}

async function createElder(request, response, user) {
  assertCaregiver(user);
  const body = await readJson(request);
  const displayName = normalizeInviteDisplayName(body.displayName);
  const relation = normalizeInviteRelation(body.relation || "家属");
  const username = body.username ? normalizeInviteUsername(body.username) : `elder_${randomBytes(4).toString("hex")}`;
  const password = body.password ? normalizeInvitePassword(body.password) : randomBytes(12).toString("hex");
  const existing = await db.prepare("SELECT id FROM users WHERE LOWER(username) = ?").get(username.toLowerCase());
  if (existing) throw new HttpError(400, "该登录名已被占用，请换一个");

  const elderId = createId("user");
  const now = nowIso();
  await db
    .prepare("INSERT INTO users (id, username, password_hash, display_name, role, created_at) VALUES (?, ?, ?, ?, 'elder', ?)")
    .run(elderId, username, hashPassword(password), displayName, now);
  await db
    .prepare("INSERT INTO family_links (id, caregiver_id, elder_id, relation) VALUES (?, ?, ?, ?)")
    .run(createId("link"), user.id, elderId, relation);
  await db.prepare("UPDATE users SET active_elder_id = ? WHERE id = ?").run(elderId, user.id);

  const created = await db.prepare("SELECT * FROM users WHERE id = ?").get(elderId);
  sendJson(response, 200, { ok: true, elder: publicUser(created) });
}

// 生成长辈免密登录链接：让家属把链接发到老人手机上（微信/短信），老人点一下直接进入并保持 90 天登录，无需记密码。
async function createElderLoginLink(request, response, user) {
  assertCaregiver(user);
  const elder = await getBoundElder(user);
  const id = createId("elink");
  const token = randomBytes(32).toString("hex");
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + elderLoginLinkTtlMs).toISOString();
  await db
    .prepare("INSERT INTO elder_login_links (id, elder_id, created_by, token_hash, expires_at, used_at, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)")
    .run(id, elder.id, user.id, hashInviteToken(token), expiresAt, createdAt);

  const origin = requestOrigin(request, new URL(request.url, "http://127.0.0.1"));
  sendJson(response, 200, {
    ok: true,
    loginLink: {
      id,
      elderName: elder.displayName,
      expiresAt,
      token,
      url: `${origin}/?elder_login=${token}`,
    },
  });
}

async function consumeElderLoginLink(request, response) {
  const ip = clientIp(request);
  const limitMessage = checkInviteRateLimit(ip);
  if (limitMessage) {
    sendJson(response, 429, { ok: false, message: limitMessage });
    return;
  }

  const body = await readJson(request);
  const rawToken = String(body.token ?? "").trim();
  if (!rawToken) {
    recordInviteFailure(ip);
    throw new HttpError(400, "登录链接无效或已过期");
  }
  const link = await db.prepare("SELECT * FROM elder_login_links WHERE token_hash = ?").get(hashInviteToken(rawToken));
  if (!link || link.used_at || !link.expires_at || new Date(link.expires_at).getTime() <= Date.now()) {
    recordInviteFailure(ip);
    throw new HttpError(400, "登录链接无效、已使用或已过期，请让家人重新生成");
  }

  const usedAt = nowIso();
  const result = await db
    .prepare("UPDATE elder_login_links SET used_at = ? WHERE id = ? AND used_at IS NULL")
    .run(usedAt, link.id);
  const changes = Number(result?.changes ?? result?.rowsAffected ?? 0);
  if (changes !== 1) {
    recordInviteFailure(ip);
    throw new HttpError(400, "登录链接已被使用，请让家人重新生成");
  }

  const elder = await db.prepare("SELECT * FROM users WHERE id = ? AND role = 'elder'").get(link.elder_id);
  if (!elder) throw new HttpError(404, "未找到对应的长辈账号");

  const sessionToken = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + elderSessionTtlSeconds * 1000).toISOString();
  await db
    .prepare("INSERT OR REPLACE INTO auth_sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
    .run(sessionToken, elder.id, expiresAt, usedAt);
  response.setHeader("Set-Cookie", `tg_session=${sessionToken}; ${sessionCookieAttributes(elderSessionTtlSeconds)}`);
  inviteFailures.delete(ip);
  sendJson(response, 200, { ok: true, user: publicUser(elder) });
}

// ---- 长辈健康急救卡 & 静默未活跃告警设置（elder_profiles）----

function mapElderProfile(row) {
  return {
    bloodType: row?.blood_type || "",
    allergies: row?.allergies || "",
    chronicConditions: row?.chronic_conditions || "",
    emergencyHospital: row?.emergency_hospital || "",
    doctorName: row?.doctor_name || "",
    doctorPhone: row?.doctor_phone || "",
    notes: row?.notes || "",
    inactivityAlertEnabled: Boolean(row?.inactivity_alert_enabled),
    inactivityDeadline: row?.inactivity_deadline || "12:00",
    updatedAt: row?.updated_at || null,
  };
}

async function getElderProfile(elderId) {
  const row = await db.prepare("SELECT * FROM elder_profiles WHERE elder_id = ?").get(elderId);
  return mapElderProfile(row);
}

async function getElderProfileHandler(response, user) {
  const elder = await getBoundElder(user);
  sendJson(response, 200, { ok: true, profile: await getElderProfile(elder.id) });
}

async function saveElderProfile(request, response, user) {
  assertCaregiver(user);
  const elder = await getBoundElder(user);
  const body = await readJson(request);
  const bloodType = String(body.bloodType ?? "").trim().slice(0, 16);
  const allergies = String(body.allergies ?? "").trim().slice(0, 200);
  const chronicConditions = String(body.chronicConditions ?? "").trim().slice(0, 200);
  const emergencyHospital = String(body.emergencyHospital ?? "").trim().slice(0, 100);
  const doctorName = String(body.doctorName ?? "").trim().slice(0, 40);
  const doctorPhone = body.doctorPhone ? normalizePhone(String(body.doctorPhone)) : "";
  const notes = String(body.notes ?? "").trim().slice(0, 300);
  const inactivityAlertEnabled = body.inactivityAlertEnabled ? 1 : 0;
  const inactivityDeadline = validateTimeOfDay(body.inactivityDeadline || "12:00", "未活跃检查时间").slice(0, 5);
  const updatedAt = nowIso();

  await db
    .prepare(
      `INSERT INTO elder_profiles
       (elder_id, blood_type, allergies, chronic_conditions, emergency_hospital, doctor_name, doctor_phone, notes, inactivity_alert_enabled, inactivity_deadline, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(elder_id) DO UPDATE SET
         blood_type = excluded.blood_type,
         allergies = excluded.allergies,
         chronic_conditions = excluded.chronic_conditions,
         emergency_hospital = excluded.emergency_hospital,
         doctor_name = excluded.doctor_name,
         doctor_phone = excluded.doctor_phone,
         notes = excluded.notes,
         inactivity_alert_enabled = excluded.inactivity_alert_enabled,
         inactivity_deadline = excluded.inactivity_deadline,
         updated_at = excluded.updated_at`
    )
    .run(elder.id, bloodType, allergies, chronicConditions, emergencyHospital, doctorName, doctorPhone, notes, inactivityAlertEnabled, inactivityDeadline, updatedAt);

  sendJson(response, 200, { ok: true, profile: await getElderProfile(elder.id) });
}

// 家属关联的全部长辈（按建立关联的先后顺序，保持和旧版「取第一条」一致的兜底语义），
// 同时解析出实际生效的 active_elder_id：为空或指向已解除关联的长辈时回退到第一条并回写自愈。
async function caregiverElders(user) {
  const rows = await db
    .prepare(
      // GROUP BY u.id 去重：同一位长辈万一有多条 family_links（重复添加、历史数据），
      // 不去重会让长辈端切换器出现重复选项，摘要也会算重。relation 取最早那条。
      `SELECT u.id, u.username, u.display_name, u.role, MIN(fl.relation) AS relation, MIN(fl.rowid) AS link_rowid
       FROM family_links fl JOIN users u ON u.id = fl.elder_id
       WHERE fl.caregiver_id = ?
       GROUP BY u.id
       ORDER BY link_rowid ASC`
    )
    .all(user.id);
  if (!rows.length) return { rows, activeId: "" };
  const me = await db.prepare("SELECT active_elder_id FROM users WHERE id = ?").get(user.id);
  const stored = me?.active_elder_id || "";
  const activeId = rows.some((row) => row.id === stored) ? stored : rows[0].id;
  // 自愈：只在存值与实际生效值不一致时写库，避免每次请求都产生多余的 UPDATE
  if (activeId !== stored) {
    await db.prepare("UPDATE users SET active_elder_id = ? WHERE id = ?").run(activeId, user.id);
  }
  return { rows, activeId };
}

// 返回前端切换器需要的长辈列表（与 GET /api/elders 完全同一份数据、同一形状）。
// 长辈端只返回自己这一项，让前端能用同一套渲染逻辑。
async function listElders(user) {
  if (user.role === "elder") {
    return [{ id: user.id, displayName: user.displayName, relation: "本人", isActive: true }];
  }
  const { rows, activeId } = await caregiverElders(user);
  // 一个长辈都没关联时返回空数组，交给前端提示，而不是在这里报错
  return rows.map((row) => ({
    id: row.id,
    displayName: row.display_name || row.displayName,
    relation: row.relation ?? "",
    isActive: row.id === activeId,
  }));
}

async function eldersList(response, user) {
  sendJson(response, 200, { ok: true, elders: await listElders(user) });
}

// 切换当前照护的长辈：必须确实和当前用户有关联，否则 403，避免越权查看别人家的数据。
async function switchElder(request, response, user) {
  const body = await readJson(request);
  const elderId = required(body.elderId, "请选择要查看的长辈");
  if (user.role === "elder") {
    // 长辈账号只能停留在自己身上，切到别人一律 403
    if (elderId !== user.id) throw new HttpError(403, "无权查看该长辈");
  } else {
    const link = await db.prepare("SELECT id FROM family_links WHERE caregiver_id = ? AND elder_id = ?").get(user.id, elderId);
    if (!link) throw new HttpError(403, "无权查看该长辈");
  }
  await db.prepare("UPDATE users SET active_elder_id = ? WHERE id = ?").run(elderId, user.id);
  sendJson(response, 200, { ok: true, activeElderId: elderId });
}

// ---- 邀请家属（ elder_invites ）：生成 / 查看 / 撤销 / 免登录查看与接受 ----
// 背景：家属账号此前只能在部署时直接写库，界面上没有真正的邀请路径。
// 这里补上「建号 + 建立 family_links 关联」这条链路，一位长辈可以邀请多位家属。

// 邀请有效期 7 天；到期后 lookup 与 accept 都必须拒绝
const inviteTtlMs = 7 * 24 * 60 * 60 * 1000;
// 用户名只允许字母数字与 _ . -（避免前端输入法带进奇怪字符）
const inviteUsernamePattern = /^[A-Za-z0-9_.-]+$/;
const inviteRelationMaxLength = 16;
const inviteDisplayNameMaxLength = 24;
const invitePasswordMinLength = 8;
const invitePasswordMaxLength = 128;

// 只存哈希：数据库哪怕被拖走，token 也不能被直接拿去建号
function hashInviteToken(token) {
  return createHash("sha256").update(String(token)).digest("hex");
}

function normalizeInviteRelation(value) {
  const relation = String(value ?? "").trim();
  if (!relation) throw new HttpError(400, "请填写与长辈的关系");
  if (relation.length > inviteRelationMaxLength) throw new HttpError(400, `关系最多 ${inviteRelationMaxLength} 个字`);
  return relation;
}

// 用户名统一按小写比较：避免 Alice 与 alice 变成两个账号（users.username 的唯一约束区分大小写）
function normalizeInviteUsername(value) {
  const username = String(value ?? "").trim();
  if (username.length < 3 || username.length > 32) throw new HttpError(400, "登录名长度应为 3 到 32 位");
  if (!inviteUsernamePattern.test(username)) throw new HttpError(400, "登录名只能包含字母、数字、下划线、点和连字符");
  return username;
}

function normalizeInvitePassword(value) {
  const password = String(value ?? "");
  if (password.length < invitePasswordMinLength) throw new HttpError(400, `密码至少 ${invitePasswordMinLength} 位`);
  if (password.length > invitePasswordMaxLength) throw new HttpError(400, `密码最多 ${invitePasswordMaxLength} 位`);
  return password;
}

function normalizeInviteDisplayName(value) {
  const displayName = String(value ?? "").trim();
  if (!displayName) throw new HttpError(400, "请填写姓名");
  if (displayName.length > inviteDisplayNameMaxLength) throw new HttpError(400, `姓名最多 ${inviteDisplayNameMaxLength} 个字`);
  return displayName;
}

// 邀请链接的 origin：优先用反向代理透传的协议头，其次回退到请求自身的 host
function requestOrigin(request, url) {
  const forwardedProto = String(request.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const protocol = forwardedProto || url.protocol.replace(":", "") || "http";
  const host = String(request.headers.host || url.host || "").trim();
  return `${protocol}://${host}`;
}

// 按哈希查邀请；token 不存在 / 已使用 / 已过期都返回 null，调用方统一按「无效」处理
async function findActiveInvite(token) {
  const raw = String(token ?? "").trim();
  if (!raw) return null;
  const invite = await db.prepare("SELECT * FROM elder_invites WHERE token_hash = ?").get(hashInviteToken(raw));
  if (!invite) return null;
  if (invite.used_at) return null;
  if (!invite.expires_at || new Date(invite.expires_at).getTime() <= Date.now()) return null;
  return invite;
}

// 生成邀请：只能为「当前照护中的长辈」建邀请，否则家属就能给别家老人塞账号
async function createInvite(request, response, user) {
  assertCaregiver(user);
  const elder = await getBoundElder(user);
  const body = await readJson(request);
  const relation = normalizeInviteRelation(body.relation);

  const id = createId("invite");
  const token = randomBytes(32).toString("hex");
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + inviteTtlMs).toISOString();
  // 只落库 token 的哈希；明文 token 仅在本响应里返回一次，之后任何人（包括数据库管理员）都取不回
  await db
    .prepare("INSERT INTO elder_invites (id, elder_id, created_by, relation, token_hash, expires_at, used_at, used_by, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?)")
    .run(id, elder.id, user.id, relation, hashInviteToken(token), expiresAt, createdAt);

  const origin = requestOrigin(request, new URL(request.url, "http://127.0.0.1"));
  sendJson(response, 200, { ok: true, invite: { id, relation, expiresAt, token, url: `${origin}/?invite=${token}` } });
}

// 邀请列表：只给当前照护长辈的邀请。同一个长辈可能有多位家属，所以响应里绝不能带 token / token_hash
async function inviteList(response, user) {
  assertCaregiver(user);
  const elder = await getBoundElder(user);
  const rows = await db
    .prepare("SELECT id, relation, created_at, expires_at, used_at FROM elder_invites WHERE elder_id = ? ORDER BY created_at DESC, rowid DESC")
    .all(elder.id);
  const now = Date.now();
  const invites = rows.map((row) => ({
    id: row.id,
    relation: row.relation,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    status: row.used_at ? "used" : new Date(row.expires_at).getTime() <= now ? "expired" : "pending",
  }));
  sendJson(response, 200, { ok: true, invites });
}

// 撤销邀请：只允许删除属于当前照护中长辈的邀请；不属于自己家的一律 404（不用 403，避免探测别家 invite id）
async function deleteInvite(request, response, user, inviteId) {
  assertCaregiver(user);
  const elder = await getBoundElder(user);
  const invite = await db.prepare("SELECT id FROM elder_invites WHERE id = ? AND elder_id = ?").get(inviteId, elder.id);
  if (!invite) {
    sendJson(response, 404, { ok: false, message: "邀请不存在" });
    return;
  }
  await db.prepare("DELETE FROM elder_invites WHERE id = ?").run(inviteId);
  sendJson(response, 200, { ok: true });
}

// 查看邀请：免登录。被邀请人打开链接后先看到「您被邀请作为 <relation> 照护 <elderName>」再输密码
async function inviteLookup(request, response, url) {
  const invite = await findActiveInvite(url.searchParams.get("token"));
  if (!invite) throw new HttpError(400, "邀请链接无效、已使用或已过期");
  const elder = await db.prepare("SELECT display_name FROM users WHERE id = ?").get(invite.elder_id);
  sendJson(response, 200, { ok: true, invite: { elderName: elder?.display_name || "长辈", relation: invite.relation, expiresAt: invite.expires_at } });
}

// 接受邀请的限流：接口免登录，按 IP 计数，连续 10 次失败锁 5 分钟，防止被拿来刷用户名 / 撞 token
const inviteFailureLimit = 10;
const inviteLockMs = 5 * 60 * 1000;
const inviteFailures = new Map();

function checkInviteRateLimit(ip) {
  const entry = inviteFailures.get(ip);
  if (!entry || !entry.lockedUntil) return null;
  if (entry.lockedUntil > Date.now()) {
    const seconds = Math.ceil((entry.lockedUntil - Date.now()) / 1000);
    return `失败次数过多，请 ${seconds} 秒后再试`;
  }
  inviteFailures.delete(ip);
  return null;
}

// 内存级限流表上限：避免长驻进程遭遇随机 IP/用户名探测时 Map 无限膨胀
const rateLimitMapMaxEntries = 500;

function pruneRateLimitMap(map) {
  if (map.size < rateLimitMapMaxEntries) return;
  const now = Date.now();
  for (const [key, entry] of map.entries()) {
    if (entry.lockedUntil && entry.lockedUntil <= now) map.delete(key);
  }
  while (map.size >= rateLimitMapMaxEntries) {
    const oldestKey = map.keys().next().value;
    if (oldestKey === undefined) break;
    map.delete(oldestKey);
  }
}

function recordInviteFailure(ip) {
  pruneRateLimitMap(inviteFailures);
  const entry = inviteFailures.get(ip) || { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= inviteFailureLimit) {
    entry.count = 0;
    entry.lockedUntil = Date.now() + inviteLockMs;
  }
  inviteFailures.set(ip, entry);
}

// 接受邀请：免登录，建 caregiver 账号 + family_links 关联，并直接下发登录会话
async function acceptInvite(request, response) {
  const ip = clientIp(request);
  const limitMessage = checkInviteRateLimit(ip);
  if (limitMessage) {
    sendJson(response, 429, { ok: false, message: limitMessage });
    return;
  }

  const body = await readJson(request);
  const invite = await findActiveInvite(body.token);
  if (!invite) {
    recordInviteFailure(ip);
    throw new HttpError(400, "邀请链接无效、已使用或已过期");
  }

  // 输入校验：任何一项不合法都算一次失败（不消耗邀请），并返回可读文案
  let username;
  let password;
  let displayName;
  try {
    username = normalizeInviteUsername(body.username);
    password = normalizeInvitePassword(body.password);
    displayName = normalizeInviteDisplayName(body.displayName);
    const existing = await db.prepare("SELECT id FROM users WHERE LOWER(username) = ?").get(username.toLowerCase());
    if (existing) throw new HttpError(400, "该登录名已被占用，请换一个");
  } catch (error) {
    recordInviteFailure(ip);
    throw error;
  }

  // 一次性消耗：条件更新保证并发下只有一个请求能把 used_at 从 NULL 写进去
  const userId = createId("user");
  const usedAt = nowIso();
  const result = await db.prepare("UPDATE elder_invites SET used_at = ?, used_by = ? WHERE id = ? AND used_at IS NULL").run(usedAt, userId, invite.id);
  const changes = Number(result?.changes ?? result?.rowsAffected ?? 0);
  if (changes !== 1) {
    recordInviteFailure(ip);
    throw new HttpError(400, "邀请已被使用");
  }

  // 复用现有密码哈希与会话逻辑，新用户固定为 caregiver，relation 用邀请里存的那条
  await db.prepare("INSERT INTO users (id, username, password_hash, display_name, role, created_at) VALUES (?, ?, ?, ?, 'caregiver', ?)").run(userId, username, hashPassword(password), displayName, usedAt);
  await db.prepare("INSERT INTO family_links (id, caregiver_id, elder_id, relation) VALUES (?, ?, ?, ?)").run(createId("link"), userId, invite.elder_id, invite.relation);

  const sessionToken = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 604_800_000).toISOString();
  await db.prepare("INSERT OR REPLACE INTO auth_sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").run(sessionToken, userId, expiresAt, nowIso());
  response.setHeader("Set-Cookie", `tg_session=${sessionToken}; ${sessionCookieAttributes(604800)}`);

  inviteFailures.delete(ip);
  const created = await db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  sendJson(response, 200, { ok: true, user: publicUser(created) });
}

// 紧急联系人：所有和该长辈有关联、且填写了电话的家属。
// 没有电话的家属不返回（点了也拨不出去），没有配置时返回空数组而不是报错。
async function listEmergencyContacts(elderId) {
  const rows = await db
    .prepare(
      `SELECT u.display_name, u.phone, fl.relation
       FROM family_links fl JOIN users u ON u.id = fl.caregiver_id
       WHERE fl.elder_id = ? AND u.phone IS NOT NULL AND TRIM(u.phone) <> ''
       ORDER BY fl.rowid ASC`
    )
    .all(elderId);
  return rows.map((row) => ({ name: row.display_name, relation: row.relation ?? "", phone: row.phone }));
}

// 家庭成员名单：这位长辈的所有关联家属 + 长辈本人。
// 「角色与权限」那张表原先只列「当前登录人 + 长辈」，一旦通过邀请加进第二、第三位家属，
// 表里就完全看不到他们，家属会以为自己邀请没成功。这里给出真实名单。
async function listHouseholdMembers(elder) {
  const caregivers = await db
    .prepare(
      `SELECT u.id, u.display_name, u.role, fl.relation
       FROM family_links fl JOIN users u ON u.id = fl.caregiver_id
       WHERE fl.elder_id = ?
       GROUP BY u.id
       ORDER BY fl.rowid ASC, u.created_at ASC`
    )
    .all(elder.id);
  return [
    ...caregivers.map((row) => ({ id: row.id, displayName: row.display_name, relation: row.relation ?? "", role: "caregiver" })),
    // 传进来的 elder 已经是 publicUser 形状（camelCase displayName），不是原始行
    { id: elder.id, displayName: elder.displayName ?? elder.display_name, relation: "", role: "elder" },
  ];
}

async function dashboard(response, user) {
  const elder = await getBoundElder(user);
  // 家属端的「切换长辈」列表与长辈端的紧急联系人：都跟当前生效的长辈保持一致
  const elders = await listElders(user);
  const emergencyContacts = await listEmergencyContacts(elder.id);
  // 家庭成员名单（关联家属 + 长辈本人），供「角色与权限」表格渲染
  const members = await listHouseholdMembers(elder);
  const elderProfile = await getElderProfile(elder.id);
  await ensureTodayMedicationLogs(elder.id);
  const today = todayDate();
  // 停用的计划（enabled = 0）只保留历史服药记录：done / missed 的日志照旧显示，
  // 但 pending 的当日待办要隐藏——药已经停了就不该再催老人吃。
  const medications = await db
    .prepare(
      `SELECT ml.id as log_id, ml.status, ml.completed_at, ms.*
       FROM medication_logs ml
       JOIN medication_schedules ms ON ms.id = ml.schedule_id
       WHERE ml.elder_id = ? AND ml.due_date = ? AND (ms.enabled = 1 OR ml.status <> 'pending')
       ORDER BY ms.time_of_day ASC`
    )
    .all(elder.id, today);
  const tasks = await db
    .prepare("SELECT * FROM care_tasks WHERE elder_id = ? AND (due_date = ? OR (due_date < ? AND status = 'pending')) ORDER BY due_date DESC, due_time ASC")
    .all(elder.id, today, today);
  const alerts = await db.prepare("SELECT * FROM alerts WHERE elder_id = ? ORDER BY created_at DESC LIMIT 20").all(elder.id);
  // 最近 7 天的漏服：让「漏服沉淀」真的能被家属看见，而不是只写进库。
  const missedMedications = await db
    .prepare(
      `SELECT ml.id as log_id, ml.due_date, ml.status, ms.medicine_name, ms.time_of_day, ms.dose_note
       FROM medication_logs ml
       JOIN medication_schedules ms ON ms.id = ml.schedule_id
       WHERE ml.elder_id = ? AND ml.status = 'missed' AND ml.due_date >= ?
       ORDER BY ml.due_date DESC, ms.time_of_day ASC
       LIMIT 30`
    )
    .all(elder.id, dateDaysAgo(7));
  const weather = (await db.prepare("SELECT * FROM weather_settings WHERE elder_id = ?").get(elder.id)) || null;
  const weatherCare = await buildWeatherCare(weather);
  const bloodPressure = await listRecentBloodPressure(elder.id, 60);
  const checkups = await db.prepare("SELECT id, elder_id, uploaded_by, file_name, summary, risk_level, source, created_at FROM checkup_reports WHERE elder_id = ? ORDER BY created_at DESC LIMIT 8").all(elder.id);
  // 生活事件：dashboard 只带最近 20 条，完整历史走 GET /api/life-events（前端不必再发一次请求就能渲染概览）
  const lifeEvents = await db.prepare("SELECT id, kind, raw_text, occurred_at, source, created_at FROM life_events WHERE elder_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 20").all(elder.id);
  const report = await buildDailyReport(elder.id);

  sendJson(response, 200, {
    ok: true,
    user,
    elder,
    // 供家属端渲染长辈切换器（与 GET /api/elders 同一份数据）
    elders,
    // 供长辈端「一键联系家人」在飞书不可用时直接拨号
    emergencyContacts,
    // 家庭成员名单（关联家属 + 长辈本人），供「角色与权限」表格渲染
    members,
    // 长辈健康急救卡与静默未活跃告警设置
    elderProfile,
    medications,
    tasks,
    alerts,
    weather,
    weatherCare,
    bloodPressure,
    bloodPressureSummary: analyzeBloodPressure(bloodPressure),
    missedMedications,
    checkups,
    // 最近 20 条生活事件，元素形状与 GET /api/life-events 完全一致
    lifeEvents: lifeEvents.map(mapLifeEvent),
    report,
    smsMode: "manual-paste",
    notification: {
      androidPushSupported: true,
      note: "网页不能自动读取短信，安卓提醒需要 HTTPS、Chrome 和通知授权。",
    },
  });
}

// ---- 复诊摘要（GET /api/visit-summary）：把老人和家属手里的数据聚合成一页，复诊时打印给医生 ----

// days 参数容错：前端不该因为参数写错就白屏，所以一律夹到 1–180，绝不返回 400。
// 缺省 / 空串 / 非数字（如 ?days=abc）都按默认 30；数字越界则夹到最近的合法边界。
const visitSummaryDefaultDays = 30;
const visitSummaryMinDays = 1;
const visitSummaryMaxDays = 180;

function normalizeVisitSummaryDays(value) {
  if (value == null || String(value).trim() === "") return visitSummaryDefaultDays;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return visitSummaryDefaultDays;
  return Math.min(visitSummaryMaxDays, Math.max(visitSummaryMinDays, Math.trunc(parsed)));
}

// 复诊摘要聚合接口：一次请求拿齐复诊需要的全部数据，避免前端发十几个请求。
// 注意所有区间过滤都用 substr(时间列, 1, 10) 做「日期」比较（与 buildDailyReport 同一口径），
// 避免 ISO 时间戳里的时区差异把边界当天的记录挤出去。
async function visitSummary(response, user, url) {
  const elder = await getBoundElder(user);
  const periodDays = normalizeVisitSummaryDays(url.searchParams.get("days"));
  const today = todayDate();
  // periodStart 与 dateDaysAgo 语义保持一致：往前推 periodDays 天（含今天在内共 periodDays+1 个自然日）
  const periodStart = dateDaysAgo(periodDays);

  // 长辈与当前家属的关系：长辈自己调用时是「本人」，家属取 family_links 里存的关系
  const relation =
    user.role === "elder"
      ? "本人"
      : (await db.prepare("SELECT relation FROM family_links WHERE caregiver_id = ? AND elder_id = ?").get(user.id, elder.id))?.relation ?? "";

  // 用药计划：返回「全部」计划（含 enabled = 0），前端要标注已停用，所以这里不能按 enabled 过滤
  const medications = await db
    .prepare(
      `SELECT medicine_name, time_of_day, dose_note, repeat_rule, repeat_days, start_date, end_date, enabled
       FROM medication_schedules
       WHERE elder_id = ?
       ORDER BY time_of_day ASC`
    )
    .all(elder.id);

  // 血压：只用区间内的记录做统计与整段判定（区别于 dashboard 传全量记录）
  const bloodPressureRows = await db
    .prepare(
      `SELECT systolic, diastolic, pulse, measured_at, note
       FROM blood_pressure_logs
       WHERE elder_id = ? AND substr(measured_at, 1, 10) >= ? AND substr(measured_at, 1, 10) <= ?
       ORDER BY measured_at ASC`
    )
    .all(elder.id, periodStart, today);

  const bloodPressureRecords = bloodPressureRows.map((row) => ({
    systolic: row.systolic,
    diastolic: row.diastolic,
    pulse: row.pulse,
    measuredAt: row.measured_at,
    note: row.note ?? "",
  }));
  // analyzeBloodPressure 在空数组时返回 level: "empty" + 中文空状态文案（见该函数），不会抛错，可直接复用
  const bloodPressureSummary = analyzeBloodPressure(bloodPressureRecords);
  const average = bloodPressureRecords.length
    ? {
        systolic: Math.round(bloodPressureRecords.reduce((sum, item) => sum + item.systolic, 0) / bloodPressureRecords.length),
        diastolic: Math.round(bloodPressureRecords.reduce((sum, item) => sum + item.diastolic, 0) / bloodPressureRecords.length),
      }
    : null;
  const latestRecord = bloodPressureRecords.length ? bloodPressureRecords[bloodPressureRecords.length - 1] : null;

  // 服药依从性：due_date 落在 [periodStart, today] 的记录（含今天）
  const adherenceRows = await db
    .prepare(
      `SELECT ml.status, ml.due_date, ms.medicine_name, ms.time_of_day
       FROM medication_logs ml JOIN medication_schedules ms ON ms.id = ml.schedule_id
       WHERE ml.elder_id = ? AND ml.due_date >= ? AND ml.due_date <= ?`
    )
    .all(elder.id, periodStart, today);
  const total = adherenceRows.length;
  const done = adherenceRows.filter((row) => row.status === "done").length;
  const missed = adherenceRows.filter((row) => row.status === "missed").length;
  const pending = adherenceRows.filter((row) => row.status === "pending").length;
  // rate 为 number（保留两位小数）；没有记录时为 null，前端才不会把 0/0 显示成「100%」
  const rate = total ? Number((done / total).toFixed(2)) : null;
  const missedDetails = adherenceRows
    .filter((row) => row.status === "missed")
    .sort((a, b) => (a.due_date < b.due_date ? 1 : a.due_date > b.due_date ? -1 : 0))
    .slice(0, 20)
    .map((row) => ({ dueDate: row.due_date, medicineName: row.medicine_name, timeOfDay: row.time_of_day }));

  // 身体不适事件：kind = 'unwell' 且创建时间落在区间内，最新在前，最多 20 条
  const unwellEvents = await db
    .prepare(
      `SELECT raw_text, occurred_at, created_at
       FROM life_events
       WHERE elder_id = ? AND kind = 'unwell'
         AND substr(created_at, 1, 10) >= ? AND substr(created_at, 1, 10) <= ?
       ORDER BY created_at DESC, rowid DESC
       LIMIT 20`
    )
    .all(elder.id, periodStart, today);

  // 体检报告：只取摘要所需字段，绝不 SELECT image_data
  // （那是几 MB 的 base64，会把复诊摘要响应撑爆、拖慢打印页）
  const checkups = await db
    .prepare(
      `SELECT summary, risk_level, source, created_at
       FROM checkup_reports
       WHERE elder_id = ? AND substr(created_at, 1, 10) >= ? AND substr(created_at, 1, 10) <= ?
       ORDER BY created_at DESC
       LIMIT 10`
    )
    .all(elder.id, periodStart, today);

  // 结构化体检指标趋势：医生复诊时最常对比的关键化验项（血糖、血脂、尿酸等）
  const indicators = await buildElderCheckupIndicators(elder.id);
  const elderProfile = await getElderProfile(elder.id);

  sendJson(response, 200, {
    ok: true,
    generatedAt: nowIso(),
    periodDays,
    periodStart,
    elder: { displayName: elder.displayName, relation },
    elderProfile,
    medications: medications.map((row) => ({
      medicineName: row.medicine_name,
      timeOfDay: row.time_of_day,
      doseNote: row.dose_note ?? "",
      repeatRule: row.repeat_rule || "daily",
      repeatDays: row.repeat_days || "",
      startDate: row.start_date || "",
      endDate: row.end_date || "",
      enabled: row.enabled,
    })),
    bloodPressure: {
      count: bloodPressureRecords.length,
      abnormalCount: bloodPressureRecords.filter(isAbnormalBloodPressure).length,
      average,
      latest: latestRecord
        ? { systolic: latestRecord.systolic, diastolic: latestRecord.diastolic, pulse: latestRecord.pulse, measuredAt: latestRecord.measuredAt }
        : null,
      level: bloodPressureSummary.level,
      label: bloodPressureSummary.label,
      advice: bloodPressureSummary.advice,
      records: bloodPressureRecords,
    },
    adherence: { total, done, missed, pending, rate, missedDetails },
    unwellEvents: unwellEvents.map((row) => ({ rawText: row.raw_text, occurredAt: row.occurred_at, createdAt: row.created_at })),
    checkups: checkups.map((row) => ({ createdAt: row.created_at, summary: row.summary, riskLevel: row.risk_level, source: row.source })),
    indicators,
    // 前端暂时不用这一项，先保留契约里的空字段，避免以后加备注时前端要改判空逻辑
    notes: "",
  });
}

// 取最近 N 条血压记录，并按测量时间升序返回（供趋势图与 analyzeBloodPressure 使用）。
// 之前直接 ORDER BY measured_at ASC LIMIT 60 会取到「最早的 60 条」，超过 60 条后新记录会从看板消失。
async function listRecentBloodPressure(elderId, limit = 60) {
  const rows = await db
    .prepare("SELECT * FROM blood_pressure_logs WHERE elder_id = ? ORDER BY measured_at DESC, rowid DESC LIMIT ?")
    .all(elderId, limit);
  return rows.reverse();
}

async function createBloodPressure(request, response, user) {
  const elder = await getBoundElder(user);
  const body = await readJson(request);
  const systolic = Number(body.systolic);
  const diastolic = Number(body.diastolic);
  const pulse = body.pulse === "" || body.pulse == null ? null : Number(body.pulse);
  // 参数校验失败统一抛 400，前端保留可读文案
  if (!Number.isFinite(systolic) || systolic < 60 || systolic > 260) throw new HttpError(400, "高压数值应在 60 到 260 之间");
  if (!Number.isFinite(diastolic) || diastolic < 40 || diastolic > 180) throw new HttpError(400, "低压数值应在 40 到 180 之间");
  if (pulse !== null && (!Number.isFinite(pulse) || pulse < 30 || pulse > 220)) throw new HttpError(400, "心率数值应在 30 到 220 之间");
  const measuredAt = normalizeMeasuredAt(body.measuredAt);
  const note = String(body.note || "").trim();
  const id = createId("bp");

  await db.prepare(
    `INSERT INTO blood_pressure_logs (id, elder_id, measured_by, systolic, diastolic, pulse, note, measured_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, elder.id, user.id, Math.round(systolic), Math.round(diastolic), pulse === null ? null : Math.round(pulse), note, measuredAt, nowIso());

  const logs = await listRecentBloodPressure(elder.id, 60);
  const summary = analyzeBloodPressure(logs);
  const isAbnormal = summary.level === "danger" || summary.level === "warning";
  const bpText = `${summary.latest.systolic}/${summary.latest.diastolic} mmHg${pulse ? `，心率 ${pulse}` : ""}`;

  if (isAbnormal) {
    const message = `TechGuard 血压提醒：${elder.displayName}刚记录血压 ${bpText}，${summary.advice}`;
    await createAlert(elder.id, "blood_pressure", "血压需要关注", message, id);
    await notifyElderCaregivers(elder.id, "blood_pressure_abnormal", "血压需要关注", `${elder.displayName}刚记录血压 ${bpText}。\n${summary.advice}`, { feishuCard: buildBloodPressureCard(elder, summary, bpText, note) });
  } else {
    await notifyElderCaregivers(elder.id, "blood_pressure_recorded", "血压已记录", `${elder.displayName}刚记录血压 ${bpText}，状态${summary.label}。`, { feishuCard: buildBloodPressureCard(elder, summary, bpText, note) });
  }
  sendJson(response, 200, { ok: true, id, summary });
}

async function bloodPressureList(response, user) {
  const elder = await getBoundElder(user);
  const bloodPressure = await listRecentBloodPressure(elder.id, 60);
  sendJson(response, 200, { ok: true, bloodPressure, summary: analyzeBloodPressure(bloodPressure) });
}

async function analyzeCheckup(request, response, user) {
  const elder = await getBoundElder(user);
  const body = await readJson(request);
  const imageData = required(body.imageData, "请先上传体检报告照片");
  const fileName = String(body.fileName || "checkup-photo").slice(0, 120);
  if (!/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(imageData)) throw new HttpError(400, "请上传 PNG、JPG 或 WebP 图片");
  if (imageData.length > 5_500_000) throw new HttpError(400, "图片太大，请先压缩或重新拍摄更清晰的单页照片");

  const advice = await generateCheckupAdvice({ elder, imageData, fileName });
  const id = createId("checkup");
  // 将原图存入独立存储层（本地 data/uploads 或对象存储），数据库仅保留轻量引用，避免大块 base64 撑爆库
  const stored = await storeCheckupImage({ rootDir: root, reportId: id, imageData, fetchWithTimeout });
  await db.prepare(
    `INSERT INTO checkup_reports (id, elder_id, uploaded_by, file_name, image_data, summary, advice_json, risk_level, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, elder.id, user.id, fileName, stored.storageRef, advice.summary, JSON.stringify(advice), advice.risk_level, advice.source, nowIso());

  const message = `${elder.displayName}上传了体检报告照片。${advice.summary}`;
  await createAlert(elder.id, "checkup", "体检报告已分析", message, id);
  await notifyElderCaregivers(
    elder.id,
    "checkup_analyzed",
    "体检报告已分析",
    message,
    { feishuCard: buildSimpleCard("体检报告已分析", `${elder.displayName}上传了体检报告照片。\n${advice.summary}`) }
  );
  sendJson(response, 200, { ok: true, report: { id, storageBackend: stored.backend, imageUrl: `/api/checkups/${id}/image`, ...advice } });
}

async function getCheckupImage(response, user, reportId) {
  const elder = await getBoundElder(user);
  const row = await db
    .prepare("SELECT image_data FROM checkup_reports WHERE id = ? AND elder_id = ?")
    .get(reportId, elder.id);
  if (!row) throw new HttpError(404, "未找到该体检报告照片");
  const media = readStoredCheckupImage({ rootDir: root, storageRef: row.image_data });
  if (!media) throw new HttpError(404, "体检报告原图不存在或已被清理");
  if (media.kind === "redirect") {
    response.writeHead(302, { Location: media.url, "Cache-Control": "private, max-age=300" });
    response.end();
    return;
  }
  response.writeHead(200, { "Content-Type": media.mime, "Cache-Control": "private, max-age=300" });
  response.end(media.buffer);
}

// ---- 体检指标（checkup_indicators）：结构化记录 + 趋势对比 ----
//
// 为什么要有这一块：体检报告现在只落一段文字摘要，看不出指标趋势，
// 「上次血脂 5.8，这次 5.2，是好转了吗？」这个医生最关心的问题应用答不了。
// 关键约束：不依赖任何 AI 服务，由家属照着报告把关键数字录进去，没配 OpenAI key 也能用。

// 成人常见指标参考范围（服务端内置）。按指标名精确匹配；匹配不到时一律返回 null，绝不瞎判。
// 单侧界限用 null 表示（如总胆固醇只有上限）：判断时只比非 null 的那一侧。
const checkupIndicatorRanges = new Map([
  ["空腹血糖", { unit: "mmol/L", low: 3.9, high: 6.1 }],
  ["糖化血红蛋白", { unit: "%", low: 4.0, high: 6.0 }],
  ["总胆固醇", { unit: "mmol/L", low: null, high: 5.2 }],
  ["甘油三酯", { unit: "mmol/L", low: null, high: 1.7 }],
  ["低密度脂蛋白胆固醇", { unit: "mmol/L", low: null, high: 3.4 }],
  ["高密度脂蛋白胆固醇", { unit: "mmol/L", low: 1.0, high: null }],
  ["尿酸", { unit: "μmol/L", low: 155, high: 420 }],
  ["肌酐", { unit: "μmol/L", low: 44, high: 133 }],
  ["血钾", { unit: "mmol/L", low: 3.5, high: 5.5 }],
  ["血钠", { unit: "mmol/L", low: 137, high: 147 }],
  ["血红蛋白", { unit: "g/L", low: 115, high: 175 }],
]);

// 录入上限：一次最多 30 条（一次体检的常见指标数量级），避免单请求写入过多数据
const checkupIndicatorMaxItems = 30;
const checkupIndicatorNameMaxLength = 40;
const checkupIndicatorUnitMaxLength = 20;
const checkupIndicatorNoteMaxLength = 100;
const checkupIndicatorValueLimit = 100000;
// history 只回最近 10 条：趋势图/对比只需要最近几次，全量返回会让前端和响应都变重
const checkupIndicatorHistoryLimit = 10;

// 指标数值校验：只接受数字或非空数字字符串。
// 不能用裸 Number()：Number("") === 0、Number(true) === 1，会把明显的空值/脏输入静默当成 0。
function normalizeIndicatorValue(value, label) {
  if (typeof value !== "number" && typeof value !== "string") throw new HttpError(400, `${label}的数值必须是数字`);
  const text = typeof value === "string" ? value.trim() : value;
  if (text === "") throw new HttpError(400, `${label}的数值不能为空`);
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed < -checkupIndicatorValueLimit || parsed > checkupIndicatorValueLimit) {
    throw new HttpError(400, `${label}的数值必须在 -${checkupIndicatorValueLimit} 到 ${checkupIndicatorValueLimit} 之间`);
  }
  return parsed;
}

// 日期必须是合法的 YYYY-MM-DD：零填充的字符串才能直接做区间/先后比较，
// 宽松解析（如 new Date("2026/1/1")）会写出无法比较的脏值。
// 体检日期、任务日期都靠它——写成 "abc" 这类脏值会被字符串比较静默漏掉，任务从此从列表和提醒里消失。
function normalizeIsoDate(value, label, emptyMessage) {
  const text = required(value, emptyMessage || `请填写${label}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new HttpError(400, `${label}格式不正确，请使用 YYYY-MM-DD（例如 2026-10-03）`);
  const parsed = new Date(`${text}T00:00:00Z`);
  // 反查格式化结果，挡住 2026-02-31 这类「格式对但不存在」的日期（Date 会自动进位成 3 月）
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) throw new HttpError(400, `${label}不是有效日期`);
  return text;
}

function normalizeMeasuredDate(value) {
  return normalizeIsoDate(value, "检查日期", "请选择检查日期");
}

// 血压的测量时间必须是「可排序」的时间戳：前端可能传 datetime-local（2026-10-10T08:30）
// 或完整 ISO。不校验会写进 "9999999999" 这类脏值——血压摘要取「最新一条」用的正是字符串排序，
// 脏值会顶掉真实记录，而 substr(measured_at,1,10) 做区间过滤时又会把它排除在外，
// 导致 dashboard 与复诊摘要口径不一致。
function normalizeMeasuredAt(value) {
  const text = String(value ?? "").trim();
  if (!text) return nowIso();
  if (!/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?)?$/.test(text)) {
    throw new HttpError(400, "测量时间格式不正确，请使用 2026-10-10 或 2026-10-10T08:30 这样的格式");
  }
  // ISO 日期串在 JS 里是严格校验的，2026-02-31 会直接解析失败
  if (Number.isNaN(new Date(text.replace(" ", "T")).getTime())) throw new HttpError(400, "测量时间不是有效时间");
  return text;
}

// 单条指标校验。调用方在写库之前把全部条目过一遍，做到「部分非法就整体 400、不插入一半」。
function normalizeIndicatorItem(item, index) {
  const label = `第 ${index + 1} 条指标`;
  if (!item || typeof item !== "object" || Array.isArray(item)) throw new HttpError(400, `${label}格式不正确`);
  const name = String(item.name ?? "").trim();
  if (!name) throw new HttpError(400, `${label}的指标名不能为空`);
  // 指标名过长多半是整段报告文本被误粘贴进来，限长避免趋势列表被撑爆
  if (name.length > checkupIndicatorNameMaxLength) throw new HttpError(400, `${label}的指标名最多 ${checkupIndicatorNameMaxLength} 个字`);
  const value = normalizeIndicatorValue(item.value, label);
  const unit = String(item.unit ?? "").trim();
  if (unit.length > checkupIndicatorUnitMaxLength) throw new HttpError(400, `${label}的单位最多 ${checkupIndicatorUnitMaxLength} 个字`);
  const note = String(item.note ?? "").trim();
  if (note.length > checkupIndicatorNoteMaxLength) throw new HttpError(400, `${label}的备注最多 ${checkupIndicatorNoteMaxLength} 个字`);
  // 空字符串统一落 NULL，前端判空只需处理 null（与 users.phone 的处理方式一致）
  return { name, value, unit: unit || null, note: note || null };
}

// 是否超出参考范围：只比非 null 的那一侧（单侧界限指标的另一侧为 null）。
// 指标名没有参考范围时返回 null——「判不了」和「正常」是两回事，不能混成一个 false。
function isIndicatorOutOfRange(value, range) {
  if (!range) return null;
  if (range.low === null && range.high === null) return null;
  return (range.low !== null && value < range.low) || (range.high !== null && value > range.high);
}

// 指标名排序：普通字符串比较（不依赖 ICU 排序规则），保证不同机器 / 不同 Node 版本顺序一致
function compareIndicatorName(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

// 把同一个指标名的全部记录（已按 measured_date ASC, created_at ASC 排好）聚合成前端要的形状。
function buildIndicatorSummary(name, items) {
  // 排序保证最后一条就是「日期最新；同一天则 created_at 最新」
  const latest = items[items.length - 1];
  // previous 要求日期严格早于 latest：先滤掉同一天的其他记录，再取较早那批里最新的一条
  const earlier = items.filter((row) => row.measured_date < latest.measured_date);
  const previous = earlier.length ? earlier[earlier.length - 1] : null;
  // 保留一位小数：浮点差（6.8 - 6.2 = 0.5999999…）直接回给前端会显示成难看的数字
  const delta = previous ? Number((latest.value - previous.value).toFixed(1)) : null;
  const direction = delta === null || delta === 0 ? "flat" : delta > 0 ? "up" : "down";
  const range = checkupIndicatorRanges.get(name) || null;

  return {
    name,
    // unit 取该指标最近一条的 unit（可能为 null）
    unit: latest.unit ?? null,
    refLow: range ? range.low : null,
    refHigh: range ? range.high : null,
    latest: { id: latest.id, value: latest.value, measuredDate: latest.measured_date, unit: latest.unit ?? null },
    previous: previous ? { id: previous.id, value: previous.value, measuredDate: previous.measured_date, unit: previous.unit ?? null } : null,
    delta,
    direction,
    // outOfRange 只按 latest 判断（不是按历史），无参考范围时为 null
    outOfRange: isIndicatorOutOfRange(latest.value, range),
    // 最近 10 条，仍按 measured_date ASC 升序
    history: items.slice(-checkupIndicatorHistoryLimit).map((row) => ({ id: row.id, value: row.value, measuredDate: row.measured_date })),
  };
}

// 体检指标趋势：长辈名下所有出现过的指标按名分组，超范围的排前面。
async function buildElderCheckupIndicators(elderId) {
  // 一次取全量（家属手工录入，量级很小）；排序在这里定死，供 latest / previous / history 共用同一口径
  const rows = await db
    .prepare(
      `SELECT id, name, value, unit, measured_date, created_at
       FROM checkup_indicators
       WHERE elder_id = ?
       ORDER BY measured_date ASC, created_at ASC, rowid ASC`
    )
    .all(elderId);

  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.name)) groups.set(row.name, []);
    groups.get(row.name).push(row);
  }

  const indicators = [...groups.entries()].map(([name, items]) => buildIndicatorSummary(name, items));
  // 超范围的排前面（家属/医生最需要先看到），其余按指标名升序。
  // 只把 outOfRange === true 视为「需要关注」，null（无参考范围）与 false 一视同仁地按名字排，
  // 否则 comparator 会不对称、排序结果依赖引擎内部实现。
  indicators.sort((a, b) => {
    const aFlagged = a.outOfRange === true;
    const bFlagged = b.outOfRange === true;
    if (aFlagged !== bFlagged) return aFlagged ? -1 : 1;
    return compareIndicatorName(a.name, b.name);
  });
  return indicators;
}

async function checkupIndicatorList(response, user) {
  const elder = await getBoundElder(user);
  sendJson(response, 200, { ok: true, indicators: await buildElderCheckupIndicators(elder.id) });
}

async function saveCheckupIndicators(request, response, user) {
  assertCaregiver(user);
  const elder = await getBoundElder(user);
  const body = await readJson(request);
  const measuredDate = normalizeMeasuredDate(body.measuredDate);
  const items = body.items;
  if (!Array.isArray(items) || !items.length) throw new HttpError(400, "请至少填写一条体检指标");
  if (items.length > checkupIndicatorMaxItems) throw new HttpError(400, `一次最多录入 ${checkupIndicatorMaxItems} 条体检指标`);

  // 先全部校验再写库：部分非法就整体 400，绝不插入一半（否则趋势里会出现缺了一块的假数据）
  const normalized = items.map((item, index) => normalizeIndicatorItem(item, index));

  const createdAt = nowIso();
  for (const item of normalized) {
    await db
      .prepare(
        `INSERT INTO checkup_indicators (id, elder_id, name, value, unit, measured_date, note, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(createId("ind"), elder.id, item.name, item.value, item.unit, measuredDate, item.note, user.id, createdAt);
  }
  sendJson(response, 200, { ok: true, inserted: normalized.length });
}

// 删除某条体检指标：录错了要能改，否则错误数字会一直污染趋势。
async function deleteCheckupIndicator(request, response, user, indicatorId) {
  assertCaregiver(user);
  const elder = await getBoundElder(user);
  // 不属于该长辈的 id 一律 404，避免用状态码泄露「别人家是否录了这个指标」
  const existing = await db.prepare("SELECT id FROM checkup_indicators WHERE id = ? AND elder_id = ?").get(indicatorId, elder.id);
  if (!existing) throw new HttpError(404, "未找到该体检指标记录");
  await db.prepare("DELETE FROM checkup_indicators WHERE id = ? AND elder_id = ?").run(indicatorId, elder.id);
  sendJson(response, 200, { ok: true });
}

// ---- 用药周期规则：支持每天（daily）、隔日（alternate）、每周固定日（weekly）及起止日期（疗程）----
const medicationRepeatRules = new Set(["daily", "alternate", "weekly"]);

function normalizeMedicationRepeatRule(value) {
  const rule = String(value ?? "daily").trim() || "daily";
  if (!medicationRepeatRules.has(rule)) throw new HttpError(400, "用药频率只能是 daily（每天）、alternate（隔日）或 weekly（每周固定日）");
  return rule;
}

// 周几列表：1=周一 .. 7=周日，支持数组或逗号分隔字符串，去重排序后存成 "1,3,5"
function normalizeMedicationRepeatDays(value, repeatRule) {
  if (repeatRule !== "weekly") return "";
  const rawList = Array.isArray(value) ? value : String(value ?? "").split(/[,，\s]+/);
  const days = [...new Set(rawList.map((item) => Number(String(item).trim())).filter((n) => Number.isInteger(n) && n >= 1 && n <= 7))].sort((a, b) => a - b);
  if (!days.length) throw new HttpError(400, "每周固定日用药请至少选择一天（周一到周日）");
  return days.join(",");
}

function normalizeOptionalIsoDate(value, label) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return normalizeIsoDate(text, label);
}

async function createMedication(request, response, user) {
  assertCaregiver(user);
  const elder = await getBoundElder(user);
  const body = await readJson(request);
  const medicineName = required(body.medicineName, "药品名称不能为空");
  const timeOfDay = validateTimeOfDay(body.timeOfDay, "用药时间");
  const doseNote = String(body.doseNote || "").trim();
  const mealTiming = String(body.mealTiming || "").trim();
  const repeatRule = normalizeMedicationRepeatRule(body.repeatRule);
  const repeatDays = normalizeMedicationRepeatDays(body.repeatDays, repeatRule);
  const startDate = normalizeOptionalIsoDate(body.startDate, "开始日期") || (repeatRule === "alternate" ? todayDate() : null);
  const endDate = normalizeOptionalIsoDate(body.endDate, "结束日期");
  if (startDate && endDate && endDate < startDate) throw new HttpError(400, "结束日期不能早于开始日期");
  const id = createId("med");

  await db.prepare(
    `INSERT INTO medication_schedules
     (id, elder_id, created_by, medicine_name, dose_note, meal_timing, time_of_day, repeat_rule, repeat_days, start_date, end_date, remind_elder, remind_caregiver, enabled, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 1, ?)`
  ).run(id, elder.id, user.id, medicineName, doseNote, mealTiming, timeOfDay, repeatRule, repeatDays, startDate, endDate, nowIso());
  await ensureTodayMedicationLogs(elder.id);
  await createAlert(elder.id, "medication", "吃药提醒已设置", `TechGuard 吃药提醒：${elder.displayName} ${timeOfDay} 需要服用${medicineName}${doseNote ? `（${doseNote}）` : ""}。`);
  await notifyElder(elder, "task_assigned", "新的吃药提醒", `${user.displayName}为您设置了吃药提醒：\n${timeOfDay} 服用${medicineName}${doseNote ? `（${doseNote}）` : ""}。`);
  sendJson(response, 200, { ok: true, id });
}

// 吃药计划列表：家属和长辈都能读。返回该长辈「全部」计划（含已停用 enabled = 0），
// 前端要能在列表里把停用的计划重新启用，所以这里不能按 enabled 过滤。
async function medicationList(response, user) {
  const elder = await getBoundElder(user);
  const medications = await db
    .prepare(
      `SELECT id, medicine_name, time_of_day, dose_note, meal_timing, repeat_rule, repeat_days, start_date, end_date, enabled, remind_elder, remind_caregiver, created_at
       FROM medication_schedules
       WHERE elder_id = ?
       ORDER BY time_of_day ASC`
    )
    .all(elder.id);
  sendJson(response, 200, { ok: true, medications });
}

// 修改吃药计划：只更新请求体里出现的字段，未传的保持原值（前端「编辑」可能只改时间或只改药名）。
// 与删除的区别见 deleteMedication：这里传 enabled = 0 属于「停用」，历史服药记录全部保留。
async function updateMedication(request, response, user, scheduleId) {
  assertCaregiver(user);
  const elder = await getBoundElder(user);
  // 不属于该家属绑定长辈的 id 一律按 404 处理，避免用状态码泄露「别人家的计划是否存在」
  const existing = await db.prepare("SELECT * FROM medication_schedules WHERE id = ? AND elder_id = ?").get(scheduleId, elder.id);
  if (!existing) throw new HttpError(404, "未找到该吃药计划");

  const body = await readJson(request);
  const updates = {};
  if (body.medicineName !== undefined) updates.medicine_name = required(body.medicineName, "药品名称不能为空");
  if (body.timeOfDay !== undefined) updates.time_of_day = validateTimeOfDay(body.timeOfDay, "用药时间");
  if (body.doseNote !== undefined) updates.dose_note = String(body.doseNote || "").trim();
  if (body.enabled !== undefined) updates.enabled = normalizeEnabledFlag(body.enabled);
  const nextRule = body.repeatRule !== undefined ? normalizeMedicationRepeatRule(body.repeatRule) : existing.repeat_rule || "daily";
  if (body.repeatRule !== undefined) updates.repeat_rule = nextRule;
  if (body.repeatDays !== undefined || body.repeatRule !== undefined) {
    updates.repeat_days = normalizeMedicationRepeatDays(body.repeatDays !== undefined ? body.repeatDays : existing.repeat_days, nextRule);
  }
  const nextStart = body.startDate !== undefined ? normalizeOptionalIsoDate(body.startDate, "开始日期") : existing.start_date;
  const nextEnd = body.endDate !== undefined ? normalizeOptionalIsoDate(body.endDate, "结束日期") : existing.end_date;
  if (nextStart && nextEnd && nextEnd < nextStart) throw new HttpError(400, "结束日期不能早于开始日期");
  if (body.startDate !== undefined) updates.start_date = nextStart;
  if (body.endDate !== undefined) updates.end_date = nextEnd;

  // updates 的 key 来自上面的白名单字面量，不是用户输入，拼 SQL 不存在注入风险
  const fields = Object.keys(updates);
  if (fields.length) {
    await db
      .prepare(`UPDATE medication_schedules SET ${fields.map((field) => `${field} = ?`).join(", ")} WHERE id = ? AND elder_id = ?`)
      .run(...fields.map((field) => updates[field]), scheduleId, elder.id);
  }
  sendJson(response, 200, { ok: true });
}

// 删除吃药计划。
// 语义区别（重要）：enabled = 0 是「停用」——不再提醒、历史 medication_logs 全部保留；
// 删除是「彻底移除」——计划和它的日志一起清掉，否则 medication_logs 会变成指向不存在计划的孤儿行，
// dashboard 的 JOIN 查不到计划，这些记录会以幽灵数据的形式留在库里。
async function deleteMedication(request, response, user, scheduleId) {
  assertCaregiver(user);
  const elder = await getBoundElder(user);
  const existing = await db.prepare("SELECT id FROM medication_schedules WHERE id = ? AND elder_id = ?").get(scheduleId, elder.id);
  if (!existing) throw new HttpError(404, "未找到该吃药计划");

  // 先数一遍要删的日志数量，返回给前端提示「已同时删除 N 条服药记录」
  const logCount = await db.prepare("SELECT COUNT(*) as count FROM medication_logs WHERE schedule_id = ?").get(scheduleId);
  // 连带清掉指向这些日志的告警：否则「吃药未确认」会作为幽灵条目永远留在告警中心，
  // 点进去对应的计划却已经不存在了。
  await db.prepare(
    "DELETE FROM alerts WHERE elder_id = ? AND type IN ('medication', 'medication_overdue') AND ref_id IN (SELECT id FROM medication_logs WHERE schedule_id = ?)"
  ).run(elder.id, scheduleId);
  await db.prepare("DELETE FROM medication_logs WHERE schedule_id = ?").run(scheduleId);
  await db.prepare("DELETE FROM medication_schedules WHERE id = ? AND elder_id = ?").run(scheduleId, elder.id);
  sendJson(response, 200, { ok: true, deletedLogs: Number(logCount?.count || 0) });
}

// ---- 用药库存（medication_stock）：回答「这盒药还剩几片、还能吃几天」----

// 缺药提醒阈值（天）：默认 7，可用 MEDICATION_STOCK_ALERT_DAYS 覆盖，非法值回落到 7。
// 每次调用时读取环境变量（而不是模块加载时固定），阈值既影响 GET 的 low 标记也影响 cron，
// 集中在一个函数里可以保证两处口径完全一致。
const medicationStockDefaultAlertDays = 7;

// 导出以便测试/脚本直接验证阈值解析，不必起 HTTP 服务（与 parseLifeEvent 的导出理由相同）
export function medicationStockAlertDays() {
  const raw = String(process.env.MEDICATION_STOCK_ALERT_DAYS ?? "").trim();
  if (!raw) return medicationStockDefaultAlertDays;
  const parsed = Number(raw);
  // 只接受非负整数：负数 / 小数 / "abc" 一律回落默认值，避免配置写错导致提醒消失或全量误报
  if (!Number.isInteger(parsed) || parsed < 0) return medicationStockDefaultAlertDays;
  return parsed;
}

// 库存数值校验：只接受「数字或纯数字字符串」，显式拒绝负数、小数、空串、十六进制、科学计数法。
// 不用裸 Number() 是因为 Number("") === 0、Number(" 12 ") === 12、Number("0x10") === 16，
// 这些隐式宽松转换会把明显的脏输入静默当成合法数字（空值变成 0 片药最危险）。
function normalizeStockInteger(value, min, max, message) {
  const text = typeof value === "number" ? String(value) : String(value ?? "").trim();
  if (!/^\d+$/.test(text)) throw new HttpError(400, message);
  const parsed = Number(text);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw new HttpError(400, message);
  return parsed;
}

// 该长辈每个药名下「启用中的日均剂数」：
// daily = 1 剂/天；alternate = 0.5 剂/天；weekly = 每周天数 / 7；已过结束日期的疗程计 0。
async function enabledDosesPerMedicine(elderId) {
  const today = todayDate();
  const rows = await db
    .prepare("SELECT medicine_name, repeat_rule, repeat_days, end_date FROM medication_schedules WHERE elder_id = ? AND enabled = 1")
    .all(elderId);
  const map = new Map();
  for (const row of rows) {
    if (row.end_date && row.end_date < today) continue;
    let weight = 1;
    if (row.repeat_rule === "alternate") {
      weight = 0.5;
    } else if (row.repeat_rule === "weekly") {
      const count = String(row.repeat_days || "")
        .split(",")
        .filter((item) => /^[1-7]$/.test(item.trim())).length;
      weight = count / 7;
    }
    map.set(row.medicine_name, (map.get(row.medicine_name) || 0) + weight);
  }
  return map;
}

// 出参统一形状：GET 列表元素与 POST 返回的 stock 共用这一份映射，前端只需一套渲染逻辑。
// remainingDays 为 null 表示「算不出来」——药已停用 / 没有计划（每日消耗为 0）。
// 这里绝不用 Infinity 或 9999 代替 null，否则前端会把「不追踪的药」显示成「还能吃很久」。
function mapMedicationStock(medicineName, dosesPerDay, stock) {
  const unitsPerDose = stock ? Number(stock.units_per_dose) || 1 : 1;
  const dailyUnits = dosesPerDay * unitsPerDose;
  const unitsRemaining = stock ? Number(stock.units_remaining) : null;
  const remainingDays = stock && dailyUnits > 0 ? Math.floor(unitsRemaining / dailyUnits) : null;
  return {
    id: stock ? stock.id : null,
    medicineName,
    unitsRemaining,
    unitsPerDose,
    dosesPerDay,
    dailyUnits,
    remainingDays,
    low: remainingDays !== null && remainingDays <= medicationStockAlertDays(),
    note: stock ? stock.note ?? "" : "",
    updatedAt: stock ? stock.updated_at : null,
  };
}

// 药名排序：普通字符串比较（不依赖 ICU 排序规则），保证不同机器 / 不同 Node 版本顺序一致
function compareMedicineName(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

async function buildMedicationStockList(elderId) {
  // 药名来源一：该长辈全部用药计划（含 enabled = 0——停药了也可能还有半盒要盯着），按药名去重
  const doseMap = await enabledDosesPerMedicine(elderId);
  const stockRows = await db.prepare("SELECT * FROM medication_stock WHERE elder_id = ?").all(elderId);
  const stockByName = new Map(stockRows.map((row) => [row.medicine_name, row]));
  const scheduleNames = await db.prepare("SELECT DISTINCT medicine_name FROM medication_schedules WHERE elder_id = ?").all(elderId);

  // 药名集合 = 「有计划」∪「已登记库存」：只登记了库存、计划还没建的药也必须出现，
  // 否则家属登记完就再也看不到它，也无法删除。
  const names = new Set([...scheduleNames.map((row) => row.medicine_name), ...stockByName.keys()]);
  const stocks = [...names]
    .filter((name) => name)
    .map((name) => mapMedicationStock(name, doseMap.get(name) || 0, stockByName.get(name) || null));

  // 缺药的排前面（家属最需要先看到「快吃完了」的药），同组内按药名稳定排序
  return stocks.sort((a, b) => (a.low === b.low ? compareMedicineName(a.medicineName, b.medicineName) : a.low ? -1 : 1));
}

async function medicationStockList(response, user) {
  const elder = await getBoundElder(user);
  sendJson(response, 200, { ok: true, stocks: await buildMedicationStockList(elder.id) });
}

async function saveMedicationStock(request, response, user) {
  assertCaregiver(user);
  const elder = await getBoundElder(user);
  const body = await readJson(request);
  const medicineName = required(body.medicineName, "药品名称不能为空");
  // 贴了整段说明书当药名的话列表会被撑爆，这里限长
  if (medicineName.length > 60) throw new HttpError(400, "药品名称最多 60 个字");
  const unitsRemaining = normalizeStockInteger(body.unitsRemaining, 0, 100000, "剩余数量必须是 0 到 100000 之间的整数");
  // unitsPerDose 可选：缺省（null / undefined / 空串）按 1 片处理
  const unitsPerDose =
    body.unitsPerDose === undefined || body.unitsPerDose === null || body.unitsPerDose === ""
      ? 1
      : normalizeStockInteger(body.unitsPerDose, 1, 100, "每次用量必须是 1 到 100 之间的整数");
  const note = String(body.note ?? "").trim();
  const id = createId("stock");

  // 按 (elder_id, medicine_name) upsert：同一个药反复登记只更新这一行，不会堆出多条库存
  await db.prepare(
    `INSERT INTO medication_stock (id, elder_id, medicine_name, units_remaining, units_per_dose, note, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(elder_id, medicine_name) DO UPDATE SET
       units_remaining = excluded.units_remaining,
       units_per_dose = excluded.units_per_dose,
       note = excluded.note,
       updated_at = excluded.updated_at`
  ).run(id, elder.id, medicineName, unitsRemaining, unitsPerDose, note, nowIso());

  // 回读库里那一行（upsert 时新 id 会被丢弃），保证返回的 id / updatedAt 与数据库一致
  const saved = await db.prepare("SELECT * FROM medication_stock WHERE elder_id = ? AND medicine_name = ?").get(elder.id, medicineName);
  const dosesPerDay = (await enabledDosesPerMedicine(elder.id)).get(medicineName) || 0;
  sendJson(response, 200, { ok: true, stock: mapMedicationStock(medicineName, dosesPerDay, saved) });
}

// 删除库存登记：表示「不再追踪这个药」，不影响任何用药计划与历史服药记录。
async function deleteMedicationStock(request, response, user, stockId) {
  assertCaregiver(user);
  const elder = await getBoundElder(user);
  // 不属于该长辈的 id 一律 404，避免用状态码泄露「别人家是否登记了这个药」
  const existing = await db.prepare("SELECT id FROM medication_stock WHERE id = ? AND elder_id = ?").get(stockId, elder.id);
  if (!existing) throw new HttpError(404, "未找到该药品的库存登记");
  await db.prepare("DELETE FROM medication_stock WHERE id = ? AND elder_id = ?").run(stockId, elder.id);
  sendJson(response, 200, { ok: true });
}

// 确认吃药后自动扣减库存：按药名找登记，扣掉这次吃的片数。
// 没有登记就静默跳过——库存是家属主动维护的数据，自动补一条 0 片记录反而会让人以为药已用完。
// 返回是否真的扣减，便于调用方（和测试）确认行为。
async function deductMedicationStock(elderId, medicineName) {
  if (!medicineName) return false;
  const stock = await db.prepare("SELECT id, units_remaining, units_per_dose FROM medication_stock WHERE elder_id = ? AND medicine_name = ?").get(elderId, medicineName);
  if (!stock) return false;
  const unitsPerDose = Math.max(1, Number(stock.units_per_dose) || 1);
  // MAX(0, ...)：库存已经见底时再确认一次也不会扣成负数（负数会让「还能吃几天」算出负值）
  const remaining = Math.max(0, (Number(stock.units_remaining) || 0) - unitsPerDose);
  await db.prepare("UPDATE medication_stock SET units_remaining = ?, updated_at = ? WHERE id = ?").run(remaining, nowIso(), stock.id);
  return true;
}

async function completeMedication(request, response, user, logId) {
  const elder = await getBoundElder(user);
  const body = await readJson(request);
  const log = await db.prepare("SELECT * FROM medication_logs WHERE id = ? AND elder_id = ?").get(logId, elder.id);
  if (!log) return sendJson(response, 404, { ok: false, message: "未找到用药记录" });
  // 幂等：重复确认（老人手机上连点两下、网络重试、脚本重放）不能再扣一次库存，否则
  // 「还能吃几天」会偏少并误报「药快吃完了」，也不能重复打扰家属。
  if (log.status === "done") return sendJson(response, 200, { ok: true, alreadyCompleted: true });
  await db.prepare("UPDATE medication_logs SET status = 'done', completed_at = ?, note = ? WHERE id = ?").run(nowIso(), String(body.note || ""), logId);
  const schedule = await db.prepare("SELECT * FROM medication_schedules WHERE id = ?").get(log.schedule_id);
  // 自动扣减库存：整段 try/catch 包住，扣减只是附带的记账动作，
  // 任何异常都不能影响「我已吃药」这个主流程本身（确认必须成功返回 200）。
  try {
    await deductMedicationStock(elder.id, schedule?.medicine_name);
  } catch (error) {
    console.warn("[TechGuard] 自动扣减用药库存失败：", error?.message || error);
  }
  await notifyElderCaregivers(elder.id, "medication_completed", "吃药已确认", `${elder.displayName}已确认服用${schedule?.medicine_name || "药品"}（${schedule?.time_of_day || ""}）。`, { feishuCard: buildSimpleCard("✅ 吃药已确认", `${elder.displayName}已确认服用${schedule?.medicine_name || "药品"}。\n时间：${schedule?.time_of_day || ""}`) });
  sendJson(response, 200, { ok: true });
}

const taskRepeatRules = new Set(["none", "daily", "weekly"]);

function normalizeTaskRepeatRule(value) {
  const rule = String(value ?? "none").trim() || "none";
  if (!taskRepeatRules.has(rule)) throw new HttpError(400, "任务重复规则只能是 none（单次）、daily（每天）或 weekly（每周）");
  return rule;
}

async function createTask(request, response, user) {
  assertCaregiver(user);
  const elder = await getBoundElder(user);
  const body = await readJson(request);
  const title = required(body.title, "任务标题不能为空");
  const description = String(body.description || "").trim();
  const dueDate = normalizeIsoDate(body.dueDate || todayDate(), "任务日期");
  // 任务时间必须是 HH:MM（或 HH:MM:SS），否则字符串比较会漏提醒
  const dueTime = validateTimeOfDay(body.dueTime || "09:00", "任务时间");
  const repeatRule = normalizeTaskRepeatRule(body.repeatRule);
  const id = createId("task");

  await db.prepare(
    `INSERT INTO care_tasks
     (id, elder_id, created_by, title, description, due_date, due_time, repeat_rule, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
  ).run(id, elder.id, user.id, title, description, dueDate, dueTime, repeatRule, nowIso());
  await createAlert(elder.id, "task", "任务已安排", `TechGuard 任务提醒：${elder.displayName} ${dueDate} ${dueTime} 需要完成：${title}。`);
  await notifyElder(elder, "task_assigned", "家人安排了新任务", `${user.displayName}给您安排了新任务：\n${title}${description ? `\n说明：${description}` : ""}\n时间：${dueDate} ${dueTime}`);
  sendJson(response, 200, { ok: true, id });
}

async function completeTask(request, response, user, taskId) {
  const elder = await getBoundElder(user);
  const body = await readJson(request);
  const task = await db.prepare("SELECT * FROM care_tasks WHERE id = ? AND elder_id = ?").get(taskId, elder.id);
  if (!task) return sendJson(response, 404, { ok: false, message: "未找到任务" });
  const wasDone = task.status === "done";
  await db.prepare("UPDATE care_tasks SET status = 'done', completed_at = ?, completion_note = ? WHERE id = ?").run(nowIso(), String(body.note || ""), taskId);

  // 周期任务（daily / weekly）完成时自动生成下一次待办（幂等：重复点完成不再重复生成）
  let nextTaskId = null;
  if (!wasDone && (task.repeat_rule === "daily" || task.repeat_rule === "weekly")) {
    const stepDays = task.repeat_rule === "daily" ? 1 : 7;
    const nextDate = addDaysToIsoDate(task.due_date, stepDays);
    const existingNext = await db
      .prepare("SELECT id FROM care_tasks WHERE elder_id = ? AND title = ? AND due_date = ? AND due_time = ? AND status = 'pending'")
      .get(elder.id, task.title, nextDate, task.due_time);
    if (!existingNext) {
      nextTaskId = createId("task");
      await db.prepare(
        `INSERT INTO care_tasks
         (id, elder_id, created_by, title, description, due_date, due_time, repeat_rule, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
      ).run(nextTaskId, elder.id, task.created_by, task.title, task.description || "", nextDate, task.due_time, task.repeat_rule, nowIso());
    }
  }

  if (!wasDone) {
    await notifyElderCaregivers(elder.id, "task_completed", "任务已完成", `${elder.displayName}完成了任务：${task.title}。`, { feishuCard: buildSimpleCard("✅ 任务已完成", `${elder.displayName}完成了任务：${task.title}\n时间：${task.due_date} ${task.due_time}`) });
  }
  sendJson(response, 200, { ok: true, nextTaskId });
}

// 任务状态白名单：写入前必须挡住任意字符串，否则 dashboard / cron 的 status = 'pending' 判断会全部失效
const taskStatuses = ["pending", "done", "missed"];

// 修改任务：只更新请求体里出现的字段，其余保持原值。
async function updateTask(request, response, user, taskId) {
  assertCaregiver(user);
  const elder = await getBoundElder(user);
  const existing = await db.prepare("SELECT id, completed_at FROM care_tasks WHERE id = ? AND elder_id = ?").get(taskId, elder.id);
  if (!existing) throw new HttpError(404, "未找到任务");

  const body = await readJson(request);
  const updates = {};
  if (body.title !== undefined) updates.title = required(body.title, "任务标题不能为空");
  if (body.description !== undefined) updates.description = String(body.description || "").trim();
  // due_date / due_time 是 dashboard 与 cron 做字符串比较的依据，空值会让任务从列表里消失，必须校验
  if (body.dueDate !== undefined) updates.due_date = normalizeIsoDate(body.dueDate, "任务日期");
  if (body.dueTime !== undefined) updates.due_time = validateTimeOfDay(body.dueTime, "任务时间");
  if (body.repeatRule !== undefined) updates.repeat_rule = normalizeTaskRepeatRule(body.repeatRule);
  if (body.status !== undefined) {
    const status = String(body.status);
    if (!taskStatuses.includes(status)) throw new HttpError(400, "任务状态只能是 pending、done 或 missed");
    updates.status = status;
    // 状态与完成时间保持一致：标记完成时补上 completed_at，改回 pending 时清掉，
    // 否则前端会显示「已完成但没有完成时间」这样的脏数据。
    if (status === "done") updates.completed_at = existing.completed_at || nowIso();
    if (status === "pending") updates.completed_at = null;
  }

  const fields = Object.keys(updates);
  if (fields.length) {
    await db.prepare(`UPDATE care_tasks SET ${fields.map((field) => `${field} = ?`).join(", ")} WHERE id = ? AND elder_id = ?`)
      .run(...fields.map((field) => updates[field]), taskId, elder.id);
  }
  sendJson(response, 200, { ok: true });
}

// 删除任务：任务下没有从属记录，直接删。相关 alerts（ref_id = 任务 id）作为历史提醒保留。
async function deleteTask(request, response, user, taskId) {
  assertCaregiver(user);
  const elder = await getBoundElder(user);
  const existing = await db.prepare("SELECT id FROM care_tasks WHERE id = ? AND elder_id = ?").get(taskId, elder.id);
  if (!existing) throw new HttpError(404, "未找到任务");
  await db.prepare("DELETE FROM care_tasks WHERE id = ? AND elder_id = ?").run(taskId, elder.id);
  sendJson(response, 200, { ok: true });
}

async function saveWeatherSettings(request, response, user) {
  assertCaregiver(user);
  const elder = await getBoundElder(user);
  const body = await readJson(request);
  const city = required(body.city, "城市不能为空");
  const district = String(body.district || "").trim();
  // 天气关怀时间同样限定 HH:MM，保证与 cron 的当前时间字符串比较一致
  const careTime = validateTimeOfDay(body.careTime || "08:00", "天气关怀时间");
  await db.prepare(
    `INSERT INTO weather_settings (elder_id, city, district, care_time, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(elder_id) DO UPDATE SET city = excluded.city, district = excluded.district, care_time = excluded.care_time, updated_at = excluded.updated_at`
  ).run(elder.id, city, district, careTime, nowIso());
  await createAlert(elder.id, "weather", "天气地区已设置", `TechGuard 天气关怀：已设置${elder.displayName}所在地为${city}${district ? district : ""}。`);
  sendJson(response, 200, { ok: true });
}

async function weatherCare(response, user) {
  const elder = await getBoundElder(user);
  const weather = (await db.prepare("SELECT * FROM weather_settings WHERE elder_id = ?").get(elder.id)) || null;
  sendJson(response, 200, { ok: true, weather, care: await buildWeatherCare(weather) });
}

async function fraudCheck(request, response, user) {
  const elder = await getBoundElder(user);
  const body = await readJson(request);
  const text = String(body.text || "").trim();
  const imageData = String(body.imageData || "").trim();
  if (!text && !imageData) throw new HttpError(400, "请粘贴可疑短信，或上传可疑聊天/短信截图");

  let result;
  if (imageData) {
    if (!/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(imageData)) {
      throw new HttpError(400, "截图只支持 PNG、JPG 或 WebP 格式");
    }
    if (imageData.length > 5_500_000) {
      throw new HttpError(400, "截图文件太大，请重新截取更小范围的图片");
    }
    result = await analyzeFraudImage({ elder, imageData, supplementalText: text });
  } else {
    result = { ...analyzeFraud(text, elder.displayName), source: "local-rules" };
  }

  if (result.score >= 80) {
    const channelLabel = imageData ? "截图" : "短信";
    const message = `${elder.displayName}提交了疑似${result.type}${channelLabel}，请尽快联系老人，提醒不要点链接、不要回验证码、不要转账。`;
    await createAlert(elder.id, "fraud", "高危防骗提醒", message);
    await notifyElderCaregivers(
      elder.id,
      "fraud_detected",
      "高危防骗提醒",
      message,
      { feishuCard: buildSimpleCard("⚠️ 高危防骗提醒", message) }
    );
  }
  sendJson(response, 200, { ok: true, result });
}

async function analyzeFraudImage({ elder, imageData, supplementalText }) {
  const addressee = String(elder?.displayName || "").trim() || "您";
  const textFallback = supplementalText ? analyzeFraud(supplementalText, addressee) : null;
  const fallback = textFallback
    ? {
        ...textFallback,
        reasons: [...textFallback.reasons, "当前未启用图片智能识别，以上结论基于您补充的文字内容"],
        source: "local-fallback",
      }
    : {
        score: 50,
        level: "中风险可疑信息",
        type: "待人工核对截图",
        reasons: ["当前未启用图片智能识别，无法直接读取截图文字", "凡是索要验证码、催促点链接或要求转账的都极可能是诈骗"],
        reply_for_elder: `${addressee}，目前没法直接看懂这张图片里的字，请先别点图片里的任何链接，也不要转账或报验证码，发给家人帮您看一眼最稳妥。`,
        source: "local-fallback",
      };

  if (!openaiApiKey) return fallback;

  try {
    const aiResponse = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "你是老年人防诈骗助手。请识别图片中的短信、微信聊天、通知或网页内容，判断是否存在诈骗风险。输出严格 JSON：score (0-100整数), level (高危诈骗/中风险可疑信息/低风险信息), type (诈骗类型), reasons (字符串数组，最多5条), reply_for_elder (称呼长辈姓名，温柔简短、明确告诉老人不要做什么)。",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `长辈称呼：${addressee}。${supplementalText ? `补充说明：${supplementalText}` : "请分析这张截图是否有诈骗风险。"}`,
              },
              { type: "image_url", image_url: { url: imageData } },
            ],
          },
        ],
      }),
    });
    if (!aiResponse.ok) return fallback;
    const data = await aiResponse.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
    const score = Math.max(0, Math.min(100, Number(parsed.score) || 0));
    return {
      score,
      level: String(parsed.level || (score >= 80 ? "高危诈骗" : score >= 41 ? "中风险可疑信息" : "低风险信息")),
      type: String(parsed.type || "疑似电信网络诈骗"),
      reasons: Array.isArray(parsed.reasons) && parsed.reasons.length ? parsed.reasons.slice(0, 6).map(String) : fallback.reasons,
      reply_for_elder: String(parsed.reply_for_elder || fallback.reply_for_elder),
      source: "openai-vision",
    };
  } catch {
    return fallback;
  }
}

async function travelPlan(request, response, user) {
  const elder = await getBoundElder(user);
  const body = await readJson(request);
  const query = required(body.query, "出行需求不能为空");
  const weather = (await db.prepare("SELECT * FROM weather_settings WHERE elder_id = ?").get(elder.id)) || null;
  const destination = inferDestination(query);
  const locations = inferTravelLocations(query, destination, weather);
  const care = await buildWeatherCare(weather);
  const aiPlan = await generateTravelAdvice({ elder, query, ...locations, weatherCare: care });
  const reply = aiPlan.reply_for_elder;
  const caregiverAlert = aiPlan.caregiver_alert;
  await createAlert(elder.id, "travel", "出行关注", caregiverAlert);
  await notifyElderCaregivers(
    elder.id,
    "travel_planned",
    "出行关注",
    caregiverAlert,
    { feishuCard: buildSimpleCard("出行关注", caregiverAlert) }
  );
  sendJson(response, 200, {
    ok: true,
    plan: {
      ...locations,
      ...aiPlan,
    },
  });
}

// 保留 normalizeFeishuWebhook 导出，委托给多通道统一校验器
export function normalizeFeishuWebhook(value) {
  try {
    return normalizeChannelWebhook("feishu", value);
  } catch (error) {
    throw new HttpError(400, error.message);
  }
}

async function saveFeishuConfig(request, response, user) {
  assertCaregiver(user);
  const body = await readJson(request);
  const webhook = normalizeFeishuWebhook(body.webhook);
  const enabled = webhook ? 1 : 0;
  await db.prepare(
    `INSERT INTO notification_channels (id, owner_id, channel_type, config_json, enabled, updated_at)
     VALUES (?, ?, 'feishu', ?, ?, ?)
     ON CONFLICT(owner_id, channel_type) DO UPDATE SET config_json = excluded.config_json, enabled = excluded.enabled, updated_at = excluded.updated_at`
  ).run(createId("chan"), user.id, JSON.stringify({ webhook }), enabled, nowIso());
  sendJson(response, 200, { ok: true });
}

// 多通道通知列表：返回当前家属已配置的飞书 / 企业微信 / 钉钉通道状态（Webhook 脱敏）
async function listNotificationChannels(response, user) {
  assertCaregiver(user);
  const rows = await db
    .prepare("SELECT channel_type, config_json, enabled, updated_at FROM notification_channels WHERE owner_id = ?")
    .all(user.id);
  const byType = new Map(rows.map((row) => [row.channel_type, row]));
  const channels = ["wecom", "dingtalk", "feishu"].map((channelType) => {
    const row = byType.get(channelType);
    let webhook = "";
    try {
      webhook = row ? JSON.parse(row.config_json || "{}").webhook || "" : "";
    } catch {
      webhook = "";
    }
    return {
      channelType,
      configured: Boolean(webhook && Number(row?.enabled) === 1),
      maskedWebhook: maskWebhook(webhook),
      updatedAt: row?.updated_at || null,
    };
  });
  sendJson(response, 200, { ok: true, channels });
}

// 保存或清空任意受支持的群机器人通道（feishu / wecom / dingtalk）
async function saveNotificationChannel(request, response, user) {
  assertCaregiver(user);
  const body = await readJson(request);
  const channelType = String(body.channelType || "").trim();
  if (!SUPPORTED_WEBHOOK_CHANNELS.has(channelType)) {
    throw new HttpError(400, "不支持的通知通道，仅支持 feishu、wecom（企业微信）或 dingtalk（钉钉）");
  }
  let webhook;
  try {
    webhook = normalizeChannelWebhook(channelType, body.webhook);
  } catch (error) {
    throw new HttpError(400, error.message);
  }
  const enabled = webhook ? 1 : 0;
  await db.prepare(
    `INSERT INTO notification_channels (id, owner_id, channel_type, config_json, enabled, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(owner_id, channel_type) DO UPDATE SET config_json = excluded.config_json, enabled = excluded.enabled, updated_at = excluded.updated_at`
  ).run(createId("chan"), user.id, channelType, JSON.stringify({ webhook }), enabled, nowIso());
  sendJson(response, 200, { ok: true, channelType, configured: Boolean(webhook), maskedWebhook: maskWebhook(webhook) });
}

async function testNotificationChannel(request, response, user) {
  assertCaregiver(user);
  const body = await readJson(request);
  const channelType = String(body.channelType || "feishu").trim();
  if (!SUPPORTED_WEBHOOK_CHANNELS.has(channelType)) {
    throw new HttpError(400, "不支持的通知通道");
  }
  if (channelType === "feishu") {
    const result = await sendFeishu(user, `TechGuard 测试提醒：${user.displayName} 的飞书看护群可以接收提醒。`);
    sendJson(response, 200, { ok: true, result });
    return;
  }
  const row = await db
    .prepare("SELECT config_json FROM notification_channels WHERE owner_id = ? AND channel_type = ? AND enabled = 1")
    .get(user.id, channelType);
  const webhook = row ? JSON.parse(row.config_json || "{}").webhook || "" : "";
  if (!webhook) throw new HttpError(400, "请先保存该通道的 Webhook 地址后再测试");
  const result = await postWebhookChannel(
    channelType,
    webhook,
    { title: "TechGuard 测试提醒", body: `${user.displayName} 的照护通知通道已连通，后续长辈的重要动态会同步到这里。` },
    fetchWithTimeout
  );
  sendJson(response, 200, { ok: true, result });
}

async function feishuTest(response, user) {
  assertCaregiver(user);
  const message = `TechGuard 测试提醒：${user.displayName} 的飞书看护群可以接收提醒。`;
  const result = await sendFeishu(user, message);
  sendJson(response, 200, { ok: true, result });
}

async function feishuManualSend(request, response, user) {
  assertCaregiver(user);
  const body = await readJson(request);
  const message = required(body.message, "请填写要发送到飞书群的提醒内容").slice(0, 1000);
  const result = await sendFeishu(user, `【看护手动提醒】\n${message}\n\n发送人：${user.displayName}`);
  sendJson(response, 200, { ok: true, result });
}

async function contactCaregiver(response, user) {
  const elder = await getBoundElder(user);
  const message = `TechGuard 求助提醒：${elder.displayName}点击了一键联系家属，请尽快查看是否需要帮助。`;
  await createAlert(elder.id, "help", "一键求助", message);
  const result = await notifyElderCaregivers(elder.id, "help_requested", "一键求助", `${elder.displayName}点击了一键联系家属，请尽快查看是否需要帮助。`, { feishuCard: buildSimpleCard("🆘 一键求助", `${elder.displayName}点击了一键联系家属。\n请尽快查看是否需要帮助。`) });
  sendJson(response, 200, { ok: true, result });
}

// 长辈主动「报平安」：不求助，但让家人知道今天一切正常，避免家属惦记。
async function elderCheckIn(response, user) {
  const elder = await getBoundElder(user);
  const today = todayDate();
  const timeText = currentTime();
  // 每天只记一条：重复点击不刷屏，也不会重复推飞书。
  const refId = `${elder.id}-${today}`;
  const message = `TechGuard 平安打卡：${elder.displayName} 在 ${timeText} 报了平安，今天一切正常。`;
  const alertId = await createAlert(elder.id, "safe_checkin", "长辈报平安", message, refId);
  if (!alertId) {
    sendJson(response, 200, { ok: true, alreadyCheckedIn: true, time: timeText, message: "今天已经报过平安了。" });
    return;
  }
  const result = await notifyElderCaregivers(
    elder.id,
    "safe_checkin",
    "长辈报平安",
    message,
    { feishuCard: buildSimpleCard("✅ 长辈报平安", `${elder.displayName} 在 ${timeText} 报了平安。\n今天一切正常。`) }
  );
  sendJson(response, 200, { ok: true, alreadyCheckedIn: false, time: timeText, result });
}

// 请求体里的 occurredAt 只在合法 HH:MM（兼容带秒）时才采信，否则交给 parseLifeEvent 推断（已拆分至 src/server/domain-rules.mjs）
function normalizeOccurredAt(value) {
  const text = String(value ?? "").trim();
  return timeOfDayPattern.test(text) ? text.slice(0, 5) : null;
}

// 出参统一形状：GET /api/life-events 的元素与 dashboard.lifeEvents 共用这一份映射
function mapLifeEvent(row) {
  return { id: row.id, kind: row.kind, rawText: row.raw_text, occurredAt: row.occurred_at, source: row.source, createdAt: row.created_at };
}

const lifeEventTextMaxLength = 200;

async function createLifeEvent(request, response, user) {
  // 长辈本人和家属都可记录，事件挂在「当前照护的长辈」名下（与血压/任务共用 getBoundElder 语义）
  const elder = await getBoundElder(user);
  const body = await readJson(request);
  const text = String(body.text ?? "").trim();
  if (!text) throw new HttpError(400, "请填写要记录的内容");
  if (text.length > lifeEventTextMaxLength) throw new HttpError(400, `记录内容最多 ${lifeEventTextMaxLength} 个字，请精简后再试`);
  // source 只认 voice/text，其余取值（含缺省）一律按 text 落库，避免脏值进库
  const source = body.source === "voice" ? "voice" : "text";

  const parsed = parseLifeEvent(text);
  // 前端给了合法时间就以前端为准（用户可能手动改过），否则用服务端推断结果
  const occurredAt = normalizeOccurredAt(body.occurredAt) || parsed.occurredAt;
  const id = createId("life");
  const createdAt = nowIso();

  await db.prepare(
    `INSERT INTO life_events (id, elder_id, kind, raw_text, occurred_at, source, recorded_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, elder.id, parsed.kind, text, occurredAt, source, user.id, createdAt);

  // 「身体不适」要立刻让家属知道：写一条 alert 并推送通知。
  // 借用已有的 blood_pressure_abnormal 通知开关（不新造 pref 列）；ref_id 用事件 id，
  // 配合 (elder_id,type,ref_id) 唯一索引保证重复提交不会重复告警。
  if (parsed.kind === "unwell") {
    const message = `${elder.displayName} 记录了身体不适：${text}`;
    await createAlert(elder.id, "life_unwell", "长辈身体不适", message, id);
    await notifyElderCaregivers(
      elder.id,
      "blood_pressure_abnormal",
      "长辈身体不适",
      message,
      { feishuCard: buildSimpleCard("⚠️ 长辈身体不适", message) }
    );
  }

  sendJson(response, 200, { ok: true, event: { id, kind: parsed.kind, rawText: text, occurredAt, source, createdAt } });
}

async function lifeEventList(response, user) {
  const elder = await getBoundElder(user);
  // created_at DESC 为主序；同一毫秒写入时用 rowid DESC 兜底，保证「最新在前」稳定可复现
  const events = await db.prepare("SELECT id, kind, raw_text, occurred_at, source, created_at FROM life_events WHERE elder_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 50").all(elder.id);
  sendJson(response, 200, { ok: true, events: events.map(mapLifeEvent) });
}

async function deleteLifeEvent(request, response, user, eventId) {
  assertCaregiver(user);
  const elder = await getBoundElder(user);
  // 不属于当前长辈的 id 一律 404，避免用状态码泄露「别人家的记录是否存在」
  const existing = await db.prepare("SELECT id FROM life_events WHERE id = ? AND elder_id = ?").get(eventId, elder.id);
  if (!existing) throw new HttpError(404, "未找到该生活记录");
  await db.prepare("DELETE FROM life_events WHERE id = ? AND elder_id = ?").run(eventId, elder.id);
  sendJson(response, 200, { ok: true });
}

// 前端开启手机提醒前先要公钥；密钥不可用时也要返回 200 + enabled:false，让前端如实提示，而不是 500
function pushConfig(response) {
  if (!vapidDetails) {
    sendJson(response, 200, { ok: true, enabled: false, reason: vapidDisabledReason || "服务端未配置 Web Push 推送密钥" });
    return;
  }
  sendJson(response, 200, { ok: true, enabled: true, publicKey: vapidDetails.publicKey });
}

async function savePushSubscription(request, response, user) {
  const body = await readJson(request);
  const endpoint = required(body.endpoint, "缺少推送地址 endpoint");
  // endpoint 来自浏览器推送服务，长度异常肯定不是合法订阅；挡在入库之前
  if (endpoint.length > 1000) throw new HttpError(400, "推送地址格式不正确");
  // 标准结构是 keys:{p256dh,auth}（PushSubscription.toJSON 的输出），同时兼容平铺字段，避免老客户端直接报错
  const keys = body.keys || {};
  const p256dh = required(keys.p256dh || body.p256dh, "缺少推送公钥 p256dh");
  const auth = required(keys.auth || body.auth, "缺少推送鉴权密钥 auth");
  const id = createId("push");

  // endpoint 上有唯一索引：同一台手机重复点「开启手机提醒」只更新这一行，不会堆出重复订阅。
  // WHERE 子句保证只有「本人」能更新这一行：否则任何登录用户只要拿到别人的 endpoint
  // 就能把订阅改绑到自己名下，让对方的手机从此收不到推送。
  await db.prepare(
    `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET
       p256dh = excluded.p256dh,
       auth = excluded.auth,
       user_agent = excluded.user_agent,
       created_at = excluded.created_at
     WHERE push_subscriptions.user_id = excluded.user_id`
  ).run(id, user.id, endpoint, p256dh, auth, String(body.userAgent || request.headers["user-agent"] || "").slice(0, 300), nowIso());

  // 更新已有行时返回库里那一行的 id，方便前端确认订阅状态
  const saved = await db.prepare("SELECT id FROM push_subscriptions WHERE endpoint = ?").get(endpoint);
  sendJson(response, 200, { ok: true, id: saved?.id || id });
}

async function deletePushSubscription(request, response, user) {
  const body = await readJson(request);
  const endpoint = required(body.endpoint, "缺少推送地址 endpoint");
  // 只删自己的订阅：否则带上别人的 endpoint 就能帮家属设备退订
  await db.prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?").run(endpoint, user.id);
  sendJson(response, 200, { ok: true });
}

// 判断长辈今天是否已有任何活跃痕迹（报平安 / 确认吃药 / 完成任务 / 量血压 / 记生活事件）
async function hasElderActivityToday(elderId, today) {
  const checkin = await db
    .prepare("SELECT id FROM alerts WHERE elder_id = ? AND type = 'safe_checkin' AND ref_id = ? LIMIT 1")
    .get(elderId, `${elderId}-${today}`);
  if (checkin) return true;
  const med = await db
    .prepare("SELECT id FROM medication_logs WHERE elder_id = ? AND due_date = ? AND status = 'done' LIMIT 1")
    .get(elderId, today);
  if (med) return true;
  const task = await db
    .prepare("SELECT id FROM care_tasks WHERE elder_id = ? AND status = 'done' AND substr(completed_at, 1, 10) = ? LIMIT 1")
    .get(elderId, today);
  if (task) return true;
  const bp = await db
    .prepare("SELECT id FROM blood_pressure_logs WHERE elder_id = ? AND (substr(measured_at, 1, 10) = ? OR substr(created_at, 1, 10) = ?) LIMIT 1")
    .get(elderId, today, today);
  if (bp) return true;
  const life = await db
    .prepare("SELECT id FROM life_events WHERE elder_id = ? AND substr(created_at, 1, 10) = ? LIMIT 1")
    .get(elderId, today);
  return Boolean(life);
}

async function scanReminders(request, response) {
  // 定时扫描会向家属推送通知，必须鉴权：配置了 CRON_SECRET 走 Bearer，否则只信任本机回环/Vercel Cron
  if (!isAuthorizedCronRequest(request)) {
    sendJson(response, 403, { ok: false, message: "无权触发定时提醒扫描" });
    return;
  }
  const today = todayDate();
  const nowTime = currentTime();
  const elders = await db.prepare("SELECT * FROM users WHERE role = 'elder'").all();
  let medicationRemindersSent = 0;
  let taskRemindersSent = 0;
  let weatherRemindersSent = 0;
  let medicationStockRemindersSent = 0;
  let inactivityRemindersSent = 0;
  const failedElders = [];
  for (const elder of elders) {
    // 单个长辈的数据异常（脏配置、DB 冲突等）不能中断整轮扫描：
    // 否则排在它后面的长辈会静默地一条提醒都收不到，而漏服提醒是绝不能丢的。
    try {
      await ensureTodayMedicationLogs(elder.id);
      const dueLogs = await db
        .prepare(
          // ms.enabled = 1：停用的计划不再进入提醒扫描，避免家属已经停掉的药继续催老人
          `SELECT ml.*, ms.medicine_name, ms.dose_note, ms.time_of_day
           FROM medication_logs ml JOIN medication_schedules ms ON ms.id = ml.schedule_id
           WHERE ml.elder_id = ? AND ml.due_date = ? AND ml.status = 'pending' AND ms.enabled = 1 AND ms.time_of_day <= ?`
        )
        .all(elder.id, today, nowTime);
      for (const log of dueLogs) {
        // 分两阶段提醒，靠 reminder_count 保证高频轮询（例如每 5 分钟）也只推一次：
        //   0 → 到点提醒；1 → 超过 30 分钟仍未确认，升级提醒；2 → 不再打扰。
        const reminderCount = Number(log.reminder_count || 0);
        if (reminderCount === 0) {
          const message = `${elder.display_name} ${log.time_of_day} 的${log.medicine_name}该服用了，目前还没有确认。`;
          // createAlert 使用 INSERT OR IGNORE，只有真正插入成功才推送，避免并发 cron 重复发飞书
          const alertId = await createAlert(elder.id, "medication", "吃药未确认", message, log.id);
          if (!alertId) continue;
          await notifyElderCaregivers(
            elder.id,
            "medication_due",
            "该吃药了",
            message,
            { feishuCard: buildSimpleCard("💊 该吃药了", message) }
          );
          // 只通知家属等于老人自己永远不知道要吃药，这里同时推给长辈本人的手机
          await pushToElder(elder.id, {
            title: "该吃药了",
            body: `现在 ${log.time_of_day}，请服用${log.medicine_name}。${log.dose_note || ""}`,
            url: "/",
            // 同一剂药共用 tag：到点提醒和升级提醒不会在通知栏叠成两条
            tag: `med-${log.id}`,
          });
          await db.prepare("UPDATE medication_logs SET reminder_count = 1 WHERE id = ?").run(log.id);
          medicationRemindersSent += 1;
          continue;
        }

        if (reminderCount === 1 && minutesSince(log.time_of_day, nowTime) >= MEDICATION_ESCALATE_AFTER_MINUTES) {
          const message = `${elder.display_name} ${log.time_of_day} 的${log.medicine_name}已经超过 ${MEDICATION_ESCALATE_AFTER_MINUTES} 分钟没有确认，建议家人打个电话问一下。`;
          const alertId = await createAlert(elder.id, "medication_overdue", "吃药仍未确认", message, `${log.id}-escalated`);
          if (!alertId) continue;
          await notifyElderCaregivers(
            elder.id,
            "medication_due",
            "吃药仍未确认",
            message,
            { feishuCard: buildSimpleCard("⚠️ 吃药仍未确认", message) }
          );
          // 升级提醒也要推到长辈本人：老人可能没看见第一条，再温柔催一次
          await pushToElder(elder.id, {
            title: "药还没确认",
            body: `${log.medicine_name} 还没有确认，记得点一下"我已吃药"。`,
            url: "/",
            tag: `med-${log.id}`,
          });
          await db.prepare("UPDATE medication_logs SET reminder_count = 2 WHERE id = ?").run(log.id);
          medicationRemindersSent += 1;
        }
      }

      // 缺药提醒：库存挂在药名上，剩余天数 = 剩余片数 /（同名启用计划条数 × 每次用量）。
      // 每日消耗为 0（药已停用 / 没有计划）时不算缺药——那种情况下 remainingDays 为 null，
      // 提醒「快吃完了」只会是误报。
      const stockRows = await db.prepare("SELECT * FROM medication_stock WHERE elder_id = ?").all(elder.id);
      if (stockRows.length) {
        const stockDoseMap = await enabledDosesPerMedicine(elder.id);
        const alertDays = medicationStockAlertDays();
        for (const stock of stockRows) {
          const dosesPerDay = stockDoseMap.get(stock.medicine_name) || 0;
          const unitsPerDose = Math.max(1, Number(stock.units_per_dose) || 1);
          const dailyUnits = dosesPerDay * unitsPerDose;
          const remainingDays = dailyUnits > 0 ? Math.floor((Number(stock.units_remaining) || 0) / dailyUnits) : null;
          if (remainingDays === null || remainingDays > alertDays) continue;
          // 同一个药每天最多提醒一次：ref_id 带上日期，配合 alerts 的 (elder_id, type, ref_id)
          // 唯一索引 + createAlert 的 INSERT OR IGNORE，高频 cron 也不会刷屏。
          const refId = `${stock.id}-${today}`;
          const message =
            remainingDays === 0
              ? `${elder.display_name}的${stock.medicine_name}今天就要吃完了，请尽快去开药或补充。`
              : `${elder.display_name}的${stock.medicine_name}大约还能吃 ${remainingDays} 天，记得去开药或补充。`;
          const alertId = await createAlert(elder.id, "medication_stock_low", "药品快吃完了", message, refId);
          // 只有真正插入成功才推飞书：重复扫描时不再重复打扰家属
          if (!alertId) continue;
          await notifyElderCaregivers(
            elder.id,
            "medication_stock_low",
            "药品快吃完了",
            message,
            { feishuCard: buildSimpleCard("💊 药品快吃完了", message) }
          );
          medicationStockRemindersSent += 1;
        }
      }

      const dueTasks = await db
        .prepare(
          `SELECT *
           FROM care_tasks
           WHERE elder_id = ? AND due_date = ? AND status = 'pending' AND due_time <= ?
           ORDER BY due_time ASC`
        )
        .all(elder.id, today, nowTime);
      for (const task of dueTasks) {
        // ref_id 必须带日期：只带 task.id 的话，任务一旦提醒过一次（或被改期到未来再改回今天），
        // 同一条任务从此再也不会提醒——而「到点提醒」正是这个应用的核心承诺。
        const taskRefId = `${task.id}-${today}`;
        const existing = await db.prepare("SELECT id FROM alerts WHERE type = 'task_due' AND ref_id = ?").get(taskRefId);
        if (!existing) {
          const message = `${elder.display_name} ${task.due_time} 需要完成：${task.title}${task.description ? `。说明：${task.description}` : ""}`;
          const alertId = await createAlert(elder.id, "task_due", "任务到点提醒", message, taskRefId);
          if (!alertId) continue;
          await notifyElderCaregivers(
            elder.id,
            "task_due",
            "任务到点提醒",
            message,
            { feishuCard: buildSimpleCard("任务到点提醒", message) }
          );
          // 任务到点同样推到长辈本人手机
          await pushToElder(elder.id, {
            title: "任务提醒",
            body: `现在该做：${task.title}`,
            url: "/",
            tag: `task-${task.id}`,
          });
          taskRemindersSent += 1;
        }
      }

      const weather = await db.prepare("SELECT * FROM weather_settings WHERE elder_id = ?").get(elder.id);
      if (weather && nowTime >= (weather.care_time || "08:00")) {
        const refId = `${elder.id}-${today}`;
        const existing = await db.prepare("SELECT id FROM alerts WHERE type = 'weather_daily' AND ref_id = ?").get(refId);
        if (!existing) {
          const care = await buildWeatherCare(weather);
          const message = `${elder.display_name}今日天气提醒：${care.text}`;
          const alertId = await createAlert(elder.id, "weather_daily", "今日天气提醒", message, refId);
          if (!alertId) continue;
          await notifyElderCaregivers(
            elder.id,
            "weather_daily",
            "今日天气提醒",
            message,
            { feishuCard: buildSimpleCard("今日天气提醒", message) }
          );
          weatherRemindersSent += 1;
        }
      }

      // 静默未活跃告警：独居老人最怕“一整天没动静”。开启开关且超过设定截止时间后，
      // 若当日既未报平安、未确认吃药、未完成任务、未量血压也无生活记录，自动提醒家属电话确认。
      const profile = await db.prepare("SELECT inactivity_alert_enabled, inactivity_deadline FROM elder_profiles WHERE elder_id = ?").get(elder.id);
      if (profile && Number(profile.inactivity_alert_enabled) === 1 && nowTime >= (profile.inactivity_deadline || "12:00")) {
        const activeToday = await hasElderActivityToday(elder.id, today);
        if (!activeToday) {
          const refId = `${elder.id}-${today}`;
          const deadline = profile.inactivity_deadline || "12:00";
          const message = `${elder.display_name} 今天截止 ${deadline} 尚无报平安、吃药确认或任何活跃记录，建议家人尽快打个电话确认平安。`;
          const alertId = await createAlert(elder.id, "inactivity", "长辈今日尚未活跃", message, refId);
          if (alertId) {
            await notifyElderCaregivers(
              elder.id,
              "inactivity_alert",
              "长辈今日尚未活跃",
              message,
              { feishuCard: buildSimpleCard("⚠️ 长辈今日尚未活跃", message) }
            );
            inactivityRemindersSent += 1;
          }
        }
      }
    } catch (error) {
      failedElders.push(elder.id);
      console.error(`[TechGuard] 长辈 ${elder.id} 的提醒扫描失败，已跳过以免影响其他长辈：`, error?.message || error);
    }
  }
  sendJson(response, 200, { ok: true, checkedAt: nowIso(), medicationRemindersSent, taskRemindersSent, weatherRemindersSent, medicationStockRemindersSent, inactivityRemindersSent, failedElders });
}

async function initDatabase() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS family_links (
      id TEXT PRIMARY KEY,
      caregiver_id TEXT NOT NULL,
      elder_id TEXT NOT NULL,
      relation TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS medication_schedules (
      id TEXT PRIMARY KEY,
      elder_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      medicine_name TEXT NOT NULL,
      dose_note TEXT,
      meal_timing TEXT,
      time_of_day TEXT NOT NULL,
      repeat_rule TEXT NOT NULL,
      remind_elder INTEGER NOT NULL,
      remind_caregiver INTEGER NOT NULL,
      enabled INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS medication_logs (
      id TEXT PRIMARY KEY,
      schedule_id TEXT NOT NULL,
      elder_id TEXT NOT NULL,
      due_date TEXT NOT NULL,
      status TEXT NOT NULL,
      completed_at TEXT,
      note TEXT,
      UNIQUE(schedule_id, due_date)
    );
    CREATE TABLE IF NOT EXISTS care_tasks (
      id TEXT PRIMARY KEY,
      elder_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      due_date TEXT NOT NULL,
      due_time TEXT NOT NULL,
      repeat_rule TEXT NOT NULL,
      status TEXT NOT NULL,
      completed_at TEXT,
      completion_note TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS weather_settings (
      elder_id TEXT PRIMARY KEY,
      city TEXT NOT NULL,
      district TEXT,
      care_time TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      elder_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL,
      ref_id TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      p256dh TEXT,
      auth TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notification_channels (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      channel_type TEXT NOT NULL,
      config_json TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(owner_id, channel_type)
    );
    CREATE TABLE IF NOT EXISTS blood_pressure_logs (
      id TEXT PRIMARY KEY,
      elder_id TEXT NOT NULL,
      measured_by TEXT NOT NULL,
      systolic INTEGER NOT NULL,
      diastolic INTEGER NOT NULL,
      pulse INTEGER,
      note TEXT,
      measured_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS checkup_reports (
      id TEXT PRIMARY KEY,
      elder_id TEXT NOT NULL,
      uploaded_by TEXT NOT NULL,
      file_name TEXT,
      image_data TEXT NOT NULL,
      summary TEXT NOT NULL,
      advice_json TEXT NOT NULL,
      risk_level TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    -- 体检指标：体检报告目前只存一段文字摘要，看不出指标趋势。
    -- 这里按指标名逐条存「数值 + 单位 + 检查日期」，由家属照着报告录入，不依赖任何 AI 服务。
    CREATE TABLE IF NOT EXISTS checkup_indicators (
      id TEXT PRIMARY KEY,
      elder_id TEXT NOT NULL,
      name TEXT NOT NULL,
      value REAL NOT NULL,
      unit TEXT,
      measured_date TEXT NOT NULL,
      note TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS life_events (
      id TEXT PRIMARY KEY,
      elder_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      raw_text TEXT NOT NULL,
      occurred_at TEXT,
      source TEXT NOT NULL,
      recorded_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS notification_preferences (
      user_id TEXT PRIMARY KEY,
      task_assigned INTEGER NOT NULL DEFAULT 1,
      task_due INTEGER NOT NULL DEFAULT 1,
      task_completed INTEGER NOT NULL DEFAULT 1,
      medication_completed INTEGER NOT NULL DEFAULT 1,
      blood_pressure_recorded INTEGER NOT NULL DEFAULT 1,
      blood_pressure_abnormal INTEGER NOT NULL DEFAULT 1,
      help_requested INTEGER NOT NULL DEFAULT 1,
      safe_checkin INTEGER NOT NULL DEFAULT 1,
      feishu_enabled INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS medication_stock (
      id TEXT PRIMARY KEY,
      elder_id TEXT NOT NULL,
      medicine_name TEXT NOT NULL,
      units_remaining INTEGER NOT NULL DEFAULT 0,
      units_per_dose INTEGER NOT NULL DEFAULT 1,
      note TEXT,
      updated_at TEXT NOT NULL,
      UNIQUE(elder_id, medicine_name)
    );
    -- 邀请家属：让真实家属能自己拿到账号，而不是只能在部署时直接写库。
    -- 库里只存 token 的 sha256（token_hash），明文 token 只在生成时返回一次。
    CREATE TABLE IF NOT EXISTS elder_invites (
      id TEXT PRIMARY KEY,
      elder_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      relation TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      used_by TEXT,
      created_at TEXT NOT NULL
    );
    -- 长辈健康急救卡 & 静默未活跃告警配置
    CREATE TABLE IF NOT EXISTS elder_profiles (
      elder_id TEXT PRIMARY KEY,
      blood_type TEXT,
      allergies TEXT,
      chronic_conditions TEXT,
      emergency_hospital TEXT,
      doctor_name TEXT,
      doctor_phone TEXT,
      notes TEXT,
      inactivity_alert_enabled INTEGER NOT NULL DEFAULT 0,
      inactivity_deadline TEXT NOT NULL DEFAULT '12:00',
      updated_at TEXT NOT NULL
    );
    -- 长辈免密绑定链接：24 小时有效、一次性使用，避免老人记账号密码
    CREATE TABLE IF NOT EXISTS elder_login_links (
      id TEXT PRIMARY KEY,
      elder_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL
    );
  `);

  // 生活事件按「长辈 + 记录时间倒序」查询（列表 / dashboard 都走这个顺序），建索引避免全表扫描
  await db.exec("CREATE INDEX IF NOT EXISTS idx_life_events_elder_created ON life_events (elder_id, created_at DESC)");
  // 用药库存始终按长辈查询（列表 / 自动扣减 / 缺药扫描），建索引避免全表扫描
  await db.exec("CREATE INDEX IF NOT EXISTS idx_medication_stock_elder ON medication_stock (elder_id)");
  // 体检指标总是按「长辈 + 指标名 + 检查日期倒序」查趋势，建索引避免全表扫描
  await db.exec("CREATE INDEX IF NOT EXISTS idx_checkup_indicators_elder_name ON checkup_indicators (elder_id, name, measured_date DESC)");
  // 邀请按长辈查询（列表 / 删除校验），接受时按 token_hash 查，都建索引避免全表扫描
  await db.exec("CREATE INDEX IF NOT EXISTS idx_elder_invites_elder ON elder_invites (elder_id)");
  await db.exec("CREATE INDEX IF NOT EXISTS idx_elder_invites_token_hash ON elder_invites (token_hash)");
  await db.exec("CREATE INDEX IF NOT EXISTS idx_elder_login_links_token_hash ON elder_login_links (token_hash)");

  await ensureColumn("notification_preferences", "task_due", "INTEGER NOT NULL DEFAULT 1");
  await ensureColumn("notification_preferences", "safe_checkin", "INTEGER NOT NULL DEFAULT 1");
  await ensureColumn("notification_preferences", "inactivity_alert", "INTEGER NOT NULL DEFAULT 1");
  // 用药周期与疗程日期：支持隔日、每周固定日与短期疗程
  await ensureColumn("medication_schedules", "repeat_days", "TEXT");
  await ensureColumn("medication_schedules", "start_date", "TEXT");
  await ensureColumn("medication_schedules", "end_date", "TEXT");
  // 联系电话（紧急联系人拨号兜底）与「当前照护长辈」都挂在 users 上：老库需要补列，ensureColumn 保证幂等
  await ensureColumn("users", "phone", "TEXT");
  await ensureColumn("users", "active_elder_id", "TEXT");
  // medication_logs 记录已提醒次数：外部 cron 可以高频轮询而不会重复推送，
  // 同时让「到点提醒 → 30 分钟仍未确认 → 升级提醒」成为可能。
  await ensureColumn("medication_logs", "reminder_count", "INTEGER NOT NULL DEFAULT 0");

  // alerts 之前只靠查询去重，并发 cron 可能重复插入。先清掉历史重复行再建唯一索引。
  // 每个 (elder_id, type, ref_id) 分组保留 rowid 最小（即最早 created_at）的一条；ref_id 为 NULL 的行在唯一索引中互不冲突，故不处理。
  await db.exec(`
    DELETE FROM alerts
    WHERE ref_id IS NOT NULL
      AND rowid NOT IN (
        SELECT MIN(rowid) FROM alerts
        WHERE ref_id IS NOT NULL
        GROUP BY elder_id, type, ref_id
      );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_alerts_elder_type_ref ON alerts (elder_id, type, ref_id);
  `);

  // push_subscriptions 以前每次订阅都插新行，同一台手机重复点「开启提醒」会堆出多行、重复推送。
  // 先按 endpoint 保留最早一行清理历史重复，再建唯一索引，让 /api/push/subscribe 能走 upsert。
  await db.exec(`
    DELETE FROM push_subscriptions
    WHERE rowid NOT IN (
      SELECT MIN(rowid) FROM push_subscriptions GROUP BY endpoint
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON push_subscriptions (endpoint);
  `);

  // 清理历史过期会话，避免 auth_sessions 长期只增不减
  await db.prepare("DELETE FROM auth_sessions WHERE expires_at <= ?").run(nowIso());

  // 生产环境（NODE_ENV=production 或 VERCEL）默认不种入弱口令演示账号，
  // 除非显式设置 ENABLE_DEMO_SEED=1；本地开发与测试环境保持自动种入。
  if (shouldSeedDemoAccounts()) {
    await seedUser(defaultCaregiverId, "caregiver", "demo1234", "家属账号", "caregiver");
    await seedUser(defaultElderId, "elder", "demo1234", "长辈账号", "elder");
    const link = await db.prepare("SELECT id FROM family_links WHERE caregiver_id = ? AND elder_id = ?").get(defaultCaregiverId, defaultElderId);
    if (!link) {
      await db.prepare("INSERT INTO family_links (id, caregiver_id, elder_id, relation) VALUES (?, ?, ?, ?)").run("link-demo-family", defaultCaregiverId, defaultElderId, "家属");
    }
    // 第二个演示长辈：同样只在不存在时创建，且不给它建任何用药计划，保持 dashboard 空状态
    await seedUser(defaultElder2Id, "elder2", "demo1234", "长辈账号2", "elder");
    const link2 = await db.prepare("SELECT id FROM family_links WHERE caregiver_id = ? AND elder_id = ?").get(defaultCaregiverId, defaultElder2Id);
    if (!link2) {
      await db.prepare("INSERT INTO family_links (id, caregiver_id, elder_id, relation) VALUES (?, ?, ?, ?)").run("link-demo-family2", defaultCaregiverId, defaultElder2Id, "家属");
    }
  }
}

export function shouldSeedDemoAccounts(env = process.env) {
  const isProduction = env.NODE_ENV === "production" || Boolean(env.VERCEL);
  return !isProduction || env.ENABLE_DEMO_SEED === "1";
}

async function ensureColumn(table, column, definition) {
  const columns = await db.prepare(`PRAGMA table_info(${table})`).all();
  if (columns.some((item) => item.name === column)) return;
  await db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

// ---- Web Push / VAPID ----

async function readSetting(key) {
  const row = await db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key);
  return row?.value || "";
}

async function writeSetting(key, value) {
  await db.prepare(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value);
}

// 浏览器 applicationServerKey 只接受 base64url（无填充）；环境变量里粘贴的可能是带 +/= 的标准 base64，统一转换
function normalizeVapidKey(key) {
  return String(key || "").trim().replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// 校验 VAPID 密钥格式：公钥必须能解出 65 字节未压缩 P-256 点，私钥 32 字节。
// 配错的密钥只会让浏览器订阅时报一个看不懂的错，所以这里直接判定为不可用（降级 enabled:false）。
function assertValidVapidKeyPair(publicKey, privateKey) {
  const publicBytes = Buffer.from(publicKey, "base64url");
  const privateBytes = Buffer.from(privateKey, "base64url");
  if (publicBytes.length !== 65 || publicBytes[0] !== 0x04 || privateBytes.length !== 32) {
    throw new Error("VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY 不是合法的 P-256 密钥对，请用 web-push generateVAPIDKeys() 重新生成");
  }
}

// 初始化 VAPID 密钥：环境变量优先，缺失时自动生成一次并入库（本地开发重启不用重新订阅）。
// 任何异常都降级为「手机提醒不可用」，绝不让进程起不来。
async function initPushConfig() {
  try {
    const envPublicKey = String(process.env.VAPID_PUBLIC_KEY || "").trim();
    const envPrivateKey = String(process.env.VAPID_PRIVATE_KEY || "").trim();
    if (envPublicKey && envPrivateKey) {
      const publicKey = normalizeVapidKey(envPublicKey);
      const privateKey = normalizeVapidKey(envPrivateKey);
      assertValidVapidKeyPair(publicKey, privateKey);
      vapidDetails = { subject: vapidSubject, publicKey, privateKey };
      vapidKeySource = "env";
      return;
    }

    let publicKey = await readSetting("vapid_public_key");
    let privateKey = await readSetting("vapid_private_key");
    if (!publicKey || !privateKey) {
      const generated = webpush.generateVAPIDKeys();
      publicKey = generated.publicKey;
      privateKey = generated.privateKey;
      await writeSetting("vapid_public_key", publicKey);
      await writeSetting("vapid_private_key", privateKey);
    }
    vapidDetails = { subject: vapidSubject, publicKey: normalizeVapidKey(publicKey), privateKey: normalizeVapidKey(privateKey) };
    vapidKeySource = "database";
    console.warn(
      "⚠️  未配置 VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY，已自动生成 Web Push 密钥并存入数据库。" +
        "生产环境请改为设置环境变量，否则换机器或清空数据库后，老人手机上已保存的订阅会全部失效（需要重新点一次「开启手机提醒」）。"
    );
  } catch (error) {
    vapidDetails = null;
    vapidKeySource = "none";
    vapidDisabledReason = `VAPID 密钥初始化失败：${error.message}`;
    console.error("[TechGuard] Web Push 初始化失败，手机提醒暂不可用：", error);
  }
}

async function seedUser(id, username, password, displayName, role) {
  const existing = await db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  // 演示账号只在不存在时创建；不再每次启动覆盖密码，避免把用户改过的口令重置回 demo1234
  if (existing) return;
  await db.prepare("INSERT INTO users (id, username, password_hash, display_name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    id,
    username,
    hashPassword(password),
    displayName,
    role,
    nowIso()
  );
}

async function getBoundElder(user) {
  if (user.role === "elder") return user;
  // 家属：优先用 users.active_elder_id 选中的长辈，脏数据由 caregiverElders 回退第一条并自愈回写，
  // 这样 dashboard / medications / tasks / 血压 / 体检 / 出行 / cron 等接口不用改就能跟着切换。
  const { rows, activeId } = await caregiverElders(user);
  // 未绑定长辈属于客户端可修复的使用问题，返回 400 而不是 500
  if (!rows.length) throw new HttpError(400, "未找到绑定的长辈账号");
  return publicUser(rows.find((row) => row.id === activeId));
}

async function ensureTodayMedicationLogs(elderId) {
  const today = todayDate();
  // 生成今天记录前，先把历史遗留（due_date 早于今天且仍 pending）的用药记录沉淀为 missed，
  // 否则漏服永远停留在 pending，前端 status 取值仍保持 done / pending / missed。
  await db.prepare("UPDATE medication_logs SET status = 'missed' WHERE elder_id = ? AND due_date < ? AND status = 'pending'").run(elderId, today);
  const schedules = await db.prepare("SELECT * FROM medication_schedules WHERE elder_id = ? AND enabled = 1").all(elderId);
  for (const schedule of schedules) {
    if (!isMedicationDueOnDate(schedule, today)) continue;
    const id = `${schedule.id}-${today}`;
    await db.prepare("INSERT OR IGNORE INTO medication_logs (id, schedule_id, elder_id, due_date, status) VALUES (?, ?, ?, ?, 'pending')").run(id, schedule.id, elderId, today);
  }
}

async function buildDailyReport(elderId) {
  const today = todayDate();
  // 与 dashboard 的今日待办保持同一口径：停用计划的 pending 记录不算「今天还没确认」，
  // 否则会出现「列表里没有这个药、日报却说有待确认」的矛盾。
  const meds = await db
    .prepare(
      `SELECT ml.status, COUNT(*) as count
       FROM medication_logs ml JOIN medication_schedules ms ON ms.id = ml.schedule_id
       WHERE ml.elder_id = ? AND ml.due_date = ? AND (ms.enabled = 1 OR ml.status <> 'pending')
       GROUP BY ml.status`
    )
    .all(elderId, today);
  const tasks = await db
    .prepare("SELECT status, COUNT(*) as count FROM care_tasks WHERE elder_id = ? AND (due_date = ? OR (due_date < ? AND status = 'pending')) GROUP BY status")
    .all(elderId, today, today);
  const bloodPressure = await db.prepare("SELECT COUNT(*) as count FROM blood_pressure_logs WHERE elder_id = ? AND substr(measured_at, 1, 10) = ?").get(elderId, today);
  return { date: today, medications: meds, tasks, bloodPressure: bloodPressure?.count || 0 };
}

async function createAlert(elderId, type, title, message, refId = null) {
  const id = createId("alert");
  // INSERT OR IGNORE 配合 (elder_id, type, ref_id) 唯一索引：并发场景下重复时不再报错，
  // 并通过返回的变更行数告诉调用方是否真正插入（refId 为 null 时不会冲突）。
  //
  // 刻意不传 refId 的调用点是「用户主动触发的一次性事件」（一键求助、高危短信、出行关注……）：
  // 那里不去重是故意的——同一天第二次真求助必须照样通知家属，宁可多推一条也不能压掉真警报。
  // 需要「同一天同一对象只提醒一次」的场景（cron 的五段提醒）必须传带日期维度的 refId。
  const result = await db.prepare("INSERT OR IGNORE INTO alerts (id, elder_id, type, title, message, status, ref_id, created_at) VALUES (?, ?, ?, ?, ?, 'new', ?, ?)").run(id, elderId, type, title, message, refId, nowIso());
  const changes = Number(result?.changes ?? result?.rowsAffected ?? 1);
  return changes > 0 ? id : null;
}

// 多家庭隔离：只有单家庭/默认演示账号，或显式开启 FEISHU_ALLOW_GLOBAL_FALLBACK=1 时，
// 才允许回落到全局环境变量里的飞书 Webhook / App 群，避免 B 家的老人告警串发到管理员或 A 家群。
function canUseGlobalFeishuFallback(user) {
  return user?.id === defaultCaregiverId || process.env.FEISHU_ALLOW_GLOBAL_FALLBACK === "1";
}

async function resolveCaregiverFeishuWebhook(user) {
  if (user?.role !== "caregiver") return { webhook: "", allowAppFallback: false };
  const row = await db
    .prepare("SELECT config_json FROM notification_channels WHERE owner_id = ? AND channel_type = 'feishu' AND enabled = 1")
    .get(user.id);
  const configured = row ? JSON.parse(row.config_json).webhook : "";
  if (configured) return { webhook: configured, allowAppFallback: false };
  if (canUseGlobalFeishuFallback(user)) {
    return { webhook: feishuWebhookUrl, allowAppFallback: true };
  }
  return { webhook: "", allowAppFallback: false };
}

async function sendFeishu(user, text) {
  const { webhook, allowAppFallback } = await resolveCaregiverFeishuWebhook(user);
  if (webhook) return postFeishu(webhook, text);
  if (allowAppFallback) return postFeishuAppMessage("text", { text });
  return { ok: false, message: "当前家属尚未配置飞书 Webhook" };
}

async function postFeishu(webhook, text) {
  if (!webhook) return { ok: false, message: "FEISHU_WEBHOOK_URL is not configured" };
  try {
    const feishuResponse = await fetchWithTimeout(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ msg_type: "text", content: { text } }),
    });
    if (!feishuResponse.ok) return { ok: false, message: "Feishu rejected the notification" };
    return { ok: true };
  } catch (error) {
    // 外部调用失败只回可读文案：error.message 可能带出内部 URL 或栈信息，细节留给服务端日志
    console.warn("[TechGuard] 飞书通知发送失败：", error?.message || error);
    return { ok: false, message: "飞书通知发送失败，请检查 Webhook 配置和网络" };
  }
}

async function sendFeishuCard(user, card) {
  const { webhook, allowAppFallback } = await resolveCaregiverFeishuWebhook(user);
  if (webhook) return postFeishuCard(webhook, card);
  if (allowAppFallback) return postFeishuAppMessage("interactive", card);
  return { ok: false, message: "当前家属尚未配置飞书 Webhook" };
}

async function postFeishuCard(webhook, card) {
  if (!webhook) return { ok: false, message: "FEISHU_WEBHOOK_URL is not configured" };
  try {
    const feishuResponse = await fetchWithTimeout(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ msg_type: "interactive", card }),
    });
    if (!feishuResponse.ok) return { ok: false, message: "Feishu rejected the notification" };
    return { ok: true };
  } catch (error) {
    // 外部调用失败只回可读文案：error.message 可能带出内部 URL 或栈信息，细节留给服务端日志
    console.warn("[TechGuard] 飞书通知发送失败：", error?.message || error);
    return { ok: false, message: "飞书通知发送失败，请检查 Webhook 配置和网络" };
  }
}

async function getFeishuTenantAccessToken() {
  if (!feishuAppId || !feishuAppSecret) return null;
  if (feishuTenantTokenCache && feishuTenantTokenCache.expiresAt > Date.now() + 60_000) {
    return feishuTenantTokenCache.token;
  }

  // 获取 token 也要有超时保护；失败时返回 null，由调用方降级处理，不能让异常冒泡
  try {
    const tokenResponse = await fetchWithTimeout("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ app_id: feishuAppId, app_secret: feishuAppSecret }),
    });
    const data = await tokenResponse.json();
    if (!tokenResponse.ok || data.code !== 0 || !data.tenant_access_token) {
      return null;
    }
    feishuTenantTokenCache = {
      token: data.tenant_access_token,
      expiresAt: Date.now() + Math.max(60, Number(data.expire || 7200) - 60) * 1000,
    };
    return feishuTenantTokenCache.token;
  } catch {
    return null;
  }
}

async function postFeishuAppMessage(msgType, content) {
  if (!feishuReceiveId) return { ok: false, message: "FEISHU_RECEIVE_ID is not configured" };
  const token = await getFeishuTenantAccessToken();
  if (!token) return { ok: false, message: "Feishu app credentials are not configured or invalid" };

  try {
    const feishuResponse = await fetchWithTimeout(`https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=${encodeURIComponent(feishuReceiveIdType)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify({
        receive_id: feishuReceiveId,
        msg_type: msgType,
        content: JSON.stringify(content),
      }),
    });
    const data = await feishuResponse.json();
    if (!feishuResponse.ok || data.code !== 0) {
      return { ok: false, message: data.msg || "Feishu app rejected the notification", code: data.code };
    }
    return { ok: true };
  } catch (error) {
    // 外部调用失败只回可读文案：error.message 可能带出内部 URL 或栈信息，细节留给服务端日志
    console.warn("[TechGuard] 飞书通知发送失败：", error?.message || error);
    return { ok: false, message: "飞书通知发送失败，请检查 Webhook 配置和网络" };
  }
}

function buildSimpleCard(title, content) {
  return {
    header: { title: { tag: "plain_text", content: title }, template: "blue" },
    elements: [{ tag: "div", text: { tag: "lark_md", content } }],
  };
}

function buildBloodPressureCard(elder, summary, bpText, note) {
  const template = summary.level === "danger" ? "red" : summary.level === "warning" ? "orange" : "green";
  return {
    header: { title: { tag: "plain_text", content: `血压记录 · ${summary.label}` }, template },
    elements: [
      { tag: "div", text: { tag: "lark_md", content: `**${elder.displayName}** 刚记录血压` } },
      { tag: "div", text: { tag: "lark_md", content: `**${bpText}**` } },
      { tag: "hr" },
      { tag: "div", text: { tag: "lark_md", content: summary.advice } },
      ...(note ? [{ tag: "note", elements: [{ tag: "plain_text", content: `备注：${note}` }] }] : []),
    ],
  };
}

async function getNotificationPreferences(userId) {
  const row = await db.prepare("SELECT * FROM notification_preferences WHERE user_id = ?").get(userId);
  if (row) return row;
  const defaults = { user_id: userId, task_assigned: 1, task_due: 1, task_completed: 1, medication_completed: 1, blood_pressure_recorded: 1, blood_pressure_abnormal: 1, help_requested: 1, safe_checkin: 1, inactivity_alert: 1, feishu_enabled: 1, updated_at: nowIso() };
  await db.prepare("INSERT INTO notification_preferences (user_id, task_assigned, task_due, task_completed, medication_completed, blood_pressure_recorded, blood_pressure_abnormal, help_requested, safe_checkin, inactivity_alert, feishu_enabled, updated_at) VALUES (?, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, ?)").run(userId, defaults.updated_at);
  return defaults;
}

async function createNotification(userId, type, title, body) {
  const id = createId("notif");
  await db.prepare("INSERT INTO notifications (id, user_id, type, title, body, is_read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)").run(id, userId, type, title, body, nowIso());
  return id;
}

async function notifyCaregiver(caregiver, type, title, body, options = {}) {
  const prefs = await getNotificationPreferences(caregiver.id);
  const prefKey = type;
  if (prefs[prefKey] === 0) return { ok: false, message: "通知已关闭" };
  await createNotification(caregiver.id, type, title, body);

  // 多通道分发：企业微信 / 钉钉（各自独立配置即生效），以及飞书（受 feishu_enabled 控制）
  const extraRows = await db
    .prepare("SELECT channel_type, config_json FROM notification_channels WHERE owner_id = ? AND channel_type IN ('wecom', 'dingtalk') AND enabled = 1")
    .all(caregiver.id);
  const extraResults = [];
  for (const row of extraRows) {
    const webhook = JSON.parse(row.config_json || "{}").webhook || "";
    if (!webhook) continue;
    extraResults.push(await postWebhookChannel(row.channel_type, webhook, { title, body }, fetchWithTimeout));
  }

  // 高危紧急事件（一键求助 / 静默未活跃 / 异常血压 / 高危防骗）支持可选短信/语音外呼网关兜底
  if (caregiver.phone) {
    await dispatchUrgentSmsGateway({ phone: caregiver.phone, type, title, body }, fetchWithTimeout);
  }

  if (prefs.feishu_enabled === 0) {
    return extraResults.find((item) => item.ok) || { ok: false, message: "飞书通知已关闭" };
  }
  const feishuResult = options.feishuCard
    ? await sendFeishuCard(caregiver, options.feishuCard)
    : await sendFeishu(caregiver, `${title}\n${body}`);
  return feishuResult.ok ? feishuResult : extraResults.find((item) => item.ok) || feishuResult;
}

// 提醒应该发给「真正在照护这位长辈」的家属。原来所有通知都写死发给 defaultCaregiverId，
// 多家庭部署时 A 家的提醒会发到 B 家。
// 没有任何关联家属时返回空数组、由调用方记录告警：绝不能回落到默认家属——
// 那会把某位长辈的血压、身体不适等敏感健康信息发给一个与 ta 毫无关系的家庭。
async function caregiversForElder(elderId) {
  const rows = await db
    .prepare(
      `SELECT u.id, u.role, u.phone FROM family_links fl JOIN users u ON u.id = fl.caregiver_id
       WHERE fl.elder_id = ?
       GROUP BY u.id`
    )
    .all(elderId);
  if (!rows.length) {
    console.warn(`[TechGuard] 长辈 ${elderId} 没有关联家属，本条通知只落库不外发（请检查 family_links）`);
  }
  return rows;
}

async function notifyElderCaregivers(elderId, type, title, body, options = {}) {
  const caregivers = await caregiversForElder(elderId);
  let result = { ok: false, message: "没有可通知的家属" };
  for (const caregiver of caregivers) {
    result = await notifyCaregiver(caregiver, type, title, body, options);
  }
  return result;
}

async function notifyElder(elder, type, title, body) {
  const prefs = await getNotificationPreferences(elder.id);
  const prefKey = type;
  if (prefs[prefKey] === 0) return { ok: false, message: "通知已关闭" };
  await createNotification(elder.id, type, title, body);
  return { ok: true };
}

// 给长辈本人的手机发 Web Push。提醒主流程（写库 + 飞书）不能被推送失败影响，所以整体吞掉异常。
async function pushToElder(elderId, payload) {
  // 没有可用密钥时静默跳过：前端在「开启手机提醒」时已经拿到 enabled:false 的提示
  if (!vapidDetails) return;
  try {
    const subscriptions = await db.prepare("SELECT * FROM push_subscriptions WHERE user_id = ?").all(elderId);
    // 并发发送：串行 await 会让一个无响应的推送端点把整个 cron 拖到超时（每个订阅最多 8s）。
    await Promise.allSettled(subscriptions.map((subscription) => sendPushToSubscription(subscription, payload)));
  } catch (error) {
    console.warn(`[TechGuard] 向长辈 ${elderId} 发送手机提醒失败：`, error?.message || error);
  }
}

// payload 约定为 { title, body, url, tag }（sw.js 按这个契约解析），tag 让同一剂药只留一条通知
async function sendPushToSubscription(subscription, payload) {
  try {
    await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
      JSON.stringify(payload),
      // timeout 与项目里其他外部请求保持一致：推送服务不响应时不能让 cron 卡死
      { vapidDetails, TTL: 3600, urgency: "high", timeout: externalFetchTimeoutMs }
    );
  } catch (error) {
    // 404/410 表示订阅已失效（用户卸载、清了浏览器数据或换了手机），删掉避免每次提醒都白跑
    if (error?.statusCode === 404 || error?.statusCode === 410) {
      await db.prepare("DELETE FROM push_subscriptions WHERE id = ?").run(subscription.id);
      console.warn(`[TechGuard] 推送订阅已失效，已删除：${subscription.endpoint}`);
      return;
    }
    // 其余错误（网络超时、推送服务 5xx 等）只记录，不打断提醒主流程
    console.warn("[TechGuard] 手机提醒发送失败：", error?.message || error);
  }
}

async function notificationList(response, user) {
  const notifications = await db.prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50").all(user.id);
  const unreadCount = (await db.prepare("SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0").get(user.id)).count;
  const prefs = await getNotificationPreferences(user.id);
  sendJson(response, 200, { ok: true, notifications, unreadCount, preferences: prefs });
}

async function markNotificationRead(request, response, user) {
  // 走统一的 readJson（而不是 readJsonSync）：非法 JSON 应像其他接口一样回 400，
  // 超大 body 也必须有上限，避免已登录用户拿这条路径做内存放大。
  const body = await readJson(request);
  if (body.all) {
    await db.prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ?").run(user.id);
  } else if (body.id) {
    await db.prepare("UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?").run(body.id, user.id);
  }
  sendJson(response, 200, { ok: true });
}

async function saveNotificationPreferences(request, response, user) {
  const body = await readJson(request);
  const prefs = await getNotificationPreferences(user.id);
  const fields = ["task_assigned", "task_due", "task_completed", "medication_completed", "blood_pressure_recorded", "blood_pressure_abnormal", "help_requested", "safe_checkin", "inactivity_alert", "feishu_enabled"];
  const updates = {};
  for (const field of fields) {
    if (body[field] !== undefined) updates[field] = body[field] ? 1 : 0;
  }
  await db.prepare(
    `INSERT INTO notification_preferences (user_id, task_assigned, task_due, task_completed, medication_completed, blood_pressure_recorded, blood_pressure_abnormal, help_requested, safe_checkin, inactivity_alert, feishu_enabled, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET ${Object.keys(updates).length ? Object.keys(updates).map((k) => `${k} = excluded.${k}`).join(", ") + ", " : ""}updated_at = excluded.updated_at`
  ).run(
    user.id,
    updates.task_assigned ?? prefs.task_assigned,
    updates.task_due ?? prefs.task_due,
    updates.task_completed ?? prefs.task_completed,
    updates.medication_completed ?? prefs.medication_completed,
    updates.blood_pressure_recorded ?? prefs.blood_pressure_recorded,
    updates.blood_pressure_abnormal ?? prefs.blood_pressure_abnormal,
    updates.help_requested ?? prefs.help_requested,
    updates.safe_checkin ?? prefs.safe_checkin,
    updates.inactivity_alert ?? prefs.inactivity_alert ?? 1,
    updates.feishu_enabled ?? prefs.feishu_enabled,
    nowIso()
  );
  sendJson(response, 200, { ok: true, preferences: await getNotificationPreferences(user.id) });
}

// 防骗规则已拆分至 src/server/domain-rules.mjs（analyzeFraud / inferFraudType）

async function buildWeatherCare(weather) {
  if (!weather) {
    return { text: "还没有设置天气地区。让家属先设置城市后，我就能每天提醒天气。", severe: false, source: "not-configured" };
  }
  const live = await fetchWeatherNow(weather);
  if (!live) return buildFallbackWeatherCare(weather);

  const location = `${weather.city}${weather.district || ""}`;
  const condition = weatherCodeLabel(live.weatherCode);
  const tempText = Number.isFinite(live.temperature) ? `${Math.round(live.temperature)}℃` : "温度暂缺";
  const apparentText = Number.isFinite(live.apparentTemperature) ? `体感${Math.round(live.apparentTemperature)}℃` : "";
  const rainText = Number.isFinite(live.precipitation) && live.precipitation > 0 ? `，降水${live.precipitation}毫米` : "";
  const windText = Number.isFinite(live.windSpeed) ? `，风速约${Math.round(live.windSpeed)}公里/小时` : "";
  const severe =
    live.weatherCode >= 51 ||
    live.precipitation > 0 ||
    live.temperature <= 5 ||
    live.temperature >= 33 ||
    live.windSpeed >= 28;
  let advice = "出门前看一眼衣服、钥匙和手机，慢慢走，别着急。";
  if (live.weatherCode >= 51 || live.precipitation > 0) advice = "出门记得带伞，地面湿滑时慢慢走。";
  else if (live.temperature <= 5) advice = "今天比较冷，出门多穿一件厚外套。";
  else if (live.temperature >= 33) advice = "今天比较热，尽量避开中午出门，记得喝水。";
  else if (live.windSpeed >= 28) advice = "今天风有点大，出门扶稳一点，注意保暖。";

  return {
    text: `${location}今天${condition}，${tempText}${apparentText ? `，${apparentText}` : ""}${rainText}${windText}。${advice}`,
    severe,
    source: "open-meteo",
  };
}

// buildFallbackWeatherCare / weatherGeocodeCandidates / weatherCodeLabel 已拆分至 src/server/domain-rules.mjs
async function fetchWeatherNow(weather) {
  try {
    const place = await geocodeWeatherLocation(weather);
    if (!place) return null;
    const params = new URLSearchParams({
      latitude: String(place.latitude),
      longitude: String(place.longitude),
      current: "temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m",
      timezone: "Asia/Shanghai",
      forecast_days: "1",
    });
    const data = await fetchJsonWithTimeout(`https://api.open-meteo.com/v1/forecast?${params}`, 4500);
    return {
      temperature: Number(data.current?.temperature_2m),
      apparentTemperature: Number(data.current?.apparent_temperature),
      precipitation: Number(data.current?.precipitation),
      weatherCode: Number(data.current?.weather_code),
      windSpeed: Number(data.current?.wind_speed_10m),
    };
  } catch {
    return null;
  }
}

async function geocodeWeatherLocation(weather) {
  for (const name of weatherGeocodeCandidates(weather)) {
    const params = new URLSearchParams({ name, count: "1", language: "zh", format: "json" });
    const data = await fetchJsonWithTimeout(`https://geocoding-api.open-meteo.com/v1/search?${params}`, 4500);
    const item = data.results?.[0];
    if (item?.latitude != null && item?.longitude != null) return item;
  }
  return null;
}

// 统一的外部 HTTP 超时封装：默认 8 秒，避免飞书/OpenAI 等请求永久挂起。
// 超时抛出 AbortError，由各调用方的 catch 降级到后备逻辑。
const externalFetchTimeoutMs = Number(process.env.EXTERNAL_FETCH_TIMEOUT_MS || 8000);

async function fetchWithTimeout(url, options = {}, timeoutMs = externalFetchTimeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJsonWithTimeout(url, timeoutMs) {
  const response = await fetchWithTimeout(url, {}, timeoutMs);
  if (!response.ok) throw new Error(`Weather request failed: ${response.status}`);
  return await response.json();
}

function inferDestination(query) {
  const match = query.match(/去([^，。,. ]{2,12})/);
  if (match) return match[1];
  if (/医院|复查/.test(query)) return "医院";
  if (/大剧院/.test(query)) return "大剧院";
  return "目的地";
}

function inferTravelLocations(query, fallbackDestination, weather) {
  const city = normalizeCity(weather?.city) || inferCityFromText(query) || "北京";
  const pair = query.match(/从(.+?)(?:到|去|前往)(.+?)(?:[，。,.；;]|$)/);
  const origin = cleanPlaceName(pair?.[1]) || cleanPlaceName(weather ? `${weather.city}${weather.district || ""}` : "") || "当前位置";
  const destination = cleanPlaceName(pair?.[2]) || cleanPlaceName(fallbackDestination);
  return { origin, destination, city };
}

function inferCityFromText(text) {
  const match = text.match(/(北京|上海|广州|深圳|杭州|南京|苏州|成都|重庆|武汉|西安|天津|长沙|郑州|青岛|厦门|福州|沈阳|大连)/);
  return match?.[1] || "";
}

function normalizeCity(city) {
  return String(city || "").replace(/市$/, "").trim();
}

function cleanPlaceName(value) {
  return String(value || "")
    .replace(/^(我|俺|老人|奶奶|爷爷|想|要|准备|打算|明天|今天|后天|上午|下午|晚上|中午)+/, "")
    .replace(/(一趟|怎么走|怎么坐车|路线|最稳妥|最安全|啊|呀|呢|吗|吧|。|，|,|\.)+$/g, "")
    .trim();
}

async function generateTravelAdvice({ elder, query, origin, destination, city, weatherCare }) {
  const routeExample =
    /四惠东/.test(query) && /朝阳公园/.test(query)
      ? {
          reply_for_elder: `${elder.displayName}，从四惠东去朝阳公园，建议您坐地铁1号线到大望路站，换乘14号线到朝阳公园站。出站后慢慢走，别着急。${weatherCare.text} 如果路上不确定，就先联系家属。`,
          caregiver_alert: `TechGuard 出行提醒：${elder.displayName}计划从四惠东前往朝阳公园，建议路线为地铁1号线到大望路换乘14号线到朝阳公园站，请关注出发和到达时间。`,
          route_summary: "四惠东 → 地铁1号线 → 大望路换乘14号线 → 朝阳公园站",
          risk_level: weatherCare.severe ? "medium" : "low",
          need_family_help: weatherCare.severe,
          weather_care: weatherCare.text,
          source: "local-route-example",
        }
      : null;
  const fallback = {
    reply_for_elder: `${elder.displayName}，建议您从${origin}去${destination}时选择少换乘、少走路的路线。${weatherCare.text} 如果路上不确定，就先联系家属。`,
    caregiver_alert: `TechGuard 出行提醒：${elder.displayName}正在查询从${origin}去${destination}的路线，建议确认是否需要接送。`,
    route_summary: `${origin} → ${destination}`,
    risk_level: weatherCare.severe ? "medium" : "low",
    need_family_help: weatherCare.severe || /医院|复查|夜|晚上/.test(query),
    weather_care: weatherCare.text,
    source: "local-fallback",
  };

  const amapPlan = await planAmapTransitRoute({ elder, origin, destination, city, weatherCare });
  if (amapPlan) return amapPlan;
  if (routeExample) return routeExample;
  if (!openaiApiKey) return fallback;

  try {
    const aiResponse = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "你是银发出行助手。输出严格 JSON，字段为 reply_for_elder, caregiver_alert, risk_level, need_family_help。语言必须温柔、简短、老人听得懂，不要使用复杂导航术语。",
          },
          {
            role: "user",
            content: JSON.stringify({
              elderName: elder.displayName,
              query,
              origin,
              destination,
              city,
              weatherCare: weatherCare.text,
            }),
          },
        ],
      }),
    });
    if (!aiResponse.ok) return fallback;
    const data = await aiResponse.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
    return {
      reply_for_elder: parsed.reply_for_elder || fallback.reply_for_elder,
      caregiver_alert: parsed.caregiver_alert || fallback.caregiver_alert,
      route_summary: parsed.route_summary || routeExample?.route_summary || fallback.route_summary,
      risk_level: parsed.risk_level || fallback.risk_level,
      need_family_help: Boolean(parsed.need_family_help ?? fallback.need_family_help),
      weather_care: weatherCare.text,
      source: "openai",
    };
  } catch {
    return fallback;
  }
}

async function planAmapTransitRoute({ elder, origin, destination, city, weatherCare }) {
  if (!amapApiKey || !origin || !destination || origin === "当前位置" || destination === "目的地") return null;
  try {
    const [originPoint, destinationPoint] = await Promise.all([
      geocodeAmapPlace(origin, city),
      geocodeAmapPlace(destination, city),
    ]);
    if (!originPoint || !destinationPoint) return null;
    const params = new URLSearchParams({
      key: amapApiKey,
      origin: `${originPoint.lng},${originPoint.lat}`,
      destination: `${destinationPoint.lng},${destinationPoint.lat}`,
      city,
      cityd: city,
      strategy: "0",
      extensions: "base",
    });
    const data = await fetchJsonWithTimeout(`https://restapi.amap.com/v3/direction/transit/integrated?${params}`, 6000);
    if (data.status !== "1") return null;
    const transit = chooseSeniorTransitPlan(data.route?.transits || []);
    if (!transit) return null;
    const routeSummary = buildTransitSummary(transit);
    const duration = formatDuration(Number(transit.duration));
    const distance = formatDistance(Number(transit.distance));
    const walkDistance = formatDistance(Number(transit.walking_distance));
    const transfers = countTransitTransfers(transit);
    const costText = transit.cost ? `，票价约${transit.cost}元` : "";
    const riskLevel = weatherCare.severe || Number(transit.walking_distance) > 800 || transfers > 1 ? "medium" : "low";
    return {
      reply_for_elder: `${elder.displayName}，建议您从${origin}去${destination}：${routeSummary}。全程约${duration}，距离约${distance}，步行约${walkDistance}${costText}。${weatherCare.text} 出门前把手机电量充足，路上不确定就先联系家属。`,
      caregiver_alert: `TechGuard 出行提醒：${elder.displayName}计划从${origin}前往${destination}。高德建议：${routeSummary}。约${duration}，步行约${walkDistance}${costText}。`,
      route_summary: routeSummary,
      risk_level: riskLevel,
      need_family_help: riskLevel === "medium",
      source: "amap-transit",
      weather_care: weatherCare.text,
      route_metrics: {
        duration_seconds: Number(transit.duration) || 0,
        distance_meters: Number(transit.distance) || 0,
        walking_meters: Number(transit.walking_distance) || 0,
        transfers,
      },
    };
  } catch {
    return null;
  }
}

async function geocodeAmapPlace(place, city) {
  const params = new URLSearchParams({
    key: amapApiKey,
    address: city && !place.includes(city) ? `${city}${place}` : place,
    city,
  });
  const data = await fetchJsonWithTimeout(`https://restapi.amap.com/v3/geocode/geo?${params}`, 6000);
  const item = data.status === "1" ? data.geocodes?.[0] : null;
  if (!item?.location) return null;
  const [lng, lat] = item.location.split(",");
  return { lng, lat, formattedAddress: item.formatted_address || place };
}

function chooseSeniorTransitPlan(transits) {
  return transits
    .filter((item) => item && item.segments?.length)
    .sort((a, b) => seniorRouteScore(a) - seniorRouteScore(b))[0] || null;
}

function seniorRouteScore(plan) {
  return countTransitTransfers(plan) * 2000 + Number(plan.walking_distance || 0) + Number(plan.duration || 0) / 20;
}

function countTransitTransfers(plan) {
  return Math.max(0, (plan.segments || []).filter((segment) => segment.bus?.buslines?.length || segment.railway?.name).length - 1);
}

function buildTransitSummary(plan) {
  const parts = [];
  for (const segment of plan.segments || []) {
    const walkingDistance = Number(segment.walking?.distance || 0);
    if (walkingDistance >= 80) parts.push(`步行约${formatDistance(walkingDistance)}`);
    const busline = segment.bus?.buslines?.[0];
    if (busline) {
      const lineName = cleanBusLineName(busline.name);
      const from = busline.departure_stop?.name || "上车站";
      const to = busline.arrival_stop?.name || "下车站";
      parts.push(`${lineName}（${from}上车，${to}下车）`);
    }
    if (segment.railway?.name) parts.push(`${segment.railway.name}`);
  }
  return parts.slice(0, 6).join(" → ") || "少换乘路线";
}

function cleanBusLineName(name) {
  return String(name || "公交").split("(")[0].replace(/地铁(\d+)/, "地铁$1号线");
}

function formatDistance(meters) {
  if (!Number.isFinite(meters) || meters <= 0) return "0米";
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)}公里` : `${Math.round(meters)}米`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "时间暂缺";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}分钟`;
  return `${Math.floor(minutes / 60)}小时${minutes % 60}分钟`;
}

// analyzeBloodPressure 已拆分至 src/server/domain-rules.mjs
async function generateCheckupAdvice({ elder, imageData, fileName }) {
  const fallback = {
    summary: "已收到体检报告照片。当前未启用图片智能分析，请让家人或医生帮忙核对报告里的异常标记。",
    risk_level: "review",
    suggestions: [
      "优先查看报告中带有上箭头、下箭头或“异常”的项目。",
      "重点留意血压、血糖、血脂、肝肾功能和心电图等常见项目。",
      "如果报告提示明显异常，建议带着原报告咨询医生，不要自行增减药量。",
    ],
    source: "local-fallback",
    disclaimer: "仅作健康管理提示，不替代医生诊断。",
  };

  if (!openaiApiKey) return fallback;

  try {
    const aiResponse = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_VISION_MODEL || process.env.OPENAI_MODEL || "gpt-4.1-mini",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "你是老人健康管理助手，不做诊断，不替代医生。请读取体检报告图片，输出严格 JSON：summary, risk_level, abnormal_items, suggestions, family_note, disclaimer。语言简短、温柔、适合老人和家属阅读。",
          },
          {
            role: "user",
            content: [
              { type: "text", text: `请分析${elder.displayName}上传的体检报告照片：${fileName}` },
              { type: "image_url", image_url: { url: imageData } },
            ],
          },
        ],
      }),
    });
    if (!aiResponse.ok) return fallback;
    const data = await aiResponse.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
    return {
      summary: String(parsed.summary || fallback.summary),
      risk_level: String(parsed.risk_level || "review"),
      abnormal_items: Array.isArray(parsed.abnormal_items) ? parsed.abnormal_items.slice(0, 8) : [],
      suggestions: Array.isArray(parsed.suggestions) && parsed.suggestions.length ? parsed.suggestions.slice(0, 6) : fallback.suggestions,
      family_note: String(parsed.family_note || "建议亲属查看原报告，并在复诊时带给医生确认。"),
      disclaimer: "仅作健康管理提示，不替代医生诊断。",
      source: "openai",
    };
  } catch {
    return fallback;
  }
}

function assertCaregiver(user) {
  // 权限不足返回 403，而不是被统一兜成 500
  if (user.role !== "caregiver") throw new HttpError(403, "只有亲属账号可以进行此操作");
}

function publicUser(user) {
  // phone 用于 /api/me 回显联系电话；未填写时统一输出空字符串，避免前端拿到 undefined
  return { id: user.id, username: user.username, displayName: user.display_name || user.displayName, role: user.role, phone: user.phone ?? "" };
}

function required(value, message) {
  const text = String(value || "").trim();
  if (!text) throw new HttpError(400, message);
  return text;
}

// 时间统一使用零填充 HH:MM（兼容 HH:MM:SS），保证和 cron 的当前时间做字符串比较时不会错位
const timeOfDayPattern = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

function validateTimeOfDay(value, label) {
  const text = required(value, `${label}不能为空`);
  if (!timeOfDayPattern.test(text)) throw new HttpError(400, `${label}格式不正确，请使用 HH:MM（例如 09:00）`);
  return text;
}

// enabled 接受布尔或 0/1（含字符串形式），统一落库成 INTEGER 0/1；
// 其他取值属于客户端错误，直接 400，避免把 "false" 这类字符串按 truthy 存成 1 反而启用了计划。
function normalizeEnabledFlag(value) {
  if (value === true || value === 1 || value === "1") return 1;
  if (value === false || value === 0 || value === "0") return 0;
  throw new HttpError(400, "enabled 只能是 true/false 或 1/0");
}

// 白名单校验：只放行前端真正需要的资源，禁止 db/server 源码/node_modules 等被下载
function isAllowedStaticPath(relativePath) {
  const segments = relativePath.split(/[\\/]+/).filter(Boolean);
  // 拒绝空路径及任何以 "." 开头的路径段（覆盖 ".."、".env"、隐藏文件等）
  if (!segments.length || segments.some((segment) => segment.startsWith("."))) return false;
  const normalized = segments.join("/");
  if (normalized === "index.html" || normalized === "sw.js" || normalized === "favicon.ico") return true;
  // PWA 入口与图标：iOS 必须「添加到主屏幕」后才允许 Web Push，所以这两项是提醒功能的前置依赖
  if (normalized === "manifest.json") return true;
  const extension = extname(normalized).toLowerCase();
  if (normalized.startsWith("src/")) return staticScriptStyles.has(extension);
  if (normalized.startsWith("icons/")) return staticImages.has(extension);
  if (normalized.startsWith("docs/assets/")) return staticImages.has(extension);
  return false;
}

function serveStatic(request, response, url) {
  let rawPath;
  try {
    rawPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400);
    response.end("Bad Request");
    return;
  }

  // 用 resolve + relative 做规范化，任何 ".."、URL 编码或反斜杠逃逸都会在 relative 结果中暴露并被拒绝
  const filePath = resolve(root, `.${rawPath.startsWith("/") ? "" : "/"}${rawPath}`);
  const relativePath = relative(root, filePath);
  if (relativePath.startsWith("..") || isAbsolute(relativePath) || !isAllowedStaticPath(relativePath) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404);
    response.end("Not Found");
    return;
  }
  response.writeHead(200, { "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream" });
  if (request.method === "HEAD") return response.end();
  createReadStream(filePath).pipe(response);
}

async function readJson(request) {
  const body = await readBody(request);
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    // JSON 解析失败属于客户端请求错误，返回 400 而不是 500
    throw new HttpError(400, "请求数据格式不正确，请检查后重试");
  }
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 6_000_000) throw new HttpError(400, "请求内容太大，请压缩后再上传");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function getCookie(request, name) {
  const cookie = request.headers.cookie || "";
  return cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.split("=")[1];
}

// 新密码使用 scrypt + 每用户 16 字节随机盐，存储为 scrypt 前缀、盐、哈希三段，用美元符号拼接
function hashPassword(password) {
  const salt = randomBytes(scryptSaltLength);
  const derived = scryptSync(password, salt, scryptKeyLength);
  return [scryptPrefix, salt.toString("hex"), derived.toString("hex")].join("$");
}

// 旧版单轮无盐 sha256，仅用于兼容历史数据
function legacyHashPassword(password) {
  return createHash("sha256").update(`techguard:${password}`).digest("hex");
}

function isScryptHash(stored) {
  return typeof stored === "string" && stored.startsWith(scryptPrefix + "$");
}

// 恒定时间比较，避免通过响应时间推断哈希
function safeEqual(a, b) {
  const bufferA = Buffer.from(String(a), "utf8");
  const bufferB = Buffer.from(String(b), "utf8");
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  if (isScryptHash(stored)) {
    const parts = String(stored).split("$");
    const saltHex = parts[1];
    const hashHex = parts[2];
    if (!saltHex || !hashHex) return false;
    try {
      const derived = scryptSync(password, Buffer.from(saltHex, "hex"), Buffer.from(hashHex, "hex").length);
      return safeEqual(derived.toString("hex"), hashHex);
    } catch {
      return false;
    }
  }
  // 兼容旧的 sha256 存储，校验成功后由 login 透明升级
  return safeEqual(legacyHashPassword(password), stored);
}

// Cookie 属性：生产环境（HTTPS）加 Secure；本地 http 调试不能加，否则浏览器不保存会话
function sessionCookieAttributes(maxAgeSeconds) {
  const secure = process.env.NODE_ENV === "production" || process.env.VERCEL ? "; Secure" : "";
  return `Path=/; HttpOnly; SameSite=Lax${secure}; Max-Age=${maxAgeSeconds}`;
}

// 内存级登录失败限流：按「用户名+IP」计数，连续 5 次失败后锁定 5 分钟
const loginFailureLimit = 5;
const loginLockMs = 5 * 60 * 1000;
const loginFailures = new Map();

function isLoopback(remoteAddress) {
  const remote = String(remoteAddress || "");
  return remote === "127.0.0.1" || remote === "::1" || remote === "::ffff:127.0.0.1";
}

// X-Forwarded-For 是客户端可以随便填的头。无条件采信它 = 每次换个假 IP 就能重置限流计数，
// 爆破防护形同虚设。只有确认请求确实经过受信代理时才采信：
// - TRUST_PROXY=1（自建 Nginx/Caddy，需自行保证上游会重写该头）
// - VERCEL=1（平台会重写该头，客户端伪造的会被覆盖）
// - 直连来自本机回环（本地开发 / 同机反代）
//
// 取「最后一段」而不是第一段：nginx 的 $proxy_add_x_forwarded_for 是把自己看到的对端
// 追加在客户端的值之后，所以最靠右的才是可信的一跳，左边的可能是攻击者预置的假 IP。
const trustForwardedFor = process.env.TRUST_PROXY === "1" || Boolean(process.env.VERCEL);

function clientIp(request) {
  const remote = String(request.socket?.remoteAddress || "");
  if (trustForwardedFor || isLoopback(remote)) {
    const hops = String(request.headers["x-forwarded-for"] || "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (hops.length) return hops[hops.length - 1];
  }
  return remote || "unknown";
}

function checkLoginRateLimit(username, ip) {
  const key = `${username}|${ip}`;
  const entry = loginFailures.get(key);
  if (!entry || !entry.lockedUntil) return null;
  if (entry.lockedUntil > Date.now()) {
    const seconds = Math.ceil((entry.lockedUntil - Date.now()) / 1000);
    return `登录失败次数过多，请 ${seconds} 秒后再试`;
  }
  loginFailures.delete(key);
  return null;
}

function recordLoginFailure(username, ip) {
  pruneRateLimitMap(loginFailures);
  const key = `${username}|${ip}`;
  const entry = loginFailures.get(key) || { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= loginFailureLimit) {
    entry.count = 0;
    entry.lockedUntil = Date.now() + loginLockMs;
  }
  loginFailures.set(key, entry);
}

function clearLoginFailures(username, ip) {
  loginFailures.delete(`${username}|${ip}`);
}

// 定时扫描鉴权：配置了 CRON_SECRET 必须带 Bearer；未配置时只信任本机回环，
// 以及在 Vercel 平台上由平台自身注入的 vercel-cron UA。
// 注意：UA 是可以伪装的，所以自建部署下不接受它——否则任何人都能反复触发扫描。
// Vercel Cron 在项目里设置了 CRON_SECRET 后会自动带上 Authorization 头，强烈建议配置。
function isAuthorizedCronRequest(request) {
  if (cronSecret) return request.headers.authorization === `Bearer ${cronSecret}`;
  if (isLoopback(request.socket?.remoteAddress)) return true;
  if (process.env.VERCEL && /^vercel-cron\//i.test(String(request.headers["user-agent"] || ""))) return true;
  return false;
}

function createId(prefix) {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}

function nowIso() {
  return new Date().toISOString();
}

function todayDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
}

// 到点提醒后多久仍未确认就升级提醒（分钟）。
const MEDICATION_ESCALATE_AFTER_MINUTES = Number(process.env.MEDICATION_ESCALATE_AFTER_MINUTES || 30) || 30;

// 计算 "HH:MM" 到 "HH:MM" 之间经过了多少分钟，跨零点按 0 处理（当天提醒不跨天）。
function minutesSince(fromTime, toTime) {
  const parse = (value) => {
    const match = /^(\d{1,2}):(\d{2})/.exec(String(value || ""));
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };
  const from = parse(fromTime);
  const to = parse(toTime);
  if (from === null || to === null) return 0;
  return Math.max(0, to - from);
}

// 按北京时间回推 N 天，用于统计最近的漏服。
function dateDaysAgo(days) {
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(date);
}

function currentTime() {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
}
