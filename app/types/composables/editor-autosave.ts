import type { Ref } from "vue";

/**
 * 一次保存尝试的定式结果。autosave 与 manual 共用，页面据此决定是否 toast / 是否进入过期恢复流程。
 */
export type SaveResult =
  | { status: "saved" }
  | { status: "skipped" } // 校验不通过（标题空/无分类等），保持脏，autosave 静默
  | { status: "expired" } // 401/403：会话或 CSRF token 已失效
  | { status: "error"; message?: string };

/** 保存状态，用于右侧内联指示（非 toast）。 */
export type SaveStatus = "idle" | "unsaved" | "saving" | "saved" | "expired" | "error";

/** 存到 localStorage 的过期草稿。 */
export interface AutosaveDraft {
  fields: Record<string, unknown>;
  savedAt: number;
}

export interface EditorAutosaveOptions {
  /** 编辑器类型，用于区分恢复提示文案。 */
  kind: "content" | "page";
  /** 计算 localStorage 备份键（须随 cid 变化，创建后 cid 从 null → 新 id）。 */
  recoveryKey: () => string;
  /** 页面计算出的「是否有未保存改动」。 */
  hasUnsaved: Ref<boolean>;
  /** 页面持有的 csrf token ref；本组合保存在保存前刷新它。 */
  csrfToken: Ref<string>;
  /** 实际保存函数（已改写为按 source 决定 toast，并返回 SaveResult）。 */
  save: (source: "manual" | "autosave") => Promise<SaveResult>;
  /** 是否允许自动保存：无 cid（新建）时返回 false，自动保存只在已有内容上生效。 */
  canAutosave: () => boolean;
  /** 是否可发布：用于自动保存前跳过「必填缺失」的无效表单（避免反复空保存）。 */
  isPublishable: () => boolean;
  /** 序列化当前表单字段（用于过期时的本地备份）。 */
  serialize: () => Record<string, unknown>;
  /** 把备份字段回填到页面 refs（用于恢复草稿）。 */
  applyRecovered: (fields: Record<string, unknown>) => void;
  /** 停笔多久后自动保存，默认 2000ms。 */
  getIdleMs?: number;
  /** 连续打字时最长间隔兜底，默认 60000ms。 */
  maxIntervalMs?: number;
}
