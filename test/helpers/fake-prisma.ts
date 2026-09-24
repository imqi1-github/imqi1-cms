// 供 mock.module("#server/utils/prisma") 用的假 prisma:
// prisma.<model>.<method>(args) 调用转发到 state["<model>.<method>"],未设置即抛错
import { mock } from "bun:test";

type Handler = (...args: never[]) => unknown;

export interface FakePrisma {
  prisma: unknown;
  on(model: string, method: string, handler: Handler): void;
}

export function createFakePrisma(): FakePrisma {
  const state = new Map<string, Handler>();
  const prisma = new Proxy({}, {
    get(_t, model: string) {
      return new Proxy({}, {
        get(_t2, method: string) {
          return (...args: never[]) => {
            const h = state.get(`${model}.${method}`);
            if (!h) throw new Error(`fake prisma: 未设置 ${model}.${method}`);
            return h(...args);
          };
        },
      });
    },
  });
  return {
    prisma,
    on(model, method, handler) {
      state.set(`${model}.${method}`, handler);
    },
  };
}

// 多个测试文件对 "#server/utils/prisma" 各自 mock.module 时工厂可能互相覆盖,
// 但只要工厂返回同一实例,handlers 就不丢——全部用这个共享单例
export const sharedFake = createFakePrisma();

// 统一的 prisma 模块 mock:被测模块可能同时 import prisma 与 isPrismaNotFoundError
export function mockSharedPrisma(): void {
  mock.module("#server/utils/prisma", () => ({
    prisma: sharedFake.prisma,
    isPrismaNotFoundError: (e: unknown) =>
      e instanceof Error && "code" in e && (e as { code?: string }).code === "P2025",
  }));
}
