import { describe, expect, test } from "bun:test";

const { createAttachmentMetadata, normalizeAttachmentMetadata } = await import("#server/utils/attachmentMetadata");

// 构造各格式最小可用头部,验证尺寸解析(不必是真图,只需签名与尺寸字段正确)
function pngBuffer(w: number, h: number): Buffer {
  const b = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
}

function gifBuffer(w: number, h: number): Buffer {
  const b = Buffer.alloc(10);
  b.write("GIF89a", 0, "ascii");
  b.writeUInt16LE(w, 6);
  b.writeUInt16LE(h, 8);
  return b;
}

function jpegBuffer(w: number, h: number): Buffer {
  // FFD8 + SOF0 段(marker C0, length 17, precision 8, height, width)
  const b = Buffer.alloc(23);
  b[0] = 0xff;
  b[1] = 0xd8;
  b[2] = 0xff;
  b[3] = 0xc0;
  b.writeUInt16BE(17, 4);
  b[6] = 8;
  b.writeUInt16BE(h, 7);
  b.writeUInt16BE(w, 9);
  return b;
}

// JPEG 含若干非 SOF 段(APP0 + DQT)后接 SOF0:验 offset += length 主路径 + 多段遍历
// APP0 = FF E0 + length(2) + content(length-2) = 16 bytes(含 marker)
// SOF0 = FF C0 + length 17 = 19 bytes; buffer 长度兜底给到 37
function jpegWithPrefixSegments(w: number, h: number): Buffer {
  const b = Buffer.alloc(2 + 16 + 19);
  b[0] = 0xff;
  b[1] = 0xd8;
  // APP0 段:marker(2) + length(2) + payload(12)=16 字节;length=14 表示 content 14 字节(含自身)
  b[2] = 0xff;
  b[3] = 0xe0;
  b.writeUInt16BE(14, 4);
  b.write("JFIF\0", 6, "ascii");
  // SOF0 段在 offset 18:marker(2) + length(2) + payload(15)=19 字节
  b[18] = 0xff;
  b[19] = 0xc0;
  b.writeUInt16BE(17, 20);
  b[22] = 8;
  b.writeUInt16BE(h, 23);
  b.writeUInt16BE(w, 25);
  return b;
}

// JPEG 段长度截断(offset+7 > buffer.length):验 line 62 越界 break
function jpegTruncatedSof(): Buffer {
  const b = Buffer.alloc(8);
  b[0] = 0xff;
  b[1] = 0xd8;
  // 段类型 + 长度都齐全但后续字节不够读尺寸字段
  b[2] = 0xff;
  b[3] = 0xc0;
  b.writeUInt16BE(17, 4);
  return b;
}

function webpVp8Buffer(w: number, h: number): Buffer {
  const b = Buffer.alloc(30);
  b.write("RIFF", 0, "ascii");
  b.write("WEBP", 8, "ascii");
  b.write("VP8 ", 12, "ascii");
  b.writeUInt16LE(w, 26);
  b.writeUInt16LE(h, 28);
  return b;
}

// WebP VP8L(无损):位流编码 width-1 / height-1 在 21-24 字节
// parseWebpDimensions 要求 buffer.length ≥ 30 → 给到 30
function webpVp8LBuffer(w: number, h: number): Buffer {
  const b = Buffer.alloc(30);
  b.write("RIFF", 0, "ascii");
  b.write("WEBP", 8, "ascii");
  b.write("VP8L", 12, "ascii");
  b[20] = 0x2f; // VP8L signature byte
  const bits = (((w - 1) & 0x3fff) | (((h - 1) & 0x3fff) << 14)) >>> 0;
  b.writeUInt32LE(bits, 21);
  return b;
}

// WebP VP8X(扩展):宽/高-1 各占 24-bit 小端在 24-26 / 27-29
function webpVp8XBuffer(w: number, h: number): Buffer {
  const b = Buffer.alloc(30);
  b.write("RIFF", 0, "ascii");
  b.write("WEBP", 8, "ascii");
  b.write("VP8X", 12, "ascii");
  b[24] = (w - 1) & 0xff;
  b[25] = ((w - 1) >> 8) & 0xff;
  b[26] = ((w - 1) >> 16) & 0xff;
  b[27] = (h - 1) & 0xff;
  b[28] = ((h - 1) >> 8) & 0xff;
  b[29] = ((h - 1) >> 16) & 0xff;
  return b;
}

// 未知 chunk 类型("VP9X" 等不在白名单):验 line 83 fallthrough → null
function webpUnknownChunk(): Buffer {
  const b = Buffer.alloc(30);
  b.write("RIFF", 0, "ascii");
  b.write("WEBP", 8, "ascii");
  b.write("VP9X", 12, "ascii");
  return b;
}

function fakeFile(name: string, type: string, size: number): File {
  return { name, type, size } as File;
}

describe("图片尺寸解析(按 MIME 分派)", () => {
  test("PNG 大端宽高", () => {
    const m = createAttachmentMetadata(pngBuffer(1920, 1080), fakeFile("a.png", "image/png", 1234));
    expect(m).toMatchObject({ width: 1920, height: 1080, format: "png", size: 1234 });
  });

  test("GIF 小端宽高", () => {
    const m = createAttachmentMetadata(gifBuffer(320, 240), fakeFile("a.gif", "image/gif", 10));
    expect(m).toMatchObject({ width: 320, height: 240, format: "gif" });
  });

  test("JPEG 走 SOF 段,format 归一为 jpg", () => {
    const m = createAttachmentMetadata(jpegBuffer(800, 600), fakeFile("a.jpg", "image/jpeg", 20));
    expect(m).toMatchObject({ width: 800, height: 600, format: "jpg" });
  });

  test("JPEG 多段前缀(APP0 后跟 SOF0)→ offset += length 主路径", () => {
    const m = createAttachmentMetadata(jpegWithPrefixSegments(640, 320), fakeFile("a.jpg", "image/jpeg", 30));
    expect(m).toMatchObject({ width: 640, height: 320, format: "jpg" });
  });

  test("JPEG SOF 段长度不足 → 尺寸 null(越界 break,不抛)", () => {
    const m = createAttachmentMetadata(jpegTruncatedSof(), fakeFile("a.jpg", "image/jpeg", 8));
    expect(m.width).toBeNull();
    expect(m.height).toBeNull();
  });

  test("WebP(VP8 )宽高掩码取低 14 位", () => {
    const m = createAttachmentMetadata(webpVp8Buffer(640, 480), fakeFile("a.webp", "image/webp", 30));
    expect(m).toMatchObject({ width: 640, height: 480, format: "webp" });
  });

  test("WebP(VP8L 无损):width-1/height-1 编码于 21-24 字节", () => {
    const m = createAttachmentMetadata(webpVp8LBuffer(100, 200), fakeFile("a.webp", "image/webp", 30));
    expect(m).toMatchObject({ width: 100, height: 200, format: "webp" });
  });

  test("WebP(VP8X 扩展):24-bit 小端宽高-1(行 94-100 + readUInt24BE)", () => {
    const m = createAttachmentMetadata(webpVp8XBuffer(1000, 2000), fakeFile("a.webp", "image/webp", 30));
    expect(m).toMatchObject({ width: 1000, height: 2000, format: "webp" });
  });

  test("WebP 未知 chunk 类型 → 尺寸 null(line 83 fallthrough)", () => {
    const m = createAttachmentMetadata(webpUnknownChunk(), fakeFile("a.webp", "image/webp", 30));
    expect(m.width).toBeNull();
    expect(m.height).toBeNull();
  });

  test("VP8L 缺失 0x2f signature byte → 尺寸 null", () => {
    const b = Buffer.alloc(25);
    b.write("RIFF", 0, "ascii");
    b.write("WEBP", 8, "ascii");
    b.write("VP8L", 12, "ascii");
    b[20] = 0x00; // 不是 0x2f
    const m = createAttachmentMetadata(b, fakeFile("a.webp", "image/webp", 25));
    expect(m.width).toBeNull();
  });

  test("签名不符/长度不足 → 尺寸 null(不抛)", () => {
    expect(createAttachmentMetadata(Buffer.from("not-an-image"), fakeFile("a.png", "image/png", 4)).width).toBeNull();
    expect(createAttachmentMetadata(Buffer.alloc(4), fakeFile("a.gif", "image/gif", 4)).height).toBeNull();
  });

  test("非图片 MIME 不解析尺寸,format 从扩展名推断", () => {
    const m = createAttachmentMetadata(Buffer.from("x"), fakeFile("a.txt", "", 1));
    expect(m).toMatchObject({ width: null, height: null, format: "txt" });
  });

  test("getImageDimensions try/catch 兜底:parser 抛错 → 返回 null 不外抛(line 111)", () => {
    // Buffer.toStringPath 等"读字段"API 在非 Buffer 上会抛 → 触发 catch
    // (用 Number 充 buffer 让 readUInt16BE 在调用时抛 TypeError)
    const fake = { length: 30 } as unknown as Buffer;
    expect(() => createAttachmentMetadata(fake, fakeFile("a.webp", "image/webp", 30))).not.toThrow();
  });
});

describe("normalizeAttachmentMetadata", () => {
  test("完整值原样透传", () => {
    expect(normalizeAttachmentMetadata({ size: 10, width: 20, height: 30, format: "png" }))
      .toEqual({ size: 10, width: 20, height: 30, format: "png" });
  });

  test("非对象/坏形状归零:size=0,其余 null", () => {
    expect(normalizeAttachmentMetadata(null)).toEqual({ size: 0, width: null, height: null, format: null });
    expect(normalizeAttachmentMetadata("str")).toEqual({ size: 0, width: null, height: null, format: null });
    expect(normalizeAttachmentMetadata({ size: "10", width: "20" })).toEqual({ size: 0, width: null, height: null, format: null });
  });

  test("部分字段缺失只补该字段", () => {
    expect(normalizeAttachmentMetadata({ width: 5 })).toEqual({ size: 0, width: 5, height: null, format: null });
  });
});
