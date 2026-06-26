<script setup lang="ts">
import { loadAmap } from "~/utils/amap-loader";

interface TravelPost {
  url: string;
  title: string;
  coverCount: number;
  manyCovers: boolean;
}

interface Reader {
  name: string;
  url: string | null;
  articleTitle: string | null;
  articleUrl: string | null;
  comment: string | null;
  avatar: string | null;
}

interface Place {
  id: number;
  name: string;
  desc: string | null;
  cover: string | null;
  longitude: number;
  latitude: number;
  posts: TravelPost[];
  // 访客分布视图：该城市内的每位访客（昵称 / 网址 / 评论文章）。我的足迹视图留空。
  readers?: Reader[];
  // 博客网络视图：站点头像（标记用）+ 来源（订阅/友链）+ 跳转信息。其它视图留空。
  avatar?: string | null;
  source?: "subscribe" | "link";
  sourceId?: number | string;
  targetUrl?: string | null;
  serverLocation?: string | null;
  serverIsp?: string | null;
}

const props = defineProps<{
  places: Place[];
  focusId?: string | number | null;
  // 最小缩放下限（防缩到全球视图，中国缩成一个小点）。不传则用 MIN_ZOOM_DEFAULT。
  minZoom?: number;
  // 最大缩放上限（访客分布用）：滚轮/点击放大都不会超过此值，createCluster 的聚合上限也与之对齐。
  // 不传则不限制（沿用高德默认）。
  maxZoom?: number;
}>();

const config = useRuntimeConfig();
const amapEnabled = Boolean(config.public.amapEnabled);
const amapUseProxy = Boolean(config.public.amapUseProxy);
const amapKey = String(config.public.amapKey || "");
const amapSecurityCode = String(config.public.amapSecurityCode || "");
const router = useRouter();

// 跟随站点深浅模式
const colorMode = useColorMode();
const isDark = computed(() => colorMode.value === "dark");

const loadError = ref(false);
const loading = ref(true);
let map: any = null;
let cluster: any = null;
let infoWindow: any = null;
// 缓存 AMap 命名空间，供 buildPoints/createCluster 等可复用函数在 onMounted 之后引用
let AMapRef: any = null;
// 每个标记上次渲染的内容签名：缩放时内容未变就跳过 setContent，
// 避免重复重建 <img> 导致头像重新加载/闪烁/重新请求。
const lastMarkerContent = new WeakMap<object, string>();
// 高德聚合在缩放/聚散切换时可能换 marker 实例。头像类标记用稳定 DOM 复用，避免新 marker setContent(string)
// 重新解析 <img> 导致头像再次加载/闪烁。
const avatarMarkerElementCache = new Map<string, HTMLElement>();
// InfoWindow 内文章链接的委托点击监听（原生 HTML <a> 默认整页刷新，改走 Nuxt 路由）
let linkClickHandler: ((e: MouseEvent) => void) | null = null;

const MAP_FONT_FAMILY = '"Noto Serif SC", serif';
// 自定义 InfoWindow 的垂直偏移：高德的 offset 是相对坐标点的像素偏移。
// 访客分布的标记是圆点/圆圈，卡片应贴近点；我的足迹/博客头像是 pin/头像标记，保留更高的偏移。
const INFO_OFFSET_PIN_Y = -44;
const INFO_OFFSET_VISITOR_Y = -30;
const INFO_OFFSET_CLUSTER_Y = -30;

type LngLatTuple = [number, number];

type MapPoint = { lnglat: LngLatTuple; id: number; place: Place };

// 聚合点击时从 clusterData 规整出的点：lnglat 已规范化且非空（类型上保证非 null，
// 消除下方 center 经 || 链推断为可空时、center[0] 的"possibly null"告警）
type ClusterPoint = { id?: number; place?: Place; lnglat: LngLatTuple };

function normalizeLngLat(value: any): LngLatTuple | null {
  if (Array.isArray(value)) {
    const lng = Number(value[0]);
    const lat = Number(value[1]);
    return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
  }

  if (value && typeof value.getLng === "function" && typeof value.getLat === "function") {
    const lng = Number(value.getLng());
    const lat = Number(value.getLat());
    return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
  }

  if (value && typeof value === "object") {
    const lng = Number(value.lng ?? value.longitude);
    const lat = Number(value.lat ?? value.latitude);
    return Number.isFinite(lng) && Number.isFinite(lat) ? [lng, lat] : null;
  }

  return null;
}

function placeLngLat(place: Place): LngLatTuple | null {
  return normalizeLngLat([place.longitude, place.latitude]);
}

function averageLngLat(lnglats: LngLatTuple[]): LngLatTuple | null {
  if (!lnglats.length) return null;
  return normalizeLngLat([
    lnglats.reduce((sum, lnglat) => sum + lnglat[0], 0) / lnglats.length,
    lnglats.reduce((sum, lnglat) => sum + lnglat[1], 0) / lnglats.length,
  ]);
}

function collectClusterLngLats(clusterData: any[]): LngLatTuple[] {
  const lnglats: LngLatTuple[] = [];

  const pushPoint = (point: any) => {
    const lnglat = normalizeLngLat(point?.lnglat ?? point);
    if (lnglat) lnglats.push(lnglat);
  };

  clusterData.forEach(item => {
    const originData = item?._amapMarker?.originData;
    if (Array.isArray(originData) && originData.length) {
      originData.flat().forEach(pushPoint);
    } else {
      pushPoint(item);
    }
  });

  return lnglats;
}

// 从聚合数据里规整出原始 cluster point（id / lnglat），用于按 id 反查完整 place 求读者数之和。
// 高德克隆 clusterData 时会裁剪自定义嵌套字段，但 id 与 lnglat 一般保留；originData 嵌套时展开。
function collectClusterPoints(clusterData: any[]): { id?: number; lnglat: LngLatTuple | null }[] {
  const out: { id?: number; lnglat: LngLatTuple | null }[] = [];

  const pushPoint = (point: any) => {
    const id = Number(point?.id);
    out.push({
      ...(Number.isFinite(id) ? { id } : {}),
      lnglat: normalizeLngLat(point?.lnglat ?? point),
    });
  };

  clusterData.forEach(item => {
    const originData = item?._amapMarker?.originData;
    if (Array.isArray(originData) && originData.length) {
      originData.flat().forEach(pushPoint);
    } else {
      pushPoint(item);
    }
  });

  return out;
}

function escapeHtml(s: string) {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function safeExternalHref(raw: string | null | undefined) {
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function serverMetaText(place: Place) {
  const location = (place.serverLocation || "").trim();
  const isp = (place.serverIsp || "").trim();
  if (!location && !isp) return "";

  if (isp.endsWith("CDN")) {
    const carrier = isp.replace(/CDN$/, "");
    return `CDN · ${location}${carrier}`;
  }

  return `${location} · ${isp}`;
}

// 聚合圆圈尺寸：点数越多越大
function clusterSize(count: number) {
  return count < 10 ? 40 : count < 100 ? 48 : 56;
}
// 聚合圆圈 HTML：数字 + 随数量加深的蓝紫底色
function clusterHtml(count: number) {
  const size = clusterSize(count);
  const bg = count < 10 ? "rgba(37,99,235,.9)" : count < 100 ? "rgba(99,102,241,.92)" : "rgba(139,92,246,.94)";
  return `<div style="width:${size}px;height:${size}px;border-radius:9999px;display:flex;align-items:center;justify-content:center;background:${bg};color:#fff;font-size:15px;font-weight:700;box-shadow:0 4px 12px rgba(0,0,0,.3);border:2px solid rgba(255,255,255,.85);font-family:${MAP_FONT_FAMILY};">${count}</div>`;
}

// 访客分布单读者点：默认显示评论邮箱生成的头像；缺失/加载失败时降级为首字母圆盘。
const SINGLE_DOT_SIZE = 20;
const VISITOR_AVATAR_SIZE = 28;
function singleDotHtml() {
  return `<div style="width:${SINGLE_DOT_SIZE}px;height:${SINGLE_DOT_SIZE}px;border-radius:9999px;background:rgba(37,99,235,.9);box-shadow:0 2px 6px rgba(0,0,0,.3);border:2px solid rgba(255,255,255,.85);"></div>`;
}
function avatarCircleHtml(src: string | null | undefined, name: string, size: number) {
  const avatarSrc = src ? escapeHtml(src) : "";
  const initial = escapeHtml((name || "?").trim().charAt(0) || "?");
  const common = `width:${size}px;height:${size}px;border-radius:9999px;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);`;
  return avatarSrc
    ? `<img src="${avatarSrc}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" style="${common}display:block;object-fit:cover;background:#2563eb;" /><div style="${common}display:none;align-items:center;justify-content:center;background:#2563eb;color:#fff;font-weight:700;font-size:${Math.max(11, Math.round(size * 0.42))}px;">${initial}</div>`
    : `<div style="${common}display:flex;align-items:center;justify-content:center;background:#2563eb;color:#fff;font-weight:700;font-size:${Math.max(11, Math.round(size * 0.42))}px;">${initial}</div>`;
}
function readerMarkerHtml(reader: Reader | null | undefined) {
  return `<div style="position:relative;width:${VISITOR_AVATAR_SIZE}px;height:${VISITOR_AVATAR_SIZE}px;">${avatarCircleHtml(reader?.avatar, reader?.name || "?", VISITOR_AVATAR_SIZE)}</div>`;
}
function markerElement(key: string, html: string) {
  const cached = avatarMarkerElementCache.get(key);
  if (cached) return { key, element: cached };

  const box = document.createElement("div");
  box.innerHTML = html;
  const element = (box.firstElementChild || box) as HTMLElement;
  avatarMarkerElementCache.set(key, element);
  return { key, element };
}
function readerMarkerElement(placeId: number, reader: Reader | null | undefined) {
  const key = `reader:${placeId}:${reader?.avatar || ""}:${reader?.name || "?"}`;
  return markerElement(key, readerMarkerHtml(reader));
}

// 博客网络单站点：圆形头像 + 白边 + 底部小尖角（仿 pin）。头像缺失/加载失败降级为首字母圆盘。
const AVATAR_SIZE = 36;
function avatarMarkerHtml(place: Place) {
  return `<div style="position:relative;width:${AVATAR_SIZE}px;height:${AVATAR_SIZE}px;">
    ${avatarCircleHtml(place.avatar, place.name, AVATAR_SIZE)}
  </div>`;
}
function blogMarkerElement(place: Place) {
  const key = `blog:${place.id}:${place.avatar || ""}:${place.name || "?"}`;
  return markerElement(key, avatarMarkerHtml(place));
}

// 内联图标（InfoWindow 是原生 HTML，Icon 组件不编译）
const ARTICLE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" style="width:14px;height:14px;flex-shrink:0;"><path fill="currentColor" d="m21 6.757l-2 2V4h-9v5H5v11h14v-2.757l2-2v5.765a.993.993 0 0 1-.993.992H3.993A1 1 0 0 1 3 20.993V8l6.003-6h10.995C20.55 2 21 2.455 21 2.992zm.778 2.05l1.414 1.415L15.414 18l-1.416-.002l.002-1.412z"/></svg>';
const CLOSE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="1em" height="1em" style="width:14px;height:14px;display:block;"><path fill="currentColor" d="m12 10.586l4.95-4.95l1.414 1.414l-4.95 4.95l4.95 4.95l-1.414 1.414l-4.95-4.95l-4.95 4.95l-1.414-1.414l4.95-4.95l-4.95-4.95L7.05 5.636z"/></svg>';

// 博客网络单点卡片：头像 + 名称 + 来源（订阅/友链）+ 跳转。
// 订阅 → /subscribes?source=<id>（站内，linkClickHandler 走 SPA）；友链 → targetUrl（外链，linkClickHandler 新标签）。
function buildBlogCard(place: Place) {
  const isSub = place.source === "subscribe";
  const externalHref = safeExternalHref(place.targetUrl);
  const actionHref = isSub ? `/subscribes?source=${encodeURIComponent(String(place.sourceId ?? ""))}` : externalHref || "#";
  const label = isSub ? "来自订阅" : "来自友链";
  const actionText = isSub ? "查看 TA 的文章" : "访问站点";
  const avatarSrc = place.avatar ? escapeHtml(place.avatar) : "";
  const initial = escapeHtml((place.name || "?").trim().charAt(0) || "?");
  const avatar = avatarSrc
    ? `<img src="${avatarSrc}" alt="" style="width:44px;height:44px;border-radius:9999px;object-fit:cover;border:2px solid rgba(148,163,184,.45);flex-shrink:0;" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" /><div style="width:44px;height:44px;border-radius:9999px;display:none;align-items:center;justify-content:center;background:#2563eb;color:#fff;font-weight:700;font-size:18px;flex-shrink:0;">${initial}</div>`
    : `<div style="width:44px;height:44px;border-radius:9999px;display:flex;align-items:center;justify-content:center;background:#2563eb;color:#fff;font-weight:700;font-size:18px;flex-shrink:0;">${initial}</div>`;
  const meta = serverMetaText(place);
  const metaHtml = meta ? `<span class="travel-info-desc" style="font-size:11px;font-weight:400;margin-left:6px;">${escapeHtml(meta)}</span>` : "";
  return `<div class="travel-info" style="position:relative;min-width:240px;max-width:360px;border-radius:12px;overflow:visible;box-shadow:0 10px 30px rgba(0,0,0,.2)">
    <div style="padding:12px;padding-left:40px;display:flex;gap:10px;align-items:center;">
      ${avatar}
      <div style="min-width:0;flex:1;">
        <h3 class="travel-info-title" style="margin:0;font-size:14px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(place.name)}${metaHtml}</h3>
        <span class="travel-info-desc" style="font-size:12px;">${label}</span>
      </div>
    </div>
    <a href="${escapeHtml(actionHref)}" class="travel-info-link" style="display:block;padding:8px 12px;text-align:center;font-size:13px;font-weight:600;border-top:1px solid rgba(148,163,184,.2);text-decoration:none;">${actionText} →</a>
    <div onclick="window.__closeTravelInfo&amp;&amp;window.__closeTravelInfo()" class="travel-info-close" style="position:absolute;top:8px;left:8px;width:24px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:9999px;cursor:pointer;">${CLOSE_ICON}</div>
    <div class="travel-info-tip" style="position:absolute;left:50%;bottom:-4px;width:8px;height:8px;transform:translateX(-50%) rotate(45deg);"></div>
  </div>`;
}

// 博客网络聚合簇内的单个站点条目：头像 + 名称（可点）。订阅 → /subscribes?source=<id>（站内 SPA）；
// 友链 → targetUrl（外链，linkClickHandler 新标签）。头像缺失/加载失败降级为首字母圆盘。
function blogEntryHtml(p: Place) {
  const isSub = p.source === "subscribe";
  const externalHref = safeExternalHref(p.targetUrl);
  const href = isSub ? `/subscribes?source=${encodeURIComponent(String(p.sourceId ?? ""))}` : externalHref || "#";
  const initial = escapeHtml((p.name || "?").trim().charAt(0) || "?");
  const avatarSrc = p.avatar ? escapeHtml(p.avatar) : "";
  const sz = 18;
  const common = `width:${sz}px;height:${sz}px;border-radius:9999px;flex-shrink:0;`;
  const avatar = avatarSrc
    ? `<img src="${avatarSrc}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" style="${common}object-fit:cover;" /><span style="${common}display:none;align-items:center;justify-content:center;background:#2563eb;color:#fff;font-weight:700;font-size:11px;">${initial}</span>`
    : `<span style="${common}display:flex;align-items:center;justify-content:center;background:#2563eb;color:#fff;font-weight:700;font-size:11px;">${initial}</span>`;
  const meta = serverMetaText(p);
  const metaHtml = meta ? `<span class="travel-info-desc" style="font-size:11px;font-weight:400;margin-left:4px;">${escapeHtml(meta)}</span>` : "";
  return `<a href="${escapeHtml(href)}" class="travel-info-link" style="display:flex;align-items:center;gap:3px;font-size:13px;text-decoration:none;font-weight:500;padding:4px 0;">${avatar}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(p.name)}${metaHtml}</span></a>`;
}

// 博客网络聚合簇卡片：圈内多个站点按「订阅 / 友链」分组展示。混合时两组各带小标题分列；
// 纯订阅/纯友链时单组、不再重复加组标题，副标题用「均为…」点明性质（友链=外链新标签、订阅=站内 SPA）。
function buildMergedBlogCard(places: Place[]) {
  const subs = places.filter(p => p.source === "subscribe");
  const links = places.filter(p => p.source === "link");
  const mixed = subs.length > 0 && links.length > 0;
  const subtitle = mixed ? `订阅 ${subs.length} · 友链 ${links.length}` : links.length > 0 ? "均为友情链接" : "均为订阅";
  // 仅混合时给每组加小标题；纯一组时副标题已点明，不再重复标题。
  const sectionHtml = (label: string, arr: Place[]) =>
    arr.length
      ? `<div style="margin-top:8px;">${mixed ? `<div class="travel-info-desc" style="font-size:11px;font-weight:600;margin-bottom:2px;">${label}</div>` : ""}${arr.map(blogEntryHtml).join("")}</div>`
      : "";
  return `<div class="travel-info" style="position:relative;min-width:240px;max-width:300px;border-radius:12px;overflow:visible;box-shadow:0 10px 30px rgba(0,0,0,.2)">
    <div style="padding:12px;padding-left:40px">
      <h3 class="travel-info-title" style="margin:0;font-size:14px;font-weight:700;">${places.length} 个站点</h3>
      <span class="travel-info-desc" style="font-size:12px;">${subtitle}</span>
      ${sectionHtml("订阅站点", subs)}${sectionHtml("友情链接", links)}
    </div>
    <div onclick="window.__closeTravelInfo&amp;&amp;window.__closeTravelInfo()" class="travel-info-close" style="position:absolute;top:8px;left:8px;width:24px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:9999px;cursor:pointer;">${CLOSE_ICON}</div>
    <div class="travel-info-tip" style="position:absolute;left:50%;bottom:-4px;width:8px;height:8px;transform:translateX(-50%) rotate(45deg);"></div>
  </div>`;
}

function buildInfoContent(place: Place) {
  // 博客网络卡片（place.source 存在）：走独立的紧凑卡片，跳过下方 travels/footprint 结构
  if (place.source) return buildBlogCard(place);
  // 顶部封面图用地点自身封面；多对多下不再有"单篇文章多封面"角标
  const coverHtml = place.cover
    ? `<div style="border-radius:12px 12px 0 0;overflow:hidden;"><img src="${escapeHtml(place.cover)}" alt="" style="width:100%;height:120px;object-fit:cover;display:block;" /></div>`
    : "";
  const descHtml = place.desc
    ? `<p class="travel-info-desc" style="margin:4px 0 0;font-size:13px;line-height:1.45;">${escapeHtml(place.desc)}</p>`
    : "";
  // 关联文章列表（多对多）：每条一个带图标的链接（place.posts 缺失时容错为空），最多显示5篇
  const posts = Array.isArray(place?.posts) ? place.posts : [];
  const MAX_POSTS = 5;
  const shownPosts = posts.slice(0, MAX_POSTS);
  const restPosts = posts.length - shownPosts.length;
  const postsHtml = shownPosts.length
    ? `<div style="margin-top:8px;display:flex;flex-direction:column;gap:6px;">${shownPosts
        .map(
          p =>
            `<a href="${escapeHtml(p.url)}" class="travel-info-link" style="display:flex;align-items:center;gap:6px;font-size:13px;text-decoration:none;font-weight:500;">${ARTICLE_ICON}<span>${escapeHtml(p.title)}</span></a>`,
        )
        .join("")}${
        restPosts > 0 ? `<div class="travel-info-desc" style="font-size:12px;padding-top:2px;">共 ${posts.length} 篇文章</div>` : ""
      }</div>`
    : "";

  // 读者列表（访客分布视图）：前 N 位 + 「等 X 位」。每位一行——昵称（有网址则可点）
  // + 该读者留下评论的文章链接。气泡内站内链接由 linkClickHandler 拦截走 SPA 导航；外链照常打开。
  const readers = Array.isArray(place?.readers) ? place.readers : [];
  const MAX_READERS = 5;
  const shownReaders = readers.slice(0, MAX_READERS);
  const restReaders = readers.length - shownReaders.length;
  const readersHtml = shownReaders.length
    ? `<div style="margin-top:8px;display:flex;flex-direction:column;gap:5px;">${shownReaders
        .map(r => {
          const readerUrl = safeExternalHref(r.url);
          const nameHtml = readerUrl
            ? `<a href="${escapeHtml(readerUrl)}" class="travel-info-link" target="_blank" rel="noopener noreferrer" style="font-size:13px;font-weight:600;text-decoration:none;flex:none">${escapeHtml(r.name)}</a>`
            : `<span class="travel-info-title" style="font-size:13px;font-weight:600;">${escapeHtml(r.name)}</span>`;
          const readerAvatar = avatarCircleHtml(r.avatar, r.name, 22);
          const articleHtml = r.articleUrl
            ? `<a href="${escapeHtml(r.articleUrl)}" class="travel-info-link" style="display:inline-flex;align-items:center;gap:3px;min-width:0;max-width:260px;font-size:12px;text-decoration:none;opacity:.85;">${ARTICLE_ICON}<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(r.articleTitle || "")}</span></a>`
            : "";
          // 该读者最后一条评论正文（服务端已截断到 80 字），气泡内再限 2 行防溢出
          const commentHtml = r.comment
            ? `<div class="travel-info-desc" style="font-size:12px;line-height:1.4;margin-top:2px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${escapeHtml(r.comment)}</div>`
            : "";
          return `<div style="display:flex;gap:7px;align-items:flex-start;"><div style="flex:none;">${readerAvatar}</div><div style="min-width:0;display:flex;flex-direction:column;gap:1px;"><div style="display:flex;align-items:center;gap:6px;min-width:0;">${nameHtml}${
            articleHtml ? `<span class="travel-info-desc" style="font-size:12px;">·</span>${articleHtml}` : ""
          }</div>${commentHtml}</div></div>`;
        })
        .join("")}${
        restReaders > 0 ? `<div class="travel-info-desc" style="font-size:12px;padding-top:2px;">共 ${readers.length} 位访客</div>` : ""
      }</div>`
    : "";
  const closeOnCover = Boolean(place.cover);
  const bodyPadding = closeOnCover ? "10px 12px" : "10px 12px 10px 38px";

  return `<div class="travel-info" style="position:relative;min-width:260px;max-width:360px;border-radius:12px;overflow:visible;box-shadow:0 10px 30px rgba(0,0,0,.2)">
    ${coverHtml}
    <div style="padding:${bodyPadding};">
      <h3 class="travel-info-title" style="margin:0;font-size:14px;font-weight:700;">${escapeHtml(place.name)}</h3>
      ${descHtml}${postsHtml}${readersHtml}
    </div>
    <!-- 关闭按钮（左上角）：深色半透圆盘 + 白字，封面图与卡片底色上都醒目 -->
    <div onclick="window.__closeTravelInfo&amp;&amp;window.__closeTravelInfo()" class="travel-info-close" style="position:absolute;top:8px;left:8px;width:24px;height:24px;display:flex;align-items:center;justify-content:center;border-radius:9999px;cursor:pointer;">${CLOSE_ICON}</div>
    <!-- 底部尖角，指向坐标 -->
    <div class="travel-info-tip" style="position:absolute;left:50%;bottom:-4px;width:8px;height:8px;transform:translateX(-50%) rotate(45deg);"></div>
  </div>`;
}

function openInfo(content: string, lnglat: LngLatTuple, offsetY = INFO_OFFSET_PIN_Y) {
  if (!map || !AMapRef) return;
  // AMap 2.0 的 InfoWindow#setOptions 对 offset 的解析不稳定，会把 Pixel 解析成
  // Pixel(undefined, undefined)；构造函数传 offset 是稳定的。不同类型点位需要不同距离时，
  // 直接重建 InfoWindow，避免点击时报 Invalid Object: Pixel(undefined, undefined)。
  try {
    infoWindow?.close();
  } catch {
    /* noop */
  }
  infoWindow = new AMapRef.InfoWindow({
    isCustom: true,
    offset: new AMapRef.Pixel(0, offsetY),
    closeWhenClickMap: true,
    autoMove: true,
  });
  infoWindow.setContent(content);
  infoWindow.open(map, lnglat);
}

function focusPlace(place: Place) {
  const lnglat = placeLngLat(place);
  if (!map || !lnglat) return;
  // 首屏带 ?place 时直接原子定位，避免 setCenter/setZoom 分两步产生残留动画，
  // 后续切到其它 tab 重置全国视野时被旧动画抢回深缩放。
  map.setZoomAndCenter(13, lnglat, true);
  openInfo(buildInfoContent(place), lnglat, INFO_OFFSET_VISITOR_Y);
}

// 从 places 过滤出有效坐标点（供聚合与边界自适应复用）
function buildPoints(places: Place[]): MapPoint[] {
  return places
    .map(place => {
      const lnglat = placeLngLat(place);
      return lnglat ? { lnglat, id: place.id, place } : null;
    })
    .filter((p): p is MapPoint => Boolean(p));
}

// 固定显示中国范围（不含南海诸岛）：两视图初始与切换都用此固定视野，不随数据点漂移。
// 不用 setBounds（与 MarkerCluster 同屏会抛 LngLat(NaN,NaN)），用 setZoomAndCenter 直接定位。
// 中心刻意偏北：页面 -mt-20 让顶栏压住地图顶部，视口纵向中心下移、底部离地图中心更远；
// 若中心取 36°，视口底部会到 ~17°N、压到西沙群岛。中心抬到 37.5° 把底部顶到 ~18°N 以上，
// 既保留海南，又把整个南海诸岛挡在画面之外。
const CHINA_CENTER: LngLatTuple = [104, 37.5];
// 宽屏基准缩放：5 是宽屏下能容纳大陆全宽的级别。窄窗口见下方 fitZoomForWidth 按宽度降档。
const CHINA_ZOOM = 5;
// 最小缩放下限默认值：4 比中国全景(5)略宽一档，留出一点周边国家做地理参照，
// 但不至于缩成世界地图（中国缩成小点）。两个视图共用，故放常量；如需按视图调可传 minZoom prop。
const MIN_ZOOM_DEFAULT = 4;
// 中国经度全宽（73°E~135°E ≈ 62°）。Web Mercator 下每经度像素 = 256·2^z/360，故把 62° 塞进
// 容器宽度 w（留 ~8% 左右边距）所需 2^z = w·0.92·360/(62·256)。固定 zoom 5 在窄窗口（手机/分屏）
// 会把大陆两侧裁掉；按容器实际宽度算初始缩放，保证任意窗口尺寸下中国全貌都在画面里。
const CHINA_LNG_SPAN = 62;
function fitZoomForWidth(width: number): number {
  const inner = Math.max(0, width * 0.92);
  if (inner <= 0) return CHINA_ZOOM; // 读不到宽度时回退宽屏基准
  const z = Math.log2((inner * 360) / (CHINA_LNG_SPAN * 256));
  // 钳到 [最小下限, 宽屏基准]：大屏不超过 5（不改变现有观感），小屏降到下限 4 直到能装下大陆。
  return Math.min(CHINA_ZOOM, Math.max(MIN_ZOOM_DEFAULT, Math.round(z)));
}
function fitChinaView() {
  if (!map) return;
  map.stopMove?.();
  const width = document.getElementById("travel-map")?.clientWidth || window.innerWidth || 0;
  map.setZoomAndCenter(fitZoomForWidth(width), CHINA_CENTER, true);
}

/**
 * 设置标记内容与偏移：仅当内容字符串变化时才 setContent（重建 <img> 的代价很高，
 * 会触发头像重新加载/重新请求），offset 每次都设置（廉价且幂等）。
 * 这样地图缩放重渲染时，内容未变的标记不再重建 DOM，头像不再反复加载。
 */
function applyMarker(marker: any, html: string, offset: any) {
  if (lastMarkerContent.get(marker) !== html) {
    marker.setContent(html);
    lastMarkerContent.set(marker, html);
  }
  marker.setOffset(offset);
}
function applyMarkerElement(marker: any, key: string, element: HTMLElement, offset: any) {
  if (lastMarkerContent.get(marker) !== key) {
    marker.setContent(element);
    lastMarkerContent.set(marker, key);
  }
  marker.setOffset(offset);
}

// 创建点聚合（含渲染与点击逻辑），返回 cluster 实例。places 变化时销毁旧 cluster 重建即可，不重载地图。
function createCluster(points: MapPoint[]) {
  // lnglat 键 → 该点读者数。访客分布视图聚合圈的数字要显示「读者数之和」而非「城市点数」；
  // 但 clusterData 自定义/嵌套字段会被高德克隆裁剪（place.readers 可能丢失），故在闭包里按
  // 坐标键建查表，渲染时据 clusterData 取出的 lnglat 反查求和，不依赖高德保留嵌套数据。
  const readerCountByLng = new Map<string, number>();
  const readerCountById = new Map<number, number>();
  let hasReaders = false;
  for (const p of points) {
    const rc = p.place?.readers?.length;
    if (rc) {
      hasReaders = true;
      readerCountByLng.set(`${p.lnglat[0]},${p.lnglat[1]}`, rc);
      readerCountById.set(p.id, rc);
    }
  }

  // 按 cluster point 求读者数：优先 id 反查（规避高德对 place.readers 的克隆裁剪），
  // 坐标表作兜底，最后回落 1，避免误报 0。这样聚合簇与单点都显示「圈内读者人数」。
  const readerCountOf = (cp: { id?: number; lnglat: LngLatTuple | null }): number => {
    if (cp.id != null && readerCountById.has(cp.id)) return readerCountById.get(cp.id) ?? 0;
    if (cp.lnglat) {
      const byLng = readerCountByLng.get(`${cp.lnglat[0]},${cp.lnglat[1]}`);
      if (byLng) return byLng;
    }
    return 1;
  };

  // 聚合最大缩放必须与地图实际最大缩放对齐（props.maxZoom ?? 20，见 onMounted 的 zooms 与下方
  // minZoom/maxZoom watch）。此前写死 18，而地图上限是 20 → 19~20 级聚合被关闭，同坐标点
  // （同城质心 / 同国质心 / 同服务器多 blog）退化成像素重叠的单标记，点击只能命中顶层一个、
  // 合并清单丢失，正是「放大后聚合点变详细、点击失效」的根因。对齐后同坐标点全程聚合，点击稳定。
  const effectiveMax = props.maxZoom ?? 20;

  // clusterData 自定义/嵌套字段会被高德裁剪 → 按 id 从规范的 props.places 反查完整 place
  const findPlace = (d: any): Place | undefined => {
    const pid = d?.id ?? d?.place?.id;
    return (pid != null ? props.places.find(p => p.id === pid) : undefined) ?? d?.place ?? undefined;
  };

  const c = new AMapRef.MarkerCluster(map, points, {
    // gridSize：聚合网格像素阈值，越大越易聚成一坨。2000 会把全国点压成一个；
    // 用 AMap 默认 60，仅聚合屏幕上紧挨的点，分散点各自显示。
    gridSize: 60,
    maxZoom: effectiveMax,
    renderClusterMarker: (context: any) => {
      const lnglats = collectClusterLngLats(context.clusterData || []);
      // 访客分布：圈内读者人数之和；我的足迹：聚合的城市点数。
      const count = hasReaders
        ? collectClusterPoints(context.clusterData || []).reduce((sum, cp) => sum + readerCountOf(cp), 0)
        : lnglats.length || context.count || context.clusterData.length;
      const center = averageLngLat(lnglats);

      if (center) context.marker.setPosition(center);
      // 内容未变则跳过 setContent（避免重建 <img> / 头像重新加载），offset 每次设置（廉价幂等）
      applyMarker(context.marker, clusterHtml(count), new AMapRef.Pixel(-clusterSize(count) / 2, -clusterSize(count) / 2));
    },
    renderMarker: (context: any) => {
      // 博客网络：单点始终用头像圆标。即使 avatar 为空，也用站点名首个汉字/字符生成占位头像，
      // 与订阅页头像 fallback 同原则；不能退回默认 pin，否则无头像站点看起来像“丢了”。
      const place0 = findPlace(context.data?.[0]);
      if (!hasReaders && place0?.source) {
        const markerElement = blogMarkerElement(place0);
        applyMarkerElement(context.marker, markerElement.key, markerElement.element, new AMapRef.Pixel(-AVATAR_SIZE / 2, -AVATAR_SIZE / 2));
        return;
      }
      // 我的足迹：单点用蓝色圆点（与访客分布单读者同款）
      if (!hasReaders) {
        applyMarker(context.marker, singleDotHtml(), new AMapRef.Pixel(-SINGLE_DOT_SIZE / 2, -SINGLE_DOT_SIZE / 2));
        return;
      }
      // 访客分布单点：按 id 优先反查该城市读者数（规避高德对 place.readers 的克隆裁剪）
      const cp0 = collectClusterPoints(context.data || [])[0];
      const rc = cp0 ? readerCountOf(cp0) : 1;
      if (rc > 1) {
        // 多位访客：数字圆圈（数字 = 读者数，与聚合圈同款）——如沈阳 6 位访客显示「6」
        applyMarker(context.marker, clusterHtml(rc), new AMapRef.Pixel(-clusterSize(rc) / 2, -clusterSize(rc) / 2));
      } else {
        // 单读者：显示该访客头像（头像加载失败时降级首字母），让访客分布不再只是匿名圆点。
        // 这里复用同一个 DOM 元素，避免高德缩放重建 marker 实例时 setContent(string) 重新解析 <img>。
        const reader = place0?.readers?.[0] ?? null;
        const markerElement = readerMarkerElement(place0?.id ?? 0, reader);
        applyMarkerElement(context.marker, markerElement.key, markerElement.element, new AMapRef.Pixel(-VISITOR_AVATAR_SIZE / 2, -VISITOR_AVATAR_SIZE / 2));
      }
    },
  });

  // 点击：单点弹该城市气泡；多点若还能放大且跨度足够则放大展开，否则（已到上限 / 同坐标分不开）
  // 弹「合并气泡」列出圈内全部读者——避免同省质心重叠点死循环放大、点击无反应。
  c.on("click", (item: any) => {
    const data: ClusterPoint[] = (item.clusterData || [])
      .map((d: any): ClusterPoint | null => {
        const lnglat = normalizeLngLat(d?.lnglat);
        return lnglat ? { id: d?.id, place: d?.place, lnglat } : null;
      })
      .filter((d: any | null): d is ClusterPoint => d !== null);
    if (!data.length) return;

    if (data.length === 1) {
      const place = findPlace(data[0]);
      if (place) {
        // 我的足迹单点已改为蓝色圆点，偏移与访客分布一致
        openInfo(buildInfoContent(place), data[0]!.lnglat, hasReaders ? INFO_OFFSET_VISITOR_Y : INFO_OFFSET_VISITOR_Y);
      }
      return;
    }

    const lngs = data.map(d => d.lnglat[0]);
    const lats = data.map(d => d.lnglat[1]);
    const span = Math.max(Math.max(...lngs) - Math.min(...lngs), Math.max(...lats) - Math.min(...lats));
    const canZoomMore = map.getZoom() < effectiveMax - 0.5;

    // 博客网络聚合簇：始终弹「合并站点清单」，不缩放展开——blog 是扁平目录（点→卡片→跳转），
    // 缩放钻入反而要多次点击才看到卡片；且同服务器/同城多 blog 同坐标本就分不开。
    // 访客分布（hasReaders）：同样直接弹合并读者气泡，不缩放（避免单读者城市埋在大簇里点不到）。
    // 仅「我的足迹」在跨度够且还能放大时缩放展开，钻入区域看具体城市封面/文章。
    const isBlogCluster = data.map(findPlace).some(p => p?.source);
    if (!hasReaders && !isBlogCluster && canZoomMore && span > 0.01) {
      // 跨度够、还能放大 → 放大展开（仅我的足迹）
      const markerLngLat = normalizeLngLat(item.marker?.getPosition?.());
      const lnglat = markerLngLat || averageLngLat(data.map(d => d.lnglat));
      if (lnglat) map.setZoomAndCenter(Math.min(map.getZoom() + 2, effectiveMax), lnglat);
    } else {
      // 已到上限 / 点太近（同坐标）/ 博客或访客分布：合并圈内所有 place，弹聚合气泡
      const places = data.map(findPlace).filter((p): p is Place => Boolean(p));
      if (!places.length) return;
      const center = normalizeLngLat(item.marker?.getPosition?.()) || averageLngLat(data.map(d => d.lnglat)) || data[0]!.lnglat;

      // 博客网络聚合簇：同坐标多个站点分不开时弹「合并站点卡片」，按订阅/友链分组（见 buildMergedBlogCard）。
      if (places.some(p => p.source)) {
        openInfo(buildMergedBlogCard(places), center, INFO_OFFSET_CLUSTER_Y);
        return;
      }

      const allReaders = places.flatMap(p => p.readers ?? []);
      const allPosts = places.flatMap(p => p.posts ?? []);
      const sameName = places.every(p => p.name === places[0]!.name);
      const merged: Place = {
        id: -1,
        name: sameName ? places[0]!.name : `${places.length} 个地点`,
        desc: hasReaders ? `${allReaders.length} 位访客` : null,
        cover: null,
        longitude: center[0],
        latitude: center[1],
        posts: allPosts,
        readers: hasReaders ? allReaders : undefined,
      };
      openInfo(buildInfoContent(merged), center, INFO_OFFSET_VISITOR_Y);
    }
  });
  return c;
}

onMounted(async () => {
  if (!amapEnabled) {
    loadError.value = true;
    loading.value = false;
    console.warn("[TravelMap] 未完整配置 AMAP_KEY / AMAP_SECURITY_CODE，请在 .env 中设置高德地图密钥");
    return;
  }
  try {
    const AMap: any = await loadAmap({
      version: "2.0",
      plugins: ["AMap.MarkerCluster"],
      useProxy: amapUseProxy,
      key: amapKey,
      securityJsCode: amapSecurityCode,
    });
    AMapRef = AMap;

    const initialPoints = buildPoints(props.places);
    const hasPlaces = initialPoints.length > 0;
    // 初次主题直接读 html 类，避免 colorMode ref 解析滞后导致"先亮后暗"
    const initDark = document.documentElement.classList.contains("dark");
    map = new AMap.Map("travel-map", {
      zoom: hasPlaces ? 5 : 4,
      center: hasPlaces ? initialPoints[0]!.lnglat : [104, 35],
      viewMode: "2D",
      resizeEnable: true,
      mapStyle: initDark ? "amap://styles/dark" : "amap://styles/whitesmoke",
      // 缩放区间：[最小下限, 最大上限]。最小下限防缩到全球视图；最大上限访客分布限制城市级。
      // 运行时切视图改 min/max 用下方 watch + setZooms。
      zooms: [props.minZoom ?? MIN_ZOOM_DEFAULT, props.maxZoom ?? 20],
    });
    // 等底图瓦片(含样式)渲染完成再撤掉遮罩，杜绝初次加载的亮色闪烁
    map.on("complete", () => {
      loading.value = false;
    });
    // 兜底：complete 未触发时也不让 loading 卡死
    window.setTimeout(() => {
      loading.value = false;
    }, 3000);
    // isCustom：用纯自定义 HTML，去掉 InfoWindow 自带的白底外壳/箭头/关闭键
    infoWindow = new AMap.InfoWindow({
      isCustom: true,
      offset: new AMap.Pixel(0, INFO_OFFSET_PIN_Y),
      closeWhenClickMap: true,
      autoMove: true,
    });
    // InfoWindow 内关闭按钮（原生 HTML onclick）回调
    (window as any).__closeTravelInfo = () => {
      try {
        infoWindow?.close();
      } catch {
        /* noop */
      }
    };

    // InfoWindow 是 isCustom 注入的原生 HTML，文章链接是裸 <a href>，默认走整页刷新。
    // 用 document 委托监听拦截地图气泡内的站内链接，改走 Nuxt 路由（等同 NuxtLink）；
    // 外链（https:// 等）与非气泡内链接一律放行。
    linkClickHandler = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement | null)?.closest?.("a");
      if (!anchor) return;
      // AMap 可能把 isCustom 气泡渲染在 #travel-map 内或 body 下，两种都认
      if (!anchor.closest("#travel-map") && !anchor.closest(".amap-info-content")) return;
      const href = anchor.getAttribute("href") || "";
      // 站内路径（/ 开头且非协议相对 //）：走 SPA 导航
      if (href.startsWith("/") && !href.startsWith("//")) {
        e.preventDefault();
        try {
          infoWindow?.close();
        } catch {
          /* noop */
        }
        router.push(href);
        return;
      }
      // 站外链接（http(s)://）：气泡内一律新标签打开（博客卡片访问站点 / 友链跳转）
      if (/^https?:\/\//i.test(href)) {
        e.preventDefault();
        window.open(href, "_blank", "noopener,noreferrer");
      }
    };
    document.addEventListener("click", linkClickHandler);

    // 先定视野（固定中国范围），再建聚合点——聚合层按当前视口惰性渲染，定好视野后新点才在正确范围被画出
    fitChinaView();
    cluster = createCluster(initialPoints);

    // 联动：focusId 命中则定位
    const fid = props.focusId != null ? String(props.focusId) : "";
    const target = fid ? props.places.find(p => String(p.id) === fid) : null;
    if (target) focusPlace(target);

    // loading 由 map 的 complete 事件关闭（见上方）
  } catch (e) {
    console.error("[TravelMap] 地图加载失败:", e);
    loadError.value = true;
    loading.value = false;
  }
});

// 深浅模式切换：动态切换底图样式
watch(isDark, dark => {
  if (!map) return;
  map.setMapStyle(dark ? "amap://styles/dark" : "amap://styles/whitesmoke");
});

// 同页 query 变化时重新定位
watch(
  () => props.focusId,
  fid => {
    if (!map || fid == null || fid === "") return;
    const target = props.places.find(p => String(p.id) === String(fid));
    if (target) focusPlace(target);
  },
);

// places 变化（如 /map 切换「我的足迹 / 访客分布」）：销毁旧聚合、按新数据重建，地图实例与 AMap 不重载
watch(
  () => props.places,
  np => {
    if (!map || !AMapRef) return;
    infoWindow?.close();
    cluster?.setMap(null);
    cluster = null;
    const points = buildPoints(np);
    if (points.length) {
      // 先定视野再建聚合：避免新点按旧（可能很深）缩放惰性渲染导致只画出局部
      fitChinaView();
      cluster = createCluster(points);
    } else {
      // 切 tab 后新数据尚在 pending 时 places 会短暂为空；此时也要先脱离 ?place 的深缩放视野，
      // 否则后续 maxZoom 钳制/旧动画可能把地图留在局部。
      fitChinaView();
    }
  },
);

// minZoom / maxZoom 变化（切视图 / 调参）：运行时改地图缩放区间（setZooms 可用），越界则钳回
watch(
  () => [props.minZoom, props.maxZoom] as const,
  ([mn, mx]) => {
    if (!map) return;
    const lo = mn ?? MIN_ZOOM_DEFAULT;
    const hi = mx ?? 20;
    map.setZooms?.([lo, hi]);
    const z = map.getZoom();
    if (z < lo) map.setZoom(lo);
    if (z > hi) fitChinaView();
  },
);

onUnmounted(() => {
  if (map) {
    map.destroy();
    map = null;
  }
  cluster = null;
  avatarMarkerElementCache.clear();
  if (linkClickHandler) {
    document.removeEventListener("click", linkClickHandler);
    linkClickHandler = null;
  }
  delete (window as any).__closeTravelInfo;
});
</script>

<template>
  <div class="relative h-full w-full">
    <div id="travel-map" class="h-full w-full bg-gray-100 dark:bg-gray-900"></div>

    <div v-if="loading" class="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-900">
      <div class="text-center">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p class="mt-2 text-sm text-slate-500">地图加载中...</p>
      </div>
    </div>

    <div v-if="loadError" class="absolute inset-0 flex items-center justify-center p-6">
      <div class="text-center">
        <Icon name="ri:map-pin-line" class="size-10 text-slate-400 mx-auto mb-2" />
        <p class="text-slate-600 dark:text-slate-400 font-medium">地图加载失败</p>
        <p class="text-xs text-slate-400 mt-1">未配置高德地图 Key，请联系站长</p>
      </div>
    </div>
  </div>
</template>

<style>
/* 高德注入的 DOM（控件、版权、Marker、InfoWindow）也跟随站点字体 */
#travel-map,
#travel-map .amap-container,
#travel-map .amap-marker,
#travel-map .amap-info-content,
#travel-map .amap-copyright,
#travel-map .amap-logo,
#travel-map .amap-control,
#travel-map .amap-scalecontrol,
#travel-map .amap-toolbar,
#travel-map .amap-ui-control {
  font-family: "Noto Serif SC", serif !important;
}

.amap-copyright {
  display: none !important;
}

/*
 * #travel-map 本身就是 .amap-container，高德默认给它浅色底（#f2f2f2），
 * 暗色模式下瓦片绘制前会短暂露出这层白。用 ID + !important 强制压成深色，
 * 与加载遮罩同色，消除"画布出来前"的白闪。亮色保持高德默认即可。
 */
.dark #travel-map {
  background-color: #111827 !important;
}

/*
 * InfoWindow 自定义卡片是 isCustom 注入的原生 HTML，吃不到 Tailwind dark: 变体。
 * 这里用全局类 + .dark 后代选择器做明暗主题：卡片在 <html class="dark"> 之内，可命中，
 * 且无需在切换主题时重建内容。
 */
.travel-info {
  background: #fff;
}
.dark .travel-info {
  background: #1e293b;
  border: 1px solid rgba(148, 163, 184, 0.15);
}
.travel-info-title {
  color: #0f172a;
  white-space: nowrap;
}
.dark .travel-info-title {
  color: #f1f5f9;
}
.travel-info-desc {
  color: #64748b;
}
.dark .travel-info-desc {
  color: #94a3b8;
}
.travel-info-link {
  color: #2563eb;
}
.dark .travel-info-link {
  color: #60a5fa;
}
.travel-info-tip {
  background: #fff;
}
.dark .travel-info-tip {
  background: #1e293b;
}
/* 关闭按钮：实色深盘 + 白字 + 内描边，压在封面图之上、不让底色透出；z-index 盖住封面角标 */
.travel-info-close {
  position: absolute;
  z-index: 20;
  background: rgba(0, 0, 0, 0.78);
  color: #fff;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.3);
}
</style>
