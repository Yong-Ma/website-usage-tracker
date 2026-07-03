import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const SIZES = [16, 32, 48, 128];

for (const size of SIZES) {
  writeFileSync(`assets/icon-${size}.png`, createIconPng(size));
}

function createIconPng(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const radius = size * 0.2;
  const center = size / 2;
  const outerRadius = size * 0.31;
  const innerRadius = size * 0.2;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const bgAlpha = roundedRectAlpha(x + 0.5, y + 0.5, size, radius);
      setPixel(pixels, index, 23, 32, 51, Math.round(255 * bgAlpha));

      const distance = Math.hypot(x + 0.5 - center, y + 0.5 - center);
      if (distance <= outerRadius) {
        setPixel(pixels, index, 255, 255, 255, 255);
      }
      if (distance <= outerRadius && distance >= innerRadius && isBlueArc(x + 0.5, y + 0.5, center)) {
        setPixel(pixels, index, 45, 127, 249, 255);
      }
      if (isClockHand(x + 0.5, y + 0.5, center, size)) {
        setPixel(pixels, index, 23, 32, 51, 255);
      }
    }
  }

  return encodePng(size, size, pixels);
}

function roundedRectAlpha(x, y, size, radius) {
  const dx = Math.max(radius - x, 0, x - (size - radius));
  const dy = Math.max(radius - y, 0, y - (size - radius));
  return dx * dx + dy * dy <= radius * radius ? 1 : 0;
}

function isBlueArc(x, y, center) {
  const angle = Math.atan2(y - center, x - center);
  return angle > -2.8 && angle < 1.2;
}

function isClockHand(x, y, center, size) {
  const stroke = Math.max(1.5, size * 0.045);
  const vertical = Math.abs(x - center) <= stroke && y >= center - size * 0.16 && y <= center + size * 0.04;
  const diagonal = distanceToSegment(x, y, center, center, center + size * 0.14, center + size * 0.09) <= stroke;
  return vertical || diagonal;
}

function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function setPixel(pixels, index, red, green, blue, alpha) {
  pixels[index] = red;
  pixels[index + 1] = green;
  pixels[index + 2] = blue;
  pixels[index + 3] = alpha;
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    createChunk('IHDR', createIhdr(width, height)),
    createChunk('IDAT', deflateSync(raw)),
    createChunk('IEND', Buffer.alloc(0)),
  ]);
}

function createIhdr(width, height) {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data[8] = 8;
  data[9] = 6;
  data[10] = 0;
  data[11] = 0;
  data[12] = 0;
  return data;
}

function createChunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
