import { describe, expect, test } from "bun:test";

const { createAttachmentMetadata, normalizeAttachmentMetadata } = await import("#server/utils/attachmentMetadata");

describe("attachmentMetadata", () => {
  test("create:size 取 file.size;非图片 buffer 尺寸为 null;format 按扩展名推断", () => {
    const meta = createAttachmentMetadata(Buffer.from("hello"), new File(["x"], "a.png", { type: "image/png" }));
    expect(meta.size).toBe(1);
    expect(meta.format).toBe("png");
    expect(meta.width).toBeNull();
    expect(meta.height).toBeNull();
  });

  test("normalize:非对象/坏形状安全归一(不抛)", () => {
    expect(() => normalizeAttachmentMetadata(null)).not.toThrow();
    expect(() => normalizeAttachmentMetadata("str")).not.toThrow();
    const ok = normalizeAttachmentMetadata({ size: 1, width: 2, height: 3 });
    expect(ok).toBeTruthy();
  });
});
