import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const riskRules = [
  { name: "出现陌生链接", score: 25, test: (text) => /(https?:\/\/|www\.|\.icu|\.top|\.xyz|\.click|链接|网址)/i.test(text) },
  { name: "要求提供或回复验证码", score: 30, test: (text) => /(验证码|校验码|动态码|短信码|回复.*码)/.test(text) },
  { name: "冒充官方机构", score: 20, test: (text) => /(社保|银行|公安|法院|检察院|医保|税务|客服|官方|中心)/.test(text) },
  { name: "制造紧急压力", score: 15, test: (text) => /(立即|马上|冻结|异常|逾期|通缉|涉案|失效|停用|解冻)/.test(text) },
  { name: "涉及资金或账户损失", score: 20, test: (text) => /(元|账户|消费|转账|汇款|手续费|安全账户|银行卡|余额|支付)/.test(text) },
  { name: "存在中奖或补贴诱导", score: 18, test: (text) => /(中奖|大奖|补贴|退税|领取|返现|福利)/.test(text) },
];

function analyzeFraud(text) {
  const matched = riskRules.filter((rule) => rule.test(text));
  return {
    score: Math.min(100, matched.reduce((sum, rule) => sum + rule.score, 0)),
    reasons: matched.map((rule) => rule.name),
  };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const highRisk = analyzeFraud("【社保中心】您的社保卡异地异常消费5000元已被冻结，请点击 shb-gov.icu 或回复验证码解冻。");
assert(highRisk.score >= 80, `TC-001 expected high risk, got ${highRisk.score}`);
assert(highRisk.reasons.length >= 3, "TC-001 expected at least 3 risk reasons");

const normalNotice = analyzeFraud("今天下午社区有免费体检，请到居委会登记。");
assert(normalNotice.score < 80, `TC-005 expected non-high risk, got ${normalNotice.score}`);

process.env.SQLITE_PATH = join(tmpdir(), `techguard-smoke-${process.pid}-${Date.now()}.db`);
// DB_PATH 优先于 SQLITE_PATH：用独立库副本测试，避免污染 data/techguard.db
const smokeDbPath = `${process.env.SQLITE_PATH}.primary`;
process.env.DB_PATH = smokeDbPath;
process.env.VAPID_PUBLIC_KEY = "";
process.env.VAPID_PRIVATE_KEY = "";
process.env.VAPID_SUBJECT = "";
process.env.FEISHU_WEBHOOK_URL = "";
process.env.FEISHU_RECEIVE_ID = "";
process.env.CRON_SECRET = "";
process.env.AMAP_WEB_SERVICE_KEY = "";
process.env.AMAP_API_KEY = "";
process.env.AMAP_JSAPI_KEY = "";

const { appHandler, parseLifeEvent, medicationStockAlertDays, weatherGeocodeCandidates, buildFallbackWeatherCare } = await import("../server.mjs");

try {
  let cookie = "";

  async function api(path, options = {}) {
    const response = await callApp(path, {
      method: options.method || "GET",
      body: options.body,
      cookie,
    });
    const setCookie = response.headers["set-cookie"];
    if (setCookie) cookie = setCookie.split(";")[0];
    const data = JSON.parse(response.body || "{}");
    assert(response.statusCode >= 200 && response.statusCode < 300, `${path} failed: ${data.message || response.statusCode}`);
    return data;
  }

  await api("/api/auth/login", { method: "POST", body: { username: "caregiver", password: "demo1234" } });
  await api("/api/weather/settings", {
    method: "POST",
    body: {
      city: "北京",
      district: "海淀区",
      careTime: "00:00",
    },
  });
  await api("/api/tasks", {
    method: "POST",
    body: {
      title: "测试任务飞书提醒",
      description: "用于确认到点后只提醒一次",
      dueDate: todayDate(),
      dueTime: "00:00",
    },
  });

  const firstScan = await api("/api/cron/reminders");
  assert(firstScan.taskRemindersSent === 1, `TC-010 expected one task reminder, got ${firstScan.taskRemindersSent}`);
  assert(firstScan.weatherRemindersSent === 1, `TC-013 expected one weather reminder, got ${firstScan.weatherRemindersSent}`);

  const secondScan = await api("/api/cron/reminders");
  assert(secondScan.taskRemindersSent === 0, `TC-011 expected no duplicate reminders, got ${secondScan.taskRemindersSent}`);
  assert(secondScan.weatherRemindersSent === 0, `TC-014 expected no duplicate weather reminders, got ${secondScan.weatherRemindersSent}`);

  const notifications = await api("/api/notifications");
  assert(
    notifications.notifications.some((item) => item.type === "task_due" && /测试任务飞书提醒/.test(item.body)),
    "TC-012 expected task_due notification"
  );
  assert(
    notifications.notifications.some((item) => item.type === "weather_daily" && /今日天气提醒/.test(item.title)),
    "TC-015 expected weather_daily notification"
  );

  const travel = await api("/api/travel/plan", {
    method: "POST",
    body: { query: "我想从四惠东去朝阳公园，怎么坐车最稳妥？" },
  });
  assert(/朝阳公园/.test(travel.plan.route_summary), "TC-016 expected a route to Chaoyang Park");
  assert(travel.plan.weather_care, "TC-017 expected travel plan to include weather care text");

  // ---- 手机提醒（Web Push）契约：config 拿公钥、subscribe 落库去重、unsubscribe 删除 ----
  const pushConfig = await api("/api/push/config");
  assert(pushConfig.enabled === true, "TC-018 expected push config to be enabled without VAPID env vars");
  assert(/^[A-Za-z0-9_-]{80,}$/.test(pushConfig.publicKey), `TC-018 expected a url-safe base64 VAPID public key, got ${pushConfig.publicKey}`);

  const endpoint = "https://push.example.com/v2/smoke-test-endpoint";
  const firstSubscribe = await api("/api/push/subscribe", {
    method: "POST",
    body: { endpoint, keys: { p256dh: "BCkQm6db0hBc8v1s3nQzSmokePublicKey", auth: "smokeAuthKey16bytes" } },
  });
  assert(Boolean(firstSubscribe.id), "TC-019 expected subscribe to return an id");
  const secondSubscribe = await api("/api/push/subscribe", {
    method: "POST",
    body: { endpoint, keys: { p256dh: "BCkQm6db0hBc8v1s3nQzSmokePublicKey", auth: "smokeAuthKey16bytes" } },
  });
  assert(secondSubscribe.id === firstSubscribe.id, "TC-019 expected duplicate subscribe to update the same row");

  // 直接查库确认重复订阅没有产生重复行
  const smokeDb = new DatabaseSync(smokeDbPath);
  const storedCount = smokeDb.prepare("SELECT COUNT(*) AS count FROM push_subscriptions WHERE endpoint = ?").get(endpoint).count;
  smokeDb.close();
  assert(storedCount === 1, `TC-019 expected exactly one subscription row, got ${storedCount}`);

  const badSubscribe = await callApp("/api/push/subscribe", { method: "POST", body: { endpoint }, cookie });
  assert(badSubscribe.statusCode === 400, `TC-020 expected 400 when keys are missing, got ${badSubscribe.statusCode}`);

  const unsubscribed = await api("/api/push/unsubscribe", { method: "POST", body: { endpoint } });
  assert(unsubscribed.ok, "TC-021 expected unsubscribe to succeed");

  // ---- 吃药计划的改 / 删：GET 全量可读、POST 局部更新、DELETE 连日志一起删 ----
  const createdPlan = await api("/api/medications", {
    method: "POST",
    body: { medicineName: "降压药", timeOfDay: "08:00", doseNote: "饭后一片" },
  });
  const medId = createdPlan.id;
  assert(Boolean(medId), "TC-022 expected the new plan to return an id");
  assert(
    (await api("/api/medications")).medications.some((item) => item.id === medId),
    "TC-022 expected GET /api/medications to include the new plan"
  );

  const updatedPlan = await api(`/api/medications/${medId}`, {
    method: "POST",
    body: { timeOfDay: "21:15", doseNote: "睡前一粒", enabled: 0 },
  });
  assert(updatedPlan.ok, "TC-023 expected medication update to succeed");
  const afterUpdate = (await api("/api/medications")).medications.find((item) => item.id === medId);
  assert(afterUpdate.time_of_day === "21:15" && afterUpdate.dose_note === "睡前一粒", "TC-023 expected time and dose to be updated");
  // 停用（enabled = 0）不是删除：计划仍要出现在列表里，前端才能重新启用
  assert(Number(afterUpdate.enabled) === 0, "TC-023 expected the disabled plan to stay listed with enabled = 0");

  const smokeToday = todayDate();
  // 先清掉建计划时生成的当日 log，再确认停用后不会再补建
  const cleanDb = new DatabaseSync(smokeDbPath);
  cleanDb.prepare("DELETE FROM medication_logs WHERE schedule_id = ?").run(medId);
  cleanDb.close();

  const dashboardDisabled = await api("/api/dashboard");
  assert(
    !dashboardDisabled.medications.some((item) => item.id === medId),
    "TC-024 expected the disabled plan to be hidden from today's dashboard list"
  );
  const checkDb = new DatabaseSync(smokeDbPath);
  const logsWhileDisabled = checkDb.prepare("SELECT COUNT(*) AS count FROM medication_logs WHERE schedule_id = ?").get(medId).count;
  checkDb.close();
  assert(logsWhileDisabled === 0, `TC-024 expected no today log for a disabled plan, got ${logsWhileDisabled}`);

  // 重新启用后又能出现，并重新生成当日待办
  await api(`/api/medications/${medId}`, { method: "POST", body: { enabled: 1 } });
  assert(
    (await api("/api/dashboard")).medications.some((item) => item.id === medId),
    "TC-025 expected the re-enabled plan to come back to today's dashboard list"
  );

  const deletedPlan = await api(`/api/medications/${medId}`, { method: "DELETE" });
  assert(deletedPlan.deletedLogs >= 1, `TC-026 expected deletedLogs >= 1, got ${deletedPlan.deletedLogs}`);
  const orphanDb = new DatabaseSync(smokeDbPath);
  const orphanLogs = orphanDb.prepare("SELECT COUNT(*) AS count FROM medication_logs WHERE schedule_id = ?").get(medId).count;
  orphanDb.close();
  assert(
    !(await api("/api/medications")).medications.some((item) => item.id === medId),
    "TC-026 expected the deleted plan to disappear from GET /api/medications"
  );
  assert(orphanLogs === 0, `TC-026 expected the plan logs to be deleted together, got ${orphanLogs} orphans`);

  // ---- 任务的改 / 删 ----
  const createdTask = await api("/api/tasks", {
    method: "POST",
    body: { title: "测试任务改删", description: "原始说明", dueDate: smokeToday, dueTime: "07:30" },
  });
  const taskId = createdTask.id;
  assert(
    (await callApp(`/api/tasks/${taskId}`, { method: "POST", body: { status: "whatever" }, cookie })).statusCode === 400,
    "TC-027 expected 400 for a status outside pending/done/missed"
  );
  assert(
    (await callApp(`/api/tasks/${taskId}`, { method: "POST", body: { dueTime: "9:00" }, cookie })).statusCode === 400,
    "TC-027 expected 400 for dueTime 9:00"
  );

  const updatedTask = await api(`/api/tasks/${taskId}`, {
    method: "POST",
    body: { title: "改名后的任务", dueTime: "06:45", status: "done" },
  });
  assert(updatedTask.ok, "TC-028 expected task update to succeed");
  const dashboardTask = (await api("/api/dashboard")).tasks.find((item) => item.id === taskId);
  assert(
    dashboardTask?.title === "改名后的任务" && dashboardTask?.due_time === "06:45" && dashboardTask?.status === "done",
    "TC-028 expected the updated task fields in the dashboard"
  );
  await api(`/api/tasks/${taskId}`, { method: "DELETE" });
  assert(
    !(await api("/api/dashboard")).tasks.some((item) => item.id === taskId),
    "TC-028 expected the deleted task to disappear from the dashboard"
  );

  // ---- 权限与错误码：长辈不能改删；不存在的 id 404；非法时间 400 ----
  const elderLogin = await callApp("/api/auth/login", { method: "POST", body: { username: "elder", password: "demo1234" } });
  assert(elderLogin.statusCode === 200, "TC-029 expected the elder account to log in");
  const elderCookie = elderLogin.headers["set-cookie"].split(";")[0];
  for (const [method, path] of [
    ["POST", "/api/medications/med_any"],
    ["DELETE", "/api/medications/med_any"],
    ["POST", "/api/tasks/task_any"],
    ["DELETE", "/api/tasks/task_any"],
  ]) {
    const res = await callApp(path, { method, body: method === "POST" ? { medicineName: "x", status: "done" } : null, cookie: elderCookie });
    assert(res.statusCode === 403, `TC-029 expected 403 for elder ${method} ${path}, got ${res.statusCode}`);
  }

  const missingPlan = await callApp("/api/medications/med_not_exists", { method: "POST", body: { medicineName: "x" }, cookie });
  assert(missingPlan.statusCode === 404, `TC-030 expected 404 for a missing medication id, got ${missingPlan.statusCode}`);
  const missingTaskDelete = await callApp("/api/tasks/task_not_exists", { method: "DELETE", cookie });
  assert(missingTaskDelete.statusCode === 404, `TC-030 expected 404 for a missing task id, got ${missingTaskDelete.statusCode}`);

  const badTimePlan = await api("/api/medications", { method: "POST", body: { medicineName: "临时药", timeOfDay: "10:00" } });
  const badTimeUpdate = await callApp(`/api/medications/${badTimePlan.id}`, { method: "POST", body: { timeOfDay: "9:00" }, cookie });
  assert(badTimeUpdate.statusCode === 400, `TC-031 expected 400 for timeOfDay 9:00, got ${badTimeUpdate.statusCode}`);
  await api(`/api/medications/${badTimePlan.id}`, { method: "DELETE" });

  // ---- 联系电话：POST /api/profile 保存、/api/me 回显、dashboard 紧急联系人 ----
  const savedProfile = await api("/api/profile", { method: "POST", body: { phone: " 138 0013 8000 " } });
  assert(savedProfile.phone === "138 0013 8000", `TC-032 expected trimmed phone in response, got ${savedProfile.phone}`);
  assert((await api("/api/me")).user.phone === "138 0013 8000", "TC-032 expected /api/me to expose the saved phone");

  const dashWithContact = await api("/api/dashboard");
  assert(
    Array.isArray(dashWithContact.emergencyContacts) &&
      dashWithContact.emergencyContacts.some((item) => item.phone === "138 0013 8000" && item.name === "家属账号" && item.relation === "家属"),
    "TC-033 expected the caregiver phone in emergencyContacts with name and relation"
  );

  // 非法电话：非字符串 / 太短 / 含非法字符，都必须 400
  for (const bad of [{ phone: 123456 }, { phone: "12" }, { phone: "abc-def!" }]) {
    const res = await callApp("/api/profile", { method: "POST", body: bad, cookie });
    assert(res.statusCode === 400, `TC-034 expected 400 for invalid phone ${JSON.stringify(bad)}, got ${res.statusCode}`);
  }

  // 空字符串 = 清除电话，紧急联系人随之清空
  const clearedProfile = await api("/api/profile", { method: "POST", body: { phone: "" } });
  assert(clearedProfile.phone === "", `TC-035 expected empty phone after clearing, got ${clearedProfile.phone}`);
  assert((await api("/api/me")).user.phone === "", "TC-035 expected /api/me phone to be cleared");
  assert((await api("/api/dashboard")).emergencyContacts.length === 0, "TC-035 expected emergencyContacts to be empty after clearing");

  // ---- 一个家属照护多位长辈：列表 / 切换 / 持久化 / 越权 ----
  const elders = (await api("/api/elders")).elders;
  assert(elders.length === 2, `TC-036 expected 2 linked elders, got ${elders.length}`);
  assert(elders.filter((item) => item.isActive).length === 1, "TC-036 expected exactly one active elder");
  assert(
    elders.every((item) => item.id && item.displayName && item.relation === "家属"),
    "TC-036 expected every elder to carry id/displayName/relation"
  );
  const otherElderId = elders.find((item) => !item.isActive).id;

  const switched = await api("/api/elders/switch", { method: "POST", body: { elderId: otherElderId } });
  assert(switched.activeElderId === otherElderId, `TC-037 expected activeElderId ${otherElderId}, got ${switched.activeElderId}`);
  const dashAfterSwitch = await api("/api/dashboard");
  assert(dashAfterSwitch.elder.id === otherElderId, `TC-037 expected dashboard elder ${otherElderId}, got ${dashAfterSwitch.elder.id}`);
  assert(
    dashAfterSwitch.elders.find((item) => item.isActive)?.id === otherElderId,
    "TC-037 expected dashboard elders isActive to follow the switch"
  );
  assert(dashAfterSwitch.elders.length === 2, "TC-037 expected dashboard elders to mirror GET /api/elders");

  // 选择必须落库（重启后仍生效），而不是只存在内存
  const persistDb = new DatabaseSync(smokeDbPath);
  const storedActive = persistDb.prepare("SELECT active_elder_id FROM users WHERE id = ?").get("user-caregiver").active_elder_id;
  persistDb.close();
  assert(storedActive === otherElderId, `TC-037 expected active_elder_id persisted as ${otherElderId}, got ${storedActive}`);

  // 越权：长辈切到别的长辈、家属切到无关联的 elderId、未登录，都必须被挡
  const elderLogin3 = await callApp("/api/auth/login", { method: "POST", body: { username: "elder", password: "demo1234" } });
  const elderCookie3 = elderLogin3.headers["set-cookie"].split(";")[0];
  const crossElderId = "user-elder2"; // 已登录长辈是 user-elder，切到 user-elder2 属于越权
  const crossSwitch = await callApp("/api/elders/switch", { method: "POST", body: { elderId: crossElderId }, cookie: elderCookie3 });
  assert(crossSwitch.statusCode === 403, `TC-038 expected 403 when an elder switches to another elder, got ${crossSwitch.statusCode}`);
  const unrelatedSwitch = await callApp("/api/elders/switch", { method: "POST", body: { elderId: "user-not-linked" }, cookie });
  assert(unrelatedSwitch.statusCode === 403, `TC-038 expected 403 for an unrelated elderId, got ${unrelatedSwitch.statusCode}`);
  const anonSwitch = await callApp("/api/elders/switch", { method: "POST", body: { elderId: "user-elder" } });
  assert(anonSwitch.statusCode === 401, `TC-038 expected 401 without login, got ${anonSwitch.statusCode}`);
  const anonElders = await callApp("/api/elders");
  assert(anonElders.statusCode === 401, `TC-038 expected 401 for GET /api/elders without login, got ${anonElders.statusCode}`);

  // ---- 自愈：active_elder_id 被写成脏数据时回退第一条关联并回写 ----
  for (const dirty of ["user-not-exist", null]) {
    const healDb = new DatabaseSync(smokeDbPath);
    healDb.prepare("UPDATE users SET active_elder_id = ? WHERE id = ?").run(dirty, "user-caregiver");
    healDb.close();
    const healed = await api("/api/dashboard");
    assert(healed.ok && healed.elder.id === "user-elder", `TC-039 expected fallback to the first link for dirty id ${dirty}, got ${healed.elder.id}`);
    const healedDb = new DatabaseSync(smokeDbPath);
    const healedActive = healedDb.prepare("SELECT active_elder_id FROM users WHERE id = ?").get("user-caregiver").active_elder_id;
    healedDb.close();
    assert(healedActive === "user-elder", `TC-039 expected the fallback to be written back, got ${healedActive}`);
  }

  // ---- 第二个演示长辈：能登录，且 dashboard 是空状态 ----
  const elder2Login = await callApp("/api/auth/login", { method: "POST", body: { username: "elder2", password: "demo1234" } });
  assert(elder2Login.statusCode === 200, `TC-040 expected elder2/demo1234 to log in, got ${elder2Login.statusCode}`);
  const elder2Cookie = elder2Login.headers["set-cookie"].split(";")[0];
  const elder2Dash = JSON.parse((await callApp("/api/dashboard", { cookie: elder2Cookie })).body);
  assert(elder2Dash.elder.id === "user-elder2", `TC-040 expected elder2 dashboard to be its own account, got ${elder2Dash.elder.id}`);
  assert(elder2Dash.medications.length === 0 && elder2Dash.tasks.length === 0, "TC-040 expected elder2 dashboard to have no medications and no tasks");
  assert(elder2Dash.elders.length === 1 && elder2Dash.elders[0].isActive, "TC-040 expected elder2 to see only itself in the switcher");

  // ---- 没有关联任何长辈的家属：/api/elders 返回空数组而不是 500 ----
  const soloDb = new DatabaseSync(smokeDbPath);
  const caregiverHash = soloDb.prepare("SELECT password_hash FROM users WHERE id = ?").get("user-caregiver").password_hash;
  soloDb
    .prepare("INSERT INTO users (id, username, password_hash, display_name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run("user-solo", "solo", caregiverHash, "独身家属", "caregiver", new Date().toISOString());
  soloDb.close();
  const soloLogin = await callApp("/api/auth/login", { method: "POST", body: { username: "solo", password: "demo1234" } });
  assert(soloLogin.statusCode === 200, `TC-041 expected the solo caregiver to log in, got ${soloLogin.statusCode}`);
  const soloCookie = soloLogin.headers["set-cookie"].split(";")[0];
  const soloElders = await callApp("/api/elders", { cookie: soloCookie });
  assert(soloElders.statusCode === 200, `TC-041 expected 200 for a caregiver without elders, got ${soloElders.statusCode}`);
  assert(JSON.parse(soloElders.body).elders.length === 0, "TC-041 expected an empty elders array when nothing is linked");
  const soloDashboard = await callApp("/api/dashboard", { cookie: soloCookie });
  assert(soloDashboard.statusCode === 400, `TC-041 expected 400 for a caregiver without elders on dashboard, got ${soloDashboard.statusCode}`);

  // ---- 生活事件记录：纯函数解析（规则顺序 + 时间推断） ----
  assert(parseLifeEvent("我有点头晕，心慌").kind === "unwell", "TC-049 expected unwell to win over other keywords");
  assert(parseLifeEvent("我今天早上八点半吃过降压药了").occurredAt === "08:30", "TC-049 expected 08:30 from 早上八点半");
  assert(parseLifeEvent("昨天晚上十点就睡了").occurredAt === "22:00", "TC-049 expected 22:00 from 晚上十点");
  assert(parseLifeEvent("下午三点去公园散步").occurredAt === "15:00", "TC-049 expected 15:00 from 下午三点");
  assert(parseLifeEvent("今天天气不错").kind === "other" && parseLifeEvent("今天天气不错").occurredAt === null, "TC-049 expected other + null for a text without event/time hints");

  // ---- 生活事件记录：POST 落库、GET/dashboard 回读、契约形状 ----
  const lifeText = "我今天早上八点半吃过降压药了";
  const createdLife = await api("/api/life-events", { method: "POST", body: { text: lifeText, source: "text" } });
  const lifeEvent = createdLife.event;
  assert(Boolean(lifeEvent?.id), "TC-042 expected POST /api/life-events to return an event id");
  assert(lifeEvent.kind === "medication", `TC-042 expected kind medication, got ${lifeEvent.kind}`);
  assert(lifeEvent.rawText === lifeText, "TC-042 expected rawText to keep the elder's exact words");
  assert(lifeEvent.occurredAt === "08:30", `TC-042 expected occurredAt 08:30, got ${lifeEvent.occurredAt}`);
  assert(lifeEvent.source === "text" && Boolean(lifeEvent.createdAt), "TC-042 expected source and createdAt in the response");

  // 原话必须真正进库，而不是只存在于响应里
  const lifeDb = new DatabaseSync(smokeDbPath);
  const storedLife = lifeDb.prepare("SELECT * FROM life_events WHERE id = ?").get(lifeEvent.id);
  lifeDb.close();
  assert(
    storedLife?.raw_text === lifeText && storedLife?.kind === "medication" && storedLife?.occurred_at === "08:30",
    "TC-042 expected the event persisted with kind/raw_text/occurred_at"
  );

  assert((await api("/api/life-events")).events.some((item) => item.id === lifeEvent.id), "TC-043 expected GET /api/life-events to include the new event");
  const dashLife = (await api("/api/dashboard")).lifeEvents.find((item) => item.id === lifeEvent.id);
  assert(dashLife && dashLife.rawText === lifeText && dashLife.kind === "medication", "TC-043 expected dashboard.lifeEvents to include the same event");

  // occurredAt：合法显式值优先；非法值回退到文本推断；source 非法值按 text 落库
  const explicitLife = await api("/api/life-events", { method: "POST", body: { text: "吃了药", occurredAt: "07:05" } });
  assert(explicitLife.event.occurredAt === "07:05", `TC-044 expected explicit occurredAt 07:05, got ${explicitLife.event.occurredAt}`);
  const fallbackLife = await api("/api/life-events", { method: "POST", body: { text: "晚上八点出门散步", occurredAt: "25:99" } });
  assert(fallbackLife.event.occurredAt === "20:00", `TC-044 expected invalid occurredAt to fall back to 20:00, got ${fallbackLife.event.occurredAt}`);
  const badSourceLife = await api("/api/life-events", { method: "POST", body: { text: "下午读报", source: "telepathy" } });
  assert(badSourceLife.event.source === "text", `TC-044 expected unknown source to fall back to text, got ${badSourceLife.event.source}`);

  // 非法 text / 超长 text 必须 400，恰好 200 字放行
  assert((await callApp("/api/life-events", { method: "POST", body: { text: "   " }, cookie })).statusCode === 400, "TC-045 expected 400 for blank text");
  assert((await callApp("/api/life-events", { method: "POST", body: { text: "药".repeat(201) }, cookie })).statusCode === 400, "TC-045 expected 400 for text longer than 200 chars");
  assert((await callApp("/api/life-events", { method: "POST", body: { text: "药".repeat(200) }, cookie })).statusCode === 200, "TC-045 expected 200 for exactly 200 chars");

  // unwell 联动：写一条 life_unwell 告警，ref_id = 事件 id（唯一索引保证幂等）
  const unwellLife = await api("/api/life-events", { method: "POST", body: { text: "我今天有点头晕，心慌" } });
  assert(unwellLife.event.kind === "unwell", `TC-046 expected kind unwell, got ${unwellLife.event.kind}`);
  const unwellDb = new DatabaseSync(smokeDbPath);
  const unwellAlerts = unwellDb.prepare("SELECT id, message FROM alerts WHERE type = 'life_unwell' AND ref_id = ?").all(unwellLife.event.id);
  unwellDb.close();
  assert(unwellAlerts.length === 1, `TC-046 expected exactly one life_unwell alert, got ${unwellAlerts.length}`);
  assert(/身体不适/.test(unwellAlerts[0].message) && /头晕/.test(unwellAlerts[0].message), "TC-046 expected the alert message to carry the elder's words");

  // 家属删除成功；不存在 → 404；长辈不能删（403）；未登录三个接口 → 401
  const lifeDeleteOk = await api(`/api/life-events/${lifeEvent.id}`, { method: "DELETE" });
  assert(lifeDeleteOk.ok, "TC-047 expected the caregiver delete to succeed");
  assert(!(await api("/api/life-events")).events.some((item) => item.id === lifeEvent.id), "TC-047 expected the deleted event to disappear from GET");
  assert(!(await api("/api/dashboard")).lifeEvents.some((item) => item.id === lifeEvent.id), "TC-047 expected the deleted event to disappear from the dashboard");
  assert((await callApp("/api/life-events/life_not_exists", { method: "DELETE", cookie })).statusCode === 404, "TC-047 expected 404 for a missing life event id");

  const lifeElderLogin = await callApp("/api/auth/login", { method: "POST", body: { username: "elder", password: "demo1234" } });
  const lifeElderCookie = lifeElderLogin.headers["set-cookie"].split(";")[0];
  const elderOwnEvent = await callApp("/api/life-events", { method: "POST", body: { text: "我刚吃了药" }, cookie: lifeElderCookie });
  const elderOwnId = JSON.parse(elderOwnEvent.body).event.id;
  assert((await callApp(`/api/life-events/${elderOwnId}`, { method: "DELETE", cookie: lifeElderCookie })).statusCode === 403, "TC-048 expected 403 when an elder deletes their own life event");
  for (const [method, path] of [["POST", "/api/life-events"], ["GET", "/api/life-events"], ["DELETE", "/api/life-events/life_any"]]) {
    const res = await callApp(path, { method, body: method === "POST" ? { text: "测试记录" } : null });
    assert(res.statusCode === 401, `TC-048 expected 401 for anonymous ${method} ${path}, got ${res.statusCode}`);
  }

  // 条数上限与顺序：造 55 条 → GET 截到 50 条，dashboard 只留 20 条，且都是最新在前
  for (let i = 0; i < 55; i += 1) {
    await api("/api/life-events", { method: "POST", body: { text: `今天吃饭了（压测第${i + 1}条）` } });
  }
  const lifeList = (await api("/api/life-events")).events;
  assert(lifeList.length === 50, `TC-050 expected GET /api/life-events to cap at 50, got ${lifeList.length}`);
  assert(lifeList[0].rawText === "今天吃饭了（压测第55条）", `TC-050 expected the newest event first, got ${lifeList[0].rawText}`);
  for (let i = 1; i < lifeList.length; i += 1) {
    assert(lifeList[i - 1].createdAt >= lifeList[i].createdAt, `TC-050 expected created_at DESC ordering at index ${i}`);
  }
  const dashList = (await api("/api/dashboard")).lifeEvents;
  assert(dashList.length === 20, `TC-050 expected dashboard.lifeEvents to cap at 20, got ${dashList.length}`);
  assert(dashList[0].rawText === "今天吃饭了（压测第55条）", `TC-050 expected the newest event first in the dashboard, got ${dashList[0].rawText}`);

  // ---- 复诊摘要（GET /api/visit-summary）：聚合、区间过滤、空状态、days 夹取、隐私、多长辈切换 ----
  // 用一组全新的「家属 + 两位长辈」直接造数，避免被上面的用例数据干扰，断言才能精确到个位数。
  const dayAgo = (days) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date(Date.now() - days * 24 * 60 * 60 * 1000));
  const visitToday = dayAgo(0);
  const visitDb = new DatabaseSync(smokeDbPath);
  const visitHash = visitDb.prepare("SELECT password_hash FROM users WHERE id = ?").get("user-caregiver").password_hash;
  const insertUser = visitDb.prepare("INSERT INTO users (id, username, password_hash, display_name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)");
  insertUser.run("user-visit-caregiver", "visit-caregiver", visitHash, "复诊家属", "caregiver", new Date().toISOString());
  insertUser.run("user-visit-elder", "visit-elder", visitHash, "王奶奶", "elder", new Date().toISOString());
  insertUser.run("user-visit-elder2", "visit-elder2", visitHash, "李爷爷", "elder", new Date().toISOString());
  visitDb.prepare("INSERT INTO family_links (id, caregiver_id, elder_id, relation) VALUES (?, ?, ?, ?)").run("link-visit-1", "user-visit-caregiver", "user-visit-elder", "女儿");
  visitDb.prepare("INSERT INTO family_links (id, caregiver_id, elder_id, relation) VALUES (?, ?, ?, ?)").run("link-visit-2", "user-visit-caregiver", "user-visit-elder2", "女婿");
  // 两条用药计划：一条启用、一条停用（复诊摘要要保留停用计划，供前端标注「已停用」）
  const insertSchedule = visitDb.prepare(
    `INSERT INTO medication_schedules (id, elder_id, created_by, medicine_name, dose_note, meal_timing, time_of_day, repeat_rule, remind_elder, remind_caregiver, enabled, created_at)
     VALUES (?, 'user-visit-elder', 'user-visit-caregiver', ?, ?, '', ?, 'daily', 1, 1, ?, ?)`
  );
  insertSchedule.run("vms-1", "苯磺酸氨氯地平片", "1片（5mg）", "08:00", 1, new Date().toISOString());
  insertSchedule.run("vms-2", "阿司匹林", "1片", "20:30", 0, new Date().toISOString());
  // 血压：区间内 4 条（137/140/145/185，其中 3 条异常），另加 1 条 2000 年的记录验证区间过滤
  const insertBp = visitDb.prepare(
    "INSERT INTO blood_pressure_logs (id, elder_id, measured_by, systolic, diastolic, pulse, note, measured_at, created_at) VALUES (?, 'user-visit-elder', 'user-visit-caregiver', ?, ?, ?, '', ?, ?)"
  );
  insertBp.run("vbp-1", 137, 84, 72, `${dayAgo(3)}T08:00:00.000Z`, `${dayAgo(3)}T08:00:00.000Z`);
  insertBp.run("vbp-2", 140, 88, 75, `${dayAgo(2)}T08:00:00.000Z`, `${dayAgo(2)}T08:00:00.000Z`);
  insertBp.run("vbp-3", 145, 95, 76, `${dayAgo(1)}T08:00:00.000Z`, `${dayAgo(1)}T08:00:00.000Z`);
  insertBp.run("vbp-4", 185, 125, 90, `${visitToday}T08:00:00.000Z`, `${visitToday}T08:00:00.000Z`);
  insertBp.run("vbp-old", 130, 80, 70, "2000-01-01T08:00:00.000Z", "2000-01-01T08:00:00.000Z");
  // 服药日志：区间内 done×3 / missed×2 / pending×1；另加 1 条 2000 年的 missed 验证区间过滤
  const insertLog = visitDb.prepare("INSERT INTO medication_logs (id, schedule_id, elder_id, due_date, status) VALUES (?, ?, 'user-visit-elder', ?, ?)");
  insertLog.run("vlog-1", "vms-1", dayAgo(1), "done");
  insertLog.run("vlog-2", "vms-1", dayAgo(2), "missed");
  insertLog.run("vlog-3", "vms-1", dayAgo(3), "done");
  insertLog.run("vlog-4", "vms-2", dayAgo(1), "done");
  insertLog.run("vlog-5", "vms-2", dayAgo(4), "missed");
  insertLog.run("vlog-6", "vms-2", visitToday, "pending");
  insertLog.run("vlog-old", "vms-1", "2000-01-01", "missed");
  // 生活事件：1 条区间内 unwell、1 条区间外 unwell、1 条区间内 meal（按 kind 过滤）
  const insertLife = visitDb.prepare("INSERT INTO life_events (id, elder_id, kind, raw_text, occurred_at, source, recorded_by, created_at) VALUES (?, 'user-visit-elder', ?, ?, ?, 'text', 'user-visit-caregiver', ?)");
  insertLife.run("vlife-1", "unwell", "我有点头晕", null, `${dayAgo(1)}T09:00:00.000Z`);
  insertLife.run("vlife-old", "unwell", "很久以前不舒服", null, "2000-01-01T00:00:00.000Z");
  insertLife.run("vlife-meal", "meal", "今天吃饭了", null, `${dayAgo(1)}T12:00:00.000Z`);
  // 体检报告：带一段假 base64 image_data，用来验证响应里绝不夹带图片数据
  visitDb
    .prepare(
      `INSERT INTO checkup_reports (id, elder_id, uploaded_by, file_name, image_data, summary, advice_json, risk_level, source, created_at)
       VALUES (?, 'user-visit-elder', 'user-visit-caregiver', 'report.png', ?, ?, '{}', ?, ?, ?)`
    )
    .run("vchk-1", "data:image/png;base64,SGVsbG8gVGVjaEd1YXJk", "血压偏高，建议复诊心内科", "medium", "openai", `${dayAgo(2)}T10:00:00.000Z`);
  visitDb.close();

  const visitLogin = await callApp("/api/auth/login", { method: "POST", body: { username: "visit-caregiver", password: "demo1234" } });
  assert(visitLogin.statusCode === 200, `TC-051 expected the visit caregiver to log in, got ${visitLogin.statusCode}`);
  const visitCookie = visitLogin.headers["set-cookie"].split(";")[0];

  // 未登录必须 401
  assert((await callApp("/api/visit-summary")).statusCode === 401, "TC-051 expected 401 for anonymous /api/visit-summary");
  // __VISIT_SUMMARY_TESTS_PART2__
  const summaryRes = await callApp("/api/visit-summary", { cookie: visitCookie });
  assert(summaryRes.statusCode === 200, `TC-052 expected 200 for /api/visit-summary, got ${summaryRes.statusCode}`);
  const summary = JSON.parse(summaryRes.body);
  assert(summary.ok === true && Boolean(summary.generatedAt), "TC-052 expected ok + generatedAt");
  assert(summary.periodDays === 30 && summary.periodStart === dayAgo(30), `TC-052 expected the default 30-day window, got ${summary.periodDays}/${summary.periodStart}`);
  assert(summary.elder.displayName === "王奶奶" && summary.elder.relation === "女儿", `TC-052 expected elder 王奶奶/女儿, got ${summary.elder.displayName}/${summary.elder.relation}`);
  // 用药计划：含停用，按 time_of_day ASC
  assert(summary.medications.length === 2, `TC-052 expected 2 medication plans, got ${summary.medications.length}`);
  assert(summary.medications[0].timeOfDay === "08:00" && summary.medications[1].timeOfDay === "20:30", "TC-052 expected medications ordered by time_of_day ASC");
  assert(Number(summary.medications[0].enabled) === 1 && Number(summary.medications[1].enabled) === 0, "TC-052 expected the disabled plan to stay listed with enabled = 0");
  // 血压：区间内 4 条、逐条判定异常 3 条、平均 152/98、最新 185/125、整段 level = danger
  assert(summary.bloodPressure.count === 4, `TC-052 expected 4 blood pressure records in range, got ${summary.bloodPressure.count}`);
  assert(summary.bloodPressure.abnormalCount === 3, `TC-052 expected abnormalCount 3, got ${summary.bloodPressure.abnormalCount}`);
  assert(summary.bloodPressure.average.systolic === 152 && summary.bloodPressure.average.diastolic === 98, `TC-052 expected average 152/98, got ${summary.bloodPressure.average.systolic}/${summary.bloodPressure.average.diastolic}`);
  assert(summary.bloodPressure.latest.systolic === 185 && summary.bloodPressure.latest.diastolic === 125, "TC-052 expected the latest record to be 185/125");
  assert(summary.bloodPressure.records.length === 4, "TC-052 expected 4 blood pressure records in the array");
  assert(summary.bloodPressure.level === "danger", `TC-052 expected level danger from the whole-period records, got ${summary.bloodPressure.level}`);
  assert(typeof summary.bloodPressure.advice === "string" && summary.bloodPressure.advice.length > 0, "TC-052 expected a non-empty advice");
  // 依从性：6 条（done 3 / missed 2 / pending 1），rate = 0.5，missedDetails 按 due_date DESC
  assert(summary.adherence.total === 6 && summary.adherence.done === 3 && summary.adherence.missed === 2 && summary.adherence.pending === 1, `TC-053 expected 6/3/2/1, got ${summary.adherence.total}/${summary.adherence.done}/${summary.adherence.missed}/${summary.adherence.pending}`);
  assert(summary.adherence.rate === 0.5 && typeof summary.adherence.rate === "number", `TC-053 expected rate 0.5 as a number, got ${summary.adherence.rate}`);
  assert(summary.adherence.missedDetails.length === 2, `TC-053 expected 2 missed details, got ${summary.adherence.missedDetails.length}`);
  assert(summary.adherence.missedDetails[0].dueDate === dayAgo(2) && summary.adherence.missedDetails[0].medicineName === "苯磺酸氨氯地平片", "TC-053 expected missed details newest first with the medicine name joined");
  assert(summary.adherence.missedDetails[0].timeOfDay === "08:00" && summary.adherence.missedDetails[1].dueDate === dayAgo(4), "TC-053 expected missed details ordered by due_date DESC");
  // 不适事件 / 体检报告：区间 + kind 过滤，体检报告不含 image_data
  assert(summary.unwellEvents.length === 1 && summary.unwellEvents[0].rawText === "我有点头晕", `TC-054 expected 1 unwell event, got ${summary.unwellEvents.length}`);
  assert(summary.checkups.length === 1 && summary.checkups[0].riskLevel === "medium" && summary.checkups[0].source === "openai", "TC-054 expected 1 checkup with riskLevel/source");
  assert(summary.notes === "", "TC-054 expected an empty notes string");
  // 隐私：响应里绝不能出现内联图片数据
  assert(!summaryRes.body.includes("data:image"), "TC-054 expected no data:image substring in the response body");
  assert(!summaryRes.body.includes("image_data"), "TC-054 expected no image_data field in the response body");

  // days 边界：全部 200 且被夹到 1–180（非数字 / 空串回落到默认 30）
  for (const [query, expected] of [["", 30], ["0", 1], ["-5", 1], ["999", 180], ["abc", 30], ["7", 7]]) {
    const res = await callApp(`/api/visit-summary?days=${query}`, { cookie: visitCookie });
    const data = JSON.parse(res.body);
    assert(res.statusCode === 200, `TC-055 expected 200 for days=${query}, got ${res.statusCode}`);
    assert(data.periodDays === expected, `TC-055 expected days=${query} clamped to ${expected}, got ${data.periodDays}`);
  }

  // 切换长辈：摘要跟着切，空数据长辈返回空状态且不抛异常
  // 注意必须用 callApp + visitCookie：测试里的 api() 复用全局 caregiver cookie，不会用传入的 cookie
  const visitSwitch = await callApp("/api/elders/switch", { method: "POST", body: { elderId: "user-visit-elder2" }, cookie: visitCookie });
  assert(visitSwitch.statusCode === 200, `TC-056 expected the visit caregiver to switch elders, got ${visitSwitch.statusCode}`);
  const emptyRes = await callApp("/api/visit-summary", { cookie: visitCookie });
  assert(emptyRes.statusCode === 200, `TC-056 expected 200 for the empty elder, got ${emptyRes.statusCode}`);
  const emptySummary = JSON.parse(emptyRes.body);
  assert(emptySummary.elder.displayName === "李爷爷" && emptySummary.elder.relation === "女婿", `TC-056 expected the summary to follow the switch, got ${emptySummary.elder.displayName}/${emptySummary.elder.relation}`);
  assert(emptySummary.bloodPressure.count === 0 && emptySummary.bloodPressure.latest === null && emptySummary.bloodPressure.average === null, "TC-056 expected empty blood pressure state");
  assert(emptySummary.adherence.total === 0 && emptySummary.adherence.rate === null, `TC-056 expected adherence rate null when empty, got ${emptySummary.adherence.rate}`);
  assert(emptySummary.medications.length === 0 && emptySummary.unwellEvents.length === 0 && emptySummary.checkups.length === 0 && emptySummary.adherence.missedDetails.length === 0, "TC-056 expected all arrays empty for the empty elder");
  assert(typeof emptySummary.bloodPressure.label === "string" && emptySummary.bloodPressure.label.length > 0, "TC-056 expected a Chinese empty-state label");
  // ---- 用药库存（medication_stock）：余量追踪、自动扣减、缺药提醒 ----
  // 用一组全新的「家属 + 一位长辈」直接造数，避免被上面的用例数据干扰，断言才能精确到个位数。
  delete process.env.MEDICATION_STOCK_ALERT_DAYS;
  const stockDb0 = new DatabaseSync(smokeDbPath);
  const stockHash = stockDb0.prepare("SELECT password_hash FROM users WHERE id = ?").get("user-caregiver").password_hash;
  const insertStockUser = stockDb0.prepare("INSERT INTO users (id, username, password_hash, display_name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)");
  insertStockUser.run("user-stock-caregiver", "stock-caregiver", stockHash, "库存家属", "caregiver", new Date().toISOString());
  insertStockUser.run("user-stock-elder", "stock-elder", stockHash, "赵奶奶", "elder", new Date().toISOString());
  stockDb0
    .prepare("INSERT INTO family_links (id, caregiver_id, elder_id, relation) VALUES (?, ?, ?, ?)")
    .run("link-stock-1", "user-stock-caregiver", "user-stock-elder", "女儿");
  stockDb0.close();

  const stockLogin = await callApp("/api/auth/login", { method: "POST", body: { username: "stock-caregiver", password: "demo1234" } });
  assert(stockLogin.statusCode === 200, `SC-001 expected the stock caregiver to log in, got ${stockLogin.statusCode}`);
  const stockCookie = stockLogin.headers["set-cookie"].split(";")[0];

  const stockApi = async (path, { method = "GET", body = null } = {}) => {
    const res = await callApp(path, { method, body, cookie: stockCookie });
    const data = JSON.parse(res.body || "{}");
    assert(res.statusCode >= 200 && res.statusCode < 300, `SC expected 2xx for ${method} ${path}, got ${res.statusCode}: ${data.message || ""}`);
    return data;
  };
  const directStockDb = () => new DatabaseSync(smokeDbPath);
  const stockRowOf = (medicineName) => {
    const rows = directStockDb().prepare("SELECT * FROM medication_stock WHERE elder_id = ? AND medicine_name = ?").all("user-stock-elder", medicineName);
    return rows;
  };
  const stockAlertsOf = () => directStockDb().prepare("SELECT id, ref_id, message FROM alerts WHERE elder_id = ? AND type = 'medication_stock_low'").all("user-stock-elder");

  // SC-001 未登录三个接口都必须 401
  for (const [method, path] of [["GET", "/api/medication-stock"], ["POST", "/api/medication-stock"], ["DELETE", "/api/medication-stock/stock_any"]]) {
    const res = await callApp(path, { method, body: method === "POST" ? { medicineName: "降压药", unitsRemaining: 10 } : null });
    assert(res.statusCode === 401, `SC-001 expected 401 for anonymous ${method} ${path}, got ${res.statusCode}`);
  }

  // SC-002 长辈可以读库存列表，但不能写（POST / DELETE 403）
  const stockElderLogin = await callApp("/api/auth/login", { method: "POST", body: { username: "elder", password: "demo1234" } });
  const stockElderCookie = stockElderLogin.headers["set-cookie"].split(";")[0];
  const elderStockRead = await callApp("/api/medication-stock", { cookie: stockElderCookie });
  assert(elderStockRead.statusCode === 200 && Array.isArray(JSON.parse(elderStockRead.body).stocks), "SC-002 expected 200 + stocks array when an elder reads the stock list");
  assert(
    (await callApp("/api/medication-stock", { method: "POST", body: { medicineName: "降压药", unitsRemaining: 10 }, cookie: stockElderCookie })).statusCode === 403,
    "SC-002 expected 403 when an elder registers stock"
  );
  assert(
    (await callApp("/api/medication-stock/stock_any", { method: "DELETE", cookie: stockElderCookie })).statusCode === 403,
    "SC-002 expected 403 when an elder deletes stock"
  );
  // SC-003 一种药一天两次 = 两条计划；没有库存记录的药名也必须出现在列表里（id / unitsRemaining / remainingDays 全 null）
  const medPlanA1 = (await stockApi("/api/medications", { method: "POST", body: { medicineName: "苯磺酸氨氯地平片", timeOfDay: "08:00" } })).id;
  const medPlanA2 = (await stockApi("/api/medications", { method: "POST", body: { medicineName: "苯磺酸氨氯地平片", timeOfDay: "20:00" } })).id;
  const medPlanB = (await stockApi("/api/medications", { method: "POST", body: { medicineName: "阿司匹林肠溶片", timeOfDay: "12:00" } })).id;

  const planOnlyList = await stockApi("/api/medication-stock");
  assert(planOnlyList.stocks.length === 2, `SC-003 expected the 2 medicine names from plans, got ${planOnlyList.stocks.length}`);
  const bottleA = planOnlyList.stocks.find((item) => item.medicineName === "苯磺酸氨氯地平片");
  const bottleB = planOnlyList.stocks.find((item) => item.medicineName === "阿司匹林肠溶片");
  assert(
    bottleA.id === null && bottleA.unitsRemaining === null && bottleA.remainingDays === null && bottleA.low === false && bottleA.note === "" && bottleA.updatedAt === null,
    `SC-003 expected a plan without stock to be listed as an empty placeholder, got ${JSON.stringify(bottleA)}`
  );
  assert(bottleA.dosesPerDay === 2 && bottleA.dailyUnits === 2, `SC-003 expected 2 doses/day for the twice-daily medicine, got ${bottleA.dosesPerDay}/${bottleA.dailyUnits}`);
  assert(bottleB.dosesPerDay === 1 && bottleB.unitsPerDose === 1 && bottleB.dailyUnits === 1, `SC-003 expected 1 dose/day for the once-daily medicine, got ${bottleB.dosesPerDay}`);
  const stockKeys = Object.keys(bottleA).sort().join(",");
  assert(
    stockKeys === "dailyUnits,dosesPerDay,id,low,medicineName,note,remainingDays,unitsPerDose,unitsRemaining,updatedAt",
    `SC-003 unexpected stock contract shape: ${stockKeys}`
  );

  // SC-004 remainingDays 手算：30 片 / (2 剂 × 2 片) = 7.5 → 向下取整 7；数字字符串也要接受；没有计划的库存 remainingDays 为 null
  const savedA = await stockApi("/api/medication-stock", { method: "POST", body: { medicineName: "苯磺酸氨氯地平片", unitsRemaining: "30", unitsPerDose: "2", note: "早晚饭后各一片" } });
  assert(savedA.stock.dosesPerDay === 2 && savedA.stock.dailyUnits === 4, `SC-004 expected dosesPerDay 2 / dailyUnits 4, got ${savedA.stock.dosesPerDay}/${savedA.stock.dailyUnits}`);
  assert(savedA.stock.unitsRemaining === 30 && savedA.stock.unitsPerDose === 2, "SC-004 expected the numeric strings to be stored as numbers");
  assert(savedA.stock.remainingDays === 7, `SC-004 expected floor(30 / (2*2)) = 7 remaining days, got ${savedA.stock.remainingDays}`);
  assert(savedA.stock.low === true, "SC-004 expected remainingDays 7 to be flagged low at the default 7-day threshold");
  assert(savedA.stock.note === "早晚饭后各一片" && Boolean(savedA.stock.updatedAt), "SC-004 expected note and updatedAt in the response");

  // 有计划但无库存 / 无计划只有库存：两种对照的 remainingDays 都必须是 null
  const onlyStock = await stockApi("/api/medication-stock", { method: "POST", body: { medicineName: "维生素D", unitsRemaining: 100000, unitsPerDose: 1 } });
  assert(onlyStock.stock.id !== null && onlyStock.stock.remainingDays === null && onlyStock.stock.low === false, `SC-004 expected a stock without any plan to have remainingDays null, got ${onlyStock.stock.remainingDays}`);
  assert(onlyStock.stock.dosesPerDay === 0 && onlyStock.stock.dailyUnits === 0, `SC-004 expected dosesPerDay 0 when no plan exists, got ${onlyStock.stock.dosesPerDay}`);
  assert(onlyStock.stock.unitsRemaining === 100000, `SC-004 expected the upper bound 100000 to be accepted, got ${onlyStock.stock.unitsRemaining}`);

  // SC-005 排序：low 的排前面，其余按药名；药名来源 = 计划 ∪ 已登记库存
  const sortedList = (await stockApi("/api/medication-stock")).stocks;
  assert(sortedList.length === 3, `SC-005 expected 3 medicines (2 planned + 1 stock-only), got ${sortedList.length}`);
  assert(sortedList[0].medicineName === "苯磺酸氨氯地平片" && sortedList[0].low === true, `SC-005 expected the low medicine first, got ${sortedList[0].medicineName}/${sortedList[0].low}`);
  const nonLowNames = sortedList.slice(1).map((item) => item.medicineName);
  assert(nonLowNames.every((name, index) => index === 0 || nonLowNames[index - 1] < name), `SC-005 expected the remaining medicines sorted by name, got ${nonLowNames.join("/")}`);

  // SC-006 非法数值一律 400（负数 / 越界 / 小数 / 非数字 / 空值 / 超长药名 / 每次用量越界）
  for (const bad of [
    { medicineName: "   ", unitsRemaining: 10 },
    { medicineName: "药".repeat(61), unitsRemaining: 10 },
    { medicineName: "降压药" },
    { medicineName: "降压药", unitsRemaining: -1 },
    { medicineName: "降压药", unitsRemaining: 100001 },
    { medicineName: "降压药", unitsRemaining: 1.5 },
    { medicineName: "降压药", unitsRemaining: "abc" },
    { medicineName: "降压药", unitsRemaining: "" },
    { medicineName: "降压药", unitsRemaining: 10, unitsPerDose: 0 },
    { medicineName: "降压药", unitsRemaining: 10, unitsPerDose: 101 },
    { medicineName: "降压药", unitsRemaining: 10, unitsPerDose: "abc" },
  ]) {
    const res = await callApp("/api/medication-stock", { method: "POST", body: bad, cookie: stockCookie });
    assert(res.statusCode === 400, `SC-006 expected 400 for ${JSON.stringify(bad)}, got ${res.statusCode}`);
  }
  assert(stockRowOf("降压药").length === 0, "SC-006 expected no row to be written for invalid payloads");
  // SC-007 同一药名 upsert：只更新同一行、刷新 updated_at，不会堆出第二条
  const upserted = await stockApi("/api/medication-stock", { method: "POST", body: { medicineName: "苯磺酸氨氯地平片", unitsRemaining: 40, unitsPerDose: 2, note: "又开了一盒" } });
  assert(upserted.stock.id === savedA.stock.id, `SC-007 expected the upsert to keep the same row id, got ${upserted.stock.id} vs ${savedA.stock.id}`);
  assert(upserted.stock.remainingDays === 10, `SC-007 expected floor(40/4) = 10 days after the upsert, got ${upserted.stock.remainingDays}`);
  assert(upserted.stock.updatedAt >= savedA.stock.updatedAt, "SC-007 expected updated_at to be refreshed on upsert");
  assert(stockRowOf("苯磺酸氨氯地平片").length === 1, "SC-007 expected exactly one row per (elder, medicine_name)");
  // 回到 30 片，供后面的自动扣减用例使用
  const backTo30 = await stockApi("/api/medication-stock", { method: "POST", body: { medicineName: "苯磺酸氨氯地平片", unitsRemaining: 30, unitsPerDose: 2, note: "早晚饭后各一片" } });
  assert(backTo30.stock.remainingDays === 7, `SC-007 expected 7 days again after resetting to 30, got ${backTo30.stock.remainingDays}`);

  // SC-008 删除库存登记：成功 / 行消失 / 再删 404 / 不存在的 id 404
  const throwaway = await stockApi("/api/medication-stock", { method: "POST", body: { medicineName: "临时药", unitsRemaining: 5, unitsPerDose: 1 } });
  assert((await stockApi(`/api/medication-stock/${throwaway.stock.id}`, { method: "DELETE" })).ok === true, "SC-008 expected the stock delete to succeed");
  assert(stockRowOf("临时药").length === 0, "SC-008 expected the deleted stock row to be gone");
  assert(!(await stockApi("/api/medication-stock")).stocks.some((item) => item.medicineName === "临时药"), "SC-008 expected the deleted medicine to disappear from the list");
  assert((await callApp(`/api/medication-stock/${throwaway.stock.id}`, { method: "DELETE", cookie: stockCookie })).statusCode === 404, "SC-008 expected 404 when deleting the same stock twice");
  assert((await callApp("/api/medication-stock/stock_not_exists", { method: "DELETE", cookie: stockCookie })).statusCode === 404, "SC-008 expected 404 for an unknown stock id");

  // SC-009 自动扣减：确认一次服药扣掉「每次用量」2 片（30 → 28）；库存见底时再确认一次停在 0，不会变成负数
  const stockToday = todayDate();
  const stockDashboard = await stockApi("/api/dashboard");
  const pendingA = stockDashboard.medications.find((item) => item.id === medPlanA1 && item.status === "pending");
  assert(Boolean(pendingA), "SC-009 expected a pending log for the morning plan");
  await stockApi(`/api/medications/${pendingA.log_id}/complete`, { method: "POST", body: { note: "已吃" } });
  assert(stockRowOf("苯磺酸氨氯地平片")[0].units_remaining === 28, `SC-009 expected 30 - 2 = 28 after confirming, got ${stockRowOf("苯磺酸氨氯地平片")[0].units_remaining}`);

  await stockApi("/api/medication-stock", { method: "POST", body: { medicineName: "苯磺酸氨氯地平片", unitsRemaining: 1, unitsPerDose: 2, note: "只剩一片" } });
  const pendingA2 = (await stockApi("/api/dashboard")).medications.find((item) => item.id === medPlanA2);
  await stockApi(`/api/medications/${pendingA2.log_id}/complete`, { method: "POST", body: {} });
  assert(stockRowOf("苯磺酸氨氯地平片")[0].units_remaining === 0, `SC-009 expected the deduction to stop at 0 instead of going negative, got ${stockRowOf("苯磺酸氨氯地平片")[0].units_remaining}`);

  // SC-010 没有库存登记的药：确认服药照常成功（200），日志变 done，且不会自动建库存记录
  const pendingB = (await stockApi("/api/dashboard")).medications.find((item) => item.id === medPlanB);
  const completeNoStock = await stockApi(`/api/medications/${pendingB.log_id}/complete`, { method: "POST", body: {} });
  assert(completeNoStock.ok === true, "SC-010 expected confirming a dose without stock to succeed");
  const noStockLog = directStockDb().prepare("SELECT status FROM medication_logs WHERE id = ?").get(pendingB.log_id);
  assert(noStockLog.status === "done", `SC-010 expected the log to become done, got ${noStockLog.status}`);
  assert(stockRowOf("阿司匹林肠溶片").length === 0, "SC-010 expected no stock row to be auto-created for a medicine without registration");
  // SC-011 缺药提醒（cron）：remainingDays 0 → 「今天就要吃完了」；ref_id = <stockId>-<今天>；同一天第二次扫描不重复
  const bottleARow = stockRowOf("苯磺酸氨氯地平片")[0];
  delete process.env.MEDICATION_STOCK_ALERT_DAYS;
  const stockScan1 = await api("/api/cron/reminders");
  assert(stockScan1.medicationStockRemindersSent === 1, `SC-011 expected exactly one stock reminder, got ${stockScan1.medicationStockRemindersSent}`);
  const lowAlerts = stockAlertsOf();
  assert(lowAlerts.length === 1, `SC-011 expected exactly one medication_stock_low alert, got ${lowAlerts.length}`);
  assert(lowAlerts[0].ref_id === `${bottleARow.id}-${stockToday}`, `SC-011 expected ref_id ${bottleARow.id}-${stockToday}, got ${lowAlerts[0].ref_id}`);
  assert(/今天就要吃完了/.test(lowAlerts[0].message), `SC-011 expected the urgent wording for remainingDays 0, got ${lowAlerts[0].message}`);
  assert(/赵奶奶/.test(lowAlerts[0].message) && /苯磺酸氨氯地平片/.test(lowAlerts[0].message), "SC-011 expected the message to name the elder and the medicine");

  const stockScan2 = await api("/api/cron/reminders");
  assert(stockScan2.medicationStockRemindersSent === 0, `SC-012 expected no duplicate stock reminder on the second scan, got ${stockScan2.medicationStockRemindersSent}`);
  assert(stockAlertsOf().length === 1, `SC-012 expected the same-day alert to stay unique, got ${stockAlertsOf().length}`);
  // 缺药提醒必须落到「这位长辈自己的家属」的站内通知里。
  // 提醒过去固定发给默认家属 user-caregiver，多家庭部署时 A 家的提醒会串到 B 家；
  // 这里用 stockApi（赵奶奶的家属）断言，同时反向确认默认家属没有收到串号的通知。
  const stockNotifs = await stockApi("/api/notifications");
  assert(
    stockNotifs.notifications.some((item) => item.type === "medication_stock_low" && /药品快吃完了/.test(item.title)),
    "SC-012 expected a medication_stock_low in-app notification for the elder's own caregiver"
  );
  const defaultCaregiverNotifs = await api("/api/notifications");
  assert(
    !defaultCaregiverNotifs.notifications.some((item) => item.type === "medication_stock_low"),
    "SC-012 expected the default caregiver NOT to receive another elder's stock reminder"
  );

  // SC-013 阈值环境变量：默认 7；30 覆盖后「还能吃 20 天」的药会触发
  delete process.env.MEDICATION_STOCK_ALERT_DAYS;
  assert(medicationStockAlertDays() === 7, `SC-013 expected the default threshold 7, got ${medicationStockAlertDays()}`);
  process.env.MEDICATION_STOCK_ALERT_DAYS = "30";
  assert(medicationStockAlertDays() === 30, `SC-013 expected the env override 30, got ${medicationStockAlertDays()}`);
  await stockApi("/api/medications", { method: "POST", body: { medicineName: "二甲双胍片", timeOfDay: "08:00" } });
  const metformin = await stockApi("/api/medication-stock", { method: "POST", body: { medicineName: "二甲双胍片", unitsRemaining: 20, unitsPerDose: 1 } });
  assert(metformin.stock.remainingDays === 20, `SC-013 expected 20 remaining days, got ${metformin.stock.remainingDays}`);
  assert(metformin.stock.low === true, "SC-013 expected remainingDays 20 to be low at a 30-day threshold");
  const stockScan3 = await api("/api/cron/reminders");
  assert(stockScan3.medicationStockRemindersSent === 1, `SC-013 expected the 20-day medicine to trigger at threshold 30, got ${stockScan3.medicationStockRemindersSent}`);
  const metforminAlert = stockAlertsOf().find((item) => item.ref_id === `${metformin.stock.id}-${stockToday}`);
  assert(Boolean(metforminAlert) && /大约还能吃 20 天/.test(metforminAlert.message), `SC-013 expected the 20-day wording, got ${metforminAlert?.message}`);

  // SC-014 非法阈值一律回落 7：同样的 20 天库存不再触发
  process.env.MEDICATION_STOCK_ALERT_DAYS = "abc";
  assert(medicationStockAlertDays() === 7, `SC-014 expected an invalid threshold to fall back to 7, got ${medicationStockAlertDays()}`);
  process.env.MEDICATION_STOCK_ALERT_DAYS = "7.5";
  assert(medicationStockAlertDays() === 7, `SC-014 expected a fractional threshold to fall back to 7, got ${medicationStockAlertDays()}`);
  process.env.MEDICATION_STOCK_ALERT_DAYS = "-3";
  assert(medicationStockAlertDays() === 7, `SC-014 expected a negative threshold to fall back to 7, got ${medicationStockAlertDays()}`);
  process.env.MEDICATION_STOCK_ALERT_DAYS = " 30 ";
  assert(medicationStockAlertDays() === 30, `SC-014 expected the trimmed env value to be honoured, got ${medicationStockAlertDays()}`);

  process.env.MEDICATION_STOCK_ALERT_DAYS = "abc";
  await stockApi("/api/medications", { method: "POST", body: { medicineName: "格列美脲片", timeOfDay: "08:00" } });
  const glimepiride = await stockApi("/api/medication-stock", { method: "POST", body: { medicineName: "格列美脲片", unitsRemaining: 20, unitsPerDose: 1 } });
  assert(glimepiride.stock.remainingDays === 20 && glimepiride.stock.low === false, "SC-014 expected 20 days to be not-low after falling back to 7");
  const stockScan4 = await api("/api/cron/reminders");
  assert(stockScan4.medicationStockRemindersSent === 0, `SC-014 expected no reminder at the fallback threshold, got ${stockScan4.medicationStockRemindersSent}`);
  assert(!stockAlertsOf().some((item) => item.ref_id === `${glimepiride.stock.id}-${stockToday}`), "SC-014 expected no alert row for the not-low medicine");
  delete process.env.MEDICATION_STOCK_ALERT_DAYS;

  // ---- 体检指标（checkup_indicators）：结构化录入 + 趋势对比 + 参考范围 ----
  // 用一组全新的「家属 + 一位长辈」直接造数，避免被上面的用例数据干扰，断言才能精确到个位数。
  const ciDb0 = new DatabaseSync(smokeDbPath);
  const ciHash = ciDb0.prepare("SELECT password_hash FROM users WHERE id = ?").get("user-caregiver").password_hash;
  const insertCiUser = ciDb0.prepare("INSERT INTO users (id, username, password_hash, display_name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)");
  insertCiUser.run("user-ci-caregiver", "ci-caregiver", ciHash, "指标家属", "caregiver", new Date().toISOString());
  insertCiUser.run("user-ci-elder", "ci-elder", ciHash, "周奶奶", "elder", new Date().toISOString());
  ciDb0.prepare("INSERT INTO family_links (id, caregiver_id, elder_id, relation) VALUES (?, ?, ?, ?)").run("link-ci-1", "user-ci-caregiver", "user-ci-elder", "女儿");
  ciDb0.close();

  const ciLogin = await callApp("/api/auth/login", { method: "POST", body: { username: "ci-caregiver", password: "demo1234" } });
  assert(ciLogin.statusCode === 200, `CI-001 expected the indicator caregiver to log in, got ${ciLogin.statusCode}`);
  const ciCookie = ciLogin.headers["set-cookie"].split(";")[0];
  const ciApi = async (path, { method = "GET", body = null } = {}) => {
    const res = await callApp(path, { method, body, cookie: ciCookie });
    const data = JSON.parse(res.body || "{}");
    assert(res.statusCode >= 200 && res.statusCode < 300, `CI expected 2xx for ${method} ${path}, got ${res.statusCode}: ${data.message || ""}`);
    return data;
  };
  const ciRaw = (path, options) => callApp(path, { ...options, cookie: ciCookie });
  // 直查库对照：与接口内部同一排序口径（measured_date ASC, created_at ASC, rowid ASC）
  const ciRowsOf = (name) =>
    new DatabaseSync(smokeDbPath)
      .prepare("SELECT * FROM checkup_indicators WHERE elder_id = ? AND name = ? ORDER BY measured_date ASC, created_at ASC, rowid ASC")
      .all("user-ci-elder", name);
  const ciCount = () => new DatabaseSync(smokeDbPath).prepare("SELECT COUNT(*) AS count FROM checkup_indicators WHERE elder_id = ?").get("user-ci-elder").count;
  const ciIndicatorOf = async (name) => (await ciApi("/api/checkup-indicators")).indicators.find((item) => item.name === name);

  // CI-001 未登录三个接口都必须 401
  for (const [method, path] of [
    ["GET", "/api/checkup-indicators"],
    ["POST", "/api/checkup-indicators"],
    ["DELETE", "/api/checkup-indicators/ind_any"],
  ]) {
    const res = await callApp(path, { method, body: method === "POST" ? { measuredDate: "2026-10-03", items: [{ name: "空腹血糖", value: 6.8 }] } : null });
    assert(res.statusCode === 401, `CI-001 expected 401 for anonymous ${method} ${path}, got ${res.statusCode}`);
  }

  // CI-002 长辈可以读趋势，但不能写 / 删（403）；录入前是空数组而不是报错
  const ciElderLogin = await callApp("/api/auth/login", { method: "POST", body: { username: "elder", password: "demo1234" } });
  const ciElderCookie = ciElderLogin.headers["set-cookie"].split(";")[0];
  const elderCiRead = await callApp("/api/checkup-indicators", { cookie: ciElderCookie });
  assert(elderCiRead.statusCode === 200 && Array.isArray(JSON.parse(elderCiRead.body).indicators), "CI-002 expected 200 + indicators array when an elder reads the trend");
  assert(
    (await callApp("/api/checkup-indicators", { method: "POST", body: { measuredDate: "2026-10-03", items: [{ name: "空腹血糖", value: 6.8 }] }, cookie: ciElderCookie })).statusCode === 403,
    "CI-002 expected 403 when an elder records indicators"
  );
  assert((await callApp("/api/checkup-indicators/ind_any", { method: "DELETE", cookie: ciElderCookie })).statusCode === 403, "CI-002 expected 403 when an elder deletes an indicator");
  assert((await ciApi("/api/checkup-indicators")).indicators.length === 0, "CI-002 expected an empty indicators array before any record");

  // CI-003 非法检查日期一律 400（缺零填充 / 斜杠 / 不存在的日期 / 越界月份 / 空值）
  for (const badDate of ["2026-2-3", "2026/10/03", "2026-02-31", "2026-13-01", "", null]) {
    const res = await ciRaw("/api/checkup-indicators", { method: "POST", body: { measuredDate: badDate, items: [{ name: "空腹血糖", value: 6.8 }] } });
    assert(res.statusCode === 400, `CI-003 expected 400 for measuredDate ${JSON.stringify(badDate)}, got ${res.statusCode}`);
  }

  // CI-004 items 非数组 / 空数组 / 超过 30 条 / 单条字段非法，全部 400，且一条都不写库
  for (const badItems of [undefined, [], "abc", { name: "空腹血糖", value: 6.8 }]) {
    const res = await ciRaw("/api/checkup-indicators", { method: "POST", body: { measuredDate: "2026-10-03", items: badItems } });
    assert(res.statusCode === 400, `CI-004 expected 400 for items ${JSON.stringify(badItems)}, got ${res.statusCode}`);
  }
  const tooMany = Array.from({ length: 31 }, (_, i) => ({ name: `指标${i}`, value: 1 }));
  assert((await ciRaw("/api/checkup-indicators", { method: "POST", body: { measuredDate: "2026-10-03", items: tooMany } })).statusCode === 400, "CI-004 expected 400 for more than 30 items");
  // 恰好 30 条必须放行（边界内），随后再删掉这条 30 条的测试数据
  await ciApi("/api/checkup-indicators", { method: "POST", body: { measuredDate: "2026-10-03", items: Array.from({ length: 30 }, (_, i) => ({ name: `边界指标${i}`, value: i })) } });
  assert(ciCount() === 30, `CI-004 expected exactly 30 rows for the boundary payload, got ${ciCount()}`);
  for (const row of new DatabaseSync(smokeDbPath).prepare("SELECT id FROM checkup_indicators WHERE elder_id = ? AND name LIKE '边界指标%'").all("user-ci-elder")) {
    await ciApi(`/api/checkup-indicators/${row.id}`, { method: "DELETE" });
  }
  assert(ciCount() === 0, `CI-004 expected the boundary rows to be cleaned up, got ${ciCount()}`);

  for (const badItem of [
    {},
    { name: "   ", value: 1 },
    { name: "药".repeat(41), value: 1 },
    { name: "空腹血糖" },
    { name: "空腹血糖", value: null },
    { name: "空腹血糖", value: "" },
    { name: "空腹血糖", value: "abc" },
    { name: "空腹血糖", value: 100001 },
    { name: "空腹血糖", value: -100001 },
    { name: "空腹血糖", value: NaN },
    { name: "空腹血糖", value: 6.8, unit: "u".repeat(21) },
    { name: "空腹血糖", value: 6.8, note: "备".repeat(101) },
  ]) {
    const res = await ciRaw("/api/checkup-indicators", { method: "POST", body: { measuredDate: "2026-10-03", items: [badItem] } });
    assert(res.statusCode === 400, `CI-004 expected 400 for item ${JSON.stringify(badItem)}, got ${res.statusCode}`);
  }
  assert(ciCount() === 0, `CI-004 expected no row written for invalid payloads, got ${ciCount()}`);

  // CI-005 部分非法就整体拒绝：第二条 name 为空 / 第二条 value 越界，都必须 400 且库里一条都没有
  const partialBlankName = await ciRaw("/api/checkup-indicators", {
    method: "POST",
    body: { measuredDate: "2026-10-03", items: [{ name: "空腹血糖", value: 6.8 }, { name: "   ", value: 5.5 }] },
  });
  assert(partialBlankName.statusCode === 400, `CI-005 expected 400 when the 2nd item name is blank, got ${partialBlankName.statusCode}`);
  assert(ciCount() === 0, `CI-005 expected zero rows after a blank-name partial-invalid payload, got ${ciCount()}`);
  const partialBadValue = await ciRaw("/api/checkup-indicators", {
    method: "POST",
    body: { measuredDate: "2026-10-03", items: [{ name: "空腹血糖", value: 6.8 }, { name: "糖化血红蛋白", value: 999999 }] },
  });
  assert(partialBadValue.statusCode === 400, `CI-005 expected 400 when the 2nd item value is out of bounds, got ${partialBadValue.statusCode}`);
  assert(ciCount() === 0, `CI-005 expected zero rows after a bad-value partial-invalid payload, got ${ciCount()}`);

  // CI-006 趋势计算：空腹血糖 6/1=5.5、8/20=6.2、10/3=6.8（乱序录入，接口内部必须自己排序）
  await ciApi("/api/checkup-indicators", { method: "POST", body: { measuredDate: "2026-08-20", items: [{ name: "空腹血糖", value: 6.2, unit: "mmol/L" }] } });
  await ciApi("/api/checkup-indicators", { method: "POST", body: { measuredDate: "2026-10-03", items: [{ name: "空腹血糖", value: 6.8, unit: "mmol/L" }] } });
  await ciApi("/api/checkup-indicators", { method: "POST", body: { measuredDate: "2026-06-01", items: [{ name: "空腹血糖", value: 5.5, unit: "mmol/L" }] } });
  const glucose = await ciIndicatorOf("空腹血糖");
  assert(glucose.latest.value === 6.8 && glucose.latest.measuredDate === "2026-10-03", `CI-006 expected latest 6.8 @2026-10-03, got ${glucose.latest.value} @${glucose.latest.measuredDate}`);
  assert(glucose.previous.value === 6.2 && glucose.previous.measuredDate === "2026-08-20", `CI-006 expected previous 6.2 @2026-08-20, got ${glucose.previous?.value} @${glucose.previous?.measuredDate}`);
  assert(glucose.delta === 0.6 && glucose.direction === "up", `CI-006 expected delta 0.6 up, got ${glucose.delta}/${glucose.direction}`);
  assert(glucose.unit === "mmol/L", `CI-006 expected unit from the latest record, got ${glucose.unit}`);
  assert(glucose.refLow === 3.9 && glucose.refHigh === 6.1 && glucose.outOfRange === true, `CI-006 expected 3.9-6.1 out of range, got ${glucose.refLow}-${glucose.refHigh}/${glucose.outOfRange}`);
  assert(
    glucose.history.map((item) => item.measuredDate).join(",") === "2026-06-01,2026-08-20,2026-10-03",
    `CI-006 expected history in ascending date order, got ${glucose.history.map((item) => item.measuredDate).join(",")}`
  );
  assert(Object.keys(glucose.history[0]).sort().join(",") === "id,measuredDate,value", `CI-006 unexpected history shape: ${Object.keys(glucose.history[0]).join(",")}`);
  // 与 SQL 原始行对照：history / latest / previous 的 id 必须一一对应，且数值来自真实行
  const glucoseRows = ciRowsOf("空腹血糖");
  assert(glucoseRows.length === 3, `CI-006 expected 3 raw glucose rows, got ${glucoseRows.length}`);
  assert(glucoseRows[0].value === 5.5 && glucoseRows[1].value === 6.2 && glucoseRows[2].value === 6.8, `CI-006 unexpected raw values ${glucoseRows.map((row) => row.value).join(",")}`);
  assert(glucose.history.map((item) => item.id).join(",") === glucoseRows.map((row) => row.id).join(","), "CI-006 expected history ids to match the raw rows in ascending order");
  assert(glucose.latest.id === glucoseRows[2].id && glucose.previous.id === glucoseRows[1].id, "CI-006 expected latest/previous ids to match the 3rd/2nd raw rows");

  // CI-007 边界：delta = 0 → flat；只有一个点 → previous/delta 为 null 且 flat；12 条只回最近 10 条
  await ciApi("/api/checkup-indicators", { method: "POST", body: { measuredDate: "2026-07-01", items: [{ name: "同值指标", value: 1.0, unit: "u" }] } });
  await ciApi("/api/checkup-indicators", { method: "POST", body: { measuredDate: "2026-08-01", items: [{ name: "同值指标", value: 1.0, unit: "u" }] } });
  const flatIndicator = await ciIndicatorOf("同值指标");
  assert(flatIndicator.delta === 0 && flatIndicator.direction === "flat", `CI-007 expected delta 0 flat, got ${flatIndicator.delta}/${flatIndicator.direction}`);

  await ciApi("/api/checkup-indicators", { method: "POST", body: { measuredDate: "2026-09-09", items: [{ name: "单点指标", value: 7.7 }] } });
  const single = await ciIndicatorOf("单点指标");
  assert(single.latest.value === 7.7 && single.previous === null && single.delta === null && single.direction === "flat", `CI-007 expected a single point to have no previous/delta, got ${JSON.stringify({ previous: single.previous, delta: single.delta, direction: single.direction })}`);
  assert(single.unit === null && single.latest.unit === null, `CI-007 expected a missing unit to stay null, got ${single.unit}`);
  assert(single.history.length === 1, `CI-007 expected one history entry for a single point, got ${single.history.length}`);

  // 同一天两条：后插入的那条 created_at 更早，latest 必须取 created_at 更新的那条（而不是插入顺序/rowid）
  const sameDayDb = new DatabaseSync(smokeDbPath);
  const insertSameDay = sameDayDb.prepare(
    `INSERT INTO checkup_indicators (id, elder_id, name, value, unit, measured_date, note, created_by, created_at)
     VALUES (?, 'user-ci-elder', '同日指标', ?, 'u', '2026-05-01', NULL, 'user-ci-caregiver', ?)`
  );
  insertSameDay.run("ind-sameday-newer", 1.1, "2026-05-01T10:00:00.000Z");
  insertSameDay.run("ind-sameday-older", 2.2, "2026-05-01T09:00:00.000Z");
  sameDayDb.close();
  const sameDay = await ciIndicatorOf("同日指标");
  assert(sameDay.latest.id === "ind-sameday-newer" && sameDay.latest.value === 1.1, `CI-007 expected the newest created_at to win on the same day, got ${sameDay.latest.id}/${sameDay.latest.value}`);
  assert(sameDay.previous === null && sameDay.history.length === 2 && sameDay.history[0].id === "ind-sameday-older", `CI-007 expected same-day rows to land in history without a previous, got ${JSON.stringify(sameDay.history)}`);

  for (let i = 1; i <= 12; i += 1) {
    await ciApi("/api/checkup-indicators", { method: "POST", body: { measuredDate: `2026-01-${String(i).padStart(2, "0")}`, items: [{ name: "多点指标", value: i }] } });
  }
  const many = await ciIndicatorOf("多点指标");
  assert(many.history.length === 10, `CI-007 expected history to cap at 10, got ${many.history.length}`);
  assert(many.history[0].measuredDate === "2026-01-03" && many.history[9].measuredDate === "2026-01-12", `CI-007 expected the most recent 10 days, got ${many.history[0].measuredDate}..${many.history[9].measuredDate}`);
  assert(
    many.history.every((item, index) => index === 0 || many.history[index - 1].measuredDate < item.measuredDate),
    "CI-007 expected the capped history to stay in ascending order"
  );
  assert(many.latest.value === 12 && many.previous.value === 11 && many.delta === 1, `CI-007 expected latest 12 / previous 11 / delta 1, got ${many.latest.value}/${many.previous.value}/${many.delta}`);

  // CI-008 参考范围：仅上限、仅下限、未知指标名一律 null（不瞎判）
  await ciApi("/api/checkup-indicators", { method: "POST", body: { measuredDate: "2026-03-01", items: [{ name: "总胆固醇", value: 5.0, unit: "mmol/L" }] } });
  const cholOk = await ciIndicatorOf("总胆固醇");
  assert(cholOk.refLow === null && cholOk.refHigh === 5.2 && cholOk.outOfRange === false, `CI-008 expected 总胆固醇 5.0 to be in range with only an upper bound, got ${cholOk.refLow}/${cholOk.refHigh}/${cholOk.outOfRange}`);
  await ciApi("/api/checkup-indicators", { method: "POST", body: { measuredDate: "2026-04-01", items: [{ name: "总胆固醇", value: 5.5, unit: "mmol/L" }] } });
  const cholHigh = await ciIndicatorOf("总胆固醇");
  assert(cholHigh.outOfRange === true && cholHigh.latest.value === 5.5, `CI-008 expected 总胆固醇 5.5 to be out of range, got ${cholHigh.outOfRange}`);

  await ciApi("/api/checkup-indicators", { method: "POST", body: { measuredDate: "2026-03-01", items: [{ name: "高密度脂蛋白胆固醇", value: 0.8, unit: "mmol/L" }] } });
  const hdl = await ciIndicatorOf("高密度脂蛋白胆固醇");
  assert(hdl.refLow === 1.0 && hdl.refHigh === null && hdl.outOfRange === true, `CI-008 expected 高密度脂蛋白胆固醇 0.8 to be below the lower bound, got ${hdl.refLow}/${hdl.refHigh}/${hdl.outOfRange}`);

  await ciApi("/api/checkup-indicators", { method: "POST", body: { measuredDate: "2026-03-01", items: [{ name: "某怪指标", value: 99, unit: "u" }] } });
  const unknown = await ciIndicatorOf("某怪指标");
  assert(unknown.refLow === null && unknown.refHigh === null && unknown.outOfRange === null, `CI-008 expected an unknown indicator to have no judgement at all, got ${unknown.refLow}/${unknown.refHigh}/${unknown.outOfRange}`);

  // CI-009 删除：成功 / 行消失 / 再删 404 / 不存在的 id 404 / 缺 id 404
  await ciApi("/api/checkup-indicators", { method: "POST", body: { measuredDate: "2026-12-01", items: [{ name: "待删指标", value: 1 }] } });
  const deleteId = ciRowsOf("待删指标")[0].id;
  assert((await ciApi(`/api/checkup-indicators/${deleteId}`, { method: "DELETE" })).ok === true, "CI-009 expected the indicator delete to succeed");
  assert(ciRowsOf("待删指标").length === 0, "CI-009 expected the deleted row to be gone from the database");
  assert(!(await ciApi("/api/checkup-indicators")).indicators.some((item) => item.name === "待删指标"), "CI-009 expected the deleted indicator to disappear from the trend");
  assert((await ciRaw(`/api/checkup-indicators/${deleteId}`, { method: "DELETE" })).statusCode === 404, "CI-009 expected 404 when deleting the same indicator twice");
  assert((await ciRaw("/api/checkup-indicators/ind_not_exists", { method: "DELETE" })).statusCode === 404, "CI-009 expected 404 for an unknown indicator id");
  assert((await ciRaw("/api/checkup-indicators", { method: "DELETE" })).statusCode === 404, "CI-009 expected 404 for DELETE without an id");

  // CI-010 排序：outOfRange === true 的排前面，其余按指标名升序
  await ciApi("/api/checkup-indicators", { method: "POST", body: { measuredDate: "2026-02-01", items: [{ name: "血钾", value: 7.0, unit: "mmol/L" }] } });
  await ciApi("/api/checkup-indicators", { method: "POST", body: { measuredDate: "2026-02-01", items: [{ name: "血钠", value: 140, unit: "mmol/L" }] } });
  const sortedCi = (await ciApi("/api/checkup-indicators")).indicators;
  const flagged = sortedCi.map((item, index) => (item.outOfRange === true ? index : -1)).filter((index) => index >= 0);
  const unflagged = sortedCi.map((item, index) => (item.outOfRange === true ? -1 : index)).filter((index) => index >= 0);
  assert(flagged.length > 0 && unflagged.length > 0, "CI-010 expected both flagged and unflagged indicators in the list");
  assert(Math.max(...flagged) < Math.min(...unflagged), "CI-010 expected every out-of-range indicator to come before the rest");
  const sortedPos = (name) => sortedCi.findIndex((item) => item.name === name);
  assert(sortedPos("血钾") < sortedPos("某怪指标") && sortedPos("某怪指标") < sortedPos("血钠"), `CI-010 expected unflagged indicators sorted by name, got ${sortedCi.map((item) => item.name).join("/")}`);
  assert(sortedCi[0].outOfRange === true, "CI-010 expected the very first indicator to be an out-of-range one");

  /* ================= 天气地区解析（WT-001…WT-002） =================
     背景：Open-Meteo 的地理编码对中文后缀敏感，「北京市」查不到、「北京」才查得到。
     家属按日常习惯填「北京市朝阳区」时，只按原样查会查不到，然后静默降级成
     兜底文案——那句「天气整体平稳」是按城市名猜的硬编码，界面上完全看不出区别。 */

  // WT-001 去掉「市/省」后缀的候选必须被包含，「北京市」要能退到「北京」
  const wtCandidates = weatherGeocodeCandidates({ city: "北京市", district: "朝阳区" });
  assert(wtCandidates.includes("北京市朝阳区"), `WT-001 expected the full name to be tried first, got ${JSON.stringify(wtCandidates)}`);
  assert(wtCandidates.includes("北京市"), `WT-001 expected the raw city to be tried, got ${JSON.stringify(wtCandidates)}`);
  assert(wtCandidates.includes("北京"), `WT-001 expected the suffix-stripped city 北京 to be tried, got ${JSON.stringify(wtCandidates)}`);
  assert(wtCandidates[0] === "北京市朝阳区", `WT-001 expected the most specific name first, got ${wtCandidates[0]}`);
  assert(wtCandidates.indexOf("北京") > wtCandidates.indexOf("北京市"), "WT-001 expected the stripped name to be a later fallback than the raw one");

  // WT-002 绝不能用裸区名去查：Open-Meteo 会把「朝阳」解析到辽宁省朝阳市，
  // 那会变成另一个城市的天气——比查不到严重得多
  for (const district of ["朝阳区", "海淀区", "浦东新区", "天河区"]) {
    const list = weatherGeocodeCandidates({ city: "北京市", district });
    const bare = district.replace(/[区县市]$/, "");
    assert(!list.includes(district) || list.some((item) => item.startsWith("北京")), `WT-002 expected no district-only candidate for ${district}, got ${JSON.stringify(list)}`);
    assert(!list.includes(bare), `WT-002 expected the bare district name ${bare} to never be a candidate, got ${JSON.stringify(list)}`);
  }
  // 省市后缀、直辖市、空区县都要能正确生成候选
  assert(weatherGeocodeCandidates({ city: "广东省", district: "深圳市" }).includes("广东"), "WT-002 expected 广东省 to fall back to 广东");
  assert(weatherGeocodeCandidates({ city: "北京", district: "" }).join(",") === "北京", "WT-002 expected a district-less city to stay as-is");
  assert(weatherGeocodeCandidates({ city: "上海市", district: "" }).includes("上海"), "WT-002 expected 上海市 to fall back to 上海");

  /* ================= 拿不到数据时不许编（WT-003） =================
     背景：老人会相信应用说的话。原来天气拿不到时会按城市名硬编码猜一句
     「今天天气整体平稳」（上海/杭州/苏州/南京 则一律「可能有雨」），跟当天真实
     天气毫无关系，而且界面上和实时数据长得一模一样。 */

  // WT-003 兜底必须是「取不到」，不能是任何关于天气的具体断言
  const wtFallbackCities = [
    { city: "北京", district: "海淀区" },
    { city: "上海", district: "浦东新区" },
    { city: "杭州", district: "" },
    { city: "苏州", district: "" },
    { city: "南京", district: "" },
    { city: "广州", district: "天河区" },
  ];
  for (const place of wtFallbackCities) {
    const care = buildFallbackWeatherCare(place);
    const label = `${place.city}${place.district}`;
    assert(care.source === "local-fallback", `WT-003 expected the fallback source for ${label}, got ${care.source}`);
    assert(care.severe === false, `WT-003 expected the fallback to not claim severity for ${label}`);
    // 只禁用「对当天天气的具体断言」。注意「下雨就带伞」这种条件建议是允许的
    // ——它没有声称今天会下雨，只是告诉老人该怎么判断。
    for (const claim of ["整体平稳", "可能有雨", "晴朗", "多云", "今天有雨", "℃"]) {
      assert(!care.text.includes(claim), `WT-003 expected the fallback for ${label} to never assert "${claim}", got: ${care.text}`);
    }
    assert(care.text.includes("取不到"), `WT-003 expected the fallback for ${label} to say the data is unavailable, got: ${care.text}`);
    assert(care.text.includes(label), `WT-003 expected the fallback for ${label} to still name the location, got: ${care.text}`);
  }

  /* ================= 安全与健壮性回归（FX-001…FX-010） =================
     这些用例对应本轮独立审查发现的问题。每条都必须在修复被打回时失败，
     所以断言尽量落到「数据库里的实际行数」而不是接口返回的 ok。 */

  const fxDb = new DatabaseSync(smokeDbPath);
  const fxHash = fxDb.prepare("SELECT password_hash FROM users WHERE id = ?").get("user-caregiver").password_hash;
  const fxInsertUser = fxDb.prepare("INSERT OR IGNORE INTO users (id, username, password_hash, display_name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)");
  const fxNow = new Date().toISOString();
  fxInsertUser.run("user-fx-caregiver", "fx-caregiver", fxHash, "回归家属", "caregiver", fxNow);
  fxInsertUser.run("user-fx-elder", "fx-elder", fxHash, "回归长辈甲", "elder", fxNow);
  fxInsertUser.run("user-fx-elder2", "fx-elder2", fxHash, "回归长辈乙", "elder", fxNow);
  fxInsertUser.run("user-fx-orphan", "fx-orphan", fxHash, "回归孤儿长辈", "elder", fxNow);
  fxDb.prepare("INSERT OR IGNORE INTO family_links (id, caregiver_id, elder_id, relation) VALUES (?, ?, ?, ?)").run("link-fx-1", "user-fx-caregiver", "user-fx-elder", "女儿");
  fxDb.prepare("INSERT OR IGNORE INTO family_links (id, caregiver_id, elder_id, relation) VALUES (?, ?, ?, ?)").run("link-fx-2", "user-fx-caregiver", "user-fx-elder2", "女儿");
  fxDb.close();

  const fxLogin = await callApp("/api/auth/login", { method: "POST", body: { username: "fx-caregiver", password: "demo1234" } });
  assert(fxLogin.statusCode === 200, `FX-000 expected the regression caregiver to log in, got ${fxLogin.statusCode}`);
  const fxCookie = fxLogin.headers["set-cookie"].split(";")[0];
  const fxRaw = (path, options = {}) => callApp(path, { ...options, cookie: fxCookie });
  const fxApi = async (path, options = {}) => {
    const res = await fxRaw(path, options);
    const data = JSON.parse(res.body || "{}");
    assert(res.statusCode >= 200 && res.statusCode < 300, `FX expected 2xx for ${options.method || "GET"} ${path}, got ${res.statusCode}: ${data.message || ""}`);
    return data;
  };
  const fxSql = (sql, ...args) => new DatabaseSync(smokeDbPath).prepare(sql).get(...args);
  const fxAll = (sql, ...args) => new DatabaseSync(smokeDbPath).prepare(sql).all(...args);
  const fxSwitch = async (elderId) => fxApi("/api/elders/switch", { method: "POST", body: { elderId } });
  const fxStockOf = (elderId, name) => fxSql("SELECT * FROM medication_stock WHERE elder_id = ? AND medicine_name = ?", elderId, name);
  const fxToday = todayDate();

  // FX-001 确认吃药必须幂等：老人手机上双击、网络重试都不能重复扣库存
  await fxSwitch("user-fx-elder");
  await fxApi("/api/medications", { method: "POST", body: { medicineName: "回归二甲双胍", timeOfDay: "00:00" } });
  await fxApi("/api/medication-stock", { method: "POST", body: { medicineName: "回归二甲双胍", unitsRemaining: 10, unitsPerDose: 2 } });
  const fxLog = fxSql("SELECT ml.id FROM medication_logs ml JOIN medication_schedules ms ON ms.id = ml.schedule_id WHERE ml.elder_id = ? AND ms.medicine_name = ?", "user-fx-elder", "回归二甲双胍");
  assert(Boolean(fxLog), "FX-001 expected a medication log to be created for today");
  for (let i = 0; i < 3; i += 1) {
    await fxApi(`/api/medications/${fxLog.id}/complete`, { method: "POST" });
  }
  assert(fxStockOf("user-fx-elder", "回归二甲双胍").units_remaining === 8, `FX-001 expected stock 10 -> 8 after triple confirmation, got ${fxStockOf("user-fx-elder", "回归二甲双胍").units_remaining}`);

  // FX-002 任务日期必须校验：脏值会让任务从 dashboard 和提醒里永久消失
  const fxBadDate = await fxRaw("/api/tasks", { method: "POST", body: { title: "脏日期任务", dueDate: "abc", dueTime: "09:00" } });
  assert(fxBadDate.statusCode === 400, `FX-002 expected 400 for dueDate "abc", got ${fxBadDate.statusCode}`);
  const fxBadDate2 = await fxRaw("/api/tasks", { method: "POST", body: { title: "脏日期任务", dueDate: "2026-02-31", dueTime: "09:00" } });
  assert(fxBadDate2.statusCode === 400, `FX-002 expected 400 for the non-existent date 2026-02-31, got ${fxBadDate2.statusCode}`);
  const fxGoodTask = await fxApi("/api/tasks", { method: "POST", body: { title: "正常日期任务", dueDate: "2026-11-01", dueTime: "09:00" } });
  const fxTaskPatch = await fxRaw(`/api/tasks/${fxGoodTask.id}`, { method: "POST", body: { dueDate: "垃圾日期" } });
  assert(fxTaskPatch.statusCode === 400, `FX-002 expected 400 when patching a task to a dirty date, got ${fxTaskPatch.statusCode}`);
  assert((await fxApi(`/api/tasks/${fxGoodTask.id}`, { method: "POST", body: { dueDate: "2026-11-02" } })).ok === true, "FX-002 expected a valid date patch to still succeed");

  // FX-003 血压时间戳必须可排序：脏值会顶掉真实「最新一条」并让口径不一致
  const fxBadBp = await fxRaw("/api/blood-pressure", { method: "POST", body: { systolic: 120, diastolic: 80, measuredAt: "9999999999" } });
  assert(fxBadBp.statusCode === 400, `FX-003 expected 400 for a dirty measuredAt, got ${fxBadBp.statusCode}`);
  assert((await fxApi("/api/blood-pressure", { method: "POST", body: { systolic: 126, diastolic: 82, measuredAt: "2026-10-10T08:30" } })).ok === true, "FX-003 expected the front-end datetime-local format to be accepted");

  // FX-004 孤儿长辈（无 family_links）的敏感告警绝不能发给无关家庭。
  // 回落的候选是「默认演示家属」user-caregiver —— 必须同时盯住它和另一个无关家庭，
  // 只查其中一个是查不到泄漏的（回落到默认账号而不是本测试的家属）。
  const fxWatched = ["user-caregiver", "user-fx-caregiver"];
  const fxCountNotifs = (userId) => fxSql("SELECT COUNT(*) AS count FROM notifications WHERE user_id = ?", userId).count;
  const fxNotifBefore = Object.fromEntries(fxWatched.map((id) => [id, fxCountNotifs(id)]));
  const fxOrphanLogin = await callApp("/api/auth/login", { method: "POST", body: { username: "fx-orphan", password: "demo1234" } });
  const fxOrphanCookie = fxOrphanLogin.headers["set-cookie"].split(";")[0];
  await callApp("/api/life-events", { method: "POST", cookie: fxOrphanCookie, body: { text: "今天胸口疼得厉害，很不舒服" } });
  for (const userId of fxWatched) {
    const after = fxCountNotifs(userId);
    assert(after === fxNotifBefore[userId], `FX-004 expected no cross-family notification for an orphan elder, but ${userId} went ${fxNotifBefore[userId]} -> ${after}`);
    assert(
      fxSql("SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND body LIKE ?", userId, "%回归孤儿长辈%").count === 0,
      `FX-004 expected ${userId} to never receive the orphan elder's alert text`
    );
  }
  assert(fxSql("SELECT COUNT(*) AS count FROM alerts WHERE elder_id = ?", "user-fx-orphan").count > 0, "FX-004 expected the orphan elder's alert to still be recorded");

  // FX-005 单个长辈的数据异常不能中断整轮 cron：否则排在它后面的长辈会静默地收不到漏服提醒
  fxInsertSchedulesFor("[FX-005]", smokeDbPath, "user-fx-elder", "user-fx-elder2");
  const fxDb2 = new DatabaseSync(smokeDbPath);
  fxDb2
    .prepare("INSERT INTO notification_channels (id, owner_id, channel_type, config_json, enabled, updated_at) VALUES (?, ?, ?, ?, 1, ?) ON CONFLICT(owner_id, channel_type) DO UPDATE SET config_json = excluded.config_json, enabled = 1")
    .run("chan-fx-broken", "user-fx-caregiver", "feishu", "{not-json", new Date().toISOString());
  fxDb2.prepare("DELETE FROM alerts WHERE elder_id IN ('user-fx-elder', 'user-fx-elder2')").run();
  fxDb2.close();
  const fxScan = await callApp("/api/cron/reminders");
  const fxScanData = JSON.parse(fxScan.body || "{}");
  assert(fxScan.statusCode === 200, `FX-005 expected the scan to survive one elder's bad data, got ${fxScan.statusCode}`);
  assert(Array.isArray(fxScanData.failedElders) && fxScanData.failedElders.includes("user-fx-elder"), `FX-005 expected failedElders to report the broken elder, got ${JSON.stringify(fxScanData.failedElders)}`);
  assert(fxSql("SELECT COUNT(*) AS count FROM alerts WHERE elder_id = ? AND type = 'medication'", "user-fx-elder2").count > 0, "FX-005 expected the elder AFTER the failing one to still get its reminder alert");
  // 关掉故意损坏的飞书配置，后面的用例走正常通知路径
  const fxDb2b = new DatabaseSync(smokeDbPath);
  fxDb2b.prepare("UPDATE notification_channels SET enabled = 0 WHERE owner_id = ?").run("user-fx-caregiver");
  fxDb2b.close();

  // FX-006 删除用药计划必须连带清掉指向它的告警，否则告警中心会留下点进去已不存在的幽灵条目
  await fxSwitch("user-fx-elder");
  await fxApi("/api/medications", { method: "POST", body: { medicineName: "回归幽灵药", timeOfDay: "00:00" } });
  await callApp("/api/cron/reminders");
  const fxGhostSched = fxSql("SELECT id FROM medication_schedules WHERE elder_id = ? AND medicine_name = ?", "user-fx-elder", "回归幽灵药");
  assert(Boolean(fxGhostSched), "FX-006 expected the fresh plan to exist");
  const fxGhostLog = fxSql("SELECT id FROM medication_logs WHERE schedule_id = ?", fxGhostSched.id);
  assert(Boolean(fxGhostLog), "FX-006 expected a medication log for the fresh plan");
  assert(fxSql("SELECT COUNT(*) AS count FROM alerts WHERE ref_id = ? AND type = 'medication'", fxGhostLog.id).count === 1, "FX-006 expected a reminder alert pointing at the plan's log");
  await fxApi(`/api/medications/${fxGhostSched.id}`, { method: "DELETE" });
  assert(fxSql("SELECT COUNT(*) AS count FROM alerts WHERE ref_id = ?", fxGhostLog.id).count === 0, "FX-006 expected the ghost alert to be removed together with the plan");

  // FX-007 任务到点提醒的 ref_id 必须带日期：只带 task.id 会让任务提醒过一次后永不再提醒
  const fxDueTask = await fxApi("/api/tasks", { method: "POST", body: { title: "到点任务", dueDate: fxToday, dueTime: "00:00" } });
  await callApp("/api/cron/reminders");
  const fxTaskAlert = fxSql("SELECT ref_id FROM alerts WHERE type = 'task_due' AND elder_id = ?", "user-fx-elder");
  assert(fxTaskAlert && fxTaskAlert.ref_id === `${fxDueTask.id}-${fxToday}`, `FX-007 expected ref_id "<taskId>-<today>", got ${fxTaskAlert && fxTaskAlert.ref_id}`);
  await callApp("/api/cron/reminders");
  assert(fxSql("SELECT COUNT(*) AS count FROM alerts WHERE type = 'task_due' AND elder_id = ?", "user-fx-elder").count === 1, "FX-007 expected the same task to be reminded only once per day");

  // FX-008 登录限流不能被伪造的 X-Forwarded-For 绕过（来源不是回环时必须忽略该头）
  let fxLocked = false;
  for (let i = 0; i < 8; i += 1) {
    const res = await callApp("/api/auth/login", {
      method: "POST",
      body: { username: "fx-brute-force", password: "wrong" },
      remote: "203.0.113.9",
      headers: { "x-forwarded-for": `10.0.0.${i}` },
    });
    if (res.statusCode === 429) fxLocked = true;
  }
  assert(fxLocked, "FX-008 expected rotating X-Forwarded-For values to no longer bypass the login rate limit");

  // FX-009 未配置 CRON_SECRET 时，非回环来源伪造 vercel-cron UA 不得触发扫描
  const fxCronSpoof = await callApp("/api/cron/reminders", { remote: "203.0.113.9", headers: { "user-agent": "vercel-cron/1.0" } });
  assert(fxCronSpoof.statusCode === 403, `FX-009 expected 403 for a spoofed vercel-cron UA from a non-loopback peer, got ${fxCronSpoof.statusCode}`);
  const fxDb3 = new DatabaseSync(smokeDbPath);
  fxDb3.prepare("UPDATE notification_channels SET enabled = 0 WHERE owner_id = ?").run("user-fx-caregiver");
  fxDb3.close();
  assert((await callApp("/api/cron/reminders")).statusCode === 200, "FX-009 expected the loopback cron call to still work");

  // FX-010 推送订阅不能被别人改绑：否则拿到 endpoint 就能让对方的手机再也收不到推送
  const fxEndpoint = "https://push.example.com/v2/fx-owner";
  await callApp("/api/push/subscribe", { method: "POST", cookie: fxCookie, body: { endpoint: fxEndpoint, keys: { p256dh: "AAAA", auth: "BBBB" } } });
  const fxOrphanSub = await callApp("/api/push/subscribe", { method: "POST", cookie: fxOrphanCookie, body: { endpoint: fxEndpoint, keys: { p256dh: "ZZZZ", auth: "YYYY" } } });
  assert(fxOrphanSub.statusCode >= 200 && fxOrphanSub.statusCode < 300, `FX-010 expected the hijack attempt to be a no-op rather than an error, got ${fxOrphanSub.statusCode}`);
  const fxSubOwner = fxSql("SELECT user_id, p256dh FROM push_subscriptions WHERE endpoint = ?", fxEndpoint);
  assert(fxSubOwner.user_id === "user-fx-caregiver", `FX-010 expected the subscription to stay owned by its original user, got ${fxSubOwner.user_id}`);
  assert(fxSubOwner.p256dh === "AAAA", "FX-010 expected the original keys to survive a foreign subscribe attempt");

  // FX-011 通知已读接口的 body 也要走统一校验（非法 JSON 必须 400，而不是静默 200）
  const fxBadJson = await callApp("/api/notifications/read", { method: "POST", cookie: fxCookie, headers: { "content-type": "application/json" }, body: null });
  assert(fxBadJson.statusCode === 200, `FX-011 expected an empty body to still be accepted, got ${fxBadJson.statusCode}`);
  const fxReallyBadJson = await callApp("/api/notifications/read", { method: "POST", cookie: fxCookie });
  assert(fxReallyBadJson.statusCode === 200, `FX-011 expected a bodyless mark-all-read to succeed, got ${fxReallyBadJson.statusCode}`);

  /* ================= 邀请家属（IV-001…IV-011） =================
     覆盖真实邀请流程：生成（token 只存哈希）、列表（绝不泄露 token）、
     接受（一次性 / 输入校验 / 大小写唯一 / 并发安全）、跨家庭隔离与过期拒绝。
     建两个互不相干的家庭，用于验证「别家的邀请」既看不到也删不掉。 */

  const ivDb = new DatabaseSync(smokeDbPath);
  const ivPasswordHash = ivDb.prepare("SELECT password_hash FROM users WHERE id = ?").get("user-caregiver").password_hash;
  const ivNow = new Date().toISOString();
  const ivInsertUser = ivDb.prepare("INSERT OR IGNORE INTO users (id, username, password_hash, display_name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)");
  ivInsertUser.run("user-iv-caregiver-a", "iv-caregiver-a", ivPasswordHash, "邀请家属甲", "caregiver", ivNow);
  ivInsertUser.run("user-iv-caregiver-b", "iv-caregiver-b", ivPasswordHash, "邀请家属乙", "caregiver", ivNow);
  ivInsertUser.run("user-iv-elder-a", "iv-elder-a", ivPasswordHash, "邀请长辈甲", "elder", ivNow);
  ivInsertUser.run("user-iv-elder-b", "iv-elder-b", ivPasswordHash, "邀请长辈乙", "elder", ivNow);
  ivDb.prepare("INSERT OR IGNORE INTO family_links (id, caregiver_id, elder_id, relation) VALUES (?, ?, ?, ?)").run("link-iv-a", "user-iv-caregiver-a", "user-iv-elder-a", "女儿");
  ivDb.prepare("INSERT OR IGNORE INTO family_links (id, caregiver_id, elder_id, relation) VALUES (?, ?, ?, ?)").run("link-iv-b", "user-iv-caregiver-b", "user-iv-elder-b", "儿子");
  ivDb.close();

  const ivSql = (sql, ...args) => new DatabaseSync(smokeDbPath).prepare(sql).get(...args);
  const ivSha256 = (value) => createHash("sha256").update(String(value)).digest("hex");

  const ivLoginA = await callApp("/api/auth/login", { method: "POST", body: { username: "iv-caregiver-a", password: "demo1234" } });
  assert(ivLoginA.statusCode === 200, `IV-000 expected caregiver A to log in, got ${ivLoginA.statusCode}`);
  const ivCookieA = ivLoginA.headers["set-cookie"].split(";")[0];
  const ivLoginB = await callApp("/api/auth/login", { method: "POST", body: { username: "iv-caregiver-b", password: "demo1234" } });
  assert(ivLoginB.statusCode === 200, `IV-000 expected caregiver B to log in, got ${ivLoginB.statusCode}`);
  const ivCookieB = ivLoginB.headers["set-cookie"].split(";")[0];
  const ivLoginElderA = await callApp("/api/auth/login", { method: "POST", body: { username: "iv-elder-a", password: "demo1234" } });
  assert(ivLoginElderA.statusCode === 200, `IV-000 expected elder A to log in, got ${ivLoginElderA.statusCode}`);
  const ivCookieElderA = ivLoginElderA.headers["set-cookie"].split(";")[0];

  const ivRawA = (path, options = {}) => callApp(path, { ...options, cookie: ivCookieA });
  // 生成邀请时固定带一个自定义 Host，用来验证 url 用的是请求 origin 而不是写死的本机地址
  const ivCreateInvite = async (relation = "儿子") => {
    const res = await ivRawA("/api/invites", { method: "POST", headers: { host: "techguard.example.com" }, body: { relation } });
    return { res, data: JSON.parse(res.body || "{}") };
  };

  // IV-001 权限：未登录 401；长辈角色 403
  assert((await callApp("/api/invites", { method: "POST", body: { relation: "儿子" } })).statusCode === 401, "IV-001 expected 401 for anonymous POST /api/invites");
  assert((await callApp("/api/invites")).statusCode === 401, "IV-001 expected 401 for anonymous GET /api/invites");
  assert((await callApp("/api/invites/invite_any", { method: "DELETE" })).statusCode === 401, "IV-001 expected 401 for anonymous DELETE /api/invites/:id");
  assert((await callApp("/api/invites", { method: "POST", cookie: ivCookieElderA, body: { relation: "儿子" } })).statusCode === 403, "IV-001 expected 403 for elder POST /api/invites");
  assert((await callApp("/api/invites", { cookie: ivCookieElderA })).statusCode === 403, "IV-001 expected 403 for elder GET /api/invites");
  assert((await callApp("/api/invites/invite_any", { method: "DELETE", cookie: ivCookieElderA })).statusCode === 403, "IV-001 expected 403 for elder DELETE /api/invites/:id");

  // IV-002 生成成功：token 为 64 位 hex、url 用请求 origin，库里存的是哈希而非明文
  const ivB = await ivCreateInvite("儿子");
  assert(ivB.res.statusCode === 200, `IV-002 expected 200 creating an invite, got ${ivB.res.statusCode}: ${ivB.res.body}`);
  const ivToken1 = ivB.data.invite.token;
  assert(/^[0-9a-f]{64}$/.test(ivToken1), `IV-002 expected a 32-byte hex token, got ${ivToken1}`);
  assert(ivB.data.invite.url === `http://techguard.example.com/?invite=${ivToken1}`, `IV-002 expected the url to use the request origin, got ${ivB.data.invite.url}`);
  const ivRow1 = ivSql("SELECT * FROM elder_invites WHERE id = ?", ivB.data.invite.id);
  assert(ivRow1.token_hash === ivSha256(ivToken1), "IV-002 expected token_hash to be sha256(token)");
  assert(ivRow1.token_hash !== ivToken1, "IV-002 expected the stored value to never equal the plaintext token");
  assert(ivRow1.elder_id === "user-iv-elder-a" && ivRow1.relation === "儿子", "IV-002 expected the invite bound to the active elder with the given relation");

  // IV-003 列表绝不泄露 token / token_hash
  const ivListA = await ivRawA("/api/invites");
  assert(ivListA.statusCode === 200, `IV-003 expected 200 listing invites, got ${ivListA.statusCode}`);
  assert(!ivListA.body.includes(ivToken1), "IV-003 expected GET /api/invites to never contain the plaintext token");
  assert(!ivListA.body.includes(ivSha256(ivToken1)), "IV-003 expected GET /api/invites to never contain the token hash");
  assert(JSON.parse(ivListA.body).invites.some((item) => item.id === ivB.data.invite.id && item.status === "pending"), "IV-003 expected the fresh invite to be listed as pending");

  // IV-004 接受成功：建出 caregiver、关联正确、Set-Cookie 可直接访问 dashboard 且能看到该长辈
  const ivLookup = await callApp(`/api/invites/lookup?token=${ivToken1}`);
  assert(ivLookup.statusCode === 200, `IV-004 expected 200 for lookup, got ${ivLookup.statusCode}`);
  const ivLookupData = JSON.parse(ivLookup.body);
  assert(ivLookupData.invite.elderName === "邀请长辈甲" && ivLookupData.invite.relation === "儿子", "IV-004 expected lookup to expose elderName and relation");

  const ivAccept = await callApp("/api/invites/accept", {
    method: "POST",
    body: { token: ivToken1, username: "iv-invitee-1", password: "invitepass1", displayName: "被邀家属一" },
  });
  assert(ivAccept.statusCode === 200, `IV-004 expected accept to succeed, got ${ivAccept.statusCode}: ${ivAccept.body}`);
  const ivSetCookie = ivAccept.headers["set-cookie"] || "";
  assert(ivSetCookie.startsWith("tg_session="), `IV-004 expected a tg_session cookie, got ${ivSetCookie}`);
  const ivNewCookie = ivSetCookie.split(";")[0];
  const ivDash = await callApp("/api/dashboard", { cookie: ivNewCookie });
  assert(ivDash.statusCode === 200, `IV-004 expected the returned cookie to open /api/dashboard, got ${ivDash.statusCode}`);
  const ivNewUser = ivSql("SELECT * FROM users WHERE username = ?", "iv-invitee-1");
  assert(ivNewUser && ivNewUser.role === "caregiver", "IV-004 expected the invitee to be created as a caregiver");
  const ivLink = ivSql("SELECT * FROM family_links WHERE caregiver_id = ? AND elder_id = ?", ivNewUser.id, "user-iv-elder-a");
  assert(ivLink && ivLink.relation === "儿子", "IV-004 expected a family_link with the invited relation");
  assert(JSON.parse(ivDash.body).elders.some((item) => item.id === "user-iv-elder-a"), "IV-004 expected the new caregiver to see the inviting elder");
  const ivUsedRow = ivSql("SELECT * FROM elder_invites WHERE id = ?", ivB.data.invite.id);
  assert(Boolean(ivUsedRow.used_at) && ivUsedRow.used_by === ivNewUser.id, "IV-004 expected the invite to be marked used by the new user");

  // IV-005 一次性：同一个 token 第二次 accept 必须失败
  const ivReuse = await callApp("/api/invites/accept", {
    method: "POST",
    body: { token: ivToken1, username: "iv-invitee-2", password: "invitepass2", displayName: "重复接受" },
  });
  assert(ivReuse.statusCode === 400, `IV-005 expected 400 reusing an accepted token, got ${ivReuse.statusCode}`);
  assert(!ivSql("SELECT id FROM users WHERE username = ?", "iv-invitee-2"), "IV-005 expected no user to be created from the reused token");

  // IV-006 过期：直接把 expires_at 改到过去，lookup 与 accept 都必须拒绝
  const ivExp = await ivCreateInvite("女儿");
  const ivExpDb = new DatabaseSync(smokeDbPath);
  ivExpDb.prepare("UPDATE elder_invites SET expires_at = ? WHERE id = ?").run(new Date(Date.now() - 60_000).toISOString(), ivExp.data.invite.id);
  ivExpDb.close();
  assert((await callApp(`/api/invites/lookup?token=${ivExp.data.invite.token}`)).statusCode === 400, "IV-006 expected 400 looking up an expired invite");
  const ivAcceptExpired = await callApp("/api/invites/accept", {
    method: "POST",
    body: { token: ivExp.data.invite.token, username: "iv-invitee-3", password: "invitepass3", displayName: "过期接受" },
  });
  assert(ivAcceptExpired.statusCode === 400, `IV-006 expected 400 accepting an expired invite, got ${ivAcceptExpired.statusCode}`);

  // IV-007 不存在的 token：lookup 与 accept 都必须失败
  const ivMissingToken = "f".repeat(64);
  assert((await callApp(`/api/invites/lookup?token=${ivMissingToken}`)).statusCode === 400, "IV-007 expected 400 looking up an unknown token");
  assert(
    (await callApp("/api/invites/accept", { method: "POST", body: { token: ivMissingToken, username: "iv-invitee-4", password: "invitepass4", displayName: "未知" } })).statusCode === 400,
    "IV-007 expected 400 accepting an unknown token"
  );

  // IV-008 输入校验：用户名被占用 / 非法字符 / 密码太短 / displayName 为空，全部 400
  const ivBad = await ivCreateInvite("亲属");
  const ivAcceptBody = (patch) => ({ token: ivBad.data.invite.token, username: "iv-valid-name", password: "validpass1", displayName: "正常姓名", ...patch });
  for (const [label, patch] of [
    ["被占用的用户名", { username: "iv-invitee-1" }],
    ["含非法字符", { username: "bad name!" }],
    ["密码太短", { password: "short" }],
    ["姓名为空", { displayName: "   " }],
  ]) {
    const res = await callApp("/api/invites/accept", { method: "POST", body: ivAcceptBody(patch) });
    assert(res.statusCode === 400, `IV-008 expected 400 for ${label}, got ${res.statusCode}: ${res.body}`);
  }
  assert(!ivSql("SELECT id FROM users WHERE username = ?", "iv-valid-name"), "IV-008 expected invalid attempts to never create a user");

  // IV-009 跨家庭隔离：家属 B 不能删 / 看不到家属 A 的邀请
  const ivCross = await ivCreateInvite("侄子");
  const ivDelByB = await callApp(`/api/invites/${ivCross.data.invite.id}`, { method: "DELETE", cookie: ivCookieB });
  assert(ivDelByB.statusCode === 404, `IV-009 expected 404 deleting another family's invite, got ${ivDelByB.statusCode}`);
  const ivListB = JSON.parse((await callApp("/api/invites", { cookie: ivCookieB })).body);
  assert(!ivListB.invites.some((item) => item.id === ivCross.data.invite.id), "IV-009 expected caregiver B's list to never include caregiver A's invite");
  assert(Boolean(ivSql("SELECT id FROM elder_invites WHERE id = ?", ivCross.data.invite.id)), "IV-009 expected the cross-family delete to leave the invite intact");
  assert((await ivRawA(`/api/invites/${ivCross.data.invite.id}`, { method: "DELETE" })).statusCode === 200, "IV-009 expected the owner to be able to delete its own invite");

  // IV-010 并发接受只能成功一次：恰好一个 200、一个 400，且库里只建出一个用户
  const ivRace = await ivCreateInvite("外甥");
  const ivRaceResults = await Promise.all([
    callApp("/api/invites/accept", { method: "POST", body: { token: ivRace.data.invite.token, username: "iv-race-a", password: "racepass1", displayName: "并发甲" } }),
    callApp("/api/invites/accept", { method: "POST", body: { token: ivRace.data.invite.token, username: "iv-race-b", password: "racepass2", displayName: "并发乙" } }),
  ]);
  const ivRaceStatuses = ivRaceResults.map((res) => res.statusCode).sort((a, b) => a - b);
  assert(ivRaceStatuses[0] === 200 && ivRaceStatuses[1] === 400, `IV-010 expected exactly one 200 and one 400, got ${JSON.stringify(ivRaceStatuses)}`);
  assert(ivSql("SELECT COUNT(*) AS count FROM users WHERE username IN ('iv-race-a', 'iv-race-b')").count === 1, "IV-010 expected exactly one user from the race");

  // IV-011 大小写用户名不能建出两个账号
  const ivCase1 = await ivCreateInvite("堂亲");
  const ivCaseAccept1 = await callApp("/api/invites/accept", { method: "POST", body: { token: ivCase1.data.invite.token, username: "IvCaseUser", password: "casepass1", displayName: "大小写一" } });
  assert(ivCaseAccept1.statusCode === 200, `IV-011 expected the first mixed-case username to register, got ${ivCaseAccept1.statusCode}`);
  const ivCase2 = await ivCreateInvite("堂亲");
  const ivCaseAccept2 = await callApp("/api/invites/accept", { method: "POST", body: { token: ivCase2.data.invite.token, username: "ivcaseuser", password: "casepass2", displayName: "大小写二" } });
  assert(ivCaseAccept2.statusCode === 400, `IV-011 expected the lowercased duplicate to be rejected, got ${ivCaseAccept2.statusCode}`);
  assert(ivSql("SELECT COUNT(*) AS count FROM users WHERE LOWER(username) = 'ivcaseuser'").count === 1, "IV-011 expected only one account for a case-insensitive username");


  // IV-012 家庭成员名单：邀请进来的家属必须出现在 dashboard.members 里。
  // 原先「角色与权限」表只列当前登录人和长辈，邀请进来的人看不到，家属会以为邀请没成功。
  {
    const ivMemberDash = await callApp("/api/dashboard", { cookie: ivCookieA });
    assert(ivMemberDash.statusCode === 200, `IV-012 expected 200 for the household dashboard, got ${ivMemberDash.statusCode}`);
    const ivLayout = JSON.parse(ivMemberDash.body || "{}");
    assert(Array.isArray(ivLayout.members), "IV-012 expected dashboard.members to be an array");
    const ivInvitedRow = ivLayout.members.find((item) => item.id === ivNewUser.id);
    assert(Boolean(ivInvitedRow), "IV-012 expected the invited caregiver to appear in the household roster");
    assert(ivInvitedRow.relation === "儿子", `IV-012 expected the invited caregiver's relation to be 儿子, got ${ivInvitedRow.relation}`);
    assert(ivInvitedRow.displayName === "被邀家属一", `IV-012 expected the invited caregiver's display name, got ${ivInvitedRow.displayName}`);
    const ivElderRow = ivLayout.members.find((item) => item.role === "elder");
    assert(Boolean(ivElderRow), "IV-012 expected the elder row in the roster");
    // 这里最容易踩的坑：dashboard 里的 elder 已经是 camelCase 的 publicUser 形状，
    // 按 snake_case 取会拿到 undefined，名单里那一行就没有名字。
    assert(ivElderRow.displayName === "邀请长辈甲", `IV-012 expected the elder row to carry a display name, got ${JSON.stringify(ivElderRow)}`);
    assert(ivLayout.members.some((item) => item.role === "caregiver" && item.id === "user-iv-caregiver-a"), "IV-012 expected the original caregiver to stay in the roster");
  }

} finally {
  // No server sockets are opened in this test.
}

console.log("TechGuard v0.1 smoke tests passed");

function todayDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
}

// 直接插一条「今天 00:00」的用药计划：用于验证 cron 的扫描顺序与异常隔离
function fxInsertSchedulesFor(tag, dbPath, ...elderIds) {
  const db = new DatabaseSync(dbPath);
  const now = new Date().toISOString();
  for (const elderId of elderIds) {
    db.prepare(
      "INSERT OR IGNORE INTO medication_schedules (id, elder_id, created_by, medicine_name, dose_note, meal_timing, time_of_day, repeat_rule, remind_elder, remind_caregiver, enabled, created_at) VALUES (?, ?, ?, ?, '', '', '00:00', 'daily', 1, 1, 1, ?)"
    ).run(`sched-fx-${tag}-${elderId}`, elderId, "user-fx-caregiver", `回归药${tag}`, now);
  }
  db.close();
}

async function callApp(path, { method = "GET", body = null, cookie = "", headers = null, remote = "127.0.0.1" } = {}) {
  const rawBody = body ? JSON.stringify(body) : "";
  const request = Readable.from(rawBody ? [Buffer.from(rawBody)] : []);
  request.method = method;
  request.url = path;
  // 默认模拟本机回环请求：未配置 CRON_SECRET 时 /api/cron/reminders 只接受回环/Vercel Cron。
  // remote / headers 可覆盖，用于验证「非回环来源 + 伪造 X-Forwarded-For / User-Agent」不被采信。
  request.socket = { remoteAddress: remote };
  request.headers = {
    ...(rawBody ? { "content-type": "application/json" } : {}),
    ...(cookie ? { cookie } : {}),
    ...(headers || {}),
  };

  return await new Promise((resolve, reject) => {
    const response = {
      statusCode: 200,
      headers: {},
      body: "",
      setHeader(name, value) {
        this.headers[name.toLowerCase()] = value;
      },
      writeHead(statusCode, headers = {}) {
        this.statusCode = statusCode;
        for (const [name, value] of Object.entries(headers)) {
          this.headers[name.toLowerCase()] = value;
        }
      },
      end(chunk = "") {
        this.body += chunk;
        resolve(this);
      },
    };
    Promise.resolve(appHandler(request, response)).catch(reject);
  });
}
