const { normalizeMime } = require('../middleware/uploadSecurity');

function bufferStartsWith(buffer, bytes) {
  return Buffer.isBuffer(buffer) && buffer.length >= bytes.length && bytes.every((byte, index) => buffer[index] === byte);
}

function stripJpegMetadata(buffer) {
  if (!bufferStartsWith(buffer, [0xff, 0xd8])) return buffer;
  const parts = [buffer.slice(0, 2)];
  let offset = 2;

  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) {
      parts.push(buffer.slice(offset));
      break;
    }

    let marker = buffer[offset + 1];
    while (marker === 0xff && offset + 1 < buffer.length) {
      offset += 1;
      marker = buffer[offset + 1];
    }

    if (marker === 0xda) {
      parts.push(buffer.slice(offset));
      break;
    }

    if (marker === 0xd9) {
      parts.push(buffer.slice(offset, offset + 2));
      break;
    }

    if (offset + 4 > buffer.length) break;
    const length = buffer.readUInt16BE(offset + 2);
    const end = offset + 2 + length;
    if (length < 2 || end > buffer.length) return buffer;

    const remove =
      marker === 0xe1 || // EXIF/XMP
      marker === 0xe2 || // ICC/profile metadata
      marker === 0xed || // Photoshop/IPTC
      marker === 0xfe;   // Comment

    if (!remove) {
      parts.push(buffer.slice(offset, end));
    }

    offset = end;
  }

  return Buffer.concat(parts);
}

function crc32(buffer) {
  let crc = ~0;
  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

function stripPngMetadata(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buffer.slice(0, 8).equals(signature)) return buffer;

  const keepAncillary = new Set(['tRNS']);
  const chunks = [signature];
  let offset = 8;

  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.slice(offset + 4, offset + 8).toString('ascii');
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const chunkEnd = dataEnd + 4;
    if (chunkEnd > buffer.length) return buffer;

    const isCritical = type[0] === type[0].toUpperCase();
    if (isCritical || keepAncillary.has(type)) {
      chunks.push(buffer.slice(offset, chunkEnd));
    }

    offset = chunkEnd;
    if (type === 'IEND') break;
  }

  return Buffer.concat(chunks);
}

function stripWebpMetadata(buffer) {
  if (!bufferStartsWith(buffer, [0x52, 0x49, 0x46, 0x46]) || buffer.slice(8, 12).toString('ascii') !== 'WEBP') {
    return buffer;
  }

  const chunks = [];
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const type = buffer.slice(offset, offset + 4).toString('ascii');
    const size = buffer.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + size;
    const paddedEnd = dataEnd + (size % 2);
    if (paddedEnd > buffer.length) return buffer;

    if (!['EXIF', 'XMP ', 'ICCP'].includes(type)) {
      chunks.push(buffer.slice(offset, paddedEnd));
    }

    offset = paddedEnd;
  }

  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(body.length + 4, 4);
  header.write('WEBP', 8, 'ascii');
  return Buffer.concat([header, body]);
}

function stripAvatarMetadata(buffer, mimeType) {
  const mime = normalizeMime(mimeType);
  if (!Buffer.isBuffer(buffer)) return buffer;
  if (mime === 'image/jpeg') return stripJpegMetadata(buffer);
  if (mime === 'image/png') return stripPngMetadata(buffer);
  if (mime === 'image/webp') return stripWebpMetadata(buffer);
  return buffer;
}

function buildSanitizedAvatarFile(file, mimeType) {
  const buffer = stripAvatarMetadata(file.buffer, mimeType);
  const extension = mimeType === 'image/png' ? '.png' : mimeType === 'image/webp' ? '.webp' : mimeType === 'image/gif' ? '.gif' : '.jpg';
  return {
    ...file,
    buffer,
    size: buffer.length,
    mimetype: mimeType,
    originalname: `avatar-${Date.now()}${extension}`
  };
}

module.exports = {
  stripAvatarMetadata,
  buildSanitizedAvatarFile
};
