import { beforeEach, describe, expect, test } from "bun:test";

import { useLightbox } from "~/composables/useLightbox";

beforeEach(() => useState<unknown>("lightbox", () => null).value = null);

describe("useLightbox pure helpers (no DOM containers required)", () => {
  test("resolveTrigger:null 或非 HTMLElement 返回 null", () => {
    const lb = useLightbox();
    expect(lb.resolveTrigger(null)).toBeNull();
    expect(lb.resolveTrigger({} as unknown as HTMLElement)).toBeNull();
  });

  test("goTo / next / prev:无 state 时不抛", () => {
    const lb = useLightbox();
    expect(() => lb.goTo(0)).not.toThrow();
    expect(() => lb.goTo(99)).not.toThrow();
    expect(() => lb.next()).not.toThrow();
    expect(() => lb.prev()).not.toThrow();
  });

  test("close:无 state 时不抛且 state 仍 null", () => {
    const lb = useLightbox();
    lb.close();
    expect(useState<unknown>("lightbox", () => null).value).toBeNull();
  });

  test("release:getTriggerAt 不抛,返回 null", () => {
    const lb = useLightbox();
    lb.release();
    expect(lb.getTriggerAt(0)).toBeNull();
    expect(lb.getTriggerAt(-1)).toBeNull();
  });

  test("open:未注册容器 / 元素不在已注册容器内 → state 保持 null", () => {
    const lb = useLightbox();
    // 没注册容器,触发器没意义
    lb.open({ getAttribute: () => "g" } as unknown as HTMLElement);
    expect(useState<unknown>("lightbox", () => null).value).toBeNull();
  });
});