/**
 * Regenerates the app icons from the ring mark (src/lib/brand/ring-mark.ts):
 *   src/app/icon.svg        favicon (any size)
 *   src/app/apple-icon.png  180x180 home-screen icon (square; iOS rounds it)
 *   src/app/favicon.ico     16/32/48 PNGs, for browsers without SVG favicons
 * Run: npx tsx scripts/build-icons.mts
 */
import sharp from "sharp";
import { writeFileSync } from "node:fs";
import { ringMarkSvg } from "../src/lib/brand/ring-mark.ts";

writeFileSync("src/app/icon.svg", ringMarkSvg({ size: 64 }) + "\n");
await sharp(Buffer.from(ringMarkSvg({ size: 180, radius: 0 })), { density: 288 }).resize(180, 180).png().toFile("src/app/apple-icon.png");
// ICO container holding PNG images (supported by every current browser).
const sizes = [16, 32, 48];
const pngs = await Promise.all(sizes.map((n) => sharp(Buffer.from(ringMarkSvg({ size: 64 })), { density: 72 * (n / 64) * 4 }).resize(n, n).png().toBuffer()));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((n, i) => {
  const e = 6 + i * 16;
  header.writeUInt8(n, e);
  header.writeUInt8(n, e + 1);
  header.writeUInt16LE(1, e + 4); // colour planes
  header.writeUInt16LE(32, e + 6); // bits per pixel
  header.writeUInt32LE(pngs[i].length, e + 8);
  header.writeUInt32LE(offset, e + 12);
  offset += pngs[i].length;
});
writeFileSync("src/app/favicon.ico", Buffer.concat([header, ...pngs]));
console.log("wrote src/app/icon.svg, src/app/apple-icon.png and src/app/favicon.ico");
