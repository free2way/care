# 定时提醒接入指南

TechGuard 的到点提醒依赖一个外部调度器按固定间隔调用：

```text
GET https://<你的域名>/api/cron/reminders
Authorization: Bearer <CRON_SECRET>
```

调度器只负责「按点敲门」，具体该提醒谁、提醒什么由应用判断。这样漏服检测、超时升级、去重都在应用里，不会因为调度器换厂家而失效。

## 飞书能不能当定时器？

不能。飞书在这条链路里是**投递渠道**，不是调度器：

- **飞书自定义机器人**：只能被动接收 HTTP 请求然后往群里发消息。它不会按你的用药时间表主动调用 TechGuard。
- **飞书多维表格自动化**：确实支持「定时触发 → 发送飞书消息」，如果你的需求只是每个固定时间往群里发一条固定文案，飞书自己就够了，不需要这个应用。
- 但本应用要判断的是「08:00 那一剂到现在还没确认」「超过 30 分钟要升级提醒」「今天这一剂算漏服」——这些状态在应用的数据库里，飞书自动化看不到。

**正确分工**：外部调度器按点调用 `/api/cron/reminders` → 应用查库决定发什么 → 飞书负责把消息送到群里。

## 调度器选项

| 方案 | 成本 | 最小间隔 | 说明 |
| --- | --- | --- | --- |
| cron-job.org 等免费外部 cron | 免费 | 1 分钟 | 最省事，适合 Vercel Hobby 部署 |
| Cloudflare Workers Cron Trigger | 免费 | 1 分钟 | 真 cron，需要写几行 Worker |
| GitHub Actions schedule | 免费 | 5 分钟 | 队列延迟可能 5–15 分钟，仓库 60 天无活动会自动停用 |
| Vercel Pro | $20/月 | 1 分钟 | 改 `vercel.json` 一个表达式即可，无需外部服务 |

> Vercel Hobby 计划限制 cron「每天只能跑一次」，且触发时间只保证在整点前后 ±59 分钟内（[官方文档](https://vercel.com/docs/cron-jobs/usage-and-pricing)）。所以 Hobby 部署必须走外部调度器。

### 方案 A：cron-job.org（推荐，免费）

1. 注册后新建 cronjob。
2. URL 填 `https://<你的域名>/api/cron/reminders`。
3. 执行频率选 **每 5 分钟**。
4. 在「Advanced → Headers」加一条：
   - Key：`Authorization`
   - Value：`Bearer <你的 CRON_SECRET>`
5. 保存并手动 Run 一次，确认返回 `{"ok":true,...}`。

### 方案 B：Cloudflare Workers Cron Trigger（免费）

`wrangler.toml`：

```toml
name = "techguard-cron"
main = "src/index.js"
compatibility_date = "2026-01-01"

[triggers]
crons = ["*/5 * * * *"]
```

`src/index.js`：

```js
export default {
  async scheduled(_event, _env, ctx) {
    ctx.waitUntil(
      fetch("https://<你的域名>/api/cron/reminders", {
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
      }).then((res) => res.text().then((body) => console.log(res.status, body)))
    );
  },
};
```

用 `wrangler secret put CRON_SECRET` 存密钥，不要写进代码。

### 方案 C：Vercel Pro

`vercel.json`：

```json
{
  "crons": [{ "path": "/api/cron/reminders", "schedule": "*/5 * * * *" }]
}
```

并确保环境变量里设置了 `CRON_SECRET`——Vercel Cron 会自动带上 `Authorization: Bearer $CRON_SECRET`。

## 提醒节奏

`/api/cron/reminders` 是幂等的，被高频调用不会重复打扰。每次调用按下面的规则处理：

| 阶段 | 触发条件 | 结果 |
| --- | --- | --- |
| 到点提醒 | 已到用药时间、状态为待确认、`reminder_count = 0` | 通知家属「该吃药了」，`reminder_count` 置 1 |
| 升级提醒 | 已过点 30 分钟仍未确认、`reminder_count = 1` | 通知家属「吃药仍未确认，建议打电话」，`reminder_count` 置 2 |
| 静默 | `reminder_count = 2` | 不再打扰，避免刷屏 |
| 漏服沉淀 | 日期已过且仍为待确认 | 状态转为 `missed`，进入家属端「最近一周漏服」面板 |

升级阈值可以用环境变量调整：

```bash
MEDICATION_ESCALATE_AFTER_MINUTES=30
```

任务到点提醒和每日天气关怀同样是幂等的（每个任务/每天各一次）。

## 鉴权

- 设置了 `CRON_SECRET`：必须带 `Authorization: Bearer <CRON_SECRET>`，否则 403。
- 没设置：只接受本机回环地址或 `vercel-cron/*` 的请求，其余 403，启动时会打印告警。

**线上部署请务必设置 `CRON_SECRET`**，否则接口对任何来源（伪造 UA 即可）开放，会被用来刷家属的飞书群。
