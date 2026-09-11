<script setup lang="ts">
import "@/assets/css/lightbox.css";

import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from "vue";
import { useEventListener, useMediaQuery, usePreferredReducedMotion } from "@vueuse/core";

import type { LightboxSlide, LightboxState, LightboxTransition } from "~/types/composables/lightbox";
import { clearLivePhotoMediaCache, useLivePhoto } from "~/composables/useLivePhoto";
import { useScrollFadeMask } from "~/composables/useScrollFadeMask";

/**
 * 图片灯箱（自研，替代商用许可的 Fancybox）
 *
 * 全局单例，在 app.vue 挂载一次，由 useLightbox 的状态驱动，
 * 页面侧只需 register(container) 注册画廊容器。
 *
 * 渲染进原生 <dialog> + showModal()：进入浏览器 top layer，天然盖住
 * z-9999 的页脚悬浮按钮，并白拿 ESC 关闭、焦点陷阱与背景 inert。
 * 视觉规格沿用原 Fancybox 主题（见 assets/css/lightbox.css）。
 */

/** 标签沿用原 assets/js/zh_CN.umd.js 的译法 */
const LABELS = {
  dialog: "图片查看器",
  close: "关闭",
  prev: "上一张",
  next: "下一张",
  zoomIn: "放大",
  zoomOut: "缩小",
  toggleZoom: "切换缩放级别",
  rotateCcw: "逆时针旋转",
  rotateCw: "顺时针旋转",
  flipX: "水平翻转",
  flipY: "垂直翻转",
  reset: "重置",
  thumbs: "切换缩略图",
  imageError: "无法加载此图像，请稍后重试。",
} as const;

const MAX_SCALE = 2;
const MORPH_MS = 350;
const ZOOM_ANIM_MS = 300;
const SWIPE_PX = 25;
const CLOSE_PX = 120;
/** 相邻两张之间的间隙：滑片与跟手预览里两张恒差「一个舞台宽 + 这点」，不贴在一起 */
const PEER_GAP = 16;
/** 交叉淡化时长（远距跳转）与滑片时长（相邻切换）；滑片要走满一个屏宽，得慢些 */
const FADE_MS = 220;
const SLIDE_MS = 300;

const { state, resolveTrigger, open, close, goTo, next, prev, getTriggerAt, release } = useLightbox();
const { extractLivePhotoMedia, peekLivePhotoImageUrl } = useLivePhoto();

const dialogRef = useTemplateRef<HTMLDialogElement>("dialog");
const stageRef = useTemplateRef<HTMLDivElement>("stage");
const stripRef = useTemplateRef<HTMLDivElement>("strip");
// 缩略图条横向溢出时把两端羽化（滚动条已隐藏，羽化负责提示还有内容）
const { atStart: stripAtStart, atEnd: stripAtEnd } = useScrollFadeMask(stripRef, "x");

const reducedMotion = usePreferredReducedMotion();
const isNarrow = useMediaQuery("(max-width: 640px)");

/** 是否渲染灯箱内容：关闭动画播完前保持 true */
const visible = ref(false);
/** 退出中：让按钮/缩略图随图片一起淡出 */
const closing = ref(false);
/** 开合变形层：从原图位置放大 / 缩回。视觉由 CSS animation 驱动（元素新建即播） */
const morph = ref<{
  src: string;
  /** 起点（open）或终点（close）相对目标矩形的 transform */
  away: string;
  /** away 里的缩放系数：整层被缩放，圆角要用它反向补偿（见 lb-morph-* keyframes） */
  scale: number;
  phase: "open" | "close";
  /** 目标矩形在创建时就固定：关闭时 current 已清空，不能再从 visual 推算 */
  rect: { left: number; top: number; width: number; height: number };
} | null>(null);
const mediaVisible = ref(false);
const loadError = ref(false);
/** 工具栏/双击缩放时给元素盒加过渡；滚轮与拖拽必须瞬时跟手 */
const zoomAnimating = ref(false);
/** 缩略图条显隐；null 表示跟随视口宽度 */
const thumbsPreference = ref<boolean | null>(null);
const thumbsVisible = computed(() => thumbsPreference.value ?? !isNarrow.value);

/**
 * 关闭动画期间仍要渲染的那份内容。close() 会立刻把 state 置 null，若直接渲染它，
 * 计数会跳成 0/0、图片与说明当场消失（ConfirmDialog 同款「冻结快照」做法）。
 */
const display = ref<LightboxState | null>(null);

const slides = computed(() => display.value?.slides ?? []);
const index = computed(() => display.value?.index ?? 0);
const current = computed<LightboxSlide | null>(() => slides.value[index.value] ?? null);
const hasMultiple = computed(() => slides.value.length > 1);

// ---- 视图状态（逐张重置；旧灯箱按张记忆缩放，这里换可预期性）----
const scale = ref(1);
const tx = ref(0);
const ty = ref(0);
const rotation = ref(0);
const flipX = ref(false);
const flipY = ref(false);
/** scale=1 时跟手位移：横滑切图 / 下滑关闭 */
const dragOffset = ref({ x: 0, y: 0 });
/** 舞台可用区域，随缩略图条显隐与窗口尺寸变化 */
const stageBox = ref({ w: 0, h: 0 });
/** 图片解码后才拿到的固有尺寸（触发元素上取不到时兜底） */
const intrinsicOverride = ref<{ w: number; h: number } | null>(null);
/**
 * 图片固有尺寸缓存（按 cleanSrc 索引）。切图时若 slide 元数据缺失（画廊图未加载），
 * 先查缓存再退回 16:9——窄屏快速切下一页时不再因 16:9 兜底让竖图骤缩。
 */
const dimensionCache = new Map<string, { w: number; h: number }>();
/**
 * 上一张真正显示过的图；首帧与画廊切换不参与过渡。
 * 声明在尺寸计算之前：图片加载完成时要回来修正它的 `aspect`（见 onMediaLoaded）。
 */
let lastRendered: { cleanSrc: string; aspect: { w: number; h: number }; index: number } | null = null;

/**
 * 当前这张对应的触发元素（原图）。开合动画与焦点归还都用它，
 * 因为切图后要收敛回「正在看的这张」的原图，而不是最初点开的那张。
 */
const triggerForCurrent = (): HTMLElement | null => getTriggerAt(display.value?.index ?? 0);
/** 开合序列的代际号：期间再次开合时丢弃旧序列的后续步骤 */
let generation = 0;
let zoomAnimTimer: ReturnType<typeof setTimeout> | null = null;
let stageObserver: ResizeObserver | null = null;

// ---- 尺寸计算 ----

const contain = (inner: { w: number; h: number }, outer: { w: number; h: number }) => {
  if (inner.w <= 0 || inner.h <= 0 || outer.w <= 0 || outer.h <= 0) return { w: 0, h: 0 };
  const ratio = Math.min(outer.w / inner.w, outer.h / inner.h);
  return { w: inner.w * ratio, h: inner.h * ratio };
};

const intrinsic = computed(() => {
  const slide = current.value;
  const cached = dimensionCache.get(slide?.cleanSrc ?? "");
  const w = intrinsicOverride.value?.w ?? slide?.width ?? cached?.w ?? 0;
  const h = intrinsicOverride.value?.h ?? slide?.height ?? cached?.h ?? 0;
  return w > 0 && h > 0 ? { w, h } : { w: 16, h: 9 };
});

/** 旋转 90/270 后参与适配的长宽对调 */
const rotatedIntrinsic = computed(() => {
  const i = intrinsic.value;
  return rotation.value % 180 === 0 ? i : { w: i.h, h: i.w };
});

/** 图片在屏幕上应占的尺寸（scale=1 时） */
const visual = computed(() => contain(rotatedIntrinsic.value, stageBox.value));

/** 元素实际盒尺寸：旋转 90/270 时需交换，旋转后才正好落回 visual */
const boxSize = computed(() => {
  const v = visual.value;
  return rotation.value % 180 === 0 ? v : { w: v.h, h: v.w };
});

const maxOffset = computed(() => ({
  x: Math.max(0, (visual.value.w * scale.value - stageBox.value.w) / 2),
  y: Math.max(0, (visual.value.h * scale.value - stageBox.value.h) / 2),
}));

const clampOffset = () => {
  const m = maxOffset.value;
  tx.value = Math.min(m.x, Math.max(-m.x, tx.value));
  ty.value = Math.min(m.y, Math.max(-m.y, ty.value));
};

/** 下滑关闭时随位移淡出，给手势一个可见的反馈 */
const dragOpacity = computed(() => {
  if (scale.value > 1 || dragOffset.value.y <= 0) return 1;
  return Math.max(0, 1 - dragOffset.value.y / (CLOSE_PX * 2));
});

const boxStyle = computed(() => ({
  width: `${boxSize.value.w}px`,
  height: `${boxSize.value.h}px`,
  opacity: dragOpacity.value,
  transform: `translate3d(${tx.value + dragOffset.value.x}px, ${ty.value + dragOffset.value.y}px, 0) scale(${scale.value})`,
}));

/**
 * 说明文字跟着图片同一个位移/透明度，拖动时两者才读作一个整体在走。
 * 单独包一层（.lb-caption-track）而不是直接写在 .lb-caption 上：
 * 后者带着 animation-fill-mode: both 的淡入动画，动画优先级高于行内样式，行内 opacity 会被它压住。
 *
 * 位移用独立的 translate 属性而不是 transform：切图动画（is-sliding/is-crossing）动的正是
 * transform，且 fill-mode 会让它在播完后继续压着行内值——曾经因此在「切图后 300ms 内再拖动」
 * 时说明文字纹丝不动。translate 与 transform 是并列的两个属性，互不覆盖。
 */
const captionStyle = computed(() => ({
  opacity: dragOpacity.value,
  translate: `${dragOffset.value.x}px ${dragOffset.value.y}px`,
}));

const mediaStyle = computed(() => ({
  transform: `rotate(${rotation.value}deg) scaleX(${flipX.value ? -1 : 1}) scaleY(${flipY.value ? -1 : 1})`,
}));

const thumbRefs = new Map<number, HTMLElement>();
const setThumbRef = (el: Element | null, i: number) => {
  if (el instanceof HTMLElement) thumbRefs.set(i, el);
  else thumbRefs.delete(i);
};

/** 缩略图宽度按自身比例推导（高度由 CSS 固定），竖图就不会两侧留白；未知尺寸时退回 94/76 */
const thumbRatio = (slide: LightboxSlide) =>
  slide.width && slide.height ? `${slide.width} / ${slide.height}` : "94 / 76";

/** 预加载相邻两张，切图不等白（实况照片同样受益：#live 片段不参与请求） */
const preload = computed(() => {
  const list = slides.value;
  if (list.length < 2) return [];
  const i = index.value;
  const candidates = [list[(i + 1) % list.length], list[(i - 1 + list.length) % list.length]];
  const seen = new Set<string>();
  return candidates.filter((s): s is LightboxSlide => {
    // 两张时两个候选是同一张：去重，否则 v-for 会出重复 key（Vue 会告警）
    if (!s || s.src === current.value?.src || seen.has(s.src)) return false;
    seen.add(s.src);
    return true;
  });
});

/**
 * 相邻实况照片提前提取。上面那些 <img> 只预热了 HTTP 缓存，视频段仍要等切过去才
 * fetch + 扫 ftyp + 切 Blob——全是主线程上的大块拷贝，落在切图那一刻就是一帧卡顿。
 * 提前跑掉，切过去只是一次缓存命中。extractLivePhotoMedia 本身是 async（fetch + blob +
 * 扫描），不阻塞当前帧；用 setTimeout(0) 而非 requestIdleCallback，确保切图前缓存已就绪。
 */
watch(preload, list => {
  if (!import.meta.client || !list.length) return;
  const warm = () => {
    for (const s of list) {
      if (s.isLive) extractLivePhotoMedia(s.cleanSrc);
    }
  };
  window.setTimeout(warm, 0);
}, { immediate: true });

/** 舞台顶部为工具栏让出的内边距（CSS 里的 --lb-toolbar-h） */
const stagePadTop = (el: HTMLElement) => Number.parseFloat(getComputedStyle(el).paddingTop) || 0;

const measureStage = () => {
  const el = stageRef.value;
  if (!el) return;
  // clientHeight 含 padding，图片可用高要把工具栏那一段扣掉
  stageBox.value = { w: el.clientWidth, h: el.clientHeight - stagePadTop(el) };
};

const resetView = () => {
  scale.value = 1;
  tx.value = 0;
  ty.value = 0;
  rotation.value = 0;
  flipX.value = false;
  flipY.value = false;
  dragOffset.value = { x: 0, y: 0 };
  intrinsicOverride.value = null;
  loadError.value = false;
};

// ---- 缩放 ----

/** 以视口坐标 (clientX, clientY) 为锚点缩放；不传坐标则锚定舞台中心 */
const zoomAt = (factor: number, clientX?: number, clientY?: number) => {
  const target = Math.min(MAX_SCALE, Math.max(1, scale.value * factor));
  if (target === scale.value) return;

  const el = stageRef.value;
  if (el && clientX !== undefined && clientY !== undefined) {
    const r = el.getBoundingClientRect();
    // 图片在内容盒里居中（顶部让出了工具栏高度），锚点要按同一个中心算，否则会偏 padTop/2
    const padTop = stagePadTop(el);
    const px = clientX - (r.left + r.width / 2);
    const py = clientY - (r.top + padTop + (r.height - padTop) / 2);
    const ratio = target / scale.value;
    tx.value = px - (px - tx.value) * ratio;
    ty.value = py - (py - ty.value) * ratio;
  }

  scale.value = target;
  clampOffset();
};

/** 工具栏/键盘触发的缩放带过渡；滚轮与捏合直接调 zoomAt 保持跟手 */
const animateZoom = (run: () => void) => {
  if (reducedMotion.value !== "reduce") {
    zoomAnimating.value = true;
    if (zoomAnimTimer) clearTimeout(zoomAnimTimer);
    zoomAnimTimer = setTimeout(() => {
      zoomAnimating.value = false;
      zoomAnimTimer = null;
    }, ZOOM_ANIM_MS);
  }
  run();
};

const zoomIn = () => animateZoom(() => zoomAt(1.5));
const zoomOut = () => animateZoom(() => zoomAt(1 / 1.5));
const toggleZoom = () => {
  animateZoom(() => {
    if (scale.value > 1) {
      scale.value = 1;
      tx.value = 0;
      ty.value = 0;
      return;
    }
    zoomAt(MAX_SCALE);
  });
};

const rotate = (delta: number) => {
  animateZoom(() => {
    rotation.value = (rotation.value + delta + 360) % 360;
    // 旋转改变适配盒，归中避免旧位移把图片顶出边界
    tx.value = 0;
    ty.value = 0;
    clampOffset();
  });
};

// ---- 指针手势 ----

const pointers = new Map<number, { x: number; y: number }>();
let dragStart: { x: number; y: number; tx: number; ty: number } | null = null;
let pinch: { prevDist: number } | null = null;
/** 本次手势是否真的移动过（用于区分"点空白关闭"与"拖完松手"） */
let movedThisGesture = false;
/** 松手切图时的落点位移与方向，交接给切图过渡当动画起点（见 beginTransition） */
let switchFromX = 0;
/** 本次切图的入场方向；null 表示按索引差推断（点缩略图时用，滑片/箭头已自带方向） */
let switchDir: -1 | 1 | null = null;
/** 低于这个位移视为点击而非拖拽 */
const DRAG_SLOP = 6;

const pointerDistance = () => {
  const pts = [...pointers.values()];
  const a = pts[0];
  const b = pts[1];
  if (!a || !b) return null;
  return {
    dist: Math.hypot(a.x - b.x, a.y - b.y),
    midX: (a.x + b.x) / 2,
    midY: (a.y + b.y) / 2,
  };
};

/**
 * 目标是否属于交互控件。必须用 Element 而非 HTMLElement：
 * 按钮里的图标是 SVGElement（instanceof HTMLElement 为 false），
 * 漏判会让指针落到舞台上并触发指针捕获，click 被重定向到舞台 → 误关灯箱。
 */
const isInteractiveTarget = (target: EventTarget | null) =>
  target instanceof Element && !!target.closest("button, a, video");

/** 清空手势状态：关闭灯箱/组件卸载时调用，避免失效的 pointerId 残留到下一次会话 */
const resetGesture = () => {
  pointers.clear();
  dragStart = null;
  pinch = null;
  movedThisGesture = false;
  dragOffset.value = { x: 0, y: 0 };
};

const onPointerDown = (e: PointerEvent) => {
  // 先清标记：下面可能因命中交互控件提前返回，标记若残留会把下一次「点空白关闭」吞掉
  movedThisGesture = false;
  // 让实况播放/箭头等控件走正常点击，不参与拖拽
  if (isInteractiveTarget(e.target)) return;
  // 指针被捕获后，拖拽结束时的 click 会被重定向到捕获元素（舞台），
  // 于是「拖完松手」会被当成「点空白处关闭」。用本手势是否真的移动过来区分。
  stageRef.value?.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  // 每次手势都清零：捏合中途插入的残留位移否则会在松手时被当成切图/关闭
  dragOffset.value = { x: 0, y: 0 };

  if (pointers.size === 1) {
    dragStart = { x: e.clientX, y: e.clientY, tx: tx.value, ty: ty.value };
  } else if (pointers.size === 2) {
    const d = pointerDistance();
    pinch = d ? { prevDist: d.dist } : null;
    dragStart = null;
  }
};

const onPointerMove = (e: PointerEvent) => {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pointers.size >= 2) {
    const d = pointerDistance();
    if (d && pinch && pinch.prevDist > 0) zoomAt(d.dist / pinch.prevDist, d.midX, d.midY);
    if (d) pinch = { prevDist: d.dist };
    return;
  }

  if (!dragStart) return;
  const dx = e.clientX - dragStart.x;
  const dy = e.clientY - dragStart.y;
  if (Math.abs(dx) > DRAG_SLOP || Math.abs(dy) > DRAG_SLOP) movedThisGesture = true;

  if (scale.value > 1) {
    tx.value = dragStart.tx + dx;
    ty.value = dragStart.ty + dy;
    clampOffset();
    return;
  }

  // scale=1：跟手位移，松手时按方向决定切图还是关闭
  if (Math.abs(dx) > Math.abs(dy)) {
    dragOffset.value = { x: dx, y: 0 };
  } else if (dy > 0) {
    dragOffset.value = { x: 0, y: dy };
  }
};

const onPointerUp = (e: PointerEvent) => {
  if (!pointers.delete(e.pointerId)) return;
  if (pointers.size < 2) pinch = null;

  if (pointers.size > 0) {
    // 捏合掉回单指：以剩下那根手指为起点重新起拖，否则单指拖动要等到抬手重按才生效
    const rest = [...pointers.values()][0];
    dragStart = rest ? { x: rest.x, y: rest.y, tx: tx.value, ty: ty.value } : null;
    dragOffset.value = { x: 0, y: 0 };
    return;
  }

  const d = dragOffset.value;
  if (scale.value === 1) {
    if (Math.abs(d.x) > SWIPE_PX) {
      // 把位移与方向交接给滑片动画：松手后出场层从手指离开的位置接着走，不是从静止位重来
      switchFromX = d.x;
      switchDir = d.x < 0 ? 1 : -1;
      if (d.x < 0) next();
      else prev();
    } else if (d.y > CLOSE_PX) {
      close();
    }
  }
  dragOffset.value = { x: 0, y: 0 };
  dragStart = null;
};

const onWheel = (e: WheelEvent) => {
  if (e.ctrlKey || e.metaKey) return;
  zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX, e.clientY);
};

const onDoubleClick = (e: MouseEvent) => {
  if (isInteractiveTarget(e.target)) return;
  animateZoom(() => {
    if (scale.value > 1) {
      scale.value = 1;
      tx.value = 0;
      ty.value = 0;
      return;
    }
    zoomAt(MAX_SCALE, e.clientX, e.clientY);
  });
};

/**
 * 拖动跟手预览：往左拖把右边那张一起带进来，往右拖反过来。
 * 位移和松手后的入场层是同一套坐标（相邻两张恒差一个屏宽），所以松手交接时位置严丝合缝。
 */
const dragPeek = computed(() => {
  if (scale.value > 1) return null;
  const dx = dragOffset.value.x;
  if (Math.abs(dx) <= DRAG_SLOP) return null;
  const total = slides.value.length;
  if (total < 2) return null;
  const step = dx < 0 ? 1 : -1;
  const slide = slides.value[(index.value + step + total) % total];
  if (!slide) return null;
  // 尺寸未知时退回 16:9：与切图本身的兜底口径一致
  const cached = dimensionCache.get(slide.cleanSrc);
  const w = slide.width ?? cached?.w ?? 16;
  const h = slide.height ?? cached?.h ?? 9;
  return { step, dx, box: contain({ w, h }, stageBox.value), src: peekLivePhotoImageUrl(slide.cleanSrc) ?? slide.cleanSrc };
});

const dragPeekStyle = computed(() => {
  const p = dragPeek.value;
  if (!p) return undefined;
  const span = (stageBox.value.w || window.innerWidth) + PEER_GAP;
  return {
    width: `${p.box.w}px`,
    height: `${p.box.h}px`,
    transform: `translate3d(${p.dx + p.step * span}px, 0, 0)`,
  };
});

/** 舞台空白处点击关闭（图片之外的暗区，与旧灯箱一致） */
const onStageClick = (e: MouseEvent) => {
  // 拖拽后浏览器会把 click 重定向到被捕获的舞台，别把它当"点空白"而误关
  if (movedThisGesture) {
    movedThisGesture = false;
    return;
  }
  if (e.target === stageRef.value) close();
};

// ---- 开合动画 ----

/** 舞台可用区（去掉顶部工具栏内边距）+ 给定的适配尺寸 → 视口坐标矩形 */
const rectFromFit = (fit: { w: number; h: number } | null) => {
  const el = stageRef.value;
  if (!el || !fit || fit.w <= 0 || fit.h <= 0) return null;
  const r = el.getBoundingClientRect();
  const padTop = stagePadTop(el);
  const innerH = r.height - padTop;
  return { cx: r.left + r.width / 2, cy: r.top + padTop + innerH / 2, w: fit.w, h: fit.h };
};

/**
 * 由图片比例 + 盒子算出实际内容矩形。
 * 缩略图条是 object-fit: contain、封面是 cover，直接拿盒子会用上错误的起止尺寸，
 * 导致放大动画起始尺寸偏大/偏小并在收尾时跳一下。
 */
const contentRect = (box: DOMRect, aspect: { w: number; h: number }, fit: "contain" | "cover") => {
  const k = fit === "contain"
    ? Math.min(box.width / aspect.w, box.height / aspect.h)
    : Math.max(box.width / aspect.w, box.height / aspect.h);
  return { cx: box.left + box.width / 2, cy: box.top + box.height / 2, w: aspect.w * k, h: aspect.h * k };
};

/** 触发元素自身的 object-fit：封面轮播用 cover，正文图片是 contain */
const triggerFit = (): "contain" | "cover" => {
  const el = triggerForCurrent();
  const img = el instanceof HTMLImageElement ? el : el?.querySelector<HTMLImageElement>("img");
  const fit = img ? getComputedStyle(img).objectFit : "cover";
  return fit === "cover" || fit === "fill" ? "cover" : "contain";
};

/**
 * 触发元素的实时矩形。灯箱开着时页面仍可能被滚动，开时捕获的矩形会过期，
 * 故开合两端都实时读一次（元素已被移除则返回 null，退化为淡出）。
 */
const liveTriggerRect = (): DOMRect | null => {
  const el = triggerForCurrent();
  if (!el?.isConnected) return null;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 ? r : null;
};

/** 触发元素不可聚焦时补 tabindex="-1"（不进 Tab 序列），否则 focus() 静默失败 */
const focusElement = (el: HTMLElement | null) => {
  if (!el?.isConnected) return;
  if (!el.hasAttribute("tabindex") && !el.matches("a[href], button, input, select, textarea")) {
    el.setAttribute("tabindex", "-1");
  }
  el.focus({ preventScroll: true });
};

/** 由源矩形与目标矩形构造变形层；away 即另一端（open 为起点 / close 为终点） */
const buildMorph = (
  from: { cx: number; cy: number; w: number; h: number } | null,
  target: { cx: number; cy: number; w: number; h: number } | null,
  src: string,
  phase: "open" | "close",
) => {
  if (!target || !from || from.w <= 0 || target.w <= 0 || reducedMotion.value === "reduce") return null;
  const dx = from.cx - target.cx;
  const dy = from.cy - target.cy;
  const s = Math.max(0.02, from.w / target.w);
  return {
    src,
    away: `translate3d(${dx}px, ${dy}px, 0) scale(${s})`,
    // 整层会被 scale 缩，圆角也跟着缩（收敛回原图时角就变尖了）。系数交给 CSS，在缩小端补回来
    scale: s,
    phase,
    rect: { left: target.cx - target.w / 2, top: target.cy - target.h / 2, width: target.w, height: target.h },
  };
};

const morphStyle = computed((): Record<string, string> => {
  const m = morph.value;
  if (!m) return {};
  return {
    left: `${m.rect.left}px`,
    top: `${m.rect.top}px`,
    width: `${m.rect.width}px`,
    height: `${m.rect.height}px`,
    "--lb-morph-away": m.away,
    "--lb-morph-scale": `${m.scale}`,
    "--lb-morph-anim": m.phase === "open" ? "lb-morph-open" : "lb-morph-close",
  };
});

const scrollThumbIntoView = () => {
  const strip = stripRef.value;
  const el = thumbRefs.get(index.value);
  if (!strip || !el) return;
  strip.scrollTo({ left: el.offsetLeft - (strip.clientWidth - el.clientWidth) / 2, behavior: "smooth" });
};

/** 触发元素自身那张图的内容矩形：收尾动画要落回原始图片的位置，而不是缩略图 */
const triggerContentRect = (box: DOMRect) => {
  const el = triggerForCurrent();
  const img = el instanceof HTMLImageElement ? el : el?.querySelector<HTMLImageElement>("img");
  const w = img?.naturalWidth ?? 0;
  const h = img?.naturalHeight ?? 0;
  return contentRect(box, w > 0 && h > 0 ? { w, h } : intrinsic.value, triggerFit());
};

/** 触发元素已滚出视口时不做收尾动画，否则图片会朝屏幕外飞出去，不如直接淡出 */
const isInViewport = (r: DOMRect | null) =>
  !!r && r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;

const lockScroll = () => {
  const html = document.documentElement;
  // main.css 的 scrollbar-gutter: stable 因原生嵌套写法实际不生效，此处量测兜底：
  // 未预留槽位时用实测滚动条宽度补 margin，避免页面横向跳动
  const reservesGutter = (getComputedStyle(html).scrollbarGutter ?? "").includes("stable");
  html.style.setProperty("--lb-scrollbar-width", `${reservesGutter ? 0 : window.innerWidth - html.clientWidth}px`);
  html.classList.add("with-lightbox");
  document.body.classList.add("lb-hide-scrollbar");
};

const unlockScroll = () => {
  document.documentElement.classList.remove("with-lightbox");
  document.body.classList.remove("lb-hide-scrollbar");
};

const openSequence = async (gen: number) => {
  const dialog = dialogRef.value;
  if (!dialog) return;

  // 若上一轮的关闭动画还没播完就再次打开，is-closing 会让整套铬件停在 opacity:0
  closing.value = false;
  resetView();
  visible.value = true;
  await nextTick();
  if (gen !== generation) return;

  if (!dialog.open) dialog.showModal();
  lockScroll();
  // 必须在 showModal 之后量：关闭态的 dialog 是 display:none，客户端尺寸为 0
  measureStage();
  mediaVisible.value = false;

  const sourceBox = liveTriggerRect();
  const source = sourceBox ? triggerContentRect(sourceBox) : null;
  morph.value = buildMorph(source, rectFromFit(visual.value), current.value?.cleanSrc ?? "", "open");
  const m = morph.value;
  // 无变形层时（减弱动效 / 量不到舞台）直接显示
  mediaVisible.value = !m;
  if (m) {
    // 变形层抵达终态后再露出真实媒体并撤掉它
    window.setTimeout(() => {
      if (gen !== generation || morph.value !== m) return;
      mediaVisible.value = true;
      morph.value = null;
    }, MORPH_MS);
  }

  scrollThumbIntoView();
};

const closeSequence = async (gen: number) => {
  if (!visible.value) return;
  mediaVisible.value = false;
  // 与下面等待的时长一致，淡完刚好关闭
  closing.value = true;

  // 立刻收掉可能还在播的切图过渡（切完 300ms 内就关闭的情况）：留着的话出场层会以全不透明度
  // 继续滑，而且 is-sliding/is-alt 规则的特异性会盖掉下面那条关闭淡出，说明文字还会闪一下。
  // 这里收掉是安全的——关闭序列紧接着由变形层接管整个图片区。
  endTransition();

  // 缩回原图片（触发元素）的当前位置；已滚出视口则退化为淡出。
  // 此刻 state 已置 null，但 display 冻结着，故 intrinsic/visual 仍然有效。
  // 加载失败的图就别再 morph 了——morph 的 img 失败会显破图标（即便改用 background-image，
  // 也只是不再显破图标而已，让它空收敛再淡出没意义），直接随 .lb-root 一起淡掉。
  const box = liveTriggerRect();
  const source = box && isInViewport(box) && !loadError.value ? triggerContentRect(box) : null;
  morph.value = buildMorph(source, rectFromFit(visual.value), current.value?.cleanSrc ?? "", "close");

  await new Promise(resolve => window.setTimeout(resolve, reducedMotion.value === "reduce" ? 0 : MORPH_MS));
  if (gen !== generation) return;
  dialogRef.value?.close();
};

/**
 * 一个 watcher 兼顾三件事：开、关、以及同画廊切图。
 * 切图时 goTo 换的是新对象——直接 watch(state) 重放开场动画、watch(state===null) 又不同步内容，
 * 故用 opened 区分「跳变」与「内容变更」。
 */
const opened = ref(false);
watch(state, value => {
  if (!value) {
    opened.value = false;
    closeSequence(++generation);
    return;
  }
  display.value = value;
  if (opened.value) return;
  opened.value = true;
  openSequence(++generation);
});

const onDialogCancel = () => {
  // 拦下原生关闭，走带动画的序列
  close();
};

/**
 * 关闭后把焦点还给用户：优先当前缩略图（真按钮），其次当前这张的原图。
 * 注意 onDialogClosed 是在 dialog.close() 之后跑的，此时 dialog 已 display:none，
 * 其内元素的 focus() 会静默失败——所以必须确认真的拿到焦点，否则退到原图。
 */
const restoreFocus = () => {
  if (thumbsVisible.value && hasMultiple.value) {
    const thumb = thumbRefs.get(display.value?.index ?? 0);
    if (thumb?.isConnected) {
      thumb.focus({ preventScroll: true });
      if (document.activeElement === thumb) return;
    }
  }
  focusElement(triggerForCurrent());
};

const onDialogClosed = () => {
  visible.value = false;
  closing.value = false;
  morph.value = null;
  mediaVisible.value = false;
  zoomAnimating.value = false;
  endTransition();
  switchFromX = 0;
  switchDir = null;
  resetGesture();
  unlockScroll();
  // 缩略图条隐藏、没有缩略图时，焦点回到当前这张的原图
  restoreFocus();
  // 最后清：焦点归还还要读它的 index
  display.value = null;
  release();
};

const onMediaLoaded = (e: Event) => {
  loadError.value = false;
  const slide = current.value;
  const img = e.target as HTMLImageElement | null;
  if (img?.naturalWidth && img?.naturalHeight) {
    if (slide?.cleanSrc) dimensionCache.set(slide.cleanSrc, { w: img.naturalWidth, h: img.naturalHeight });
    // 记下的上一张尺寸要跟着回来修正：切到这张的那一刻图还没加载，lastRendered 很可能落到
    // 16:9 兜底；不修的话下次切走时出场层按错误比例铺开，滑出去的那一下会明显跳一下
    if (lastRendered && lastRendered.cleanSrc === slide?.cleanSrc) {
      lastRendered.aspect = { w: img.naturalWidth, h: img.naturalHeight };
    }
    if (!slide?.width || !slide.height) {
      intrinsicOverride.value = { w: img.naturalWidth, h: img.naturalHeight };
    }
  }
};

/** 预加载图解码后把固有尺寸入缓存，切到该图时直接命中、不落入 16:9 兜底 */
const onPreloadLoad = (e: Event, cleanSrc: string) => {
  const img = e.target as HTMLImageElement | null;
  if (img?.naturalWidth && img?.naturalHeight && cleanSrc) {
    dimensionCache.set(cleanSrc, { w: img.naturalWidth, h: img.naturalHeight });
  }
};

/**
 * 主图加载失败：开场的 morph 还在播，破图标会被一起收敛进灯箱（morph 用的是同一 URL）。
 * 立即把 morph 撤掉让 .lb-error 接管，错误提示的淡入由 CSS animation 处理。
 */
const onMediaError = () => {
  loadError.value = true;
  if (morph.value) {
    morph.value = null;
    mediaVisible.value = true;
  }
};

const goToIndex = (i: number) => {
  resetView();
  goTo(i);
};

// 箭头/键盘切图自带方向：两张画廊里"下一张"的前后关系靠索引差推不出来（索引差永远是 ±1），
// 而滑片方向必须跟手势一致，否则会看着像弹回去
const goNext = () => {
  switchDir = 1;
  next();
};

const goPrev = () => {
  switchDir = -1;
  prev();
};

// ---- 切图过渡：相邻切换左右滑片，远距跳转交叉淡化 ----

/** 过渡进行中的出场层（上一张图 + 说明文字）；非空表示过渡中 */
const transition = ref<LightboxTransition | null>(null);
let switchTimer: ReturnType<typeof setTimeout> | null = null;

const switchMs = (t: LightboxTransition) => (t.dir === 0 ? FADE_MS : SLIDE_MS);

const endTransition = () => {
  if (switchTimer) {
    clearTimeout(switchTimer);
    switchTimer = null;
  }
  transition.value = null;
};

/** 出场层按它自己的比例铺在舞台上：不能沿用新图的盒，否则横竖图互换时会缩放跳变 */
const outgoingBox = computed(() => (transition.value ? contain(transition.value.aspect, stageBox.value) : null));

/** 入场层与出场层共用的类名：滑片 or 交叉淡化 */
const switchClass = computed(() => {
  const t = transition.value;
  if (!t) return "";
  return t.dir === 0 ? "is-crossing" : "is-sliding";
});

/** 出场图地址。实况照片优先用已提取的 blob（同一包字节，入场层也是它渲染的），
    免得出场这张还要按原 URL 重新解码、开场空一拍；上一张本身加载失败时留空，不画出场图。 */
const outgoingSrc = computed(() => {
  const src = transition.value?.src;
  if (!src) return "";
  return peekLivePhotoImageUrl(src) ?? src;
});

/** 出场说明文字；交叉淡化时说明文字照旧随图换掉，不额外做一层 */
const outgoingCaption = computed(() => (transition.value?.dir ? transition.value.caption : ""));

/**
 * 交替位。连续两次同类过渡下元素上的类名一模一样，浏览器认为动画没变、不会重播，
 * 画面就成了瞬移（连点箭头、两图间快速来回时最明显）。靠它交替换一份同名 keyframes。
 */
const switchAlt = ref(false);

/**
 * 位移起止交给 CSS 变量、插值交给 keyframes：入场层与出场层是两个元素，
 * 只共享同一组变量与同一条动画，才能读作「一个整体」在移动。
 */
const switchVars = computed<Record<string, string> | undefined>(() => {
  const t = transition.value;
  if (!t) return undefined;
  return {
    "--lb-switch-ms": `${switchMs(t)}ms`,
    "--lb-slide-from": `${t.inFrom}px`,
    "--lb-out-from": `${t.outFrom}px`,
    "--lb-out-to": `${t.outTo}px`,
  };
});

/** 说明文字容器的底边距视口底：说明文字紧挨在缩略图条上方，故取缩略图条顶边 */
const captionBottomPx = () => {
  const strip = stripRef.value;
  if (!hasMultiple.value || !thumbsVisible.value || !strip) return 0;
  const r = strip.getBoundingClientRect();
  return r.height > 0 ? Math.max(0, window.innerHeight - r.top) : 0;
};

/** 相邻则返回步进方向，跨多张（点远端缩略图）返回 null → 该走交叉淡化 */
const adjacentDir = (from: number, to: number): -1 | 1 | null => {
  const total = slides.value.length;
  if (total < 2) return null;
  let d = to - from;
  if (d > total / 2) d -= total;
  else if (d < -total / 2) d += total;
  return Math.abs(d) === 1 ? (d > 0 ? 1 : -1) : null;
};

/**
 * 起过渡。动画全走 CSS keyframes（元素新建即播）；这里只算出两层的起止位移与清理时机。
 * 减弱动效直接换图，不留出场层——留了也只会静止地盖在新图上闪一帧。
 */
const beginTransition = (
  prev: { cleanSrc: string; aspect: { w: number; h: number }; index: number },
  dir: -1 | 0 | 1,
  fromX: number,
  failed: boolean,
) => {
  endTransition();
  if (reducedMotion.value === "reduce") return;

  // 相邻两张恒差「一个舞台宽 + 间隙」：出场层滑到另一侧屏外，入场层从同侧屏外进来，
  // 与跟手预览同一套坐标，松手交接才不会跳
  const span = (stageBox.value.w || window.innerWidth) + PEER_GAP;
  const t: LightboxTransition = {
    // 上一张加载失败就只免掉出场图，入场层照旧滑进来——整段过渡都省掉的话新图是瞬移出现的
    src: failed ? null : prev.cleanSrc,
    aspect: prev.aspect,
    caption: slides.value[prev.index]?.caption ?? "",
    dir,
    outFrom: dir === 0 ? 0 : fromX,
    outTo: dir === 0 ? 0 : -dir * span,
    inFrom: dir === 0 ? 0 : fromX + dir * span,
    captionBottom: captionBottomPx(),
  };
  transition.value = t;
  switchAlt.value = !switchAlt.value;
  switchTimer = setTimeout(() => {
    transition.value = null;
    switchTimer = null;
  }, switchMs(t));
};

/**
 * 切图判定键：索引与地址**任一**变化都算切图。
 * 只认地址会漏掉「同一张图在画廊里出现两次」——正文重复引用同一张图时（首尾各一次很常见），
 * 换过去地址不变，但计数、说明文字、缩略图选中态都变了，此时整段处理被跳过、画面纹丝不动。
 */
const switchKey = computed(() => `${index.value}:${current.value?.cleanSrc ?? ""}`);

/**
 * 逐张重置 + 起切图过渡。用 post：过渡要按**换图后**的舞台尺寸和缩略图条位置算，
 * pre 阶段 DOM 还是旧内容，量出来的盒会偏出一张说明文字的高度（说明文字在流内，撑得舞台变矮）。
 */
watch(
  switchKey,
  () => {
    // 切图前先把上一张记下来：此刻 current 已是新图，读不到旧尺寸了
    const prev = lastRendered;
    const prevWasError = loadError.value;
    const fromX = switchFromX;
    const dirHint = switchDir;
    switchFromX = 0;
    switchDir = null;

    resetView();
    measureStage();
    if (state.value) {
      // 画廊开着才算切图（开/关那一下不走过渡）
      if (prev && prev.index !== index.value) {
        beginTransition(prev, dirHint ?? adjacentDir(prev.index, index.value) ?? 0, fromX, prevWasError);
      }
      scrollThumbIntoView();
    }
    lastRendered = current.value
      ? { cleanSrc: current.value.cleanSrc, aspect: { ...intrinsic.value }, index: index.value }
      : null;
  },
  { flush: "post" },
);

const onKeydown = (e: KeyboardEvent) => {
  if (!state.value) return;
  // 放行浏览器自身快捷键（Ctrl +/-/0 缩放、Cmd 组合等）
  if (e.ctrlKey || e.metaKey || e.altKey) return;

  // 焦点在缩略图条里时，左右键在缩略图之间移动焦点，不切幻灯片
  const strip = stripRef.value;
  if (strip && e.target instanceof Node && strip.contains(e.target)) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const total = slides.value.length;
    if (total === 0) return;
    const delta = e.key === "ArrowRight" ? 1 : -1;
    thumbRefs.get((index.value + delta + total) % total)?.focus();
    e.preventDefault();
    return;
  }

  switch (e.key) {
    case "ArrowLeft":
      goPrev();
      break;
    case "ArrowRight":
      goNext();
      break;
    case "ArrowUp":
      if (scale.value > 1) {
        ty.value -= 80;
        clampOffset();
      } else return;
      break;
    case "ArrowDown":
      if (scale.value > 1) {
        ty.value += 80;
        clampOffset();
      } else return;
      break;
    case "+":
    case "=":
      zoomIn();
      break;
    case "-":
    case "_":
      zoomOut();
      break;
    case "0":
      animateZoom(resetView);
      break;
    case "r":
      rotate(e.shiftKey ? -90 : 90);
      break;
    case "f":
      if (e.shiftKey) flipY.value = !flipY.value;
      else flipX.value = !flipX.value;
      break;
    default:
      return;
  }
  e.preventDefault();
};

useEventListener(window, "keydown", onKeydown);

// 委派监听：点击时才解析触发元素，故 Markdown 事后注入 DOM 的图片同样生效
useEventListener(document, "click", (e: MouseEvent) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const trigger = resolveTrigger(e.target);
  if (!trigger) return;
  e.preventDefault();
  open(trigger);
});

/**
 * 实况照片的视频 Blob 缓存按「页面」存活，路由切换时清理（延后一轮才 revoke，
 * 见 useLivePhoto 的 retiredBlobUrls——避免 revoke 到过渡中/新页面仍在引用的 blob）。
 * 挂在这里是因为 Lightbox 是全局单例（app.vue 挂载一次、永不卸载），相当于应用级生命周期钩子；
 * 同一路由内开/关灯箱不清，故文章页与灯箱之间能复用同一份提取结果。
 */
const route = useRoute();
// 用 path 而非 fullPath：fullPath 含 hash，文章页点一下目录锚点就会清掉整份媒体缓存，
// 而页面上的 LivePhoto 不会重新提取（提取只依赖 shouldLoad/cleanSrc），从此播不了
watch(() => route.path, clearLivePhotoMediaCache);

onBeforeUnmount(() => {
  stageObserver?.disconnect();
  stageObserver = null;
  if (zoomAnimTimer) clearTimeout(zoomAnimTimer);
  if (switchTimer) clearTimeout(switchTimer);
  resetGesture();
  unlockScroll();
});

watch(stageRef, el => {
  stageObserver?.disconnect();
  stageObserver = null;
  if (!el) return;
  stageObserver = new ResizeObserver(measureStage);
  stageObserver.observe(el);
  measureStage();
});
</script>

<template>
  <dialog
    ref="dialog"
    class="lb-dialog"
    :aria-label="LABELS.dialog"
    @cancel.prevent="onDialogCancel"
    @close="onDialogClosed">
    <div v-if="visible" class="lb-root" :class="{ 'is-closing': closing }" :style="switchVars">
      <div class="lb-backdrop" @click="close" />

      <div class="lb-toolbar">
        <div class="lb-pill is-left">
          <span class="lb-counter" aria-live="polite">{{ index + 1 }} / {{ slides.length }}</span>
        </div>

        <div class="lb-pill is-middle">
          <button type="button" class="lb-btn" :aria-label="LABELS.zoomIn" :disabled="scale >= MAX_SCALE" @click="zoomIn">
            <Icon name="lucide:zoom-in" mode="svg" />
          </button>
          <button type="button" class="lb-btn" :aria-label="LABELS.zoomOut" :disabled="scale <= 1" @click="zoomOut">
            <Icon name="lucide:zoom-out" mode="svg" />
          </button>
          <button type="button" class="lb-btn" :aria-label="LABELS.toggleZoom" @click="toggleZoom">
            <Icon name="lucide:maximize" mode="svg" />
          </button>
          <button type="button" class="lb-btn" :aria-label="LABELS.rotateCcw" @click="rotate(-90)">
            <Icon name="lucide:rotate-ccw" mode="svg" />
          </button>
          <button type="button" class="lb-btn" :aria-label="LABELS.rotateCw" @click="rotate(90)">
            <Icon name="lucide:rotate-cw" mode="svg" />
          </button>
          <button type="button" class="lb-btn" :aria-label="LABELS.flipX" @click="flipX = !flipX">
            <Icon name="lucide:flip-horizontal" mode="svg" />
          </button>
          <button type="button" class="lb-btn" :aria-label="LABELS.flipY" @click="flipY = !flipY">
            <Icon name="lucide:flip-vertical" mode="svg" />
          </button>
          <button type="button" class="lb-btn" :aria-label="LABELS.reset" @click="animateZoom(resetView)">
            <Icon name="lucide:undo-2" mode="svg" />
          </button>
        </div>

        <div class="lb-pill is-right">
          <button
            v-if="hasMultiple"
            type="button"
            class="lb-btn"
            :class="{ 'is-active': thumbsVisible }"
            :aria-label="LABELS.thumbs"
            :aria-pressed="thumbsVisible"
            @click="thumbsPreference = !thumbsVisible">
            <Icon name="lucide:layout-grid" mode="svg" />
          </button>
          <button type="button" class="lb-btn" :aria-label="LABELS.close" @click="close">
            <Icon name="lucide:x" mode="svg" />
          </button>
        </div>
      </div>

      <!-- 舞台需给出确定尺寸：panzoom 的适配与边界都基于它计算 -->
      <div
        ref="stage"
        class="lb-stage"
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
        @wheel.prevent="onWheel"
        @click="onStageClick"
        @dragstart.prevent
        @dblclick="onDoubleClick">
        <!-- 滑片轨道：只当位移载体，好让箭头、预加载图不跟着图片一起走。
             pointer-events: none 把空白处的点击放回舞台（点空白关闭照旧生效）。 -->
        <div class="lb-slide-track" :class="[switchClass, { 'is-alt': switchAlt }]">
          <div v-if="current" class="lb-media-box" :class="{ 'is-animating': zoomAnimating }" :style="boxStyle">
            <!-- 加载失败时整块撤掉：v-if="!loadError" 让 <img>/LivePhoto 根本不在 DOM，破图占位没载体可依附。
                 之前的 .has-error { visibility: hidden } 救不了切图瞬间——resetView 会先把 loadError 清回 false，
                 接着新图加载失败前的几十 ms 里 <img> 已是破图占位 + visibility 还是 visible。
                 不在 .lb-media / LivePhoto 上挂 :key：让 Vue 按位置/类型复用实例，
                 切图省掉 setup 重跑 + refs 重置 + IntersectionObserver 重绑那一大段——只有 src 真正变化时由组件内 watch 响应。 -->
            <div v-if="!loadError" class="lb-media" :style="mediaStyle" :class="{ 'is-visible': mediaVisible, 'has-error': loadError }">
              <LivePhoto
                v-if="current.isLive"
                :src="current.src"
                :alt="current.caption"
                :hover-play="false"
                :lazy="false"
                class="size-full" />
              <img
                v-else
                :key="`img:${current.src}`"
                :src="current.src"
                :alt="current.caption"
                class="lb-image size-full"
                decoding="async"
                @load="onMediaLoaded"
                @error="onMediaError" >
            </div>

            <div v-if="loadError" class="lb-error" role="alert">
              <Icon name="lucide:image-off" mode="svg" />
              <span>{{ LABELS.imageError }}</span>
            </div>
          </div>
        </div>

        <!-- 出场层：上一张按自身比例铺在舞台上，向另一侧滑出（相邻切换）或淡出（远距跳转）。
             上一张加载失败时只剩空盒（没图可画），但入场层照旧滑进来。 -->
        <div
          v-if="transition && outgoingBox"
          class="lb-outgoing"
          :class="[switchClass, { 'is-alt': switchAlt }]"
          :style="{ width: `${outgoingBox.w}px`, height: `${outgoingBox.h}px` }">
          <img v-if="outgoingSrc" :src="outgoingSrc" alt="" >
        </div>

        <!-- 拖动跟手预览：相邻那张跟着手指一起进来，松手切图时正好由入场层接住 -->
        <div v-if="dragPeek" class="lb-drag-peek" :style="dragPeekStyle">
          <img :src="dragPeek.src" alt="" >
        </div>

        <img v-for="item in preload" :key="item.src" :src="item.src" alt="" class="lb-preload" @load="onPreloadLoad($event, item.cleanSrc)" >

        <!-- 箭头放在舞台内：top 的 100% 才对得上图片区（放在 .lb-root 会按整屏居中，偏低） -->
        <button v-if="hasMultiple" type="button" class="lb-arrow is-prev" :aria-label="LABELS.prev" @click="goPrev">
          <Icon name="lucide:chevron-left" mode="svg" />
        </button>
        <button v-if="hasMultiple" type="button" class="lb-arrow is-next" :aria-label="LABELS.next" @click="goNext">
          <Icon name="lucide:chevron-right" mode="svg" />
        </button>
      </div>

      <!-- 说明文字轨道：拖动时与图片同位移、切图时与图片同动画，两者才读作一个整体 -->
      <div v-if="current?.caption" class="lb-caption-track" :class="[switchClass, { 'is-alt': switchAlt }]" :style="captionStyle">
        <div class="lb-caption">{{ current.caption }}</div>
      </div>

      <!-- 出场说明文字：与出场图共用一条动画，跟着一起滑出屏幕。
           用 fit-content + auto 外边距复刻 .lb-caption 的 align-self: center（居中不留 translate）。 -->
      <div
        v-if="outgoingCaption"
        class="lb-outgoing-caption"
        :class="[switchClass, { 'is-alt': switchAlt }]"
        :style="{ bottom: `${transition!.captionBottom}px` }"
        aria-hidden="true">
        {{ outgoingCaption }}
      </div>

      <div
        v-if="hasMultiple"
        v-show="thumbsVisible"
        ref="strip"
        class="lb-thumbs"
        :data-at-left="stripAtStart"
        :data-at-right="stripAtEnd">
        <button
          v-for="(item, i) in slides"
          :key="i"
          :ref="el => setThumbRef(el as Element | null, i)"
          type="button"
          class="lb-thumb"
          :class="{ 'is-selected': i === index }"
          :style="{ aspectRatio: thumbRatio(item) }"
          :tabindex="i === index ? 0 : -1"
          :aria-label="item.caption || item.alt"
          :aria-current="i === index"
          @click="goToIndex(i)">
          <!-- caption 即图片标题（data-caption 优先，缺失则回落到 alt）；都没写就让 alt 空着，不写「第 N 张」占位 -->
          <img :src="item.cleanSrc" :alt="item.caption" loading="lazy" >
        </button>
      </div>

      <div v-if="morph" class="lb-morph" :style="morphStyle">
        <div class="lb-morph-bg" :style="{ backgroundImage: `url('${morph.src}')` }" />
      </div>
    </div>
  </dialog>
</template>
