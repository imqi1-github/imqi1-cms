/**
 * 自定义 `:::xxx` 容器在编辑器占位块里的展示元信息（图标 + 友好标签）。
 *
 * 这里是一份**受控的小段客户端重复**——不共享 server/utils/markdown.ts，因为
 * 服务端那份内联在 markdown-it-container 插件配置里、无法干净导出，且会牵入
 * Shiki/prisma 等服务端依赖。客户端只需"选个图标/标签"，不做任何容器渲染，
 * 容器的真正渲染仍由服务端管线负责。容器名集合与服务端保持一致。
 */

import type { ContainerMeta, ContainerType } from "~/types/markdown-editor";

export const CONTAINER_META: Record<ContainerType, ContainerMeta> = {
  "live-photo": { type: "live-photo", label: "实况照片", icon: "lucide:aperture" },
  video: { type: "video", label: "视频", icon: "lucide:video" },
  callout: { type: "callout", label: "提示框", icon: "lucide:info" },
  card: { type: "card", label: "链接卡片", icon: "lucide:layout-template" },
  "simple-card": { type: "simple-card", label: "外链卡片", icon: "lucide:link-2" },
  swiper: { type: "swiper", label: "轮播图", icon: "lucide:images" },
  waterfall: { type: "waterfall", label: "瀑布流", icon: "lucide:gallery-vertical" },
  repo: { type: "repo", label: "仓库卡片", icon: "lucide:github" },
  music: { type: "music", label: "音乐播放器", icon: "lucide:disc-3" },
  details: { type: "details", label: "折叠区块", icon: "lucide:chevrons-up-down" },
};

/** 未知容器类型的兜底展示。 */
export const UNKNOWN_CONTAINER_META: ContainerMeta = {
  type: "details", // 占位，仅满足类型；label/icon 才是实际用到的
  label: "自定义容器",
  icon: "lucide:box",
};

/**
 * 解析 callout 的变体（success/warning/error/info），用于占位块按变体着色。
 * 非 callout 容器返回 null。
 */
export function deriveCalloutVariant(raw: string): "success" | "warning" | "error" | "info" | null {
  const m = raw.match(/^:::callout\s+(success|warning|error|info)\b/);
  return m ? (m[1] as "success" | "warning" | "error" | "info") : null;
}
