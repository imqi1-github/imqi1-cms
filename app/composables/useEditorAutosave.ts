import type {
  AutosaveDraft,
  EditorAutosaveOptions,
  SaveResult,
  SaveStatus,
} from "~/types/composables/editor-autosave";

/**
 * 后台富文本/Markdown 编辑器：Ctrl+S 保存 + 停笔自动保存 + 会话/CSRF 过期防丢。
 *
 * - 保存前刷新 CSRF token（`/api/csrf/token` 会重设 cookie），根治 CSRF 1 小时过期 → 403。
 * - 停笔 idleMs(2s) 自动保存；连续打字时兜底 maxIntervalMs(60s) 至少存一次，均静默、非 toast，
 *   状态通过 saveStatus/hasUnsaved 反映到页面内联指示。
 * - 保存返回 401/403 视为会话/token 过期：把表单序列化备份到 localStorage，提示重新登录；
 *   回编辑页后 checkRecovery() 检测到更新的本地草稿，询问是否恢复。
 * - 自动保存仅在已有内容（有 cid）上生效；新建只见手动保存。
 *
 * @param opts 见 EditorAutosaveOptions
 * @returns { saveStatus, lastSavedAt, saveNow, markChanged, checkRecovery }
 */
export function useEditorAutosave(opts: EditorAutosaveOptions) {
  const route = useRoute();
  const { confirm } = useConfirm();

  const saveStatus = ref<SaveStatus>("idle");
  const lastSavedAt = ref<number | null>(null);

  const idleMs = opts.getIdleMs ?? 2000;
  const maxIntervalMs = opts.maxIntervalMs ?? 60_000;

  let lastChangeAt = 0;
  // 初始化为当前时间：避免 maxInterval 兜底在页面刚加载（无改动）时因 lastAttemptAt=0 恒成立而误触发。
  let lastAttemptAt = Date.now();
  let busy = false;
  // 会话已死时暂停自动保存，避免每 maxIntervalMs 空打一次 401；手动保存（saveNow）不受此限。
  let sessionDead = false;
  let expiryPrompted = false;

  async function refreshCsrf() {
    try {
      const res = await $fetch<{ data?: { token?: string } }>("/api/csrf/token", { credentials: "include" });
      if (res?.data?.token) opts.csrfToken.value = res.data.token;
    } catch {
      // 取不到就沿用现有值，让 save 去抛错并被识别为 expired。csrf cookie 非 httpOnly，此接口始终可用。
    }
  }

  function backup() {
    try {
      localStorage.setItem(
        opts.recoveryKey(),
        JSON.stringify({ fields: opts.serialize(), savedAt: Date.now() } satisfies AutosaveDraft),
      );
    } catch {
      /* localStorage 不可用（隐私模式/被禁），跳过备份 */
    }
  }

  function clearBackup() {
    try {
      localStorage.removeItem(opts.recoveryKey());
    } catch {
      /* 忽略 */
    }
  }

  async function saveNow(source: "manual" | "autosave") {
    if (busy) return;
    busy = true;
    saveStatus.value = "saving";
    lastAttemptAt = Date.now();
    try {
      await refreshCsrf();
      const result: SaveResult = await opts.save(source);

      if (result.status === "saved") {
        sessionDead = false;
        expiryPrompted = false;
        clearBackup();
        lastSavedAt.value = Date.now();
        saveStatus.value = "saved";
      } else if (result.status === "skipped") {
        // 必填缺失：视为刚处理过，防止 1s 循环空保存（等待用户补齐字段后 isPublishable 才放行）。
        lastChangeAt = Date.now();
        saveStatus.value = "unsaved";
      } else if (result.status === "expired") {
        sessionDead = true;
        backup();
        saveStatus.value = "expired";
        if (!expiryPrompted) {
          expiryPrompted = true;
          await promptExpiry();
        }
      } else {
        saveStatus.value = "error";
        // manual 的错误 toast 已由页面 save（source==="manual"）内处理；autosave 只反映状态。
      }
    } finally {
      busy = false;
    }
  }

  // 过期提示（一次性）：确认则跳登录，回跳带 fullPath（保留 query/cid，勿用 path 拼接）。
  async function promptExpiry() {
    const go = await confirm({
      title: "登录已过期",
      description: "登录状态已失效，当前未保存的内容已暂存到本地。是否前往重新登录？",
      variant: "destructive",
      confirmText: "去重新登录",
    });
    if (go) {
      await navigateTo({ path: "/login", query: { to: route.fullPath } });
    }
  }

  /** 页面在表单变更时调用（hasUnsaved 变 true 后）。 */
  function markChanged() {
    lastChangeAt = Date.now();
    if (saveStatus.value === "idle" || saveStatus.value === "saved") {
      saveStatus.value = "unsaved";
    }
  }

  // 定时器：idle(2s) 或 maxInterval(60s) 兜底。每秒检查一次。
  let timer: ReturnType<typeof setInterval> | null = null;
  onMounted(() => {
    timer = setInterval(() => {
      if (busy || sessionDead) return;
      if (!opts.hasUnsaved.value) return;
      if (!opts.canAutosave()) return;
      if (!opts.isPublishable()) return;
      const idleDue = Date.now() - lastChangeAt >= idleMs;
      const maxDue = Date.now() - lastAttemptAt >= maxIntervalMs;
      if (idleDue || maxDue) void saveNow("autosave");
    }, 1000);
  });
  onUnmounted(() => {
    if (timer) clearInterval(timer);
  });

  /** Ctrl/Cmd + S 保存。 */
  function onKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      void saveNow("manual");
    }
  }
  onMounted(() => window.addEventListener("keydown", onKeydown));
  onUnmounted(() => window.removeEventListener("keydown", onKeydown));

  /**
   * 恢复检测：内容加载完成后由页面调用。若 local 存在比当前内容更新的草稿，询问是否恢复。
   * 只处理编辑中/已有 cid 的情况（新建无 cid 时 recoveryKey 落在 ":new"，但 canAutosave=false 不会写备份）。
   */
  async function checkRecovery() {
    let raw: string | null;
    try {
      raw = localStorage.getItem(opts.recoveryKey());
    } catch {
      return;
    }
    if (!raw) return;

    let draft: AutosaveDraft;
    try {
      draft = JSON.parse(raw) as AutosaveDraft;
    } catch {
      clearBackup();
      return;
    }

    // 与当前已加载内容一致则视为已还原，弃掉。
    const current = opts.serialize();
    const fields = draft.fields ?? {};
    if (typeof current === "object" && !!current && JSON.stringify(current) === JSON.stringify(fields)) {
      clearBackup();
      return;
    }

    const d = new Date(draft.savedAt);
    const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const yes = await confirm({
      title: `检测到未保存的本地${opts.kind === "content" ? "文章" : "页面"}草稿`,
      description: `上次会话过期时已将内容暂存在本地（${time}）。是否恢复？`,
      confirmText: "恢复",
    });
    if (yes) {
      opts.applyRecovered(fields);
      markChanged();
    } else {
      clearBackup();
    }
  }

  return { saveStatus, lastSavedAt, saveNow, markChanged, checkRecovery };
}
