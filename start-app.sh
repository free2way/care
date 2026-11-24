#!/bin/sh
# 启动 TechGuard 本地服务。
#
# 为什么单独放一个脚本：在 AI 会话里用「后台任务」方式起的进程，会在该回话结束时
# 被环境回收（日志里能看到 SIGTERM），表现为「刚才还能打开，过一会儿就连不上」。
# 在你自己的终端里跑这个脚本，进程就属于你的终端会话，不会被会话回收。
#
# 用法：
#   sh start-app.sh              # 前台运行，Ctrl+C 停止
#   PORT=8080 sh start-app.sh    # 换端口
set -e
cd "$(dirname "$0")"
PORT="${PORT:-5174}"
echo "TechGuard 启动中… 打开 http://127.0.0.1:${PORT}/"
echo "演示账号：caregiver / demo1234（家属端）  elder / demo1234（长辈端）"
exec env PORT="$PORT" node server.mjs
