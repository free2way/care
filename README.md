# TechGuard Senior Care Console

TechGuard Senior Care Console is a multi-agent care application for older adults living independently and the family members who support them. It provides two separated experiences: seniors get a simple daily workspace for reminders, fraud checks, health records, and travel help, while caregivers can configure medication schedules, tasks, weather care, travel plans, and Feishu group notifications.

The highlight is its practical multi-agent workflow. A medication agent manages medicine reminders, a task agent tracks family assignments, a fraud-protection agent checks suspicious SMS messages, a health agent reviews blood pressure and checkup reports, a travel agent gives senior-friendly route advice, and a notification agent sends important events to the family care group. Together, these agents turn scattered care needs into clear, timely, and trackable actions.

TechGuard aims to make technology warmer and easier for seniors. It helps reduce digital anxiety, improves family care coordination, and gives older adults more confidence when facing daily health, travel, and online safety situations.

Full English documentation: [README_EN.md](README_EN.md)

English app URL:

```text
/?lang=en
```

![TechGuard English homepage](docs/assets/techguard-english-home.png)

## 演示账号

项目启动后会自动创建一组通用演示账号：

| 角色 | 登录名 | 密码 |
| --- | --- | --- |
| 家属端 | `caregiver` | `demo1234` |
| 长辈端 | `elder` | `demo1234` |

这些账号仅用于本地演示。公开部署前请替换为正式认证方案，并修改默认密码。

## 本地运行

```bash
PORT=5174 node server.mjs
```

打开浏览器访问：

```text
http://127.0.0.1:5174
```

英文界面：

```text
http://127.0.0.1:5174/?lang=en
```

局域网手机访问时，把 `127.0.0.1` 替换为电脑在同一 Wi-Fi 下的局域网地址。

## 可选配置

飞书机器人通知：

```bash
FEISHU_WEBHOOK_URL="https://open.feishu.cn/open-apis/bot/v2/hook/xxxx" PORT=5174 node server.mjs
```

线上定时提醒：

- `vercel.json` 已配置 `/api/cron/reminders` 每天扫描一次，以兼容 Vercel Hobby 计划。
- 如果设置了 `CRON_SECRET`，Vercel Cron 会带上 `Authorization: Bearer $CRON_SECRET`，接口会用它校验来源。
- 如果需要 5 分钟级准时提醒，可以升级 Vercel Pro，或使用外部定时服务调用同一路径。

OpenAI 出行和体检报告分析：

```bash
OPENAI_API_KEY="你的 OpenAI API Key" PORT=5174 node server.mjs
```

## 开发检查

```bash
node --check src/app.js
node --check server.mjs
node tests/core-smoke-test.js
```

## 目录结构

| 文件 | 说明 |
| --- | --- |
| `index.html` | 应用主页面 |
| `src/styles.css` | 响应式界面样式 |
| `src/app.js` | 前端交互、角色界面和模块渲染 |
| `server.mjs` | Node 服务、SQLite API、飞书通知和 AI 调用 |
| `sw.js` | 手机通知演示用 Service Worker |
| `tests/core-smoke-test.js` | 核心功能冒烟测试 |

## 数据与隐私

- 本地 SQLite 数据库默认创建在 `data/techguard.db`，该文件已在 `.gitignore` 中排除。
- 飞书 Webhook 和 OpenAI Key 请通过环境变量配置，不要写入代码仓库。
- 体检报告照片和健康数据属于敏感信息，生产环境建议迁移到受控对象存储，并增加访问权限、加密和审计。
