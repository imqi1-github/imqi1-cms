/**
 * Toaster 组件类型定义
 */

export interface ToasterProps {
  class?: string;
  richColors?: boolean;
  closeButton?: boolean;
  expand?: boolean;
  duration?: number;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top-center' | 'bottom-center';
}