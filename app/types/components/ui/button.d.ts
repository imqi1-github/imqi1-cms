/**
 * Button 组件类型定义
 */

import type { VariantProps } from "class-variance-authority";

export interface ButtonProps {
  variant?: ButtonVariants["variant"];
  size?: ButtonVariants["size"];
  class?: string;
  as?: string;
  asChild?: boolean;
}

export type ButtonVariants = VariantProps<typeof import("./*.vue")>;