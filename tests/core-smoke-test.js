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

console.log("TechGuard v0.1 smoke tests passed");
