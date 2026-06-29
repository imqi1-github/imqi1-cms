/**
 * Badge 组件类型定义
 */

import type { VariantProps } from "class-variance-authority";

export interface BadgeProps {
  variant?: BadgeVariants["variant"];
  class?: string;
}

export type BadgeVariants = VariantProps<typeof import("./*.vue")>;