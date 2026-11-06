/**
 * 源站缓存层的精确失效。
 *
 * 关键前提：Nitro 的缓存键 = `<frag>.<hash>.json`，其中 hash = digest(完整URL)。
 * 应用侧要用 ohash 复现这个 hash 才能精确删掉「文章所在的那一页」——
 * golden vector 锁死算法：ohash/nitro 升级导致算法漂移时，这条测试会先红，
 * 而不是让精确失效静默失效（旧评论数挂满 6 小时）。
 */
import { describe, expect, test } from "bun:test";
import { digest } from "ohash";

/** 与 server/utils/source-cache.ts 同一份算法（改一处必须同步改这里） */
const escapeKey = (key: string): string => String(key).replace(/\W/g, "");
const pathFrag = (path: string): string => escapeKey(decodeURI(path)).slice(0, 16) || "index";
const nitroHash = (url: string): string => digest(url).replace(/[-_]/g, "").slice(0, 10);
const exactKeySuffix = (url: string): string => `${pathFrag(url.split("?")[0] || "/")}.${nitroHash(url)}.json`;

describe("精确缓存键构造（对齐 Nitro 的 getKey）", () => {
  test("golden vector：分页变体的键", () => {
    // 取自本机真实缓存文件 .nitro/cache/nitro/routes/_/categorynote.0S8nTpq2pW.json
    expect(exactKeySuffix("/category/note?page=2")).toBe("categorynote.0S8nTpq2pW.json");
  });

  test("同一路径的不同分页 → 不同键（分页变体是独立条目）", () => {
    expect(exactKeySuffix("/category/note")).not.toBe(exactKeySuffix("/category/note?page=2"));
  });

  test("中文 slug：先 decodeURI 再剥非词字符（与 Nitro 一致）", () => {
    // 不 decode 会得到百分号转义片段，与实际键对不上
    expect(pathFrag("/content/note/中文")).toBe("contentnote");
    expect(pathFrag("/content/note/hello")).toBe("contentnotehello");
  });

  test("根路径 → index（Nitro 的回退值）", () => {
    expect(pathFrag("/")).toBe("index");
  });
});

describe("源站缓存按路由/路径/精确键失效", () => {
  const keys = [
    "nitro:routes:_:categorynote.0S8nTpq2pW.json",
    "nitro:routes:_:categorynote.Xjry99U9z3.json",
    "nitro:routes:_:contentnotehello.aaaaaaaaaa.json",
    "nitro:routes:_:index.bbbbbbbbbb.json",
    "nitro:routes:_:apicategories.cccccccccc.json",
  ];

  /** 复刻 clearSourceCache 的选择逻辑 */
  function select(opts: { routes?: string[]; paths?: string[]; exactPaths?: string[] }): string[] {
    const routeFrags = opts.routes?.map(pathFrag) ?? null;
    const pathFrags = opts.paths?.length ? opts.paths.map(pathFrag) : null;
    const exactSuffixes = opts.exactPaths?.length ? opts.exactPaths.map(exactKeySuffix) : null;
    const clearAll = routeFrags === null && !pathFrags && !exactSuffixes;
    return keys.filter((key) => {
      const frag = key.split(/[:/]/).pop()!.replace(/\.[^.]+\.json$/, "");
      if (frag.startsWith("api")) return true;
      if (clearAll) return true;
      if (exactSuffixes?.some(suffix => key.endsWith(suffix))) return true;
      if (pathFrags?.some(prefix => frag.startsWith(prefix))) return true;
      return routeFrags?.some(prefix => frag.startsWith(prefix)) ?? false;
    });
  }

  test("精确键：只命中那一条，同路径的其它分页不受影响", () => {
    const hit = select({ exactPaths: ["/category/note?page=2"] });
    // 接口键永远清（设计如此），页面键只清那一条
    expect(hit).toEqual([
      "nitro:routes:_:categorynote.0S8nTpq2pW.json",
      "nitro:routes:_:apicategories.cccccccccc.json",
    ]);
  });

  test("按路由：整组清（含同前缀的其它分页变体）", () => {
    const hit = select({ routes: ["/category/**"] });
    expect(hit).toContain("nitro:routes:_:categorynote.0S8nTpq2pW.json");
    expect(hit).toContain("nitro:routes:_:categorynote.Xjry99U9z3.json");
    expect(hit).not.toContain("nitro:routes:_:contentnotehello.aaaaaaaaaa.json");
  });

  test("精确键 + 固定页路由：固定页照清、别的列表页不动", () => {
    const hit = select({ routes: ["/", "/about"], exactPaths: ["/category/note?page=2"] });
    expect(hit).toContain("nitro:routes:_:index.bbbbbbbbbb.json");
    expect(hit).toContain("nitro:routes:_:categorynote.0S8nTpq2pW.json");
    expect(hit).not.toContain("nitro:routes:_:categorynote.Xjry99U9z3.json");
  });

  test("接口键永远清（否则边缘回源拿到旧 JSON）", () => {
    expect(select({ exactPaths: ["/category/note?page=2"] })).toContain("nitro:routes:_:apicategories.cccccccccc.json");
  });

  test("不传任何范围 → 清整组", () => {
    expect(select({})).toHaveLength(keys.length);
  });
});
