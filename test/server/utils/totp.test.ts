import { describe, expect, test } from "bun:test";

import { generateTOTPSecret, otpauthUrl, verifyTOTP } from "../../../server/utils/totp";

// RFC 6238 附录 B 的标准测试密钥(20 字节 ASCII "12345678901234567890" 的 base32)
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
// RFC 4226 附录 D 向量 = 同密钥 HOTP(counter),即 RFC 6238 在 T=counter*30s 的 6 位码
const CODE_AT = new Map<number, string>([
  [0, "755224"],
  [1, "287082"],
  [2, "359152"],
  [3, "969429"],
]);

describe("verifyTOTP(RFC 6238 向量)", () => {
  test("counter 1(T=59s)的正确码通过", () => {
    expect(verifyTOTP(RFC_SECRET, CODE_AT.get(1)!, 59_000)).toBe(true);
  });

  test("其余 RFC 向量全部通过", () => {
    expect(verifyTOTP(RFC_SECRET, "081804", 1_111_111_109_000)).toBe(true);
    expect(verifyTOTP(RFC_SECRET, "005924", 1_234_567_890_000)).toBe(true);
  });

  test("±1 步窗口内的相邻码通过(时钟漂移容忍)", () => {
    expect(verifyTOTP(RFC_SECRET, CODE_AT.get(0)!, 59_000)).toBe(true);
    expect(verifyTOTP(RFC_SECRET, CODE_AT.get(2)!, 59_000)).toBe(true);
  });

  test("窗口外(counter+2)拒绝", () => {
    expect(verifyTOTP(RFC_SECRET, CODE_AT.get(3)!, 59_000)).toBe(false);
  });

  test("错误码拒绝", () => {
    expect(verifyTOTP(RFC_SECRET, "000000", 59_000)).toBe(false);
  });

  test("输入容忍首尾空白", () => {
    expect(verifyTOTP(RFC_SECRET, " 287082 ", 59_000)).toBe(true);
  });

  test.each(["28708", "2870821", "28708a", ""])("非法格式 %s 拒绝", token => {
    expect(verifyTOTP(RFC_SECRET, token, 59_000)).toBe(false);
  });

  test("坏 base32 密钥拒绝(不抛)", () => {
    expect(verifyTOTP("!!!bad!!!", "287082", 59_000)).toBe(false);
  });
});

describe("generateTOTPSecret", () => {
  test("32 字符且仅含 base32 字母表", () => {
    const secret = generateTOTPSecret();
    expect(secret).toHaveLength(32);
    expect(secret).toMatch(/^[A-Z2-7]+$/);
  });

  test("两次生成不相同", () => {
    expect(generateTOTPSecret()).not.toBe(generateTOTPSecret());
  });
});

describe("otpauthUrl", () => {
  test("含 secret/issuer 参数与 issuer:account 标签", () => {
    const url = otpauthUrl({ secret: "ABC234", account: "admin@example.com", issuer: "imqi1" });
    expect(url).toContain("otpauth://totp/imqi1:admin%40example.com");
    expect(url).toContain("secret=ABC234");
    expect(url).toContain("issuer=imqi1");
    expect(url).toContain("digits=6");
    expect(url).toContain("period=30");
  });
});
