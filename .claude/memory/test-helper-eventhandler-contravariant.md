---
name: test-helper-eventhandler-contravariant
description: test helper 接收 nitro handler 的参数签名必须是 (e: never) => T，不是 (e: unknown) => Promise（contravariant 决定 EventHandler 只能赋给前者）
metadata:
  type: feedback
---

test helper（`callAdmin` / `callDbAdmin` 等）接收 nitro `defineEventHandler` 的参数签名统一用 `(e: never) => T`，**不是** `(e: unknown) => Promise<unknown>`。

**Why**: TypeScript 函数参数是 contravariant（逆变）的。nitro 的 `defineEventHandler` 返回 `EventHandler<EventHandlerRequest, ...>`，实际签名是 `(event: H3Event) => something`。由于 `never` 是所有类型的子类型，contravariant 翻转后 accepts H3Event 的函数是 accepts never 的函数的**子类型**，可赋值。但 accepts H3Event 的函数**不能**赋给 accepts unknown 的函数（unknown 是顶层，handler 不能处理 unknown 入参）—— 后者触发 TS2345 `Argument of type 'EventHandler<...>' is not assignable to parameter of type '(e: unknown) => Promise<unknown>'`。实测：test/integration/real/* 12 个文件、~140 个 TS2345 全因此改对。

**How to apply**:
- 所有 test helper（callAdmin、callDbAdmin 等）接收 nitro handler 的参数统一 `(e: never) => T` 形式，T 是 handler 真实返回类型（generic 默认 unknown）
- 实现里 `return handler(makeEvent(opts).event as never) as T`
- 不要用 `(e: any) => any`（绕过类型校验丢失 narrowing）
- `callAdmin`（test/helpers/admin.ts）和 `callDbAdmin`（test/integration/real/_helpers.ts）已统一此模式，新 helper 沿用
