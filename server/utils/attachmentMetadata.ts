import * as path from "path";

import type { AttachmentMetadata } from "#server/types/apis/attachment-metadata";

const readUInt24BE = (buffer: Buffer, offset: number): number => {
  return (buffer[offset]! << 16) + (buffer[offset + 1]! << 8) + buffer[offset + 2]!;
};

const getFormatFromMimeOrName = (mimeType: string, fileName: string): string | null => {
  const mimeFormat = mimeType.split("/")[1]?.toLowerCase();
  if (mimeFormat) return mimeFormat === "jpeg" ? "jpg" : mimeFormat;

  const ext = path.extname(fileName).toLowerCase().slice(1);
  return ext || null;
};

const parsePngDimensions = (buffer: Buffer) => {
  if (buffer.length < 24) return null;
  if (!buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
};

const parseGifDimensions = (buffer: Buffer) => {
  if (buffer.length < 10) return null;
  const signature = buffer.subarray(0, 6).toString("ascii");
  if (signature !== "GIF87a" && signature !== "GIF89a") return null;
  return {
    width: buffer.readUInt16LE(6),
    height: buffer.readUInt16LE(8),
  };
};

const parseJpegDimensions = (buffer: Buffer) => {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;

  let offset = 2;
  while (offset < buffer.length) {
    while (buffer[offset] === 0xff) offset++;
    const marker = buffer[offset];
    offset++;

    if (marker == null || marker === 0xd9 || marker === 0xda) break;
    if (offset + 2 > buffer.length) break;

    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) break;

    // SOF markers that contain dimensions.
    if (
      marker === 0xc0 || marker === 0xc1 || marker === 0xc2 || marker === 0xc3 ||
      marker === 0xc5 || marker === 0xc6 || marker === 0xc7 || marker === 0xc9 ||
      marker === 0xca || marker === 0xcb || marker === 0xcd || marker === 0xce || marker === 0xcf
    ) {
      if (offset + 7 > buffer.length) break;
      return {
        height: buffer.readUInt16BE(offset + 3),
        width: buffer.readUInt16BE(offset + 5),
      };
    }

    offset += length;
  }

  return null;
};

const parseWebpDimensions = (buffer: Buffer) => {
  if (buffer.length < 30) return null;
  if (buffer.subarray(0, 4).toString("ascii") !== "RIFF") return null;
  if (buffer.subarray(8, 12).toString("ascii") !== "WEBP") return null;

  const chunkType = buffer.subarray(12, 16).toString("ascii");

  if (chunkType === "VP8 ") {
    if (buffer.length < 30) return null;
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }

  if (chunkType === "VP8L") {
    if (buffer.length < 25 || buffer[20] !== 0x2f) return null;
    const bits = buffer.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }

  if (chunkType === "VP8X") {
    if (buffer.length < 30) return null;
    return {
      width: readUInt24BE(Buffer.from([buffer[26]!, buffer[25]!, buffer[24]!]), 0) + 1,
      height: readUInt24BE(Buffer.from([buffer[29]!, buffer[28]!, buffer[27]!]), 0) + 1,
    };
  }

  return null;
};

const getImageDimensions = (buffer: Buffer, mimeType: string) => {
  try {
    if (mimeType === "image/png") return parsePngDimensions(buffer);
    if (mimeType === "image/gif") return parseGifDimensions(buffer);
    if (mimeType === "image/jpeg" || mimeType === "image/jpg") return parseJpegDimensions(buffer);
    if (mimeType === "image/webp") return parseWebpDimensions(buffer);
  } catch {
    return null;
  }
  return null;
};

export const createAttachmentMetadata = (buffer: Buffer, file: File): AttachmentMetadata => {
  const format = getFormatFromMimeOrName(file.type, file.name);
  const dimensions = getImageDimensions(buffer, file.type);

  return {
    size: file.size,
    width: dimensions?.width ?? null,
    height: dimensions?.height ?? null,
    format,
  };
};

export const normalizeAttachmentMetadata = (value: unknown): AttachmentMetadata => {
  const metadata = (typeof value === "object" && value !== null ? value : {}) as Partial<AttachmentMetadata>;
  return {
    size: typeof metadata.size === "number" ? metadata.size : 0,
    width: typeof metadata.width === "number" ? metadata.width : null,
    height: typeof metadata.height === "number" ? metadata.height : null,
    format: typeof metadata.format === "string" ? metadata.format : null,
  };
};
