// 供 mock.module("#server/utils/prisma") 用的假 prisma:
// prisma.<model>.<method>(args) 调用转发到 state["<model>.<method>"],未设置即抛错
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
