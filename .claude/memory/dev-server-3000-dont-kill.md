---
name: dev-server-3000-dont-kill
description: 用户可能自己启动 dev server 在 3000 端口，绝不 kill/占用已在跑的端口；要自起用别的端口(如 3001)
metadata:
  node_type: memory
  type: feedback
---

用户自起 dev server 在 **3000**(自己运行)。**绝不 kill/占用用户在跑的端口**——之前误 kill 过其进程。

**Why:** 3000 是用户自己的进程,杀掉会打断其开发;port 3000 被占时 Nuxt 会自动落到 3001(所以早期日志常显示 3001)。用户明确要求「3000 是我自己启动的,你不要杀掉」。

**How to apply:** 测试直接访问用户已跑的那个服务(如 `http://localhost:3000`);若必须自起 dev server,用**别的端口**(如 3001),先 `netstat -ano | grep -E ':3001'` 确认没占用;测试结束**不要 `taskkill` 用户端口上的进程**。相关 [[audit-skill]]。
