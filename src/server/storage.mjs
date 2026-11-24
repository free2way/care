import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

// 体检报告原图存储抽象：
// 1) 默认落盘到 data/uploads/checkups/<id>.<ext>（数据库里只存轻量引用 file://...，不再把 5MB base64 塞进 SQLite/Turso）
// 2) 若配置了 OBJECT_STORAGE_UPLOAD_URL（兼容 R2 / OSS / S3 预签名或网关），优先上传至对象存储并存 https://... 引用
// 3) 若在只读文件系统（如 Vercel Serverless 且未配对象存储）落盘失败，自动退回 base64 存库，保证功能不中断
// 4) 读取时无缝兼容历史 base64 data URL 行、本地 file:// 引用与远程 https:// URL

const mimeToExt = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
};

const extToMime = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

export function parseImageDataUrl(dataUrl) {
  const match = /^data:(image\/(?:png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(dataUrl || ""));
  if (!match) return null;
  const mime = match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase();
  const buffer = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
  return { mime, ext: mimeToExt[mime] || "jpg", buffer };
}

export async function storeCheckupImage({ rootDir, reportId, imageData, fetchWithTimeout }) {
  const parsed = parseImageDataUrl(imageData);
  if (!parsed) throw new Error("图片格式不正确");

  // 优先尝试外部对象存储（例如 Cloudflare R2 / 阿里云 OSS 网关）
  const uploadBase = String(process.env.OBJECT_STORAGE_UPLOAD_URL || "").trim().replace(/\/+$/, "");
  const publicBase = String(process.env.OBJECT_STORAGE_PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
  const authToken = String(process.env.OBJECT_STORAGE_AUTH_TOKEN || "").trim();
  const objectKey = `checkups/${reportId}.${parsed.ext}`;

  if (uploadBase && fetchWithTimeout) {
    try {
      const headers = { "Content-Type": parsed.mime };
      if (authToken) headers.Authorization = `Bearer ${authToken}`;
      const res = await fetchWithTimeout(`${uploadBase}/${objectKey}`, {
        method: "PUT",
        headers,
        body: parsed.buffer,
      });
      if (res.ok) {
        return {
          storageRef: publicBase ? `${publicBase}/${objectKey}` : `${uploadBase}/${objectKey}`,
          backend: "object-storage",
        };
      }
    } catch (error) {
      console.warn("[TechGuard] 对象存储上传失败，将降级本地存储：", error?.message || error);
    }
  }

  // 默认落本地文件系统：data/uploads/checkups/<reportId>.<ext>
  // Serverless 只读目录（如 Vercel）写入失败时退回 base64 存库，避免上传功能不可用
  try {
    const uploadsRoot = resolve(rootDir, "data", "uploads");
    const targetPath = resolve(uploadsRoot, objectKey);
    const rel = relative(uploadsRoot, targetPath);
    if (rel.startsWith("..") || isAbsolute(rel)) throw new Error("非法存储路径");
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, parsed.buffer);
    return {
      storageRef: `file://${objectKey}`,
      backend: "local-fs",
    };
  } catch (error) {
    console.warn("[TechGuard] 本地图片落盘失败，已退回数据库存储：", error?.message || error);
    return {
      storageRef: imageData,
      backend: "db-inline",
    };
  }
}

export function readStoredCheckupImage({ rootDir, storageRef }) {
  const ref = String(storageRef || "");
  if (!ref) return null;

  // 1. 历史数据或只读环境兜底：直接是 data:image/...;base64,...
  if (ref.startsWith("data:image/")) {
    const parsed = parseImageDataUrl(ref);
    if (!parsed) return null;
    return { kind: "buffer", mime: parsed.mime, buffer: parsed.buffer };
  }

  // 2. 本地文件引用：file://checkups/<id>.<ext>
  if (ref.startsWith("file://")) {
    const relKey = ref.slice("file://".length).replace(/^\/+/, "");
    const uploadsRoot = resolve(rootDir, "data", "uploads");
    const targetPath = resolve(uploadsRoot, relKey);
    const rel = relative(uploadsRoot, targetPath);
    if (rel.startsWith("..") || isAbsolute(rel) || !existsSync(targetPath)) return null;
    const ext = relKey.split(".").pop()?.toLowerCase() || "jpg";
    return {
      kind: "buffer",
      mime: extToMime[ext] || "application/octet-stream",
      buffer: readFileSync(targetPath),
    };
  }

  // 3. 远程对象存储 URL
  if (/^https:\/\//i.test(ref)) {
    return { kind: "redirect", url: ref };
  }

  return null;
}
