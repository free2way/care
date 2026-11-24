// TechGuard 纯领域规则模块（无 DB / HTTP 依赖，可独立单测）
// 包含：血压评估、防骗规则、生活事件中文时间解析、用药周期判定、体检指标参考范围、天气兜底与地理候选、适老路线评分。

// ---- 1. 血压评估 ----
export function analyzeBloodPressure(logs) {
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

export function isAbnormalBloodPressure(record) {
  const level = analyzeBloodPressure([record]).level;
  return level === "warning" || level === "danger";
}

// ---- 2. 防骗规则引擎 ----
export function inferFraudType(text) {
  if (/社保|医保/.test(text)) return "冒充社保或医保诈骗";
  if (/银行|账户|银行卡/.test(text)) return "冒充银行诈骗";
  if (/公安|法院|检察院|通缉|涉案/.test(text)) return "冒充公检法诈骗";
  if (/中奖|大奖|手续费/.test(text)) return "中奖领奖诈骗";
  return "疑似电信网络诈骗";
}

export function analyzeFraud(text, elderName = "") {
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
  const addressee = String(elderName || "").trim() || "您";
  return {
    score,
    level: score >= 80 ? "高危诈骗" : score >= 41 ? "中风险可疑信息" : "低风险信息",
    type: inferFraudType(text),
    reasons: matched.map(([name]) => name),
    reply_for_elder:
      score >= 80
        ? `${addressee}，这条信息很像骗子发来的，千万别点链接，也不要回复验证码。我已经提醒家人了。`
        : `${addressee}，这条信息先别急着操作，可以让家属帮您看一眼。`,
  };
}

// ---- 3. 生活事件解析（中文口语分类与时间推断）----
const lifeEventKindRules = [
  { kind: "unwell", words: ["不舒服", "头晕", "头疼", "头痛", "心慌", "胸闷", "恶心", "想吐", "疼", "难受", "发烧", "咳嗽", "没力气", "乏力", "摔"] },
  { kind: "medication", words: ["吃药", "服药", "用药", "降压药", "药片", "胶囊", "吃过药", "吃了药"] },
  { kind: "meal", words: ["吃饭", "早饭", "午饭", "晚饭", "早餐", "午餐", "晚餐", "喝粥", "吃了饭", "面条", "米饭"] },
  { kind: "sleep", words: ["睡觉", "睡了", "起床", "午睡", "睡着", "失眠", "醒来"] },
  {
    kind: "outing",
    words: ["出门", "散步", "溜达", "买菜", "公园", "超市", "医院", "去逛", "下楼", "广场", "活动中心"],
    patterns: [/出去|遛弯|菜市场|买.{0,3}菜/],
  },
  { kind: "mood", words: ["高兴", "开心", "愉快", "难过", "伤心", "寂寞", "孤单", "心烦", "想念", "担心"] },
];

const chineseDigits = { 零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const clockTokenPattern = "\\d{1,2}|[零一二三四五六七八九十两]+";

const lifeEventPeriods = [
  { words: ["凌晨"], defaultTime: "04:00", apply: (hour) => hour },
  { words: ["早上", "上午"], defaultTime: "08:00", apply: (hour) => hour },
  { words: ["中午"], defaultTime: "12:00", apply: (hour) => hour },
  { words: ["早饭", "早餐"], defaultTime: "08:00", apply: (hour) => hour },
  { words: ["午饭", "午餐"], defaultTime: "12:00", apply: (hour) => hour },
  { words: ["晚饭", "晚餐"], defaultTime: "18:00", apply: (hour) => hour },
  { words: ["下午"], defaultTime: "15:00", apply: (hour) => (hour < 12 ? hour + 12 : hour) },
  { words: ["傍晚"], defaultTime: "18:00", apply: (hour) => (hour < 12 ? hour + 12 : hour) },
  { words: ["晚上", "夜里"], defaultTime: "20:00", apply: (hour) => (hour === 12 ? 0 : hour < 12 ? hour + 12 : hour) },
];

function detectLifeEventKind(text) {
  for (const rule of lifeEventKindRules) {
    if (rule.words?.some((word) => text.includes(word))) return rule.kind;
    if (rule.patterns?.some((pattern) => pattern.test(text))) return rule.kind;
  }
  return "other";
}

function chineseToNumber(token) {
  if (/^\d+$/.test(token)) return Number(token);
  if (!/^[零一二三四五六七八九十两]+$/.test(token)) return null;
  if (token.includes("十")) {
    const [tensText, onesText] = token.split("十");
    const tens = tensText === "" ? 1 : chineseDigits[tensText];
    const ones = onesText === "" ? 0 : chineseDigits[onesText];
    if (tens === undefined || ones === undefined) return null;
    return tens * 10 + ones;
  }
  if (token.length !== 1) return null;
  return chineseDigits[token] ?? null;
}

function extractClockTime(text) {
  const colon = /(\d{1,2})\s*[:：]\s*(\d{1,2})/.exec(text);
  if (colon) {
    const minute = Number(colon[2]);
    if (minute <= 59) return { hour: Number(colon[1]), minute };
  }
  const half = new RegExp(`(${clockTokenPattern})\\s*点\\s*半`).exec(text);
  if (half) {
    const hour = chineseToNumber(half[1]);
    if (hour !== null) return { hour, minute: 30 };
  }
  const point = new RegExp(`(${clockTokenPattern})\\s*点\\s*(\\d{1,2}|[零一二三四五六七八九十]+)?\\s*分?`).exec(text);
  if (point) {
    const hour = chineseToNumber(point[1]);
    const minute = point[2] ? chineseToNumber(point[2]) : 0;
    if (hour !== null && minute !== null && minute <= 59) return { hour, minute };
  }
  return null;
}

function formatClock(hour, minute) {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function inferLifeEventTime(text) {
  const clock = extractClockTime(text);
  const period = lifeEventPeriods.find((item) => item.words.some((word) => text.includes(word))) || null;
  if (clock) {
    const hour = period ? period.apply(clock.hour) : clock.hour;
    return formatClock(hour, clock.minute);
  }
  return period ? period.defaultTime : null;
}

export function parseLifeEvent(text) {
  const raw = String(text || "");
  return { kind: detectLifeEventKind(raw), occurredAt: inferLifeEventTime(raw) };
}

// ---- 4. 用药周期与日期计算 ----
export function diffIsoDays(baseDate, targetDate) {
  const base = Date.parse(`${baseDate}T00:00:00Z`);
  const target = Date.parse(`${targetDate}T00:00:00Z`);
  return Math.round((target - base) / 86_400_000);
}

export function isoWeekday(dateText) {
  const day = new Date(`${dateText}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

export function addDaysToIsoDate(dateText, days) {
  const base = Date.parse(`${dateText}T00:00:00Z`);
  return new Date(base + days * 86_400_000).toISOString().slice(0, 10);
}

export function isMedicationDueOnDate(schedule, dateText) {
  if (!schedule || Number(schedule.enabled) === 0) return false;
  if (schedule.start_date && dateText < schedule.start_date) return false;
  if (schedule.end_date && dateText > schedule.end_date) return false;
  const rule = schedule.repeat_rule || "daily";
  if (rule === "daily") return true;
  if (rule === "alternate") {
    const anchor = schedule.start_date || String(schedule.created_at || "").slice(0, 10) || dateText;
    const diff = diffIsoDays(anchor, dateText);
    return diff >= 0 && diff % 2 === 0;
  }
  if (rule === "weekly") {
    const days = String(schedule.repeat_days || "")
      .split(",")
      .map((item) => Number(item))
      .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7);
    if (!days.length) return false;
    return days.includes(isoWeekday(dateText));
  }
  return true;
}

// ---- 5. 天气辅助与兜底 ----
export function buildFallbackWeatherCare(weather) {
  const location = `${weather.city}${weather.district || ""}`;
  return {
    text: `${location}的实时天气暂时取不到（网络或天气服务不可用）。出门前自己看一眼窗外：下雨就带伞，觉得冷就多穿一件。`,
    severe: false,
    source: "local-fallback",
  };
}

export function weatherGeocodeCandidates(weather) {
  const stripSuffix = (text, suffixes) => {
    const trimmed = String(text || "").trim();
    for (const suffix of suffixes) {
      if (trimmed.length > suffix.length && trimmed.endsWith(suffix)) return trimmed.slice(0, -suffix.length);
    }
    return "";
  };
  const city = String(weather?.city || "").trim();
  const district = String(weather?.district || "").trim();
  const cityBare = stripSuffix(city, ["特别行政区", "自治区", "市", "省"]);
  const candidates = [
    `${city}${district}`,
    city,
    cityBare ? `${cityBare}${district}` : "",
    cityBare,
  ];
  return [...new Set(candidates.filter(Boolean))];
}

export function weatherCodeLabel(code) {
  if (code === 0) return "晴朗";
  if ([1, 2, 3].includes(code)) return "多云";
  if ([45, 48].includes(code)) return "有雾";
  if (code >= 51 && code <= 67) return "有雨";
  if (code >= 71 && code <= 77) return "有雪";
  if (code >= 80 && code <= 82) return "有阵雨";
  if (code >= 95 && code <= 99) return "有雷雨";
  return "天气平稳";
}
