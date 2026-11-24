// 生成 PWA 图标。项目里没有图像处理依赖，这里用 zlib 手写最小 PNG 编码器，
// 画出「绿色圆角方块 + 白色盾牌 + 对勾」，避免为了两个图标引入 sharp/canvas。
// 用法：node scripts/generate-icons.mjs
import zlib from "node:zlib";
import fs from "node:fs";
import path from "node:path";

const OUT_DIR = path.resolve("icons");
const BG = [11, 102, 91]; // --accent
const FG = [255, 255, 255];

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// 盾牌轮廓：上边两条竖线，下面收成尖角。
function shieldInside(x, y, size) {
  const cx = size / 2;
  const top = size * 0.14;
  const bottom = size * 0.9;
  const halfTop = size * 0.31;
  if (y < top || y > bottom) return false;
  const t = (y - top) / (bottom - top);
  // 上半段保持宽度，下半段按二次曲线收窄到尖角
  const width = t < 0.55 ? halfTop : halfTop * (1 - ((t - 0.55) / 0.45) ** 1.7);
  return Math.abs(x - cx) <= width;
}

function checkInside(x, y, size) {
  // 两段线段组成的对勾
  const p1 = [size * 0.3, size * 0.5];
  const p2 = [size * 0.44, size * 0.64];
  const p3 = [size * 0.72, size * 0.35];
  const thickness = size * 0.062;
  const near = (a, b) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    let t = ((x - a[0]) * dx + (y - a[1]) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = a[0] + t * dx;
    const py = a[1] + t * dy;
    return Math.hypot(x - px, y - py) <= thickness;
  };
  return near(p1, p2) || near(p2, p3);
}

function drawIcon(size, { maskable }) {
  const rgba = Buffer.alloc(size * size * 4);
  const radius = maskable ? 0 : size * 0.22; // maskable 版本铺满整块，交给系统裁
  const scale = maskable ? 0.74 : 1; // maskable 需要把内容收进中间的安全区
  const offset = (1 - scale) / 2;
  const maxAlpha = 255;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let alpha = maxAlpha;
      if (radius > 0) {
        const dx = Math.max(radius - x, x - (size - radius), 0);
        const dy = Math.max(radius - y, y - (size - radius), 0);
        const dist = Math.hypot(dx, dy);
        alpha = dist <= radius ? 255 : Math.max(0, Math.round((1 - (dist - radius)) * 255));
      }
      const lx = (x / size - offset) / scale;
      const ly = (y / size - offset) / scale;
      const inShield = lx >= 0 && lx <= 1 && ly >= 0 && ly <= 1 && shieldInside(lx, ly, 1);
      // 白盾牌 + 盾内镂空出绿色对勾，识别度比纯色块高，也对应「守护」这个产品名。
      const pixel = inShield ? (checkInside(lx, ly, 1) ? BG : FG) : BG;
      const i = (y * size + x) * 4;
      rgba[i] = pixel[0];
      rgba[i + 1] = pixel[1];
      rgba[i + 2] = pixel[2];
      rgba[i + 3] = alpha;
    }
  }
  return encodePng(size, size, rgba);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const outputs = [
  ["icon-192.png", 192, false],
  ["icon-512.png", 512, false],
  ["icon-maskable-512.png", 512, true],
];
for (const [name, size, maskable] of outputs) {
  const png = drawIcon(size, { maskable });
  fs.writeFileSync(path.join(OUT_DIR, name), png);
  console.log(`${name}  ${size}x${size}  ${png.length} bytes`);
}
