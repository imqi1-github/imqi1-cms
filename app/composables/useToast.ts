import { toast } from 'vue-sonner'

import type { PromiseToastOptions, ToastProps } from '~/types/composables/toast'

export const useToast = () => {
  // 共享 options 构造（description/duration 默认值）—— 抽出避免 4 个 helper 重复拼同一对象
  const baseOptions = (props: ToastProps) => ({
    description: props.description,
    duration: props.duration ?? 4000,
  })

  const success = (props: ToastProps) =>
    toast.success(props.message, baseOptions(props))

  const error = (props: ToastProps) =>
    toast.error(props.message, baseOptions(props))

  const info = (props: ToastProps) =>
    toast.info(props.message, baseOptions(props))

  const warning = (props: ToastProps) =>
    toast.warning(props.message, baseOptions(props))

  const promise = <T,>(
    promise: Promise<T>,
    {
      loading,
      success,
      error,
    }: PromiseToastOptions<T>
  ) => {
    return toast.promise(promise, {
      loading,
      success,
      error,
    })
  }

  return {
    success,
    error,
    info,
    warning,
    promise,
  }
}