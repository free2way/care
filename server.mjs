import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize } from "node:path";
import { randomBytes, createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const root = process.cwd();
const port = Number(process.env.PORT || 5173);
const dbPath = process.env.SQLITE_PATH || join(root, "data", "techguard.db");
const feishuWebhookUrl = process.env.FEISHU_WEBHOOK_URL || "";
const openaiApiKey = process.env.OPENAI_API_KEY || "";
const sessions = new Map();
const defaultCaregiverId = "user-caregiver";
const defaultElderId = "user-elder";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

mkdirSync(dirname(dbPath), { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");
initDatabase();

createServer(async (request, response) => {
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
    sendJson(response, 500, { ok: false, message: error.message });
  }
}).listen(port, () => {
  console.log(`TechGuard is running at http://127.0.0.1:${port}/`);
  console.log(`SQLite database: ${dbPath}`);
  console.log(feishuWebhookUrl ? "Feishu relay is enabled." : "Feishu relay is not configured.");
});

async function handleApi(request, response, url) {
  const route = `${request.method} ${url.pathname}`;

  if (route === "POST /api/auth/login") return login(request, response);
  if (route === "POST /api/auth/logout") return logout(request, response);
  if (route === "GET /api/me") return requireUser(request, response, (user) => sendJson(response, 200, { ok: true, user }));
  if (route === "GET /api/dashboard") return requireUser(request, response, (user) => dashboard(response, user));
  if (route === "POST /api/medications") return requireUser(request, response, (user) => createMedication(request, response, user));
  if (route === "POST /api/tasks") return requireUser(request, response, (user) => createTask(request, response, user));
  if (route === "POST /api/weather/settings") return requireUser(request, response, (user) => saveWeatherSettings(request, response, user));
  if (route === "GET /api/weather/care") return requireUser(request, response, (user) => weatherCare(response, user));
  if (route === "POST /api/fraud/check") return requireUser(request, response, (user) => fraudCheck(request, response, user));
  if (route === "POST /api/travel/plan") return requireUser(request, response, (user) => travelPlan(request, response, user));
  if (route === "POST /api/blood-pressure") return requireUser(request, response, (user) => createBloodPressure(request, response, user));
  if (route === "GET /api/blood-pressure") return requireUser(request, response, (user) => bloodPressureList(response, user));
  if (route === "POST /api/checkups/analyze") return requireUser(request, response, (user) => analyzeCheckup(request, response, user));
  if (route === "POST /api/feishu/config") return requireUser(request, response, (user) => saveFeishuConfig(request, response, user));
  if (route === "POST /api/feishu/test") return requireUser(request, response, (user) => feishuTest(response, user));
  if (route === "POST /api/push/subscribe") return requireUser(request, response, (user) => savePushSubscription(request, response, user));
  if (route === "POST /api/help/contact-caregiver") return requireUser(request, response, (user) => contactCaregiver(response, user));
  if (route === "GET /api/cron/reminders") return scanReminders(response);

  const medicationMatch = url.pathname.match(/^\/api\/medications\/([^/]+)\/complete$/);
  if (request.method === "POST" && medicationMatch) {
    return requireUser(request, response, (user) => completeMedication(request, response, user, medicationMatch[1]));
  }

  const taskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)\/complete$/);
  if (request.method === "POST" && taskMatch) {
    return requireUser(request, response, (user) => completeTask(request, response, user, taskMatch[1]));
  }

  if (route === "POST /api/feishu-notify") return legacyFeishuNotify(request, response);

  sendJson(response, 404, { ok: false, message: "API not found" });
}

async function login(request, response) {
  const body = await readJson(request);
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);

  if (!user || user.password_hash !== hashPassword(password)) {
    sendJson(response, 401, { ok: false, message: "登录名或密码不正确" });
    return;
  }

  const token = randomBytes(24).toString("hex");
  sessions.set(token, user.id);
  response.setHeader("Set-Cookie", `tg_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`);
  sendJson(response, 200, { ok: true, user: publicUser(user) });
}

function logout(_request, response) {
  response.setHeader("Set-Cookie", "tg_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
  sendJson(response, 200, { ok: true });
}

function requireUser(request, response, handler) {
  const token = getCookie(request, "tg_session");
  const userId = token ? sessions.get(token) : null;
  if (!userId) {
    sendJson(response, 401, { ok: false, message: "请先登录" });
    return;
  }
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  if (!user) {
    sendJson(response, 401, { ok: false, message: "登录已失效" });
    return;
  }
  return handler(publicUser(user));
}

function dashboard(response, user) {
  const elder = getBoundElder(user);
  ensureTodayMedicationLogs(elder.id);
  const today = todayDate();
  const medications = db
    .prepare(
      `SELECT ml.id as log_id, ml.status, ml.completed_at, ms.*
       FROM medication_logs ml
       JOIN medication_schedules ms ON ms.id = ml.schedule_id
       WHERE ml.elder_id = ? AND ml.due_date = ?
       ORDER BY ms.time_of_day ASC`
    )
    .all(elder.id, today);
  const tasks = db.prepare("SELECT * FROM care_tasks WHERE elder_id = ? AND due_date = ? ORDER BY due_time ASC").all(elder.id, today);
  const alerts = db.prepare("SELECT * FROM alerts WHERE elder_id = ? ORDER BY created_at DESC LIMIT 20").all(elder.id);
  const weather = db.prepare("SELECT * FROM weather_settings WHERE elder_id = ?").get(elder.id) || null;
  const bloodPressure = db.prepare("SELECT * FROM blood_pressure_logs WHERE elder_id = ? ORDER BY measured_at ASC LIMIT 60").all(elder.id);
  const checkups = db.prepare("SELECT id, elder_id, uploaded_by, file_name, summary, risk_level, source, created_at FROM checkup_reports WHERE elder_id = ? ORDER BY created_at DESC LIMIT 8").all(elder.id);
  const report = buildDailyReport(elder.id);

  sendJson(response, 200, {
    ok: true,
    user,
    elder,
    medications,
    tasks,
    alerts,
    weather,
    weatherCare: buildWeatherCare(weather),
    bloodPressure,
    bloodPressureSummary: analyzeBloodPressure(bloodPressure),
    checkups,
    report,
    smsMode: "manual-paste",
    notification: {
      androidPushSupported: true,
      note: "网页不能自动读取短信，安卓提醒需要 HTTPS、Chrome 和通知授权。",
    },
  });
}

async function createBloodPressure(request, response, user) {
  const elder = getBoundElder(user);
  const body = await readJson(request);
  const systolic = Number(body.systolic);
  const diastolic = Number(body.diastolic);
  const pulse = body.pulse === "" || body.pulse == null ? null : Number(body.pulse);
  if (!Number.isFinite(systolic) || systolic < 60 || systolic > 260) throw new Error("高压数值应在 60 到 260 之间");
  if (!Number.isFinite(diastolic) || diastolic < 40 || diastolic > 180) throw new Error("低压数值应在 40 到 180 之间");
  if (pulse !== null && (!Number.isFinite(pulse) || pulse < 30 || pulse > 220)) throw new Error("心率数值应在 30 到 220 之间");
  const measuredAt = String(body.measuredAt || nowIso());
  const note = String(body.note || "").trim();
  const id = createId("bp");

  db.prepare(
    `INSERT INTO blood_pressure_logs (id, elder_id, measured_by, systolic, diastolic, pulse, note, measured_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, elder.id, user.id, Math.round(systolic), Math.round(diastolic), pulse === null ? null : Math.round(pulse), note, measuredAt, nowIso());

  const logs = db.prepare("SELECT * FROM blood_pressure_logs WHERE elder_id = ? ORDER BY measured_at ASC LIMIT 60").all(elder.id);
  const summary = analyzeBloodPressure(logs);
  if (summary.level === "danger" || summary.level === "warning") {
    const message = `TechGuard 血压提醒：${elder.displayName}刚记录血压 ${summary.latest.systolic}/${summary.latest.diastolic} mmHg，${summary.advice}`;
    createAlert(elder.id, "blood_pressure", "血压需要关注", message, id);
    await sendFeishu(user.role === "caregiver" ? user : { id: defaultCaregiverId, role: "caregiver" }, message);
  }
  sendJson(response, 200, { ok: true, id, summary });
}

function bloodPressureList(response, user) {
  const elder = getBoundElder(user);
  const bloodPressure = db.prepare("SELECT * FROM blood_pressure_logs WHERE elder_id = ? ORDER BY measured_at ASC LIMIT 60").all(elder.id);
  sendJson(response, 200, { ok: true, bloodPressure, summary: analyzeBloodPressure(bloodPressure) });
}

async function analyzeCheckup(request, response, user) {
  const elder = getBoundElder(user);
  const body = await readJson(request);
  const imageData = required(body.imageData, "请先上传体检报告照片");
  const fileName = String(body.fileName || "checkup-photo").slice(0, 120);
  if (!/^data:image\/(png|jpeg|jpg|webp);base64,/i.test(imageData)) throw new Error("请上传 PNG、JPG 或 WebP 图片");
  if (imageData.length > 5_500_000) throw new Error("图片太大，请先压缩或重新拍摄更清晰的单页照片");

  const advice = await generateCheckupAdvice({ elder, imageData, fileName });
  const id = createId("checkup");
  db.prepare(
    `INSERT INTO checkup_reports (id, elder_id, uploaded_by, file_name, image_data, summary, advice_json, risk_level, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, elder.id, user.id, fileName, imageData, advice.summary, JSON.stringify(advice), advice.risk_level, advice.source, nowIso());

  const message = `TechGuard 体检报告提醒：${elder.displayName}上传了体检报告照片。${advice.summary}`;
  createAlert(elder.id, "checkup", "体检报告已分析", message, id);
  await sendFeishu(user.role === "caregiver" ? user : { id: defaultCaregiverId, role: "caregiver" }, message);
  sendJson(response, 200, { ok: true, report: { id, ...advice } });
}

async function createMedication(request, response, user) {
  assertCaregiver(user);
  const elder = getBoundElder(user);
  const body = await readJson(request);
  const medicineName = required(body.medicineName, "药品名称不能为空");
  const timeOfDay = required(body.timeOfDay, "用药时间不能为空");
  const doseNote = String(body.doseNote || "").trim();
  const mealTiming = String(body.mealTiming || "").trim();
  const id = createId("med");

  db.prepare(
    `INSERT INTO medication_schedules
     (id, elder_id, created_by, medicine_name, dose_note, meal_timing, time_of_day, repeat_rule, remind_elder, remind_caregiver, enabled, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'daily', 1, 1, 1, ?)`
  ).run(id, elder.id, user.id, medicineName, doseNote, mealTiming, timeOfDay, nowIso());
  ensureTodayMedicationLogs(elder.id);
  createAlert(elder.id, "medication", "吃药提醒已设置", `TechGuard 吃药提醒：${elder.displayName}每天 ${timeOfDay} 需要服用${medicineName}${doseNote ? `（${doseNote}）` : ""}。`);
  sendJson(response, 200, { ok: true, id });
}

async function completeMedication(request, response, user, logId) {
  const elder = getBoundElder(user);
  const body = await readJson(request);
  const log = db.prepare("SELECT * FROM medication_logs WHERE id = ? AND elder_id = ?").get(logId, elder.id);
  if (!log) return sendJson(response, 404, { ok: false, message: "未找到用药记录" });
  db.prepare("UPDATE medication_logs SET status = 'done', completed_at = ?, note = ? WHERE id = ?").run(nowIso(), String(body.note || ""), logId);
  sendJson(response, 200, { ok: true });
}

async function createTask(request, response, user) {
  assertCaregiver(user);
  const elder = getBoundElder(user);
  const body = await readJson(request);
  const title = required(body.title, "任务标题不能为空");
  const description = String(body.description || "").trim();
  const dueDate = String(body.dueDate || todayDate());
  const dueTime = String(body.dueTime || "09:00");
  const id = createId("task");

  db.prepare(
    `INSERT INTO care_tasks
     (id, elder_id, created_by, title, description, due_date, due_time, repeat_rule, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'none', 'pending', ?)`
  ).run(id, elder.id, user.id, title, description, dueDate, dueTime, nowIso());
  createAlert(elder.id, "task", "任务已安排", `TechGuard 任务提醒：${elder.displayName} ${dueDate} ${dueTime} 需要完成：${title}。`);
  sendJson(response, 200, { ok: true, id });
}

async function completeTask(request, response, user, taskId) {
  const elder = getBoundElder(user);
  const body = await readJson(request);
  const task = db.prepare("SELECT * FROM care_tasks WHERE id = ? AND elder_id = ?").get(taskId, elder.id);
  if (!task) return sendJson(response, 404, { ok: false, message: "未找到任务" });
  db.prepare("UPDATE care_tasks SET status = 'done', completed_at = ?, completion_note = ? WHERE id = ?").run(nowIso(), String(body.note || ""), taskId);
  sendJson(response, 200, { ok: true });
}

async function saveWeatherSettings(request, response, user) {
  assertCaregiver(user);
  const elder = getBoundElder(user);
  const body = await readJson(request);
  const city = required(body.city, "城市不能为空");
  const district = String(body.district || "").trim();
  const careTime = String(body.careTime || "07:30");
  db.prepare(
    `INSERT INTO weather_settings (elder_id, city, district, care_time, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(elder_id) DO UPDATE SET city = excluded.city, district = excluded.district, care_time = excluded.care_time, updated_at = excluded.updated_at`
  ).run(elder.id, city, district, careTime, nowIso());
  createAlert(elder.id, "weather", "天气地区已设置", `TechGuard 天气关怀：已设置${elder.displayName}所在地为${city}${district ? district : ""}。`);
  sendJson(response, 200, { ok: true });
}

function weatherCare(response, user) {
  const elder = getBoundElder(user);
  const weather = db.prepare("SELECT * FROM weather_settings WHERE elder_id = ?").get(elder.id) || null;
  sendJson(response, 200, { ok: true, weather, care: buildWeatherCare(weather) });
}

async function fraudCheck(request, response, user) {
  const elder = getBoundElder(user);
  const body = await readJson(request);
  const text = required(body.text, "短信内容不能为空");
  const result = analyzeFraud(text);
  if (result.score >= 80) {
    const message = `TechGuard 高危提醒：${elder.displayName}收到疑似${result.type}短信，请尽快联系老人，提醒不要点链接、不要回验证码、不要转账。`;
    createAlert(elder.id, "fraud", "高危短信提醒", message);
    await sendFeishu(user, message);
  }
  sendJson(response, 200, { ok: true, result });
}

async function travelPlan(request, response, user) {
  const elder = getBoundElder(user);
  const body = await readJson(request);
  const query = required(body.query, "出行需求不能为空");
  const destination = inferDestination(query);
  const weather = db.prepare("SELECT * FROM weather_settings WHERE elder_id = ?").get(elder.id) || null;
  const care = buildWeatherCare(weather);
  const aiPlan = await generateTravelAdvice({ elder, query, destination, weatherCare: care });
  const reply = aiPlan.reply_for_elder;
  const caregiverAlert = aiPlan.caregiver_alert;
  createAlert(elder.id, "travel", "出行关注", caregiverAlert);
  await sendFeishu(user, caregiverAlert);
  sendJson(response, 200, {
    ok: true,
    plan: {
      destination,
      ...aiPlan,
    },
  });
}

async function saveFeishuConfig(request, response, user) {
  assertCaregiver(user);
  const body = await readJson(request);
  const webhook = String(body.webhook || "").trim();
  db.prepare(
    `INSERT INTO notification_channels (id, owner_id, channel_type, config_json, enabled, updated_at)
     VALUES (?, ?, 'feishu', ?, 1, ?)
     ON CONFLICT(owner_id, channel_type) DO UPDATE SET config_json = excluded.config_json, enabled = 1, updated_at = excluded.updated_at`
  ).run(createId("chan"), user.id, JSON.stringify({ webhook }), nowIso());
  sendJson(response, 200, { ok: true });
}

async function feishuTest(response, user) {
  assertCaregiver(user);
  const message = `TechGuard 测试提醒：${user.displayName} 的飞书看护群可以接收提醒。`;
  const result = await sendFeishu(user, message);
  sendJson(response, 200, { ok: true, result });
}

async function contactCaregiver(response, user) {
  const elder = getBoundElder(user);
  const message = `TechGuard 求助提醒：${elder.displayName}点击了一键联系家属，请尽快查看是否需要帮助。`;
  createAlert(elder.id, "help", "一键求助", message);
  const result = await sendFeishu({ id: defaultCaregiverId, role: "caregiver" }, message);
  sendJson(response, 200, { ok: true, result });
}

async function legacyFeishuNotify(request, response) {
  const body = await readJson(request);
  const result = await postFeishu(feishuWebhookUrl, String(body.text || ""));
  sendJson(response, result.ok ? 200 : 428, result);
}

async function savePushSubscription(request, response, user) {
  const body = await readJson(request);
  const id = createId("push");
  db.prepare(
    `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, user.id, String(body.endpoint || ""), String(body.p256dh || ""), String(body.auth || ""), String(body.userAgent || request.headers["user-agent"] || ""), nowIso());
  sendJson(response, 200, { ok: true, id, message: "已保存安卓通知订阅。当前版本保留订阅记录，推送发送将在下一步接入 Web Push VAPID。" });
}

async function scanReminders(response) {
  const today = todayDate();
  const nowTime = currentTime();
  const elders = db.prepare("SELECT * FROM users WHERE role = 'elder'").all();
  for (const elder of elders) {
    ensureTodayMedicationLogs(elder.id);
    const dueLogs = db
      .prepare(
        `SELECT ml.*, ms.medicine_name, ms.dose_note, ms.time_of_day
         FROM medication_logs ml JOIN medication_schedules ms ON ms.id = ml.schedule_id
         WHERE ml.elder_id = ? AND ml.due_date = ? AND ml.status = 'pending' AND ms.time_of_day <= ?`
      )
      .all(elder.id, today, nowTime);
    for (const log of dueLogs) {
      const existing = db.prepare("SELECT id FROM alerts WHERE type = 'medication' AND ref_id = ?").get(log.id);
      if (!existing) {
        createAlert(elder.id, "medication", "吃药未确认", `TechGuard 未确认：${elder.display_name} ${log.time_of_day} 的${log.medicine_name}还没有确认服用。`, log.id);
      }
    }
  }
  sendJson(response, 200, { ok: true, checkedAt: nowIso() });
}

function initDatabase() {
  db.exec(`
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
  `);

  seedUser(defaultCaregiverId, "caregiver", "demo1234", "家属账号", "caregiver");
  seedUser(defaultElderId, "elder", "demo1234", "长辈账号", "elder");
  const link = db.prepare("SELECT id FROM family_links WHERE caregiver_id = ? AND elder_id = ?").get(defaultCaregiverId, defaultElderId);
  if (!link) {
    db.prepare("INSERT INTO family_links (id, caregiver_id, elder_id, relation) VALUES (?, ?, ?, ?)").run("link-demo-family", defaultCaregiverId, defaultElderId, "家属");
  }
}

function seedUser(id, username, password, displayName, role) {
  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (existing) return;
  db.prepare("INSERT INTO users (id, username, password_hash, display_name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    id,
    username,
    hashPassword(password),
    displayName,
    role,
    nowIso()
  );
}

function getBoundElder(user) {
  if (user.role === "elder") return user;
  const row = db
    .prepare(
      `SELECT u.id, u.username, u.display_name, u.role
       FROM family_links fl JOIN users u ON u.id = fl.elder_id
       WHERE fl.caregiver_id = ?
       LIMIT 1`
    )
    .get(user.id);
  return publicUser(row);
}

function ensureTodayMedicationLogs(elderId) {
  const today = todayDate();
  const schedules = db.prepare("SELECT * FROM medication_schedules WHERE elder_id = ? AND enabled = 1").all(elderId);
  for (const schedule of schedules) {
    const id = `${schedule.id}-${today}`;
    db.prepare("INSERT OR IGNORE INTO medication_logs (id, schedule_id, elder_id, due_date, status) VALUES (?, ?, ?, ?, 'pending')").run(id, schedule.id, elderId, today);
  }
}

function buildDailyReport(elderId) {
  const today = todayDate();
  const meds = db.prepare("SELECT status, COUNT(*) as count FROM medication_logs WHERE elder_id = ? AND due_date = ? GROUP BY status").all(elderId, today);
  const tasks = db.prepare("SELECT status, COUNT(*) as count FROM care_tasks WHERE elder_id = ? AND due_date = ? GROUP BY status").all(elderId, today);
  const bloodPressure = db.prepare("SELECT COUNT(*) as count FROM blood_pressure_logs WHERE elder_id = ? AND substr(measured_at, 1, 10) = ?").get(elderId, today);
  return { date: today, medications: meds, tasks, bloodPressure: bloodPressure?.count || 0 };
}

function createAlert(elderId, type, title, message, refId = null) {
  const id = createId("alert");
  db.prepare("INSERT INTO alerts (id, elder_id, type, title, message, status, ref_id, created_at) VALUES (?, ?, ?, ?, ?, 'new', ?, ?)").run(id, elderId, type, title, message, refId, nowIso());
  return id;
}

async function sendFeishu(user, text) {
  const row = db.prepare("SELECT config_json FROM notification_channels WHERE owner_id = ? AND channel_type = 'feishu' AND enabled = 1").get(user.role === "caregiver" ? user.id : defaultCaregiverId);
  const configured = row ? JSON.parse(row.config_json).webhook : "";
  const webhook = configured || feishuWebhookUrl;
  return postFeishu(webhook, text);
}

async function postFeishu(webhook, text) {
  if (!webhook) return { ok: false, message: "FEISHU_WEBHOOK_URL is not configured" };
  try {
    const feishuResponse = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ msg_type: "text", content: { text } }),
    });
    if (!feishuResponse.ok) return { ok: false, message: "Feishu rejected the notification" };
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

function analyzeFraud(text) {
  const rules = [
    ["出现陌生链接", 25, /(https?:\/\/|www\.|\.icu|\.top|\.xyz|\.click|链接|网址)/i],
    ["要求提供或回复验证码", 30, /(验证码|校验码|动态码|短信码|回复.*码)/],
    ["冒充官方机构", 20, /(社保|银行|公安|法院|检察院|医保|税务|客服|官方|中心)/],
    ["制造紧急压力", 15, /(立即|马上|冻结|异常|逾期|通缉|涉案|失效|停用|解冻)/],
    ["涉及资金或账户损失", 20, /(元|账户|消费|转账|汇款|手续费|安全账户|银行卡|余额|支付)/],
    ["存在中奖或补贴诱导", 18, /(中奖|大奖|补贴|退税|领取|返现|福利)/],
  ];
  const matched = rules.filter(([, , pattern]) => pattern.test(text));
  const score = Math.min(100, matched.reduce((sum, [, value]) => sum + value, 0));
  return {
    score,
    level: score >= 80 ? "高危诈骗" : score >= 41 ? "中风险可疑信息" : "低风险信息",
    type: inferFraudType(text),
    reasons: matched.map(([name]) => name),
    reply_for_elder:
      score >= 80
        ? "奶奶，这条信息很像骗子发来的，千万别点链接，也不要回复验证码。我已经提醒家人了。"
        : "奶奶，这条信息先别急着操作，可以让家属帮您看一眼。",
  };
}

function inferFraudType(text) {
  if (/社保|医保/.test(text)) return "冒充社保或医保诈骗";
  if (/银行|账户|银行卡/.test(text)) return "冒充银行诈骗";
  if (/公安|法院|检察院|通缉|涉案/.test(text)) return "冒充公检法诈骗";
  if (/中奖|大奖|手续费/.test(text)) return "中奖领奖诈骗";
  return "疑似电信网络诈骗";
}

function buildWeatherCare(weather) {
  if (!weather) {
    return { text: "还没有设置天气地区。让家属先设置城市后，我就能每天提醒天气。", severe: false };
  }
  const location = `${weather.city}${weather.district || ""}`;
  const rainy = /上海|杭州|苏州|南京/.test(location);
  return rainy
    ? { text: `${location}今天可能有雨，出门记得带伞，路上慢慢走。`, severe: true }
    : { text: `${location}今天天气整体平稳，出门前看一眼衣服和钥匙。`, severe: false };
}

function inferDestination(query) {
  const match = query.match(/去([^，。,. ]{2,12})/);
  if (match) return match[1];
  if (/医院|复查/.test(query)) return "医院";
  if (/大剧院/.test(query)) return "大剧院";
  return "目的地";
}

async function generateTravelAdvice({ elder, query, destination, weatherCare }) {
  const routeExample =
    /四惠东/.test(query) && /朝阳公园/.test(query)
      ? {
          reply_for_elder: `${elder.displayName}，从四惠东去朝阳公园，建议您坐地铁1号线到大望路站，换乘14号线到朝阳公园站。出站后慢慢走，别着急。${weatherCare.text} 如果路上不确定，就先联系家属。`,
          caregiver_alert: `TechGuard 出行提醒：${elder.displayName}计划从四惠东前往朝阳公园，建议路线为地铁1号线到大望路换乘14号线到朝阳公园站，请关注出发和到达时间。`,
          route_summary: "四惠东 → 地铁1号线 → 大望路换乘14号线 → 朝阳公园站",
          risk_level: weatherCare.severe ? "medium" : "low",
          need_family_help: weatherCare.severe,
          source: "local-route-example",
        }
      : null;
  const fallback = {
    reply_for_elder: `${elder.displayName}，建议您去${destination}时选择少换乘、少走路的路线。${weatherCare.text} 如果路上不确定，就先联系家属。`,
    caregiver_alert: `TechGuard 出行提醒：${elder.displayName}正在查询去${destination}的路线，建议确认是否需要接送。`,
    route_summary: `前往${destination}`,
    risk_level: weatherCare.severe ? "medium" : "low",
    need_family_help: weatherCare.severe || /医院|复查|夜|晚上/.test(query),
    source: "local-fallback",
  };

  if (routeExample && !openaiApiKey) return routeExample;
  if (!openaiApiKey) return fallback;

  try {
    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
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
              destination,
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
      source: "openai",
    };
  } catch {
    return fallback;
  }
}

function analyzeBloodPressure(logs) {
  if (!logs.length) {
    return {
      level: "empty",
      label: "还没有记录",
      advice: "量完血压后记在这里，我会帮您看今天有没有需要留意的变化。",
      latest: null,
      trend: "none",
    };
  }

  const latest = logs[logs.length - 1];
  const recent = logs.slice(-7);
  const avgSystolic = Math.round(recent.reduce((sum, item) => sum + item.systolic, 0) / recent.length);
  const avgDiastolic = Math.round(recent.reduce((sum, item) => sum + item.diastolic, 0) / recent.length);
  const previous = logs.length > 1 ? logs[logs.length - 2] : null;
  const trend =
    previous && latest.systolic - previous.systolic >= 8
      ? "up"
      : previous && previous.systolic - latest.systolic >= 8
        ? "down"
        : "stable";

  if (latest.systolic >= 180 || latest.diastolic >= 120) {
    return {
      level: "danger",
      label: "明显偏高",
      advice: "这次数值很高，请先坐下休息并尽快联系家人；如果伴随胸闷、头痛、气短或不舒服，请立即就医。",
      latest,
      avgSystolic,
      avgDiastolic,
      trend,
    };
  }
  if (latest.systolic >= 140 || latest.diastolic >= 90) {
    return {
      level: "warning",
      label: "偏高",
      advice: "这次数值偏高，建议安静休息 5 分钟后复测一次，并把结果告诉家人或医生。",
      latest,
      avgSystolic,
      avgDiastolic,
      trend,
    };
  }
  if (latest.systolic < 90 || latest.diastolic < 60) {
    return {
      level: "warning",
      label: "偏低",
      advice: "这次数值偏低，起身请慢一点；如果头晕、乏力或站不稳，请联系家人。",
      latest,
      avgSystolic,
      avgDiastolic,
      trend,
    };
  }
  return {
    level: "safe",
    label: "平稳",
    advice: trend === "up" ? "这次数值在可接受范围内，但比上次高了一些，建议继续观察。" : "这次数值暂未发现明显异常，继续按医生建议规律记录。",
    latest,
    avgSystolic,
    avgDiastolic,
    trend,
  };
}

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
    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
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
  if (user.role !== "caregiver") throw new Error("只有亲属账号可以进行此操作");
}

function publicUser(user) {
  return { id: user.id, username: user.username, displayName: user.display_name || user.displayName, role: user.role };
}

function required(value, message) {
  const text = String(value || "").trim();
  if (!text) throw new Error(message);
  return text;
}

function serveStatic(request, response, url) {
  const rawPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const safePath = normalize(rawPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(root, safePath);

  if (!filePath.startsWith(root) || !existsSync(filePath) || !statSync(filePath).isFile()) {
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
  return body ? JSON.parse(body) : {};
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 6_000_000) throw new Error("请求内容太大，请压缩后再上传");
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

function hashPassword(password) {
  return createHash("sha256").update(`techguard:${password}`).digest("hex");
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

function currentTime() {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
}
