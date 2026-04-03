declare global {
  interface Window {
    isLogin(): boolean
    verifySession(): Promise<boolean>
  }
}

export {}
