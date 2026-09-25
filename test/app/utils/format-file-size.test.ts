import { describe, expect, test } from "bun:test";

import { formatFileSize } from "~/utils/formatFileSize";

describe("formatFileSize", () => {
  test("空值/0/非数字 → -", () => {
    expect(formatFileSize("-")).toBe("-");
    expect(formatFileSize(null)).toBe("-");
    expect(formatFileSize(undefined)).toBe("-");
    expect(formatFileSize("")).toBe("-");
    expect(formatFileSize(0)).toBe("-");
    expect(formatFileSize(-500)).toBe("-");
    expect(formatFileSize("abc")).toBe("-");
  });

  test("小于 1KB 不带小数", () => {
    expect(formatFileSize(1)).toBe("1 B");
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(1023)).toBe("1023 B");
  });

  test("KB/MB/GB 一位小数", () => {
    expect(formatFileSize(1024)).toBe("1.0 KB");
    expect(formatFileSize(1536)).toBe("1.5 KB");
    expect(formatFileSize(1024 * 1024)).toBe("1.0 MB");
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe("1.5 MB");
    expect(formatFileSize(1024 ** 3)).toBe("1.0 GB");
  });

  test("TB 是最大单位(不溢出)", () => {
    expect(formatFileSize(1024 ** 4)).toBe("1.0 TB");
    expect(formatFileSize(2048 * 1024 ** 3)).toBe("2.0 TB");
  });

  test("字符串数字可解析", () => {
    expect(formatFileSize("2048")).toBe("2.0 KB");
  });
});
