<template>
  <div class="flex min-h-screen items-center justify-center bg-background px-4">
    <div class="w-full max-w-sm rounded-lg border bg-card text-card-foreground shadow-sm">
      <!-- Header -->
      <div class="flex flex-col space-y-1.5 p-6">
        <h3 class="text-2xl font-semibold leading-none tracking-tight text-center">登录</h3>
        <p class="text-sm text-muted-foreground text-center">输入您的账号信息以登录后台管理系统</p>
      </div>

      <div class="p-6 pt-0 space-y-4">
        <div class="space-y-2">
          <div>
            <label class="text-sm font-medium leading-none" for="username">用户名</label>
          </div>
          <input
            id="username"
            type="text"
            placeholder="请输入用户名"
            class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </div>
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <label class="text-sm font-medium leading-none" for="password">密码</label>
            <a href="#" class="text-sm text-primary hover:underline"> 忘记密码? </a>
          </div>
          <input
            id="password"
            type="password"
            placeholder="请输入密码"
            class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </div>
        <div class="flex items-center space-x-2">
          <input type="checkbox" id="remember" class="h-4 w-4 rounded border-input" />
          <label for="remember" class="text-sm font-medium leading-none cursor-pointer"> 记住我 </label>
        </div>
      </div>

      <div class="flex flex-col items-center p-6 pt-0 space-y-4">
        <button
          class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 w-full">
          登录
        </button>
        <div class="text-sm text-center text-muted-foreground">
          还没有账号?
          <a href="#" class="text-primary hover:underline">立即注册</a>
        </div>
      </div>
    </div>
  </div>
</template>
