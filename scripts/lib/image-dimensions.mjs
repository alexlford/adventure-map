import fs from 'node:fs/promises';
import path from 'node:path';

const SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3,
  0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb,
  0xcd, 0xce, 0xcf
]);

export const normalizeImageSrc = value => {
  const raw = String(value || '').trim();
  if (!raw || /^(?:data:|https?:|\/\/)/i.test(raw)) return null;
  return raw.split(/[?#]/, 1)[0].replace(/^\.\//, '').replace(/^\/+/, '');
};

const positive = (width, height) => Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0
  ? { width: Math.round(width), height: Math.round(height) }
  : null;

function jpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 8 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    let marker = buffer[offset + 1];
    offset += 2;
    while (marker === 0xff && offset < buffer.length) marker = buffer[offset++];
    if (marker === 0xd8 || marker === 0x01) continue;
    if (marker === 0xd9 || marker === 0xda) break;
    if (offset + 2 > buffer.length) break;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) break;
    if (SOF_MARKERS.has(marker) && length >= 7) {
      return positive(buffer.readUInt16BE(offset + 5), buffer.readUInt16BE(offset + 3));
    }
    offset += length;
  }
  return null;
}

function pngDimensions(buffer) {
  const signature = '89504e470d0a1a0a';
  if (buffer.length < 24 || buffer.subarray(0, 8).toString('hex') !== signature) return null;
  return positive(buffer.readUInt32BE(16), buffer.readUInt32BE(20));
}

function gifDimensions(buffer) {
  const header = buffer.subarray(0, 6).toString('ascii');
  if (buffer.length < 10 || (header !== 'GIF87a' && header !== 'GIF89a')) return null;
  return positive(buffer.readUInt16LE(6), buffer.readUInt16LE(8));
}

const readUInt24LE = (buffer, offset) => buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);

function webpDimensions(buffer) {
  if (buffer.length < 30 || buffer.subarray(0, 4).toString('ascii') !== 'RIFF' || buffer.subarray(8, 12).toString('ascii') !== 'WEBP') return null;
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const type = buffer.subarray(offset, offset + 4).toString('ascii');
    const size = buffer.readUInt32LE(offset + 4);
    const data = offset + 8;
    if (data + size > buffer.length) break;
    if (type === 'VP8X' && size >= 10) {
      return positive(readUInt24LE(buffer, data + 4) + 1, readUInt24LE(buffer, data + 7) + 1);
    }
    if (type === 'VP8 ' && size >= 10 && buffer[data + 3] === 0x9d && buffer[data + 4] === 0x01 && buffer[data + 5] === 0x2a) {
      return positive(buffer.readUInt16LE(data + 6) & 0x3fff, buffer.readUInt16LE(data + 8) & 0x3fff);
    }
    if (type === 'VP8L' && size >= 5 && buffer[data] === 0x2f) {
      const bits = buffer.readUInt32LE(data + 1);
      return positive((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
    }
    offset = data + size + (size % 2);
  }
  return null;
}

function svgDimensions(text) {
  const open = text.match(/<svg\b[^>]*>/i)?.[0] || '';
  const numberAttr = name => {
    const raw = open.match(new RegExp(`\\b${name}=["']([0-9.]+)(?:px)?["']`, 'i'))?.[1];
    return raw ? Number(raw) : null;
  };
  const width = numberAttr('width');
  const height = numberAttr('height');
  if (positive(width, height)) return positive(width, height);
  const viewBox = open.match(/\bviewBox=["']\s*[-0-9.]+\s+[-0-9.]+\s+([0-9.]+)\s+([0-9.]+)\s*["']/i);
  return viewBox ? positive(Number(viewBox[1]), Number(viewBox[2])) : null;
}

export async function readImageDimensions(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.svg') return svgDimensions(await fs.readFile(file, 'utf8'));
  const buffer = await fs.readFile(file);
  if (ext === '.jpg' || ext === '.jpeg') return jpegDimensions(buffer);
  if (ext === '.png') return pngDimensions(buffer);
  if (ext === '.gif') return gifDimensions(buffer);
  if (ext === '.webp') return webpDimensions(buffer);
  return null;
}
