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

function webpVp8Buffer(w: number, h: number): Buffer {
  const b = Buffer.alloc(30);
  b.write("RIFF", 0, "ascii");
  b.write("WEBP", 8, "ascii");
  b.write("VP8 ", 12, "ascii");
  b.writeUInt16LE(w, 26);
  b.writeUInt16LE(h, 28);
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

  test("WebP(VP8 )宽高掩码取低 14 位", () => {
    const m = createAttachmentMetadata(webpVp8Buffer(640, 480), fakeFile("a.webp", "image/webp", 30));
    expect(m).toMatchObject({ width: 640, height: 480, format: "webp" });
  });

  test("签名不符/长度不足 → 尺寸 null(不抛)", () => {
    expect(createAttachmentMetadata(Buffer.from("not-an-image"), fakeFile("a.png", "image/png", 4)).width).toBeNull();
    expect(createAttachmentMetadata(Buffer.alloc(4), fakeFile("a.gif", "image/gif", 4)).height).toBeNull();
  });

  test("非图片 MIME 不解析尺寸,format 从扩展名推断", () => {
    const m = createAttachmentMetadata(Buffer.from("x"), fakeFile("a.txt", "", 1));
    expect(m).toMatchObject({ width: null, height: null, format: "txt" });
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
