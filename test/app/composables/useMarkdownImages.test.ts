import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";

import { useMarkdownImages } from "~/composables/useMarkdownImages";

let win: Window;

beforeEach(() => {
  win = new Window();
  Object.assign(globalThis, {
    window: win,
    document: win.document,
    HTMLElement: win.HTMLElement,
  });
});

afterEach(() => {
  win.close();
});

// 注:LivePhoto 走 Vue render + createVNode。Vue runtime-dom 内部在模块加载时
// 用 `typeof document !== "undefined" ? document : null` 锁定 doc 变量,
// bun:test 文件 import 顺序下 Vue 加载早于 happy-dom Window,doc=null → render 抛错。
// 实况照片分支由 dev 手工验证,本测试只覆盖普通图片 wrapper + 分支选择 + 边界 case。

describe("useMarkdownImages mount 普通图片", () => {
  test("普通图片替换为 .markdown-image-container wrapper", () => {
    const root = win.document.createElement("div");
    root.innerHTML = `<div class="markdown-body"><img src="/imgs/a.jpg" alt="hello" /></div>`;
    win.document.body.appendChild(root);

    const { mount } = useMarkdownImages();
    mount(root);

    const wrapper = root.querySelector(".markdown-image-container");
    expect(wrapper).not.toBeNull();
    expect(wrapper?.querySelector("img.markdown-image")).not.toBeNull();
    expect(wrapper?.querySelector("img.markdown-image")?.getAttribute("src")).toBe("/imgs/a.jpg");
    expect(wrapper?.querySelector("img.markdown-image")?.getAttribute("alt")).toBe("hello");
  });

  test("宽高属性(width/height) → 写入 wrapper 的 aspect-ratio 内联样式", () => {
    const root = win.document.createElement("div");
    root.innerHTML = `<div class="markdown-body"><img src="/imgs/a.jpg" alt="" width="800" height="600" /></div>`;
    win.document.body.appendChild(root);

    const { mount } = useMarkdownImages();
    mount(root);

    const wrapper = root.querySelector(".markdown-image-container > div") as HTMLElement | null;
    expect(wrapper?.getAttribute("style") ?? "").toContain("aspect-ratio: 800 / 600");
  });

  test("options.resolveDimensions 提供宽高 → 覆盖 img 原属性", () => {
    const root = win.document.createElement("div");
    root.innerHTML = `<div class="markdown-body"><img src="/imgs/a.jpg" alt="" /></div>`;
    win.document.body.appendChild(root);

    const { mount } = useMarkdownImages();
    mount(root, {
      resolveDimensions: () => ({ width: 1000, height: 500 }),
    });

    const wrapper = root.querySelector(".markdown-image-container > div") as HTMLElement | null;
    expect(wrapper?.getAttribute("style") ?? "").toContain("aspect-ratio: 1000 / 500");
  });

  test("data-lightbox / data-caption 属性透传到 wrapper 内 <img>", () => {
    const root = win.document.createElement("div");
    root.innerHTML = `<div class="markdown-body"><img src="/imgs/a.jpg" data-lightbox="g" data-caption="cap" /></div>`;
    win.document.body.appendChild(root);

    const { mount } = useMarkdownImages();
    mount(root);

    const img = root.querySelector(".markdown-image");
    expect(img?.getAttribute("data-lightbox")).toBe("g");
    expect(img?.getAttribute("data-caption")).toBe("cap");
  });

  test("宽高属性为非数字字符串 → 不写 aspect-ratio(避免 NaN)", () => {
    const root = win.document.createElement("div");
    root.innerHTML = `<div class="markdown-body"><img src="/imgs/a.jpg" alt="" width="abc" height="0" /></div>`;
    win.document.body.appendChild(root);

    const { mount } = useMarkdownImages();
    mount(root);

    const wrapper = root.querySelector(".markdown-image-container > div") as HTMLElement | null;
    expect(wrapper?.getAttribute("style") ?? "").not.toContain("aspect-ratio");
  });
});

describe("useMarkdownImages 跳过分支", () => {
  test("卡片类容器内图片(markdown-card / markdown-repo / markdown-simple-card)→ 跳过增强", () => {
    const root = win.document.createElement("div");
    root.innerHTML = `
      <div class="markdown-body">
        <div class="markdown-card"><img src="/imgs/card.jpg" /></div>
        <div class="markdown-simple-card"><img src="/imgs/simple.jpg" /></div>
        <div class="markdown-repo"><img src="/imgs/repo.jpg" /></div>
      </div>
    `;
    win.document.body.appendChild(root);

    const { mount } = useMarkdownImages();
    mount(root);

    // 卡片内的图片应保留原 <img>,不被替换
    expect(root.querySelector(".markdown-card img")).not.toBeNull();
    expect(root.querySelector(".markdown-simple-card img")).not.toBeNull();
    expect(root.querySelector(".markdown-repo img")).not.toBeNull();
    expect(root.querySelectorAll(".markdown-image-container").length).toBe(0);
  });

  test("已增强过的图片(markdown-image-container 内)→ 跳过避免套娃", () => {
    const root = win.document.createElement("div");
    root.innerHTML = `
      <div class="markdown-body">
        <div class="markdown-image-container"><img class="markdown-image" src="/imgs/a.jpg" /></div>
      </div>
    `;
    win.document.body.appendChild(root);

    const { mount } = useMarkdownImages();
    mount(root);

    expect(root.querySelectorAll(".markdown-image-container").length).toBe(1);
  });
});

describe("useMarkdownImages mount 边界", () => {
  test("无图片的 root → 不抛、不创建空 wrapper", () => {
    const root = win.document.createElement("div");
    root.className = "markdown-body";
    win.document.body.appendChild(root);

    const { mount } = useMarkdownImages();
    expect(() => mount(root)).not.toThrow();
    expect(root.querySelectorAll(".markdown-image-container").length).toBe(0);
  });

  test("非 markdown-body 内的图片 → 不被增强(querySelectorAll 限定)", () => {
    const root = win.document.createElement("div");
    root.innerHTML = `<div class="other"><img src="/imgs/a.jpg" /></div>`;
    win.document.body.appendChild(root);

    const { mount } = useMarkdownImages();
    mount(root);

    // .markdown-body img 选择器限定,other 内图片不应被替换
    expect(root.querySelector(".other img")).not.toBeNull();
    expect(root.querySelectorAll(".markdown-image-container").length).toBe(0);
  });

  test("重复 mount → 不产生重复 wrapper(unmount 旧的再装)", () => {
    const root = win.document.createElement("div");
    root.innerHTML = `<div class="markdown-body"><img src="/imgs/a.jpg" /></div>`;
    win.document.body.appendChild(root);

    const { mount } = useMarkdownImages();
    mount(root);
    mount(root);
    expect(root.querySelectorAll(".markdown-image-container").length).toBe(1);
  });

  test("空 className 的 <img> → wrapper div 的 markdown-image-wrapper 不带额外 class", () => {
    const root = win.document.createElement("div");
    root.innerHTML = `<div class="markdown-body"><img src="/imgs/a.jpg" alt="" /></div>`;
    win.document.body.appendChild(root);

    const { mount } = useMarkdownImages();
    mount(root);

    const inner = root.querySelector(".markdown-image-wrapper") as HTMLElement | null;
    // 模板固定带 relative overflow-hidden,额外 class 应为空
    expect(inner?.className).toContain("relative");
    expect(inner?.className).toContain("overflow-hidden");
  });
});

describe("useMarkdownImages unmount", () => {
  test("未 mount 直接 unmount → 不抛", () => {
    const { unmount } = useMarkdownImages();
    expect(() => unmount()).not.toThrow();
  });

  test("mount 后 unmount 不抛(即使 LivePhoto render 已成功)", () => {
    const root = win.document.createElement("div");
    root.innerHTML = `<div class="markdown-body"><img src="/imgs/a.jpg" /></div>`;
    win.document.body.appendChild(root);

    const { mount, unmount } = useMarkdownImages();
    mount(root);
    expect(() => unmount()).not.toThrow();
  });
});