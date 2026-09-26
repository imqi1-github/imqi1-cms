import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { useEditorAutosave } from "~/composables/useEditorAutosave";
import { useConfirm } from "~/composables/useConfirm";

// useConfirm 是 Nuxt 自动导入(源码未显式 import),挂到 globalThis 让测试里可解析。
Object.defineProperty(globalThis, "useConfirm", { value: useConfirm, writable: true, configurable: true });

// 过滤 Vue dev 模式 "no active component instance" 警告 — useEditorAutosave 调
// onMounted/onUnmounted,但测试里没有 effectScope/component setup context。
const origWarn = console.warn;
beforeEach(() => {
  console.warn = (...args: unknown[]) => {
    const first = args[0];
    if (typeof first === "string" && first.startsWith("[Vue warn]")) return;
    origWarn(...(args as Parameters<typeof origWarn>));
  };
});
afterEach(() => {
  console.warn = origWarn;
});

// 替换为可控 mock:记录每次调用,默认 CSRF 刷新返回空 data(沿用旧 token)。
const fetchCalls: Array<{ url: string; opts: { credentials?: string } }> = [];
const origFetch = globalThis.$fetch;
(globalThis as { $fetch: typeof globalThis.$fetch }).$fetch = (async (url: string, opts: { credentials?: string } = {}) => {
  fetchCalls.push({ url, opts });
  if (url === "/api/csrf/token") return { data: {} };
  return undefined;
}) as typeof globalThis.$fetch;

afterEach(() => {
  fetchCalls.length = 0;
  (globalThis as { $fetch: typeof globalThis.$fetch }).$fetch = origFetch;
  // 清 confirm / useConfirm 单例避免跨测试污染
  localStorage.clear();
  useState<unknown>("confirm-dialog", () => null).value = null;
});

// 构造一组可控的 EditorAutosaveOptions;测试各分支时覆盖 save/csrfToken 等。
function makeOpts(overrides?: Partial<Parameters<typeof useEditorAutosave>[0]>) {
  const csrfToken = ref("csrf-old");
  const hasUnsaved = ref(false);
  const opts: Parameters<typeof useEditorAutosave>[0] = {
    kind: "content",
    recoveryKey: () => "content:draft:test",
    hasUnsaved,
    csrfToken,
    save: mock(async () => ({ status: "saved" as const })),
    canAutosave: () => true,
    isPublishable: () => true,
    serialize: () => ({ title: "T", body: "B" }),
    applyRecovered: () => {},
    ...overrides,
  };
  return { opts, csrfToken, hasUnsaved };
}

describe("useEditorAutosave saveNow", () => {
  test("saved 分支:清备份 + saveStatus=saved,csrf 刷新一次", async () => {
    localStorage.setItem("content:draft:test", JSON.stringify({ fields: { old: 1 }, savedAt: 1 }));
    const { opts, csrfToken } = makeOpts();
    const { saveStatus, lastSavedAt, saveNow } = useEditorAutosave(opts);
    saveStatus.value = "unsaved"; // 模拟 markChanged

    await saveNow("manual");
    expect(saveStatus.value).toBe("saved");
    expect(lastSavedAt.value).not.toBeNull();
    // 备份已清
    expect(localStorage.getItem("content:draft:test")).toBeNull();
    // csrf 端点调用过一次
    expect(fetchCalls.filter(c => c.url === "/api/csrf/token")).toHaveLength(1);
    expect(csrfToken.value).toBe("csrf-old"); // 空 data 不更新
  });

  test("skipped 分支:必填缺失,saveStatus=unsaved 防止 1s 空保存循环", async () => {
    const { opts } = makeOpts({
      save: mock(async () => ({ status: "skipped" as const })),
    });
    const { saveStatus, saveNow } = useEditorAutosave(opts);
    saveStatus.value = "saved"; // 初始为 saved

    await saveNow("manual");
    expect(saveStatus.value).toBe("unsaved");
  });

  test("expired 分支:备份当前 serialize 到 localStorage + 弹出确认提示", async () => {
    const { opts } = makeOpts({
      save: mock(async () => ({ status: "expired" as const })),
      serialize: () => ({ title: "TITLE", body: "BODY" }),
    });
    const { saveStatus, saveNow } = useEditorAutosave(opts);
    saveStatus.value = "unsaved";

    const p = saveNow("manual");
    // 等待 confirm 弹出但暂不响应
    await new Promise<void>((r) => setTimeout(r, 0));
    // 备份应已写入(同步部分)
    const raw = localStorage.getItem("content:draft:test");
    expect(raw).not.toBeNull();
    const draft = JSON.parse(raw!) as { fields: Record<string, unknown>; savedAt: number };
    expect(draft.fields.title).toBe("TITLE");
    expect(typeof draft.savedAt).toBe("number");
    expect(saveStatus.value).toBe("expired");

    // 取消确认,避免 navigateTo
    useConfirm().answer(false);
    await p;
  });

  test("error 分支:saveStatus=error,不弹提示(toast 由调用方处理)", async () => {
    const { opts } = makeOpts({
      save: mock(async () => ({ status: "error" as const, message: "x" })),
    });
    const { saveStatus, saveNow } = useEditorAutosave(opts);
    saveStatus.value = "unsaved";
    await saveNow("autosave");
    expect(saveStatus.value).toBe("error");
  });

  test("save 抛异常时向外抛 + busy 仍复位,后续 saveNow 仍可触发", async () => {
    const calls: number[] = [];
    const { opts } = makeOpts({
      save: mock(async () => {
        calls.push(1);
        throw new Error("boom");
      }) as unknown as Parameters<typeof useEditorAutosave>[0]["save"],
    });
    const { saveStatus, saveNow } = useEditorAutosave(opts);
    saveStatus.value = "unsaved";
    // save 抛 → saveNow 同步抛出(try/finally 没 catch)
    await expect(saveNow("manual")).rejects.toThrow("boom");
    // saveStatus 停在 saving(赋值 saved 在 await save 之后,异常使其跳过)
    expect(saveStatus.value).toBe("saving");
    expect(calls).toHaveLength(1);
    // 第二次调用仍能进入(busy 已 finally 复位),save 同样抛
    await expect(saveNow("manual")).rejects.toThrow("boom");
    expect(calls).toHaveLength(2);
  });

  test("busy 状态:并发的第二次 saveNow 直接 return,save 只调一次", async () => {
    let release!: () => void;
    const saveImpl = () => new Promise<{ status: "saved" }>((r) => { release = () => r({ status: "saved" }); });
    const { opts } = makeOpts({ save: mock(saveImpl) as unknown as Parameters<typeof useEditorAutosave>[0]["save"] });
    const { saveStatus, saveNow } = useEditorAutosave(opts);
    saveStatus.value = "unsaved";
    const p1 = saveNow("manual");
    const p2 = saveNow("manual"); // busy → 立即 return
    // 等待 refreshCsrf 内部 + 链上多个 await 微任务全部跑完(save 才会被调到)
    await new Promise<void>((r) => setTimeout(r, 10));
    release();
    await Promise.all([p1, p2]);
    expect(opts.save).toHaveBeenCalledTimes(1);
    expect(saveStatus.value).toBe("saved");
  });
});

describe("useEditorAutosave markChanged", () => {
  test("idle/saved → markChanged 变 unsaved", () => {
    const { opts } = makeOpts();
    const { saveStatus, markChanged } = useEditorAutosave(opts);
    expect(saveStatus.value).toBe("idle");
    markChanged();
    expect(saveStatus.value).toBe("unsaved");
  });

  test("已 unsaved/saving/error → markChanged 不重置状态", () => {
    const { opts } = makeOpts();
    const { saveStatus, markChanged } = useEditorAutosave(opts);
    saveStatus.value = "saving";
    markChanged();
    expect(saveStatus.value).toBe("saving");
    saveStatus.value = "error";
    markChanged();
    expect(saveStatus.value).toBe("error");
  });
});

describe("useEditorAutosave checkRecovery", () => {
  test("无本地草稿:无操作", async () => {
    const { opts } = makeOpts();
    const { checkRecovery } = useEditorAutosave(opts);
    await expect(checkRecovery()).resolves.toBeUndefined();
  });

  test("本地 JSON 损坏:静默清掉,不弹 confirm", async () => {
    localStorage.setItem("content:draft:test", "{bad-json");
    const { opts } = makeOpts();
    const { checkRecovery } = useEditorAutosave(opts);
    await checkRecovery();
    expect(localStorage.getItem("content:draft:test")).toBeNull();
  });

  test("本地草稿与当前一致:清掉,不弹 confirm", async () => {
    localStorage.setItem("content:draft:test", JSON.stringify({
      fields: { title: "T", body: "B" },
      savedAt: Date.now(),
    }));
    const { opts } = makeOpts({ serialize: () => ({ title: "T", body: "B" }) });
    const { checkRecovery } = useEditorAutosave(opts);
    await checkRecovery();
    expect(localStorage.getItem("content:draft:test")).toBeNull();
  });

  test("用户点确认:applyRecovered + markChanged(变 unsaved);备份仍保留(代码不主动清,下次保存会覆盖)", async () => {
    // 注:checkRecovery 确认分支只 applyRecovered + markChanged,不主动 clearBackup。
    // 取消分支才会清。看源码:
    //   if (yes) { applyRecovered(fields); markChanged(); } else { clearBackup(); }
    localStorage.setItem("content:draft:test", JSON.stringify({
      fields: { title: "RECOVERED" },
      savedAt: Date.now(),
    }));
    let applied: Record<string, unknown> | null = null;
    const { opts } = makeOpts({
      serialize: () => ({ title: "CURRENT" }),
      applyRecovered: (f) => { applied = f; },
    });
    const { checkRecovery, saveStatus } = useEditorAutosave(opts);
    const p = checkRecovery();
    await new Promise<void>((r) => setTimeout(r, 0));
    useConfirm().answer(true);
    await p;
    expect(applied).toEqual({ title: "RECOVERED" });
    expect(saveStatus.value).toBe("unsaved");
  });

  test("用户点取消:不清应用,但清掉备份", async () => {
    localStorage.setItem("content:draft:test", JSON.stringify({
      fields: { title: "X" },
      savedAt: Date.now(),
    }));
    let applied = false;
    const { opts } = makeOpts({
      serialize: () => ({ title: "CURRENT" }),
      applyRecovered: () => { applied = true; },
    });
    const { checkRecovery } = useEditorAutosave(opts);
    const p = checkRecovery();
    await new Promise<void>((r) => setTimeout(r, 0));
    useConfirm().answer(false);
    await p;
    expect(applied).toBe(false);
    expect(localStorage.getItem("content:draft:test")).toBeNull();
  });

  test("kind=content 时弹窗标题为「文章」;kind=page 时为「页面」", async () => {
    localStorage.setItem("content:draft:test", JSON.stringify({
      fields: { title: "X" },
      savedAt: Date.now(),
    }));
    const { opts: optsC } = makeOpts({
      kind: "content",
      serialize: () => ({ a: 1 }),
    });
    const { checkRecovery: checkC } = useEditorAutosave(optsC);
    const pc = checkC();
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(useState<{ title: string } | null>("confirm-dialog", () => null).value?.title).toContain("文章");
    useConfirm().answer(false);
    await pc;
    localStorage.clear();

    localStorage.setItem("page:draft:test", JSON.stringify({
      fields: { title: "Y" },
      savedAt: Date.now(),
    }));
    const { opts: optsP } = makeOpts({
      kind: "page",
      recoveryKey: () => "page:draft:test",
      serialize: () => ({ a: 2 }),
    });
    const { checkRecovery: checkP } = useEditorAutosave(optsP);
    const pp = checkP();
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(useState<{ title: string } | null>("confirm-dialog", () => null).value?.title).toContain("页面");
    useConfirm().answer(false);
    await pp;
  });
});

describe("useEditorAutosave refreshCsrf 兜底", () => {
  test("CSRF 接口抛错 → 不抛、沿用旧 token", async () => {
    (globalThis as { $fetch: typeof globalThis.$fetch }).$fetch = (async () => {
      throw new Error("csrf 500");
    }) as typeof globalThis.$fetch;
    const { opts, csrfToken } = makeOpts();
    const { saveNow } = useEditorAutosave(opts);
    csrfToken.value = "stale";
    await saveNow("manual");
    // token 未被更新
    expect(csrfToken.value).toBe("stale");
  });

  test("CSRF 成功返回 token → 写入 csrfToken", async () => {
    (globalThis as { $fetch: typeof globalThis.$fetch }).$fetch = (async (url: string) => {
      if (url === "/api/csrf/token") return { data: { token: "fresh" } };
      return undefined;
    }) as typeof globalThis.$fetch;
    const { opts, csrfToken } = makeOpts();
    const { saveNow } = useEditorAutosave(opts);
    csrfToken.value = "stale";
    await saveNow("manual");
    expect(csrfToken.value).toBe("fresh");
  });
});

describe("useEditorAutosave 过期提示", () => {
  test("expired 后用户确认 → navigateTo /login 带 to=fullPath", async () => {
    const { opts } = makeOpts({
      save: mock(async () => ({ status: "expired" as const })),
      serialize: () => ({ x: 1 }),
    });
    const navCalls: Array<{ path?: string; query?: Record<string, string> }> = [];
    (globalThis as { navigateTo: typeof navigateTo }).navigateTo = (async (to: unknown) => {
      navCalls.push(to as { path?: string; query?: Record<string, string> });
      return undefined;
    }) as typeof navigateTo;
    const { saveNow } = useEditorAutosave(opts);
    const p = saveNow("manual");
    await new Promise<void>((r) => setTimeout(r, 0));
    useConfirm().answer(true);
    await p;
    expect(navCalls[0]?.path).toBe("/login");
    expect(navCalls[0]?.query?.to).toBe("/test"); // useRoute stub 的 fullPath
  });

  test("expired 后用户取消 → 不调用 navigateTo", async () => {
    const { opts } = makeOpts({
      save: mock(async () => ({ status: "expired" as const })),
      serialize: () => ({ x: 1 }),
    });
    let called = 0;
    (globalThis as { navigateTo: typeof navigateTo }).navigateTo = (async () => {
      called++;
      return undefined;
    }) as typeof navigateTo;
    const { saveNow } = useEditorAutosave(opts);
    const p = saveNow("manual");
    await new Promise<void>((r) => setTimeout(r, 0));
    useConfirm().answer(false);
    await p;
    expect(called).toBe(0);
  });
});