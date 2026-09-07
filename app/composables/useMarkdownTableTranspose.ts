/**
 * Markdown 表格窄屏转置 + 横向滚动羽化（防闸型重构）。
 *
 * 设计：
 * - 滚动容器是 wrapper(<div class="markdown-table-wrap">),<table> 保留原生 display:table。
 *   恒定包装:所有表都套 wrapper;窄表经 > table {max-content;min-width:100%} 铺满容器,
 *   宽表按内容自然撑开、由 wrapper overflow-x 横向滚动(转置仍仅窄屏,见 allowTranspose)。
 * - mount 走 rAF 节流;同一帧内多次 mount 不重复调度。
 * - 同断点内只同步 data-at-left/right,不重建 DOM。
 * - 跨断点(matchMedia change)才走 restoreAll + rebuild。
 * - data-table-handled 守卫 + 多重 mount 防 HMR 重复 mount 时 cleanup 再建。
 * - ResizeObserver 只听 wrapper.clientWidth 变化(不观察内部子节点);
 *   内容尺寸变化(图片懒加载等)只触发一次同步、不会重建。
 * - colspan/rowspan 在 markdown 表格里极少用,遇则降级:不转置、保留原表,
 *   走横向滚动 + 羽化兜底。
 *
 * cleanup:删除所有 wrapper,还原原 outerHTML。
 */

const NARROW_MQ = "(max-width: 767.98px)";

// localStorage 持久化"已展示过转置提示"标记——同一浏览器只弹一次,避免每篇文章重复打扰。
const HINT_STORAGE_KEY = "imqi1-table-transpose-hint-seen";

function hasSeenTransposeHint(): boolean {
  try {
    return localStorage.getItem(HINT_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function markTransposeHintSeen(): void {
  try {
    localStorage.setItem(HINT_STORAGE_KEY, "1");
  } catch {
    /* localStorage 不可用(隐私模式/被禁),下次还会弹,可接受 */
  }
}

/** 在被转置的表右上角挂一个"已旋转为纵向视图"气泡,3 秒后淡出。
 * 仅在浏览器未持久化"已看过"时显示。气泡定位在表第一个单元格的右上角,不影响表格布局。
 */
function attachTransposeHint(table: HTMLTableElement) {
  if (!import.meta.client) return;
  if (hasSeenTransposeHint()) return;

  const hint = document.createElement("span");
  hint.className = "markdown-table-transpose-hint";
  hint.setAttribute("aria-hidden", "true");
  hint.textContent = "↺ 已旋转为纵向视图";

  const firstCell = table.querySelector<HTMLElement>("th, td");
  if (firstCell) {
    firstCell.style.position = "relative";
    firstCell.appendChild(hint);
  } else {
    table.style.position = "relative";
    table.appendChild(hint);
  }

  markTransposeHintSeen();

  // 3 秒后淡出(300ms),再移除节点;若表格此时已 unmount,remove 不存在也不报错。
  setTimeout(() => {
    hint.classList.add("markdown-table-transpose-hint--leaving");
    setTimeout(() => {
      hint.remove();
    }, 300);
  }, 3000);
}

type Cell = { text: string };

type Entry = {
  wrap: HTMLElement; // 当前 DOM 中的 wrapper(若是原表未转置则 wrap === table)
  original: string; // 原 outerHTML,供还原
  cleanup: () => void;
};

// 模块级状态:防 HMR / 多重 mount 重复
let mounted = false;
let instanceId = 0;
let mql: MediaQueryList | null = null;
let onMqChange: (() => void) | null = null;
const entries: Entry[] = [];
let rafScheduled = false;
// 上一次记录下的断点状态(桌面/窄屏),用于 window resize 兜底:某些浏览器/环境
// (DevTools resize、嵌入式 WebView) resize 不触发 MediaQueryList change,
// 仅靠 matchMedia 跨断点会漏还原。这里手动比对 + 跨边界才触发,避免抖动。
let lastIsNarrow: boolean | null = null;
let resizeRafPending = false;
let onWindowResize: (() => void) | null = null;
// 构建令牌:每次 restoreAll/cleanup 递增。scheduleRebuild 捕获当前令牌,rAF 回调里
// 若令牌已变(期间发生过还原)说明这批处理已过期,直接丢弃 —— 否则过期的 rAF 会在
// 宽屏下重跑 rebuild,给还原后的原表重新包 wrapper / 转置,造成表态不一致或 wrapper 残留/消失。
let buildToken = 0;

function isNarrow(): boolean {
  return !!mql?.matches;
}

function readTable(table: HTMLTableElement): { rows: Cell[][]; hasComplexSpan: boolean } {
  const rows: Cell[][] = [];
  let hasComplexSpan = false;
  table.querySelectorAll("tr").forEach(tr => {
    const row: Cell[] = [];
    tr.querySelectorAll("th, td").forEach(cell => {
      const el = cell as HTMLElement;
      if (el.hasAttribute("colspan") || el.hasAttribute("rowspan")) hasComplexSpan = true;
      row.push({
        text: (el.textContent || "").trim(),
      });
    });
    if (row.length > 0) rows.push(row);
  });
  return { rows, hasComplexSpan };
}

function buildTransposed(rows: Cell[][]): HTMLTableElement {
  const headerRow = rows[0] ?? [];
  const dataRows = rows.slice(1);

  // markdown-it 的表体单元格一律是 <td>(isHeader 恒为 false),原"首格为 th 才当行名"的
  // 分支在 markdown 表格里永远走不到、且与兜底分支完全相同,故删去。设计上统一把原表
  // 第 0 列视作"行标签列",其文本用作转置后表头(rowNames)。
  const rowNames: string[] = dataRows.map((r, i) => r[0]?.text || `行 ${i + 1}`);

  const table = document.createElement("table");
  table.setAttribute("data-table-transposed", "true");
  table.setAttribute("role", "presentation");
  table.setAttribute("aria-label", "已旋转为纵向视图");

  const thead = document.createElement("thead");
  const headTr = document.createElement("tr");
  const cornerTh = document.createElement("th");
  // 角顶沿用原表表头第 0 格(行标签列表头),无角顶(空白)则留空。
  cornerTh.textContent = headerRow[0]?.text || "";
  headTr.appendChild(cornerTh);
  rowNames.forEach(name => {
    const th = document.createElement("th");
    th.textContent = name;
    headTr.appendChild(th);
  });
  thead.appendChild(headTr);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  // 原表第 0 列已用作转置后表头(rowNames),表体须从第 1 列开始;
  // 否则行标签列会被同时写进 thead 与首个 tbody 行,重复。对无行标签列的纯数据表
  // (表头第 0 格为真实标签),其结果恰好等价于矩阵转置。
  for (let i = 1; i < headerRow.length; i++) {
    const tr = document.createElement("tr");
    const headTh = document.createElement("th");
    headTh.textContent = headerRow[i]?.text || "";
    tr.appendChild(headTh);
    for (let j = 0; j < dataRows.length; j++) {
      const src = dataRows[j]?.[i];
      const td = document.createElement("td");
      td.textContent = src?.text || "";
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

/** wrapper 上同步 data-at-left/right + data-table-scrollable。 */
function syncScrollAttrs(wrap: HTMLElement) {
  const inner = wrap.firstElementChild as HTMLElement | null;
  if (!inner) {
    wrap.removeAttribute("data-table-scrollable");
    wrap.removeAttribute("data-at-left");
    wrap.removeAttribute("data-at-right");
    return;
  }
  // 溢出与否以**滚动容器 wrapper 自身**为准(wrap.scrollWidth > wrap.clientWidth)。
  // 不能测内层 table:转置后单元格有 min-width:8rem,表格填满自身盒(scrollWidth≈clientWidth),
  // 永远判不出"溢出";转置表/宽表的真正横向溢出发生在 wrapper 的 overflow-x:auto 上。
  const overflow = wrap.scrollWidth > wrap.clientWidth + 1;
  if (!overflow) {
    wrap.removeAttribute("data-table-scrollable");
    wrap.removeAttribute("data-at-left");
    wrap.removeAttribute("data-at-right");
    return;
  }
  wrap.setAttribute("data-table-scrollable", "true");
  const atLeft = wrap.scrollLeft <= 1;
  const atRight = wrap.scrollLeft + wrap.clientWidth >= wrap.scrollWidth - 1;
  wrap.setAttribute("data-at-left", String(atLeft));
  wrap.setAttribute("data-at-right", String(atRight));
}

function attachWrapHandlers(wrap: HTMLElement): () => void {
  let rafPending = false;
  const schedule = () => {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      syncScrollAttrs(wrap);
    });
  };

  wrap.addEventListener("scroll", schedule, { passive: true });

  // 只听 wrapper 宽度变化,不观察内部子节点;内容渲染(图片懒加载等)不触发重建。
  let ro: ResizeObserver | null = null;
  if (typeof ResizeObserver !== "undefined") {
    ro = new ResizeObserver(schedule);
    ro.observe(wrap);
  }

  return () => {
    wrap.removeEventListener("scroll", schedule);
    ro?.disconnect();
  };
}

/** 判断表格"真实内容宽"是否超出父容器。
 * 表格自身有 width:100%(桌面)/ width:max-content(窄屏),不能直接用 scrollWidth/clientWidth。
 * 这里用 clone 强制按内容撑开,并通过 document.body 应用与正文一致的 padding/font-size,
 * (用临时 style 注入 td padding 复刻 .markdown-body :deep(table th/td { padding: 0.5em 1em }))
 * 确保列宽与原表一致。完成后清理 clone。
 */
function isTableWiderThanParent(table: HTMLTableElement, parent: HTMLElement): boolean {
  const clone = table.cloneNode(true) as HTMLTableElement;
  clone.removeAttribute("class");
  clone.removeAttribute("style");
  clone.style.position = "absolute";
  clone.style.visibility = "hidden";
  clone.style.left = "-99999px";
  clone.style.top = "0";
  clone.style.width = "auto";
  clone.style.maxWidth = "none";
  clone.style.minWidth = "0";
  // 复刻 markdown-body 内 td/th 的 padding(0.5em 1em),让列宽与正文一致。
  clone.querySelectorAll("th, td").forEach(cell => {
    (cell as HTMLElement).style.padding = "0.5em 1em";
  });
  document.body.appendChild(clone);
  const natural = clone.scrollWidth;
  clone.remove();
  return natural > parent.clientWidth + 1;
}

/** 创建 wrapper(空壳,不挂 inner)。挂 inner 由调用方在正确 parent 里完成。 */
function makeWrap(currentInstanceId: number): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "markdown-table-wrap";
  wrap.dataset.handled = "true";
  wrap.dataset.instance = String(currentInstanceId);
  return wrap;
}

/** 处理一张原表:决定转置 + 用 wrapper 包起来(或裸放)。
 * @param allowTranspose 是否允许宽表转置为纵向。仅窄屏为 true;桌面端纯包装(overflow 兜底),
 *   不做转置,避免横向滚动被换成纵向换行。 */
function processTable(table: HTMLTableElement, currentInstanceId: number, allowTranspose: boolean) {
  // 已 handled(同断点内重复进入 rebuild)→ 跳过
  if (table.closest(".markdown-table-wrap")) return;
  if (table.dataset.handled) return;

  const original = table.outerHTML;
  const { rows, hasComplexSpan } = readTable(table);

  // 仅当原表实际超出父容器才转置:避免对窄表做无谓的"宽→高"重排。
  // 注意表格的 scrollWidth/clientWidth 受自身 width 影响,不能直接判断"是否超宽父容器",
  // 真实判断 = 表格的"内容宽" > 父容器宽。这里通过 cloneNode 临时脱离父容器测真实内容宽。
  const parent = table.parentElement;
  if (!parent) return;
  // isOverflowing 只用于决定"是否转置";桌面端(allowTranspose=false)只做包装,不必克隆测量真实内容宽。
  const isOverflowing = allowTranspose && isTableWiderThanParent(table, parent);

  const colCount = rows[0]?.length ?? 0;
  const rowCount = rows.length;
  // 转置触发条件(任一):
  //   1) 原表内容超宽(列向) — 标准响应式换向;
  //   2) 行数过多(≥ ROW_HEAVY_THRESHOLD),即使列向不超宽也转置,
  //      把"纵向滚动 → 横向滚动"的体验翻过来,让 30 行 × 4 列这种表不会占满屏高。
  // 限制:必须有 ≥ 2 行 ≥ 2 列(否则转置没意义);不能含 colspan/rowspan(降级为横滑);
  //       且仅 allowTranspose(窄屏)才转置,桌面端只做 overflow 包装、不转置。
  const ROW_HEAVY_THRESHOLD = 10;
  const isRowHeavy = rowCount >= ROW_HEAVY_THRESHOLD;
  const canTranspose =
    allowTranspose && !hasComplexSpan && rowCount >= 2 && colCount >= 2 && (isOverflowing || isRowHeavy);

  let current: HTMLElement = table;
  if (canTranspose) {
    const transposed = buildTransposed(rows);
    // 首屏闪变过渡:transposed 先 opacity:0,挂进 DOM 后下一帧切 1,触发 CSS fade-in;
    // transitionend 后清标记,避免后续 mount/cleanup 误判。
    transposed.classList.add("markdown-table-just-transposed");
    table.replaceWith(transposed);
    requestAnimationFrame(() => {
      transposed.classList.remove("markdown-table-just-transposed");
      transposed.addEventListener(
        "transitionend",
        () => transposed.classList.remove("markdown-table-just-transposed"),
        { once: true },
      );
    });
    current = transposed;
    // 首次转置提示气泡:仅在该表从未转置过且本次确实是首次时显示一次。
    attachTransposeHint(transposed);
  }

  // 恒定包装:所有表都套 .markdown-table-wrap,不再按 scrollWidth 决定是否保留。
  // 嵌套后 CSS(.markdown-table-wrap > table)的 width:max-content + min-width:100%
  // 让窄表铺满容器、宽表按内容自然撑开,由外层 overflow-x:auto 处理横向滚动。
  // 顺序很关键:必须先 insertBefore(wrap, current.nextSibling)把 wrap 挂到 current 的原 parent,
  // 再 wrap.appendChild(current)。如果先 appendChild,current 会被搬走、parentElement 变成 wrap 自己,
  // 后续 insertBefore(wrap, ...) 就变成 "把 wrap 插到 wrap 里",抛 HierarchyRequestError。
  const probe = makeWrap(currentInstanceId);
  parent.insertBefore(probe, current.nextSibling);
  probe.appendChild(current);
  syncScrollAttrs(probe);
  entries.push({
    wrap: probe,
    original,
    cleanup: attachWrapHandlers(probe),
  });
}

/** 扫描 root 内的原表(未被 wrap / 未 handled),逐张 process。 */
function rebuild(root: ParentNode, currentInstanceId: number) {
  // 跨断点都处理:转置与否由 processTable 的 allowTranspose(窄屏)决定,桌面端也要做包装兜底。
  const allowTranspose = isNarrow();

  root.querySelectorAll<HTMLTableElement>(".markdown-body table").forEach(table => {
    processTable(table, currentInstanceId, allowTranspose);
  });
  // 同一断点内再次进入 rebuild:已 handled 的 wrapper 跳过 processTable;
  // 但仍然需要 syncScrollAttrs 一次(可能 wrapper 宽度变化了)。
  entries.forEach(e => {
    if (e.wrap.classList.contains("markdown-table-wrap")) {
      syncScrollAttrs(e.wrap);
    }
  });
}

function scheduleRebuild(root: ParentNode, currentInstanceId: number) {
  if (rafScheduled) return;
  rafScheduled = true;
  const token = buildToken;
  requestAnimationFrame(() => {
    rafScheduled = false;
    // 令牌已变(期间 restoreAll/cleanup)→ 这批处理过期,丢弃,避免还原后的批重跑。
    if (token !== buildToken) return;
    rebuild(root, currentInstanceId);
  });
}

function restoreOne(entry: Entry) {
  const { wrap, original } = entry;
  if (!wrap.isConnected) {
    entry.cleanup();
    return;
  }
  // 1) 优先处理"被转置"的情况:不论是否被 wrap 包,只要当前节点含 data-table-transposed
  //    就必须用原 outerHTML 重建,否则窄屏转置后的表会在切回宽屏时残留为转置态。
  if (wrap.hasAttribute("data-table-transposed")) {
    const template = document.createElement("template");
    template.innerHTML = original;
    const restored = template.content.firstElementChild as HTMLTableElement | null;
    if (restored) wrap.replaceWith(restored);
    else wrap.remove();
    entry.cleanup();
    return;
  }

  // 2) wrap 是 <div class="markdown-table-wrap">:删 wrapper。
  //    若内部是转置表,必须用 original 还原(不能只把转置表搬出来,否则切宽屏残留转置态);
  //    若内部仍是原表(从未转置、只因超宽被 wrap),直接搬出即可。
  if (wrap.classList.contains("markdown-table-wrap")) {
    const inner = wrap.firstElementChild as HTMLElement | null;
    if (inner && inner.hasAttribute("data-table-transposed")) {
      const template = document.createElement("template");
      template.innerHTML = original;
      const restored = template.content.firstElementChild as HTMLTableElement | null;
      if (restored) wrap.replaceWith(restored);
      else wrap.remove();
    } else if (inner) {
      wrap.replaceWith(inner);
    } else {
      wrap.remove();
    }
    entry.cleanup();
    return;
  }

  // 3) wrap 本身是原表(未被 wrap 也未被转置):仅清标记即可。
  wrap.removeAttribute("data-handled");
  wrap.removeAttribute("data-instance");
  entry.cleanup();
}

function restoreAll() {
  buildToken++; // 使所有已调度的 rAF(含过期)失效
  for (const entry of entries.splice(0)) {
    restoreOne(entry);
  }
}

function cleanup() {
  if (!mounted) return;
  mounted = false;
  if (mql && onMqChange) mql.removeEventListener("change", onMqChange);
  mql = null;
  onMqChange = null;
  if (onWindowResize) window.removeEventListener("resize", onWindowResize);
  onWindowResize = null;
  lastIsNarrow = null;
  resizeRafPending = false;
  rafScheduled = false;
  restoreAll();
}

export const useMarkdownTableTranspose = () => {
  function mount(root: ParentNode = document) {
    if (!import.meta.client) return;
    if (mounted) cleanup(); // HMR / 二次 mount:先清再装

    mounted = true;
    instanceId++;
    const myId = instanceId;

    mql = window.matchMedia(NARROW_MQ);
    onMqChange = () => {
      applyBreakpoint(root, myId);
    };
    mql.addEventListener("change", onMqChange);

    // 兜底:某些环境(DevTools resize、嵌入式 WebView) resize 不触发 MediaQueryList.change,
    // 这里用 window.resize + rAF 合流,只在跨过 768 边界时才 rebuild,避免抖动。
    onWindowResize = () => {
      if (resizeRafPending) return;
      resizeRafPending = true;
      requestAnimationFrame(() => {
        resizeRafPending = false;
        applyBreakpoint(root, myId);
      });
    };
    lastIsNarrow = isNarrow();
    window.addEventListener("resize", onWindowResize, { passive: true });

    // 跨断点都做首次重建:桌面端也要给宽表套 wrapper(横向滚动兜底),转置由 processTable 按窄屏决定。
    scheduleRebuild(root, myId);
  }

  return { mount, cleanup };
}

/** 断点变化(change / resize 兜底都走这):先还原,再按当前断点重建。
 * 幂等:多次快速进入会每次都 restoreAll(此时元表都被清空),幂等无害。
 * 校验 lastIsNarrow 仅用于 resize 兜底(matchMedia change 本身只会在跨断点时触发)。
 */
function applyBreakpoint(root: ParentNode, currentInstanceId: number) {
  const current = isNarrow();
  // resize 兜底:未跨断点就不动(DOM 已由上次处理过),避免抖动。
  // 但 matchMedia change 时 lastIsNarrow 可能滞后一帧;这里让"断点变化"一律走 restore。
  if (lastIsNarrow !== null && current === lastIsNarrow) return;
  lastIsNarrow = current;
  restoreAll();
  // 还原后按当前断点重建:窄屏转置、桌面包装,均需重跑。
  scheduleRebuild(root, currentInstanceId);
};