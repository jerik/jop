import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}
export function makeIcon(size) {
  const rows = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const paper = u > .24 && u < .76 && v > .16 && v < .84;
      const line = u > .34 && u < .66 && [.33, .48, .63].some(top => v > top && v < top + .045);
      const color = paper && !line ? [248, 250, 252] : [22, 78, 99];
      rows.set(color, y * (1 + size * 3) + 1 + x * 3);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0)),
  ]);
}
if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  for (const size of [180, 192, 512]) {
    writeFileSync(new URL(`../icon-${size}.png`, import.meta.url), makeIcon(size));
  }
}
