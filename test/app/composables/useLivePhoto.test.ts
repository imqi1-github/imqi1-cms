import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "bun:test";

import { clearLivePhotoMediaCache, useLivePhoto } from "~/composables/useLivePhoto";

describe("useLivePhoto pure helpers", () => {
  test("isLivePhoto / cleanLivePhotoUrl 双向往返", () => {
    const { isLivePhoto, cleanLivePhotoUrl } = useLivePhoto();
    expect(isLivePhoto("https://x.com/a.jpg#live")).toBe(true);
    expect(isLivePhoto("https://x.com/a.jpg")).toBe(false);
    expect(cleanLivePhotoUrl("https://x.com/a.jpg#live")).toBe("https://x.com/a.jpg");
    expect(cleanLivePhotoUrl("https://x.com/a.jpg")).toBe("https://x.com/a.jpg");
    expect(isLivePhoto(cleanLivePhotoUrl("https://x.com/a.jpg#live") + "#live")).toBe(true);
  });

  test("peekLivePhotoImageUrl:未缓存时返回 null(不应抛)", () => {
    clearLivePhotoMediaCache();
    const { peekLivePhotoImageUrl } = useLivePhoto();
    expect(peekLivePhotoImageUrl("https://x.com/never-seen.jpg")).toBeNull();
  });
});

// findMotionVideoStart 是 useLivePhoto 内部纯函数,扫字节找 MP4 box 起点(ftyp 标记)。
// 没导出 → 通过读源码 + eval 函数体取出来测(去掉 TS `!` 非空断言,Function 构造器不认)。
// 等价复制一份到测试,源码改函数体时若不一致测试会失败(字符串 match 抛错)。
function callFindMotionVideoStart(bytes: Uint8Array): number {
  const src = readFileSync(resolve(__dirname, "../../../app/composables/useLivePhoto.ts"), "utf8");
  const start = src.indexOf("const findMotionVideoStart");
  if (start < 0) throw new Error("findMotionVideoStart 源码未找到");
  const body = src.slice(start);
  // eslint-disable-next-line no-regex-spaces -- 源码缩进固定 2 空格
  const fnMatch = body.match(/=> \{([\s\S]*?)\n  \};/);
  if (!fnMatch) throw new Error("findMotionVideoStart 函数体未匹配,请检查结构");
  // 去掉 TS `!` 非空断言(运行时是合法 JS 语法外的东西),保留真实逻辑
  const cleanBody = fnMatch[1].replace(/\]!/g, "]").replace(/!(\.|\[)/g, "$1");
  const fn = new Function("bytes", cleanBody) as (bytes: Uint8Array) => number;
  return fn(bytes);
}

describe("findMotionVideoStart 字节扫描", () => {
  test("标准 MP4 起始:box size=24 + 'ftyp' → 返回 0", () => {
    // 真实 MP4 文件起始 8 字节:大端 box size + 'ftyp'
    // size=24 (0x00 0x00 0x00 0x18) + 'ftyp'(0x66 0x74 0x79 0x70)
    const bytes = new Uint8Array([
      0x00, 0x00, 0x00, 0x18,
      0x66, 0x74, 0x79, 0x70, // 'ftyp'
      0x69, 0x73, 0x6f, 0x6d, // 'isom'
    ]);
    expect(callFindMotionVideoStart(bytes)).toBe(0);
  });

  test("前置 JPEG 段(模拟实况照片合包):扫描返回 MP4 起点 4(在 'f' 之前 4 字节)", () => {
    // 4 字节 JPEG 头 + 8 字节 MP4 box size + 'ftyp'
    const bytes = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, // JPEG SOI/APP0
      0x00, 0x00, 0x00, 0x18,
      0x66, 0x74, 0x79, 0x70,
    ]);
    expect(callFindMotionVideoStart(bytes)).toBe(4);
  });

  test("box size < 8(无效 MP4 box)→ 跳过此 ftyp 序列,返回 -1", () => {
    // box size = 4 (0x00 0x00 0x00 0x04) + 'ftyp' → size 不足 8,不算合法 box
    const bytes = new Uint8Array([
      0x00, 0x00, 0x00, 0x04,
      0x66, 0x74, 0x79, 0x70,
    ]);
    expect(callFindMotionVideoStart(bytes)).toBe(-1);
  });

  test("无 ftyp 序列(普通 JPEG)→ -1", () => {
    const bytes = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46,
    ]);
    expect(callFindMotionVideoStart(bytes)).toBe(-1);
  });

  test("JPEG 数据里凑出的 'f'(0x66)+ 后三字节碰巧是 t/y/p → 校验 box size,跳过", () => {
    // 在偏移 6 处放一个偶然的 0x66 + 0x74 0x79 0x70,但前面 box size = 4(无效)
    const bytes = new Uint8Array([
      0x00, 0x00, 0x00, 0x04, // 偏移 0-3:box size 4(无效)
      0x66, 0x74, 0x79, 0x70, // 偏移 4-7:偶然 ftyp 序列
      // 后面才是真正的 MP4 box
      0x00, 0x00, 0x00, 0x20,
      0x66, 0x74, 0x79, 0x70,
    ]);
    // 应跳过第一个(无效 size),返回第二个起点 8
    expect(callFindMotionVideoStart(bytes)).toBe(8);
  });

  test("空字节数组 → -1", () => {
    expect(callFindMotionVideoStart(new Uint8Array(0))).toBe(-1);
  });

  test("短于 8 字节(无法形成完整 box)→ -1", () => {
    const bytes = new Uint8Array([0x00, 0x66, 0x74, 0x79]);
    expect(callFindMotionVideoStart(bytes)).toBe(-1);
  });
});