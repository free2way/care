import { Readable } from "node:stream";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
process.env.FEISHU_WEBHOOK_URL = "";
process.env.FEISHU_RECEIVE_ID = "";
process.env.CRON_SECRET = "";

const { appHandler } = await import("../server.mjs");

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

  const secondScan = await api("/api/cron/reminders");
  assert(secondScan.taskRemindersSent === 0, `TC-011 expected no duplicate reminders, got ${secondScan.taskRemindersSent}`);

  const notifications = await api("/api/notifications");
  assert(
    notifications.notifications.some((item) => item.type === "task_due" && /测试任务飞书提醒/.test(item.body)),
    "TC-012 expected task_due notification"
  );
} finally {
  // No server sockets are opened in this test.
}

console.log("TechGuard v0.1 smoke tests passed");

function todayDate() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
}

async function callApp(path, { method = "GET", body = null, cookie = "" } = {}) {
  const rawBody = body ? JSON.stringify(body) : "";
  const request = Readable.from(rawBody ? [Buffer.from(rawBody)] : []);
  request.method = method;
  request.url = path;
  request.headers = {
    ...(rawBody ? { "content-type": "application/json" } : {}),
    ...(cookie ? { cookie } : {}),
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
