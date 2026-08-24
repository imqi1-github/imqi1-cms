import type { ConfirmOptions, ConfirmState } from "~/types/composables/confirm";

/**
 * 全局确认弹窗。
 *
 * 提供与浏览器原生 confirm() 一致的 Promise<boolean> 用法，
 * 由挂在 AdminLayout 中的 <ConfirmDialog /> 负责渲染（shadcn Dialog）。
 *
 * 用法：
 *   const { confirm } = useConfirm()
 *   if (!await confirm({ title: "删除", description: "...", variant: "destructive" })) return
 */
export const useConfirm = () => {
  // 全局单例状态：非 null 表示有一个待响应的确认弹窗
  const state = useState<ConfirmState | null>("confirm-dialog", () => null);

  const confirm = (options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      // 已有待响应的确认弹窗时，先取消旧的那个（resolve(false)）：
      // 否则它会被下面的覆盖，旧 Promise 永远悬挂不决（「连点/并行 confirm」孤儿问题）
      state.value?.resolve(false);
      state.value = {
        title: options.title ?? "确认操作",
        description: options.description ?? "",
        confirmText: options.confirmText ?? "确认",
        cancelText: options.cancelText ?? "取消",
        variant: options.variant === "destructive" ? "destructive" : "default",
        icon: options.icon,
        resolve,
      };
    });
  };

  /** 用户作出选择（true=确认 / false=取消）；同时清空状态关闭弹窗 */
  const answer = (ok: boolean) => {
    state.value?.resolve(ok);
    state.value = null;
  };

  return {
    state,
    confirm,
    answer,
  };
};
