import { beforeEach, describe, expect, test } from "bun:test";

import { useConfirm } from "~/composables/useConfirm";

beforeEach(() => useState<unknown>("confirm-dialog", () => null).value = null);

describe("useConfirm", () => {
  test("answer(true) 让对应 confirm 解析为 true", async () => {
    const { confirm, answer } = useConfirm();
    const p = confirm({ title: "T", description: "D" });
    answer(true);
    expect(await p).toBe(true);
  });

  test("answer(false) 让 confirm 解析为 false", async () => {
    const { confirm, answer } = useConfirm();
    const p = confirm({ title: "T" });
    answer(false);
    expect(await p).toBe(false);
  });

  test("variant=destructive 原样保留;默认变体为 default", () => {
    const { confirm } = useConfirm();
    void confirm({ title: "T", variant: "destructive" });
    expect(useState<{ variant: string } | null>("confirm-dialog", () => null).value?.variant).toBe("destructive");
    void confirm({ title: "T" });
    expect(useState<{ variant: string } | null>("confirm-dialog", () => null).value?.variant).toBe("default");
  });

  test("缺省文案:title/description/confirmText/cancelText 均有兜底", () => {
    const { confirm } = useConfirm();
    void confirm({});
    const s = useState<Record<string, unknown> | null>("confirm-dialog", () => null).value!;
    expect(s.title).toBe("确认操作");
    expect(s.description).toBe("");
    expect(s.confirmText).toBe("确认");
    expect(s.cancelText).toBe("取消");
  });

  test("二次 confirm 时上一个 Promise 被同步 resolve(false) 终止孤儿", async () => {
    const { confirm, answer } = useConfirm();
    const first = confirm({ title: "first" });
    const second = confirm({ title: "second" });
    expect(await first).toBe(false);
    void answer(true);
    expect(await second).toBe(true);
  });
});