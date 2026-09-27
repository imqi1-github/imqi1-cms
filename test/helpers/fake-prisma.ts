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
            // 未注册时返 null(模拟真实 Prisma「记录不存在」语义),避免每个测试都得 registerMetasFakes 这种防御性样板
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
      state.set(key, handler ?? (b as Handler));
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
