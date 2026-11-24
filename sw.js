// TechGuard Service Worker
// 职责：1）接收后台 Web Push 弹系统通知；2）缓存静态应用壳，弱网或离线时页面仍能打开。
// 注意：这个文件必须保留在项目根目录，推送服务端记录的订阅才找得到它。

const SHELL_CACHE = "techguard-shell-v1";
const SHELL_ASSETS = ["/", "/index.html", "/src/styles.css", "/src/app.js", "/manifest.json", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .catch(() => null)
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== SHELL_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// 仅对同源静态资源做「网络优先、离线回退缓存」；不缓存 /api/ 敏感健康数据，避免泄露或陈旧状态。
self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy)).catch(() => null);
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("/index.html")))
  );
});

// 服务端下发的 payload 契约：{ title, body, url, tag }
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // 有些推送服务只会给纯文本，退回成正文，不要让通知整个丢掉。
    payload = { body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "TechGuard 提醒";
  const options = {
    body: payload.body || "打开应用查看今天的安排。",
    // tag 相同的新通知会覆盖旧的：同一剂药不会在通知栏堆很多条。
    tag: payload.tag || "techguard",
    renotify: Boolean(payload.tag),
    requireInteraction: true, // 老人可能没马上看到，不要自动消失
    data: { url: payload.url || "/" },
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // 已经开着应用就聚焦它，不再开新窗口。
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(target).catch(() => null);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
