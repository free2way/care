import { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes } from "node:crypto";
import { join } from "node:path";

const dbPath = join(process.cwd(), "data", "techguard.db");
const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL");
db.exec("PRAGMA foreign_keys = ON");

function hashPassword(password) {
  return createHash("sha256").update(`techguard:${password}`).digest("hex");
}
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
function daysAgoIso(n, hour, min) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, min, 0, 0);
  return d.toISOString();
}

const today = todayDate();

// ============================================================
// 1. 清理旧的演示数据（保留用户和 family_links）
// ============================================================
console.log("清理旧数据...");
db.exec(`
  DELETE FROM medication_logs;
  DELETE FROM medication_schedules;
  DELETE FROM care_tasks;
  DELETE FROM blood_pressure_logs;
  DELETE FROM checkup_reports;
  DELETE FROM alerts;
  DELETE FROM weather_settings;
  DELETE FROM notification_channels;
  DELETE FROM push_subscriptions;
  DELETE FROM notifications;
  DELETE FROM notification_preferences;
`);

// ============================================================
// 2. 准备演示账号
// ============================================================
console.log("更新用户信息...");
function seedUser(id, username, password, displayName, role) {
  db.prepare(
    `INSERT INTO users (id, username, password_hash, display_name, role, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET username = excluded.username, password_hash = excluded.password_hash, display_name = excluded.display_name, role = excluded.role`
  ).run(id, username, hashPassword(password), displayName, role, nowIso());
}
function seedFamilyLink(id, caregiverId, elderId, relation) {
  db.prepare(
    `INSERT INTO family_links (id, caregiver_id, elder_id, relation)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET caregiver_id = excluded.caregiver_id, elder_id = excluded.elder_id, relation = excluded.relation`
  ).run(id, caregiverId, elderId, relation);
}

seedUser("user-elder", "elder", "demo1234", "李建国", "elder");
seedUser("user-caregiver", "caregiver", "demo1234", "李明", "caregiver");
seedUser("user-demo-elder", "demo-elder", "demo1234", "长辈样例", "elder");
seedUser("user-demo-caregiver", "demo-caregiver", "demo1234", "家属样例", "caregiver");
seedFamilyLink("link-demo-family", "user-caregiver", "user-elder", "儿子");
seedFamilyLink("link-demo-family-extra", "user-demo-caregiver", "user-demo-elder", "家属");

// ============================================================
// 3. 天气设置
// ============================================================
console.log("生成天气设置...");
for (const elderId of ["user-elder", "user-demo-elder"]) {
  db.prepare(
    `INSERT INTO weather_settings (elder_id, city, district, care_time, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(elderId, "北京", "海淀区", "07:30", nowIso());
}

// ============================================================
// 4. 吃药安排 + 今日用药记录
// ============================================================
console.log("生成吃药安排...");

const medications = [
  // user-elder (李建国)
  { id: "med_elder_bp", elderId: "user-elder", name: "苯磺酸氨氯地平片", dose: "1片（5mg）", meal: "饭后", time: "08:00" },
  { id: "med_elder_aspirin", elderId: "user-elder", name: "阿司匹林肠溶片", dose: "1片（100mg）", meal: "饭后", time: "12:30" },
  { id: "med_elder_calcium", elderId: "user-elder", name: "碳酸钙D3片", dose: "1片", meal: "睡前", time: "20:30" },
  // user-demo-elder (长辈样例)
  { id: "med_demo_bp", elderId: "user-demo-elder", name: "缬沙坦胶囊", dose: "1粒（80mg）", meal: "饭后", time: "08:30" },
  { id: "med_demo_calcium", elderId: "user-demo-elder", name: "钙片", dose: "睡前一片，温水服用", meal: "睡前", time: "20:00" },
];

for (const med of medications) {
  db.prepare(
    `INSERT INTO medication_schedules
     (id, elder_id, created_by, medicine_name, dose_note, meal_timing, time_of_day, repeat_rule, remind_elder, remind_caregiver, enabled, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'daily', 1, 1, 1, ?)`
  ).run(med.id, med.elderId, med.elderId === "user-elder" ? "user-caregiver" : "user-demo-caregiver", med.name, med.dose, med.meal, med.time, nowIso());
}

// 生成今日用药记录（部分已完成，部分待完成）
function ensureMedLogs(elderId, dateStr) {
  const schedules = db.prepare("SELECT * FROM medication_schedules WHERE elder_id = ? AND enabled = 1").all(elderId);
  for (const s of schedules) {
    const logId = `${s.id}-${dateStr}`;
    // 早上8点的药已完成，中午12:30的药已完成，晚上20:30的药待完成
    const hour = parseInt(s.time_of_day.split(":")[0]);
    const isDone = hour < 18; // 早上和中午的药已完成
    db.prepare(
      `INSERT OR REPLACE INTO medication_logs (id, schedule_id, elder_id, due_date, status, completed_at, note)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(logId, s.id, elderId, dateStr, isDone ? "done" : "pending", isDone ? daysAgoIso(0, hour + 1, 0) : null, isDone ? "老人确认已吃药" : null);
  }
}

ensureMedLogs("user-elder", today);
ensureMedLogs("user-demo-elder", today);

// 生成过去几天的用药记录（全部已完成）
for (let d = 1; d <= 5; d++) {
  const dateStr = daysAgoDate(d);
  for (const elderId of ["user-elder", "user-demo-elder"]) {
    const schedules = db.prepare("SELECT * FROM medication_schedules WHERE elder_id = ? AND enabled = 1").all(elderId);
    for (const s of schedules) {
      const logId = `${s.id}-${dateStr}`;
      db.prepare(
        `INSERT OR REPLACE INTO medication_logs (id, schedule_id, elder_id, due_date, status, completed_at, note)
         VALUES (?, ?, ?, ?, 'done', ?, '老人确认已吃药')`
      ).run(logId, s.id, elderId, dateStr, daysAgoIso(d, parseInt(s.time_of_day.split(":")[0]) + 1, 0));
    }
  }
}

// ============================================================
// 5. 护理任务（过去5天 + 今天）
// ============================================================
console.log("生成护理任务...");

const taskTemplates = [
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

function seedTasks(elderId, caregiverId) {
  let idx = 0;
  // 过去5天的任务（大部分已完成）
  for (let d = 5; d >= 1; d--) {
    const dateStr = daysAgoDate(d);
    // 每天3-4个任务
    const dailyTasks = taskTemplates.slice(idx % 5, (idx % 5) + 3);
    for (const t of dailyTasks) {
      const taskId = createId("task");
      const isDone = Math.random() > 0.2; // 80% 完成
      db.prepare(
        `INSERT INTO care_tasks
         (id, elder_id, created_by, title, description, due_date, due_time, repeat_rule, status, completed_at, completion_note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'none', ?, ?, ?, ?)`
      ).run(
        taskId,
        elderId,
        caregiverId,
        t.title,
        t.desc,
        dateStr,
        t.time,
        isDone ? "done" : "pending",
        isDone ? daysAgoIso(d, parseInt(t.time.split(":")[0]) + 1, 0) : null,
        isDone ? "按时完成" : null,
        daysAgoIso(d, 8, 0)
      );
    }
    idx++;
  }

  // 今天的任务（部分已完成，部分待完成）
  const todayTasks = [
    { title: "早晨量血压", time: "08:30", desc: "起床后静坐5分钟再测量", done: true },
    { title: "中午吃药", time: "12:30", desc: "饭后服用阿司匹林", done: true },
    { title: "下午散步", time: "16:00", desc: "小区花园走30分钟", done: false },
    { title: "傍晚量血压", time: "18:00", desc: "记录数值并告诉家人", done: false },
    { title: "晚上吃药", time: "20:30", desc: "睡前服用钙片", done: false },
  ];

  for (const t of todayTasks) {
    const taskId = createId("task");
    db.prepare(
      `INSERT INTO care_tasks
       (id, elder_id, created_by, title, description, due_date, due_time, repeat_rule, status, completed_at, completion_note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'none', ?, ?, ?, ?)`
    ).run(
      taskId,
      elderId,
      caregiverId,
      t.title,
      t.desc,
      today,
      t.time,
      t.done ? "done" : "pending",
      t.done ? daysAgoIso(0, parseInt(t.time.split(":")[0]) + 1, 0) : null,
      t.done ? "按时完成" : null,
      daysAgoIso(0, 7, 0)
    );
  }
}

seedTasks("user-elder", "user-caregiver");
seedTasks("user-demo-elder", "user-demo-caregiver");

// ============================================================
// 6. 血压记录（过去14天）
// ============================================================
console.log("生成血压记录...");

function seedBloodPressure(elderId, measuredBy) {
  const readings = [
    { sys: 138, dia: 85, pulse: 72 },
    { sys: 142, dia: 88, pulse: 75 },
    { sys: 135, dia: 82, pulse: 70 },
    { sys: 145, dia: 90, pulse: 78 },
    { sys: 130, dia: 80, pulse: 68 },
    { sys: 140, dia: 86, pulse: 73 },
    { sys: 148, dia: 92, pulse: 80 },
    { sys: 136, dia: 84, pulse: 71 },
    { sys: 133, dia: 81, pulse: 69 },
    { sys: 141, dia: 87, pulse: 74 },
    { sys: 128, dia: 79, pulse: 67 },
    { sys: 139, dia: 85, pulse: 72 },
    { sys: 143, dia: 89, pulse: 76 },
    { sys: 134, dia: 82, pulse: 70 },
  ];

  for (let d = 13; d >= 0; d--) {
    const reading = readings[13 - d];
    // 早上测量
    const morningId = createId("bp");
    db.prepare(
      `INSERT INTO blood_pressure_logs (id, elder_id, measured_by, systolic, diastolic, pulse, note, measured_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      morningId,
      elderId,
      measuredBy,
      reading.sys,
      reading.dia,
      reading.pulse,
      d === 0 ? "早晨起床后测量" : `${daysAgoDate(d)} 早晨记录`,
      daysAgoIso(d, 8, 30),
      daysAgoIso(d, 8, 31)
    );

    // 部分天数有晚上测量
    if (d % 2 === 0) {
      const eveningReading = { sys: reading.sys + 3, dia: reading.dia + 2, pulse: reading.pulse + 2 };
      const eveningId = createId("bp");
      db.prepare(
        `INSERT INTO blood_pressure_logs (id, elder_id, measured_by, systolic, diastolic, pulse, note, measured_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        eveningId,
        elderId,
        measuredBy,
        eveningReading.sys,
        eveningReading.dia,
        eveningReading.pulse,
        d === 0 ? "傍晚测量" : `${daysAgoDate(d)} 傍晚记录`,
        daysAgoIso(d, 18, 0),
        daysAgoIso(d, 18, 1)
      );
    }
  }
}

seedBloodPressure("user-elder", "user-elder");
seedBloodPressure("user-demo-elder", "user-demo-elder");

// ============================================================
// 7. 体检报告
// ============================================================
console.log("生成体检报告...");

const checkupReports = [
  {
    elderId: "user-elder",
    summary: "总体健康状况平稳，血压略偏高，血脂正常范围，建议继续规律服药并定期监测血压。",
    riskLevel: "review",
    advice: JSON.stringify({
      summary: "总体健康状况平稳，血压略偏高，血脂正常范围，建议继续规律服药并定期监测血压。",
      suggestions: [
        "血压略偏高，建议每天早晚各测量一次并记录",
        "继续按时服用降压药，不要自行停药",
        "饮食清淡，减少盐分摄入",
        "适当运动，每天散步30分钟",
      ],
      disclaimer: "仅作健康管理提示，不替代医生诊断。",
    }),
    daysAgo: 7,
  },
  {
    elderId: "user-demo-elder",
    summary: "体检结果基本正常，血糖略高，建议控制饮食并增加运动。",
    riskLevel: "review",
    advice: JSON.stringify({
      summary: "体检结果基本正常，血糖略高，建议控制饮食并增加运动。",
      suggestions: [
        "空腹血糖略高，建议减少甜食和主食摄入",
        "多吃蔬菜和粗粮",
        "每天保持适量运动",
        "一个月后复查空腹血糖",
      ],
      disclaimer: "仅作健康管理提示，不替代医生诊断。",
    }),
    daysAgo: 14,
  },
];

for (const report of checkupReports) {
  const id = createId("checkup");
  db.prepare(
    `INSERT INTO checkup_reports (id, elder_id, uploaded_by, file_name, image_data, summary, advice_json, risk_level, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    report.elderId,
    report.elderId === "user-elder" ? "user-caregiver" : "user-demo-caregiver",
    `体检报告_${daysAgoDate(report.daysAgo)}.jpg`,
    "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAIAAoDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKgAB//Z",
    report.summary,
    report.advice,
    report.riskLevel,
    "local-fallback",
    daysAgoIso(report.daysAgo, 10, 0)
  );
}

// ============================================================
// 8. 告警记录
// ============================================================
console.log("生成告警记录...");

function seedAlerts(elderId, displayName) {
  const alertTemplates = [
    { type: "medication", title: "吃药提醒已设置", message: `TechGuard 吃药提醒：${displayName}每天 08:00 需要服用苯磺酸氨氯地平片（饭后1片）。`, daysAgo: 5 },
    { type: "task", title: "任务已安排", message: `TechGuard 任务提醒：${displayName}今天 08:30 需要完成：早晨量血压。`, daysAgo: 5 },
    { type: "blood_pressure", title: "血压需要关注", message: `TechGuard 血压提醒：${displayName}刚记录血压 148/92 mmHg，这次数值偏高，建议安静休息5分钟后复测一次。`, daysAgo: 4 },
    { type: "fraud", title: "高危短信提醒", message: `TechGuard 高危提醒：${displayName}收到疑似冒充社保诈骗短信，请尽快联系老人，提醒不要点链接、不要回验证码、不要转账。`, daysAgo: 3 },
    { type: "weather", title: "天气地区已设置", message: `TechGuard 天气关怀：已设置${displayName}所在地为北京海淀区。`, daysAgo: 5 },
    { type: "medication", title: "吃药未确认", message: `TechGuard 未确认：${displayName} 20:30 的碳酸钙D3片还没有确认服用。`, daysAgo: 2 },
    { type: "checkup", title: "体检报告已分析", message: `TechGuard 体检报告提醒：${displayName}上传了体检报告照片。总体健康状况平稳，血压略偏高。`, daysAgo: 7 },
    { type: "travel", title: "出行关注", message: `TechGuard 出行提醒：${displayName}正在查询去医院的路线，建议确认是否需要接送。`, daysAgo: 2 },
    { type: "help", title: "一键求助", message: `TechGuard 求助提醒：${displayName}点击了一键联系家属，请尽快查看是否需要帮助。`, daysAgo: 1 },
    { type: "task", title: "任务已完成", message: `${displayName}完成了"下午散步"任务。`, daysAgo: 1 },
  ];

  for (const alert of alertTemplates) {
    const id = createId("alert");
    db.prepare(
      `INSERT INTO alerts (id, elder_id, type, title, message, status, ref_id, created_at)
       VALUES (?, ?, ?, ?, ?, 'new', ?, ?)`
    ).run(id, elderId, alert.type, alert.title, alert.message, null, daysAgoIso(alert.daysAgo, 10, 0));
  }
}

seedAlerts("user-elder", "李建国");
seedAlerts("user-demo-elder", "长辈账号");

// ============================================================
// 9. 飞书通知配置（模拟）
// ============================================================
console.log("生成通知配置...");
for (const caregiverId of ["user-caregiver", "user-demo-caregiver"]) {
  db.prepare(
    `INSERT INTO notification_channels (id, owner_id, channel_type, config_json, enabled, updated_at)
     VALUES (?, ?, 'feishu', ?, 1, ?)`
  ).run(createId("chan"), caregiverId, JSON.stringify({ webhook: "" }), nowIso());
}

// ============================================================
// 验证
// ============================================================
console.log("\n=== 数据生成完成，验证结果 ===");
console.log("用户:", db.prepare("SELECT id, display_name, role FROM users").all());
console.log("吃药安排:", db.prepare("SELECT count(*) as c FROM medication_schedules").get().c, "条");
console.log("用药记录:", db.prepare("SELECT count(*) as c FROM medication_logs").get().c, "条");
console.log("护理任务:", db.prepare("SELECT count(*) as c FROM care_tasks").get().c, "条");
console.log("血压记录:", db.prepare("SELECT count(*) as c FROM blood_pressure_logs").get().c, "条");
console.log("体检报告:", db.prepare("SELECT count(*) as c FROM checkup_reports").get().c, "条");
console.log("告警记录:", db.prepare("SELECT count(*) as c FROM alerts").get().c, "条");
console.log("天气设置:", db.prepare("SELECT count(*) as c FROM weather_settings").get().c, "条");

console.log("\n=== 今日任务（user-elder）===");
console.log(db.prepare("SELECT title, due_time, status FROM care_tasks WHERE elder_id = 'user-elder' AND due_date = ? ORDER BY due_time").all(today));

console.log("\n=== 今日用药（user-elder）===");
console.log(
  db
    .prepare(
      `SELECT ms.medicine_name, ms.time_of_day, ml.status
       FROM medication_logs ml
       JOIN medication_schedules ms ON ms.id = ml.schedule_id
       WHERE ml.elder_id = 'user-elder' AND ml.due_date = ?
       ORDER BY ms.time_of_day`
    )
    .all(today)
);

console.log("\n=== 最近血压（user-elder）===");
console.log(db.prepare("SELECT systolic, diastolic, pulse, measured_at FROM blood_pressure_logs WHERE elder_id = 'user-elder' ORDER BY measured_at DESC LIMIT 5").all());

db.close();
console.log("\n✅ 演示数据生成完成！");
