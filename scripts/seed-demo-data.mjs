// 重置本地演示数据。
//
// 设计原则（改这个脚本前请先读这里）：
// 1. 只重建「演示范围内的用户」的数据，不做全库 DELETE。
//    之前的版本用无 WHERE 的 DELETE，会删掉所有长辈的数据却只重建两个。
// 2. 不覆盖已存在账号的密码哈希。
//    之前的版本 ON CONFLICT DO UPDATE SET password_hash 会把 scrypt 哈希重置回
//    旧的单轮 sha256，等于把安全升级冲掉了。
// 3. 不碰 notification_channels（里面是真实的飞书 webhook 配置）、
//    push_subscriptions（绑定在具体浏览器上）、notification_preferences（用户设置）、
//    app_settings（VAPID 密钥）。删掉它们等于把用户的配置清空。
// 4. 日期全部相对「今天」生成，所以任何时候重跑，演示都是当下的。
//
// 用法：node scripts/seed-demo-data.mjs
import { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes } from "node:crypto";
import { join } from "node:path";
import { existsSync, copyFileSync } from "node:fs";

const dbPath = join(process.cwd(), "data", "techguard.db");
if (!existsSync(dbPath)) {
  console.error(`找不到数据库 ${dbPath}，请先执行一次 PORT=5174 node server.mjs 让它完成建表。`);
  process.exit(1);
}

// 重跑前自动备份一份，改坏了还能退回去。
const backupPath = `${dbPath}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
copyFileSync(dbPath, backupPath);
console.log(`已备份原库到 ${backupPath}`);

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

const DEMO_CAREGIVER = "user-caregiver";
const DEMO_ELDERS = ["user-elder", "user-elder2"];
const DEMO_USERS = [DEMO_CAREGIVER, ...DEMO_ELDERS];

// ------------------------------------------------------------------
// 工具
// ------------------------------------------------------------------
function nowIso() {
  return new Date().toISOString();
}
function createId(prefix) {
  return `${prefix}_${randomBytes(8).toString("hex")}`;
}
function todayDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
}
function daysAgoDate(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(d);
}
function daysAgoIso(n, hour, min = 0) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, min, 0, 0);
  return d.toISOString();
}
// 固定种子的伪随机，保证每次重跑生成的演示任务一致（Math.random 会让演示每天都在变）
function makeRandom(seed) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

const today = todayDate();
const placeholders = DEMO_ELDERS.map(() => "?").join(",");
const userPlaceholders = DEMO_USERS.map(() => "?").join(",");

// ------------------------------------------------------------------
// 1. 清理旧演示数据（只清演示范围内的长辈，保留用户与用户级配置）
// ------------------------------------------------------------------
console.log("清理旧演示数据（只针对 demo 长辈）...");
for (const table of [
  "medication_logs",
  "medication_schedules",
  "care_tasks",
  "blood_pressure_logs",
  "checkup_reports",
  "life_events",
  "alerts",
  "weather_settings",
]) {
  const result = db.prepare(`DELETE FROM ${table} WHERE elder_id IN (${placeholders})`).run(...DEMO_ELDERS);
  if (result.changes) console.log(`  ${table}: 清理 ${result.changes} 行`);
}
db.prepare(`DELETE FROM notifications WHERE user_id IN (${userPlaceholders})`).run(...DEMO_USERS);

// ------------------------------------------------------------------
// 2. 演示账号（已存在就只更新展示名，绝不覆盖密码哈希）
// ------------------------------------------------------------------
console.log("准备演示账号...");
// 注意：这里用的是旧的 sha256 格式，服务端会在首次成功登录时自动升级为 scrypt。
// 已有的账号不会被覆盖，所以不会把用户改过的密码重置掉。
function legacyPasswordHash(password) {
  return createHash("sha256").update(`techguard:${password}`).digest("hex");
}
function ensureUser(id, username, displayName, role) {
  const existing = db.prepare("SELECT id FROM users WHERE id = ?").get(id);
  if (existing) {
    db.prepare("UPDATE users SET display_name = ?, role = ? WHERE id = ?").run(displayName, role, id);
    return;
  }
  db.prepare("INSERT INTO users (id, username, password_hash, display_name, role, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    id,
    username,
    legacyPasswordHash("demo1234"),
    displayName,
    role,
    nowIso()
  );
}
function ensureFamilyLink(id, caregiverId, elderId, relation) {
  const existing = db.prepare("SELECT id FROM family_links WHERE id = ?").get(id);
  if (existing) {
    db.prepare("UPDATE family_links SET caregiver_id = ?, elder_id = ?, relation = ? WHERE id = ?").run(caregiverId, elderId, relation, id);
    return;
  }
  db.prepare("INSERT INTO family_links (id, caregiver_id, elder_id, relation) VALUES (?, ?, ?, ?)").run(id, caregiverId, elderId, relation);
}

ensureUser(DEMO_CAREGIVER, "caregiver", "家属账号", "caregiver");
ensureUser("user-elder", "elder", "长辈账号", "elder");
ensureUser("user-elder2", "elder2", "长辈账号2", "elder");
ensureFamilyLink("link-demo-family", DEMO_CAREGIVER, "user-elder", "儿子");
// id 必须和 server.mjs initDatabase 里用的一致，否则会多出一条重复关联
ensureFamilyLink("link-demo-family2", DEMO_CAREGIVER, "user-elder2", "家属");

// ------------------------------------------------------------------
// 3. 天气设置
// ------------------------------------------------------------------
console.log("生成天气设置...");
for (const elderId of DEMO_ELDERS) {
  db.prepare("INSERT INTO weather_settings (elder_id, city, district, care_time, updated_at) VALUES (?, ?, ?, ?, ?)").run(
    elderId,
    "北京市",
    "朝阳区",
    "08:00",
    nowIso()
  );
}

// ------------------------------------------------------------------
// 4. 吃药计划 + 用药记录
// ------------------------------------------------------------------
console.log("生成吃药计划与用药记录...");

const medications = [
  // 主长辈：三种药，规格齐全
  { id: "med_elder_bp", elderId: "user-elder", name: "苯磺酸氨氯地平片", dose: "1片（5mg）", meal: "饭后", time: "08:00" },
  { id: "med_elder_aspirin", elderId: "user-elder", name: "阿司匹林肠溶片", dose: "1片（100mg）", meal: "饭后", time: "12:30" },
  { id: "med_elder_calcium", elderId: "user-elder", name: "碳酸钙D3片", dose: "1片", meal: "睡前", time: "20:30" },
  // 第二位长辈：数据少一些，这样切换长辈时能看出是两个人
  { id: "med_elder2_valsartan", elderId: "user-elder2", name: "缬沙坦胶囊", dose: "1粒（80mg）", meal: "饭后", time: "07:30" },
  { id: "med_elder2_metformin", elderId: "user-elder2", name: "二甲双胍片", dose: "1片（0.5g）", meal: "随餐", time: "18:30" },
];

for (const med of medications) {
  db.prepare(
    `INSERT INTO medication_schedules
     (id, elder_id, created_by, medicine_name, dose_note, meal_timing, time_of_day, repeat_rule, remind_elder, remind_caregiver, enabled, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'daily', 1, 1, 1, ?)`
  ).run(med.id, med.elderId, DEMO_CAREGIVER, med.name, med.dose, med.meal, med.time, nowIso());
}

// 过去 6 天的用药记录：大部分已完成，故意留几次漏服，让「漏服可见」和复诊摘要有内容
function seedMedicationLogs(elderId) {
  const schedules = db.prepare("SELECT * FROM medication_schedules WHERE elder_id = ?").all(elderId);
  const missedPlan = {
    // 第几天漏第几个药（按 time_of_day 排序后的下标）
    "user-elder": { 1: [0], 3: [2], 4: [0, 1] },
    "user-elder2": { 2: [1], 5: [0] },
  }[elderId] || {};

  for (let d = 6; d >= 0; d -= 1) {
    const dateStr = d === 0 ? today : daysAgoDate(d);
    schedules.forEach((schedule, index) => {
      const hour = parseInt(schedule.time_of_day.split(":")[0], 10);
      const logId = `${schedule.id}-${dateStr}`;
      const missedIndexes = missedPlan[d] || [];
      let status;
      if (d === 0) {
        // 今天：已过时间的算完成，还没到点的留待确认
        status = hour < 18 ? "done" : "pending";
      } else {
        status = missedIndexes.includes(index) ? "missed" : "done";
      }
      db.prepare(
        `INSERT OR REPLACE INTO medication_logs (id, schedule_id, elder_id, due_date, status, completed_at, note)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        logId,
        schedule.id,
        elderId,
        dateStr,
        status,
        status === "done" ? daysAgoIso(d, hour + 1, 5) : null,
        status === "done" ? "老人确认已吃药" : null
      );
    });
  }
}
for (const elderId of DEMO_ELDERS) seedMedicationLogs(elderId);

// ------------------------------------------------------------------
// 5. 护理任务（过去 5 天 + 今天）
// ------------------------------------------------------------------
console.log("生成护理任务...");

const pastTaskTemplates = [
  { title: "早晨量血压", time: "08:30", desc: "起床后静坐5分钟再测量" },
  { title: "中午吃药", time: "12:30", desc: "饭后服用阿司匹林" },
  { title: "下午散步", time: "16:00", desc: "小区花园走30分钟" },
  { title: "傍晚量血压", time: "18:00", desc: "记录数值并告诉家人" },
  { title: "晚上吃药", time: "20:30", desc: "睡前服用钙片" },
  { title: "去社区活动中心", time: "09:30", desc: "参加老年健康讲座" },
  { title: "打电话给儿子", time: "10:00", desc: "聊聊今天身体状况" },
  { title: "去医院复查", time: "09:00", desc: "心内科常规复查，带好医保卡" },
  { title: "去超市买菜", time: "10:00", desc: "买些新鲜蔬菜和水果" },
];

const todayTasks = [
  { title: "早晨量血压", time: "08:30", desc: "起床后静坐5分钟再测量", done: true },
  { title: "中午吃药", time: "12:30", desc: "饭后服用阿司匹林", done: true },
  { title: "下午散步", time: "16:00", desc: "小区花园走30分钟", done: false },
  { title: "傍晚量血压", time: "18:00", desc: "记录数值并告诉家人", done: false },
  { title: "晚上吃药", time: "20:30", desc: "睡前服用钙片", done: false },
];

function seedTasks(elderId, randomSeed) {
  const random = makeRandom(randomSeed);
  let cursor = 0;
  for (let d = 5; d >= 1; d -= 1) {
    const dateStr = daysAgoDate(d);
    const dailyTasks = pastTaskTemplates.slice(cursor % 5, (cursor % 5) + 3);
    for (const task of dailyTasks) {
      const isDone = random() > 0.25;
      const hour = parseInt(task.time.split(":")[0], 10);
      db.prepare(
        `INSERT INTO care_tasks
         (id, elder_id, created_by, title, description, due_date, due_time, repeat_rule, status, completed_at, completion_note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'none', ?, ?, ?, ?)`
      ).run(
        createId("task"),
        elderId,
        DEMO_CAREGIVER,
        task.title,
        task.desc,
        dateStr,
        task.time,
        isDone ? "done" : "pending",
        isDone ? daysAgoIso(d, hour + 1) : null,
        isDone ? "按时完成" : null,
        daysAgoIso(d, 7)
      );
    }
    cursor += 1;
  }
  for (const task of todayTasks) {
    const hour = parseInt(task.time.split(":")[0], 10);
    db.prepare(
      `INSERT INTO care_tasks
       (id, elder_id, created_by, title, description, due_date, due_time, repeat_rule, status, completed_at, completion_note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'none', ?, ?, ?, ?)`
    ).run(
      createId("task"),
      elderId,
      DEMO_CAREGIVER,
      task.title,
      task.desc,
      today,
      task.time,
      task.done ? "done" : "pending",
      task.done ? daysAgoIso(0, hour + 1) : null,
      task.done ? "按时完成" : null,
      daysAgoIso(0, 7)
    );
  }
}
seedTasks("user-elder", 20261009);
seedTasks("user-elder2", 20261010);

// ------------------------------------------------------------------
// 6. 血压记录（过去 14 天，早晚各一次）
// ------------------------------------------------------------------
console.log("生成血压记录...");

const bpSeries = {
  // 主长辈：整体偏高，中间有几天明显高，让血压趋势和复诊摘要有东西可看
  "user-elder": [
    [138, 85, 72], [142, 88, 75], [135, 82, 70], [148, 92, 80], [130, 80, 68], [140, 86, 73], [152, 94, 82],
    [136, 84, 71], [133, 81, 69], [141, 87, 74], [128, 79, 67], [144, 90, 77], [139, 85, 72], [146, 91, 79],
  ],
  // 第二位长辈：相对平稳，用来对比
  "user-elder2": [
    [126, 78, 68], [124, 76, 66], [130, 80, 70], [122, 75, 65], [128, 79, 69], [125, 77, 67], [131, 81, 71],
    [123, 76, 66], [127, 78, 68], [129, 80, 70], [121, 74, 64], [126, 77, 67], [124, 76, 66], [128, 79, 68],
  ],
};

function seedBloodPressure(elderId) {
  const series = bpSeries[elderId];
  for (let d = 13; d >= 0; d -= 1) {
    const [sys, dia, pulse] = series[13 - d];
    db.prepare(
      `INSERT INTO blood_pressure_logs (id, elder_id, measured_by, systolic, diastolic, pulse, note, measured_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      createId("bp"),
      elderId,
      DEMO_CAREGIVER,
      sys,
      dia,
      pulse,
      d === 0 ? "早晨起床后测量" : `${daysAgoDate(d)} 早晨记录`,
      daysAgoIso(d, 8, 30),
      daysAgoIso(d, 8, 31)
    );
    if (d % 2 === 0) {
      db.prepare(
        `INSERT INTO blood_pressure_logs (id, elder_id, measured_by, systolic, diastolic, pulse, note, measured_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        createId("bp"),
        elderId,
        DEMO_CAREGIVER,
        sys + 3,
        dia + 2,
        pulse + 2,
        d === 0 ? "傍晚测量" : `${daysAgoDate(d)} 傍晚记录`,
        daysAgoIso(d, 18, 0),
        daysAgoIso(d, 18, 1)
      );
    }
  }
}
for (const elderId of DEMO_ELDERS) seedBloodPressure(elderId);

// ------------------------------------------------------------------
// 7. 生活记录（长辈自己说的话）
// ------------------------------------------------------------------
console.log("生成生活记录...");

const lifeEventSeeds = [
  { elderId: "user-elder", kind: "medication", text: "我今天早上八点半吃过降压药了", occurredAt: "08:30", daysAgo: 0, source: "voice" },
  { elderId: "user-elder", kind: "meal", text: "刚吃完午饭，今天胃口还行", occurredAt: "12:00", daysAgo: 0, source: "text" },
  { elderId: "user-elder", kind: "unwell", text: "我有点头晕，心慌", occurredAt: null, daysAgo: 2, source: "text" },
  { elderId: "user-elder", kind: "outing", text: "下午三点去公园散步了", occurredAt: "15:00", daysAgo: 1, source: "voice" },
  { elderId: "user-elder", kind: "sleep", text: "昨天晚上十点就睡了", occurredAt: "22:00", daysAgo: 1, source: "text" },
  { elderId: "user-elder2", kind: "meal", text: "早上喝了粥，吃了鸡蛋", occurredAt: "08:00", daysAgo: 0, source: "voice" },
  { elderId: "user-elder2", kind: "mood", text: "今天很高兴，孙女来看我了", occurredAt: null, daysAgo: 1, source: "text" },
];

for (const event of lifeEventSeeds) {
  const id = createId("life");
  db.prepare(
    `INSERT INTO life_events (id, elder_id, kind, raw_text, occurred_at, source, recorded_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, event.elderId, event.kind, event.text, event.occurredAt, event.source, event.elderId, daysAgoIso(event.daysAgo, 9, 20));
  // 身体不适会同时产生一条告警（和接口里的行为保持一致），否则演示数据自相矛盾
  if (event.kind === "unwell") {
    const elder = db.prepare("SELECT display_name FROM users WHERE id = ?").get(event.elderId);
    db.prepare(
      `INSERT INTO alerts (id, elder_id, type, title, message, status, ref_id, created_at)
       VALUES (?, ?, 'life_unwell', '长辈身体不适', ?, 'new', ?, ?)`
    ).run(
      createId("alert"),
      event.elderId,
      `${elder.display_name} 记录了身体不适：${event.text}`,
      id,
      daysAgoIso(event.daysAgo, 9, 20)
    );
  }
}

// ------------------------------------------------------------------
// 8. 体检报告
// ------------------------------------------------------------------
console.log("生成体检报告...");

// 一张 1x1 的占位 JPEG，够前端显示缩略图，又不会把库撑大
const placeholderImage =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAIAAoDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKgAB//Z";

const checkupReports = [
  {
    elderId: "user-elder",
    summary: "总体健康状况平稳，血压略偏高，血脂正常范围，建议继续规律服药并定期监测血压。",
    riskLevel: "review",
    suggestions: [
      "血压略偏高，建议每天早晚各测量一次并记录",
      "继续按时服用降压药，不要自行停药",
      "饮食清淡，减少盐分摄入",
      "适当运动，每天散步30分钟",
    ],
    daysAgo: 7,
  },
  {
    elderId: "user-elder",
    summary: "上次复查：血糖偏高（空腹 6.8 mmol/L），建议控制饮食后复测。",
    riskLevel: "review",
    suggestions: ["空腹血糖略高，建议减少甜食和主食摄入", "一个月后复查空腹血糖"],
    daysAgo: 45,
  },
  {
    elderId: "user-elder2",
    summary: "体检结果基本正常，血糖略高，建议控制饮食并增加运动。",
    riskLevel: "review",
    suggestions: ["空腹血糖略高，建议减少甜食和主食摄入", "多吃蔬菜和粗粮", "每天保持适量运动", "一个月后复查空腹血糖"],
    daysAgo: 14,
  },
];

for (const report of checkupReports) {
  const advice = {
    summary: report.summary,
    suggestions: report.suggestions,
    disclaimer: "仅作健康管理提示，不替代医生诊断。",
  };
  db.prepare(
    `INSERT INTO checkup_reports (id, elder_id, uploaded_by, file_name, image_data, summary, advice_json, risk_level, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'local-fallback', ?)`
  ).run(
    createId("checkup"),
    report.elderId,
    DEMO_CAREGIVER,
    `体检报告_${daysAgoDate(report.daysAgo)}.jpg`,
    placeholderImage,
    report.summary,
    JSON.stringify(advice),
    report.riskLevel,
    daysAgoIso(report.daysAgo, 10, 0)
  );
}

// ------------------------------------------------------------------
// 9. 体检指标（趋势对比用的结构化数字）
// ------------------------------------------------------------------
console.log("生成体检指标...");

// 主长辈：血糖和血脂都在往上走，尿酸偏高 —— 趋势看得出问题
const indicatorSeeds = [
  { elderId: "user-elder", name: "空腹血糖", unit: "mmol/L", daysAgo: 180, value: 5.6 },
  { elderId: "user-elder", name: "空腹血糖", unit: "mmol/L", daysAgo: 45, value: 6.2 },
  { elderId: "user-elder", name: "空腹血糖", unit: "mmol/L", daysAgo: 7, value: 6.8 },
  { elderId: "user-elder", name: "糖化血红蛋白", unit: "%", daysAgo: 45, value: 5.9 },
  { elderId: "user-elder", name: "糖化血红蛋白", unit: "%", daysAgo: 7, value: 6.4 },
  { elderId: "user-elder", name: "总胆固醇", unit: "mmol/L", daysAgo: 180, value: 5.4 },
  { elderId: "user-elder", name: "总胆固醇", unit: "mmol/L", daysAgo: 45, value: 5.6 },
  { elderId: "user-elder", name: "总胆固醇", unit: "mmol/L", daysAgo: 7, value: 5.2 },
  { elderId: "user-elder", name: "甘油三酯", unit: "mmol/L", daysAgo: 45, value: 1.9 },
  { elderId: "user-elder", name: "甘油三酯", unit: "mmol/L", daysAgo: 7, value: 1.6 },
  { elderId: "user-elder", name: "尿酸", unit: "μmol/L", daysAgo: 45, value: 405 },
  { elderId: "user-elder", name: "尿酸", unit: "μmol/L", daysAgo: 7, value: 452 },
  { elderId: "user-elder", name: "高密度脂蛋白胆固醇", unit: "mmol/L", daysAgo: 7, value: 0.95 },
  // 第二位长辈：指标基本平稳，用来对比
  { elderId: "user-elder2", name: "空腹血糖", unit: "mmol/L", daysAgo: 90, value: 5.9 },
  { elderId: "user-elder2", name: "空腹血糖", unit: "mmol/L", daysAgo: 14, value: 5.7 },
  { elderId: "user-elder2", name: "总胆固醇", unit: "mmol/L", daysAgo: 14, value: 4.8 },
  { elderId: "user-elder2", name: "血红蛋白", unit: "g/L", daysAgo: 14, value: 132 },
];

for (const item of indicatorSeeds) {
  db.prepare(
    `INSERT INTO checkup_indicators (id, elder_id, name, value, unit, measured_date, note, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, '', ?, ?)`
  ).run(createId("ind"), item.elderId, item.name, item.value, item.unit, daysAgoDate(item.daysAgo), DEMO_CAREGIVER, daysAgoIso(item.daysAgo, 10, 30));
}

// ------------------------------------------------------------------
// 10. 告警记录
// ------------------------------------------------------------------
console.log("生成告警记录...");

function seedAlerts(elderId, displayName) {
  const templates = [
    { type: "medication", title: "吃药提醒已设置", message: `TechGuard 吃药提醒：${displayName}每天 08:00 需要服用苯磺酸氨氯地平片（饭后1片）。`, daysAgo: 5 },
    { type: "task_due", title: "任务到点提醒", message: `TechGuard 任务提醒：${displayName}今天 08:30 需要完成：早晨量血压。`, daysAgo: 5 },
    { type: "blood_pressure", title: "血压需要关注", message: `TechGuard 血压提醒：${displayName}刚记录血压 152/94 mmHg，这次数值偏高，建议安静休息5分钟后复测一次。`, daysAgo: 4 },
    { type: "fraud", title: "高危短信提醒", message: `TechGuard 高危提醒：${displayName}收到疑似冒充社保诈骗短信，请尽快联系老人，提醒不要点链接、不要回验证码、不要转账。`, daysAgo: 3 },
    { type: "medication_overdue", title: "吃药仍未确认", message: `TechGuard 未确认：${displayName} 20:30 的碳酸钙D3片超过 30 分钟没有确认，建议打个电话问一下。`, daysAgo: 2 },
    { type: "checkup", title: "体检报告已分析", message: `TechGuard 体检报告提醒：${displayName}上传了体检报告照片。总体健康状况平稳，血压略偏高。`, daysAgo: 7 },
    { type: "help", title: "一键求助", message: `TechGuard 求助提醒：${displayName}点击了一键联系家人，请尽快查看是否需要帮助。`, daysAgo: 1 },
    { type: "safe_checkin", title: "长辈报平安", message: `TechGuard 平安打卡：${displayName}在 09:10 报了平安，今天一切正常。`, daysAgo: 1 },
    { type: "task", title: "任务已完成", message: `${displayName}完成了「下午散步」任务。`, daysAgo: 1 },
  ];
  for (const alert of templates) {
    db.prepare(
      `INSERT INTO alerts (id, elder_id, type, title, message, status, ref_id, created_at)
       VALUES (?, ?, ?, ?, ?, 'new', ?, ?)`
    ).run(createId("alert"), elderId, alert.type, alert.title, alert.message, null, daysAgoIso(alert.daysAgo, 10, 0));
  }
}
seedAlerts("user-elder", "长辈账号");
seedAlerts("user-elder2", "长辈账号2");

// ------------------------------------------------------------------
// 验证
// ------------------------------------------------------------------
console.log("\n=== 数据生成完成 ===");
const count = (sql, ...args) => db.prepare(sql).get(...args).c;
console.log("演示长辈:", DEMO_ELDERS.join(", "), "| 家属:", DEMO_CAREGIVER);
for (const elderId of DEMO_ELDERS) {
  const name = db.prepare("SELECT display_name FROM users WHERE id = ?").get(elderId).display_name;
  console.log(
    `\n[${name}] 用药计划 ${count("SELECT count(*) c FROM medication_schedules WHERE elder_id = ?", elderId)}` +
      ` | 用药记录 ${count("SELECT count(*) c FROM medication_logs WHERE elder_id = ?", elderId)}` +
      `(漏服 ${count("SELECT count(*) c FROM medication_logs WHERE elder_id = ? AND status='missed'", elderId)})` +
      ` | 任务 ${count("SELECT count(*) c FROM care_tasks WHERE elder_id = ?", elderId)}` +
      ` | 血压 ${count("SELECT count(*) c FROM blood_pressure_logs WHERE elder_id = ?", elderId)}` +
      ` | 生活记录 ${count("SELECT count(*) c FROM life_events WHERE elder_id = ?", elderId)}` +
      ` | 体检 ${count("SELECT count(*) c FROM checkup_reports WHERE elder_id = ?", elderId)}` +
      ` | 体检指标 ${count("SELECT count(*) c FROM checkup_indicators WHERE elder_id = ?", elderId)}` +
      ` | 告警 ${count("SELECT count(*) c FROM alerts WHERE elder_id = ?", elderId)}`
  );
}
console.log("\n今日用药（长辈账号）:");
console.log(
  db
    .prepare(
      `SELECT ms.medicine_name, ms.time_of_day, ml.status FROM medication_logs ml
       JOIN medication_schedules ms ON ms.id = ml.schedule_id
       WHERE ml.elder_id = 'user-elder' AND ml.due_date = ? ORDER BY ms.time_of_day`
    )
    .all(today)
);
console.log("\n今日任务（长辈账号）:");
console.log(db.prepare("SELECT title, due_time, status FROM care_tasks WHERE elder_id = 'user-elder' AND due_date = ? ORDER BY due_time").all(today));

db.close();
console.log("\n✅ 演示数据生成完成。");
