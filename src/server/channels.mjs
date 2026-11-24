// 多通道家属通知适配器：支持飞书、企业微信（微信内可直接收消息）、钉钉，以及紧急短信/语音网关兜底。
// 每个通道都强制做域名 + 路径白名单校验，杜绝 SSRF。

export const SUPPORTED_WEBHOOK_CHANNELS = new Set(["feishu", "wecom", "dingtalk"]);

const channelValidators = {
  feishu: {
    hosts: new Set(["open.feishu.cn", "open.larksuite.com"]),
    pathPattern: /^\/open-apis\/bot\/v2\/hook\/[A-Za-z0-9_-]{8,}$/,
    hint: "飞书 Webhook 必须为 https://open.feishu.cn/open-apis/bot/v2/hook/... 格式",
  },
  wecom: {
    hosts: new Set(["qyapi.weixin.qq.com"]),
    pathPattern: /^\/cgi-bin\/webhook\/send$/,
    queryRequired: "key",
    hint: "企业微信机器人 Webhook 必须为 https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=... 格式",
  },
  dingtalk: {
    hosts: new Set(["oapi.dingtalk.com"]),
    pathPattern: /^\/robot\/send$/,
    queryRequired: "access_token",
    hint: "钉钉机器人 Webhook 必须为 https://oapi.dingtalk.com/robot/send?access_token=... 格式",
  },
};

export function normalizeChannelWebhook(channelType, value) {
  const rule = channelValidators[channelType];
  if (!rule) throw new Error("不支持的通知通道类型，仅支持 feishu、wecom、dingtalk");
  const text = String(value ?? "").trim();
  if (!text) return "";
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error(rule.hint);
  }
  if (parsed.protocol !== "https:" || !rule.hosts.has(parsed.hostname)) {
    throw new Error(rule.hint);
  }
  if (!rule.pathPattern.test(parsed.pathname)) {
    throw new Error(rule.hint);
  }
  if (rule.queryRequired) {
    const token = String(parsed.searchParams.get(rule.queryRequired) || "").trim();
    if (token.length < 8) throw new Error(rule.hint);
  }
  return parsed.toString();
}

// 脱敏展示已配置的 Webhook（保留前缀与最后 4 位，避免完整密钥回显在普通列表中）
export function maskWebhook(webhook) {
  const text = String(webhook || "").trim();
  if (!text) return "";
  if (text.length <= 24) return "****";
  return `${text.slice(0, 32)}…${text.slice(-4)}`;
}

// 向指定 Webhook 通道推送消息（企业微信 / 钉钉走 Markdown，飞书走卡片或纯文本）
export async function postWebhookChannel(channelType, webhook, { title, body, feishuCard }, fetchWithTimeout) {
  if (!webhook) return { ok: false, message: "未配置 Webhook" };
  let payload;
  if (channelType === "feishu") {
    payload = feishuCard
      ? { msg_type: "interactive", card: feishuCard }
      : { msg_type: "text", content: { text: title ? `${title}\n${body}` : body } };
  } else if (channelType === "wecom") {
    payload = {
      msgtype: "markdown",
      markdown: { content: `### ${title || "TechGuard 守护提醒"}\n${body}` },
    };
  } else if (channelType === "dingtalk") {
    payload = {
      msgtype: "markdown",
      markdown: {
        title: title || "TechGuard 守护提醒",
        text: `### ${title || "TechGuard 守护提醒"}\n\n${body}`,
      },
    };
  } else {
    return { ok: false, message: "不支持的通知通道" };
  }

  try {
    const res = await fetchWithTimeout(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { ok: false, message: `${channelType} 拒绝了本次推送（HTTP ${res.status}）` };
    return { ok: true, channel: channelType };
  } catch (error) {
    console.warn(`[TechGuard] ${channelType} 通知发送失败：`, error?.message || error);
    return { ok: false, message: `${channelType} 通知发送失败，请检查配置与网络` };
  }
}

// 高危紧急事件的短信/语音外呼网关兜底（可选配置 SMS_GATEWAY_URL + SMS_GATEWAY_TOKEN）
export const URGENT_NOTIFICATION_TYPES = new Set([
  "help_requested",
  "inactivity_alert",
  "blood_pressure_abnormal",
  "fraud_detected",
]);

export async function dispatchUrgentSmsGateway({ phone, type, title, body }, fetchWithTimeout) {
  const gatewayUrl = String(process.env.SMS_GATEWAY_URL || "").trim();
  if (!gatewayUrl || !phone || !URGENT_NOTIFICATION_TYPES.has(type)) return null;
  const gatewayToken = String(process.env.SMS_GATEWAY_TOKEN || "").trim();
  try {
    const headers = { "Content-Type": "application/json; charset=utf-8" };
    if (gatewayToken) headers.Authorization = `Bearer ${gatewayToken}`;
    const res = await fetchWithTimeout(gatewayUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ phone, type, title, body }),
    });
    return { ok: res.ok, channel: "sms_gateway" };
  } catch (error) {
    console.warn("[TechGuard] 紧急短信/语音网关发送失败：", error?.message || error);
    return { ok: false, channel: "sms_gateway" };
  }
}
