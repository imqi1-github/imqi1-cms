import "#test/helpers/nitro-globals";

import { createHmac } from "node:crypto";

import { afterAll, describe, expect, test } from "bun:test";

// getSecret 在首次使用时缓存:必须在其之前固定 LOGIN_SECRET
const LOGIN_SECRET = "unit-test-login-secret";
const ORIGINAL = process.env.LOGIN_SECRET;
process.env.LOGIN_SECRET = LOGIN_SECRET;

const { TRUSTED_DEVICE_COOKIE, makeLoginChallenge, verifyLoginChallenge } = await import("#server/utils/security-token");

afterAll(() => {
  if (ORIGINAL === undefined) delete process.env.LOGIN_SECRET;
  else process.env.LOGIN_SECRET = ORIGINAL;
});

// 复刻内部签名算法,构造任意 exp 的令牌(测过期分支)
function craftToken(uid: number, exp: number): string {
  const payload = Buffer.from(JSON.stringify({ uid, exp })).toString("base64url");
  const sig = createHmac("sha256", LOGIN_SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

describe("security-token(2FA challenge)", () => {
  test("cookie 名常量", () => {
    expect(TRUSTED_DEVICE_COOKIE).toBe("trusted_device");
  });

  test("签发与校验往返:返回绑定 uid", () => {
    const token = makeLoginChallenge(7);
    expect(verifyLoginChallenge(token)).toBe(7);
  });

  test("篡改签名 → null(定长比较)", () => {
    const token = makeLoginChallenge(7);
    const [payload] = token.split(".");
    expect(verifyLoginChallenge(`${payload}.AAAAAAAA`)).toBeNull();
  });

  test("过期令牌 → null", () => {
    expect(verifyLoginChallenge(craftToken(7, Date.now() - 1000))).toBeNull();
  });

  test("用错误密钥签的令牌 → null(不回落任何公开常量)", () => {
    const payload = Buffer.from(JSON.stringify({ uid: 7, exp: Date.now() + 60000 })).toString("base64url");
    const sig = createHmac("sha256", "wrong-secret").update(payload).digest("base64url");
    expect(verifyLoginChallenge(`${payload}.${sig}`)).toBeNull();
  });

  test("格式坏(无点/坏 base64url)→ null", () => {
    expect(verifyLoginChallenge("no-dot")).toBeNull();
    expect(verifyLoginChallenge("a.b")).toBeNull();
  });
});
