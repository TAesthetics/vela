/**
 * Render VELA's app icons and splash screens into the generated native
 * projects (ios/, android/) from the committed SVGs in resources/.
 * Run via `npm run native:setup` (or `node scripts/native-assets.mjs`).
 *
 * Opaque images are written as RGB PNGs without an alpha channel (App Store
 * Connect rejects app icons with alpha).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";
import { Resvg } from "@resvg/resvg-js";

const BG = "#12100E";
const read = (name) => readFileSync(join("resources", name), "utf8");
const icon = read("icon.svg");
const foreground = read("icon-foreground.svg");
const splash = read("splash.svg");

/** Re-root an SVG at a new pixel size, cropping/centering like CSS `cover`. */
function resize(svg, width, height, extra = "") {
  const inner = svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  const box = svg.match(/viewBox="([^"]+)"/)[1];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${box}" preserveAspectRatio="xMidYMid slice">${extra}${inner}</svg>`;
}

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
/** Encode raw RGBA pixels as PNG; `alpha: false` drops the alpha channel. */
function encodePng(rgba, width, height, alpha) {
  const channels = alpha ? 4 : 3;
  const raw = Buffer.alloc((width * channels + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * channels + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4;
      const dst = row + 1 + x * channels;
      raw[dst] = rgba[src];
      raw[dst + 1] = rgba[src + 1];
      raw[dst + 2] = rgba[src + 2];
      if (alpha) raw[dst + 3] = rgba[src + 3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = alpha ? 6 : 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function render(svg, width, height, { alpha = false, background } = {}) {
  const image = new Resvg(resize(svg, width, height), {
    fitTo: { mode: "width", value: width },
    background: alpha ? background : (background ?? BG),
  }).render();
  return encodePng(image.pixels, image.width, image.height, alpha);
}

/** Width/height of an existing PNG (template placeholder) from its IHDR. */
function pngSize(file) {
  const buf = readFileSync(file);
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

function write(file, data) {
  writeFileSync(file, data);
  console.log(`  ${file}`);
}

// ── iOS ─────────────────────────────────────────────────────────────────────
const iosAssets = "ios/App/App/Assets.xcassets";
if (existsSync(iosAssets)) {
  console.log("iOS");
  write(`${iosAssets}/AppIcon.appiconset/AppIcon-512@2x.png`, render(icon, 1024, 1024));
  for (const name of readdirSync(`${iosAssets}/Splash.imageset`).filter((f) =>
    f.endsWith(".png"),
  )) {
    const file = `${iosAssets}/Splash.imageset/${name}`;
    const [w, h] = pngSize(file);
    write(file, render(splash, w, h));
  }
}

// ── Android ─────────────────────────────────────────────────────────────────
const res = "android/app/src/main/res";
if (existsSync(res)) {
  console.log("Android");
  const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  const round = `<defs><clipPath id="r"><circle cx="512" cy="512" r="512"/></clipPath></defs>`;
  const roundIcon = icon
    .replace(
      /<rect [^>]*\/>/,
      `${round}<g clip-path="url(#r)"><rect width="1024" height="1024" fill="${BG}"/>`,
    )
    .replace(/<\/svg>\s*$/, "</g></svg>");
  for (const [density, scale] of Object.entries(densities)) {
    const dir = `${res}/mipmap-${density}`;
    if (!existsSync(dir)) continue;
    const size = Math.round(48 * scale);
    write(`${dir}/ic_launcher.png`, render(icon, size, size));
    write(`${dir}/ic_launcher_round.png`, render(roundIcon, size, size, { alpha: true }));
    const fg = Math.round(108 * scale);
    write(`${dir}/ic_launcher_foreground.png`, render(foreground, fg, fg, { alpha: true }));
  }
  for (const dir of readdirSync(res).filter((d) => d.startsWith("drawable"))) {
    const file = `${res}/${dir}/splash.png`;
    if (!existsSync(file) || !statSync(file).isFile()) continue;
    const [w, h] = pngSize(file);
    write(file, render(splash, w, h));
  }
}

// ── Store listing graphics (Google Play icon + feature graphic) ─────────────
mkdirSync("store-assets", { recursive: true });
console.log("Store");
write("store-assets/play-icon-512.png", render(icon, 512, 512));
write("store-assets/app-store-icon-1024.png", render(icon, 1024, 1024));
write("store-assets/feature-graphic-1024x500.png", render(splash, 1024, 500));
