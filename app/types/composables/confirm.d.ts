/**
 * 确认弹窗（useConfirm / ConfirmDialog）相关类型定义
 */

export interface ConfirmOptions {
  /** 弹窗标题，缺省“确认操作” */
  title?: string;
  /** 描述文案，支持多行（\n） */
  description?: string;
  /** 确认按钮文案，缺省“确认” */
  confirmText?: string;
  /** 取消按钮文案，缺省“取消” */
  cancelText?: string;
  /** 确认按钮风格：destructive 用红色（删除/清空等不可撤销操作） */
  variant?: "default" | "destructive";
  /** 标题前图标名（如 lucide:trash-2），可选 */
  icon?: string;
}

/** 运行中的确认弹窗状态（全局单例，挂在 AdminLayout） */
export interface ConfirmState extends Required<Omit<ConfirmOptions, "icon">> {
  icon?: string;
  resolve: (value: boolean) => void;
}
