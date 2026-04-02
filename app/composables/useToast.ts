import { toast } from 'vue-sonner'

export type ToastProps = {
  message: string
  description?: string
  duration?: number
}

export const useToast = () => {
  const success = (props: ToastProps) => {
    return toast.success(props.message, {
      description: props.description,
      duration: props.duration ?? 4000,
    })
  }

  const error = (props: ToastProps) => {
    return toast.error(props.message, {
      description: props.description,
      duration: props.duration ?? 4000,
    })
  }

  const info = (props: ToastProps) => {
    return toast.info(props.message, {
      description: props.description,
      duration: props.duration ?? 4000,
    })
  }

  const warning = (props: ToastProps) => {
    return toast.warning(props.message, {
      description: props.description,
      duration: props.duration ?? 4000,
    })
  }

  const promise = <T,>(
    promise: Promise<T>,
    {
      loading,
      success,
      error,
    }: {
      loading: string
      success: string | ((data: T) => string)
      error: string | ((err: unknown) => string)
    }
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
