export type ToastProps = {
  message: string
  description?: string
  duration?: number
}

/** useToast().promise 的选项：loading 文案 + 成功/失败文案（可为函数，接收 resolved/rejected 值） */
export type PromiseToastOptions<T> = {
  loading: string
  success: string | ((data: T) => string)
  error: string | ((err: unknown) => string)
}