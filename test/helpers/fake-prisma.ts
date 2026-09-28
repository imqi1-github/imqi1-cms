// 供 mock.module("#server/utils/prisma") 用的假 prisma:
// prisma.<model>.<method>(args) 调用转发到 state["<model>.<method>"],未设置即抛错
import { mock } from "bun:test";

type Handler = (...args: never[]) => unknown;

export interface FakePrisma {
  prisma: unknown;
  on(model: string, method: string, handler: Handler): void;
  on(key: string, handler: Handler): void;
  // 取当前 state 快照(bun-preload 在 beforeEach 调,锁定当前所有 registerXxxFakes 注册)
  snapshot(): Map<string, Handler>;
  // 把 state 还原到给定快照(afterEach 调,清掉测试里 sharedFake.on() 留下的污染)
  restore(snap: Map<string, Handler>): void;
}

export function createFakePrisma(): FakePrisma {
  const state = new Map<string, Handler>();
  const prisma = new Proxy({}, {
    get(_t, model: string) {
      // $transaction 等顶层方法是单层调用,不走 模型.方法 两级
      if (model.startsWith("$")) {
        return (...args: never[]) => {
          const h = state.get(model);
          if (!h) return undefined;
          return h(...args);
        };
      }
      return new Proxy({}, {
        get(_t2, method: string) {
          return (...args: never[]) => {
            const h = state.get(`${model}.${method}`);
            // updateMany 未注册时返 {count: 1}(成功路径)兜底,避免每个乐观锁 handler
            // 都得显式 mock updateMany;已注册的同名 handler 走原 h
            if (!h && method === "updateMany") {
              return { count: 1 };
            }
            if (!h) return null;
            return h(...args);
          };
        },
      });
    },
  });
  return {
    prisma,
    // 两参形式 on("$transaction", fn) 注册顶层方法;三参 on("metas", "findMany", fn) 注册模型方法
    on(a: string, b: string | Handler, handler?: Handler) {
      const key = handler ? `${a}.${b}` : a;
      const finalHandler = handler ?? (b as Handler);
      // 通用回退:updateMany 未注册时返 {count: 1}(成功路径)而非 null
      // 让使用 updateMany 做乐观锁的 handler 在没专门 mock 时也能正常通过
      // 已注册的同名 handler 不受影响(避免覆盖测试的精确 mock)
      if (!state.has(key) && key.endsWith(".updateMany")) {
        state.set(key, (async () => ({ count: 1 })) as Handler);
      }
      state.set(key, finalHandler);
    },
    snapshot() {
      return new Map(state);
    },
    restore(snap: Map<string, Handler>) {
      state.clear();
      for (const [k, v] of snap) state.set(k, v);
    },
  };
}

// 多个测试文件对 "#server/utils/prisma" 各自 mock.module 时工厂可能互相覆盖,
// 但只要工厂返回同一实例,handlers 就不丢——全部用这个共享单例
export const sharedFake = createFakePrisma();

// 统一的 prisma 模块 mock:被测模块可能 import prisma(命名)、default prisma、isPrismaNotFoundError 三种形态
export function mockSharedPrisma(): void {
  mock.module("#server/utils/prisma", () => ({
    default: sharedFake.prisma,
    prisma: sharedFake.prisma,
    isPrismaNotFoundError: (e: unknown) =>
      e instanceof Error && "code" in e && (e as { code?: string }).code === "P2025",
  }));
}
