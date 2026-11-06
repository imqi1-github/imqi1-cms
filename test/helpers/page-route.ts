import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** 递归收集目录下的 .vue 文件 */
export function collectVueFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectVueFiles(full, out);
    } else if (entry.endsWith(".vue")) {
      out.push(full.replace(/\\/g, "/"));
    }
  }
  return out;
}

/**
 * 页面文件 → 站内路由（动态段折叠成 /**，index 段去掉）。
 *
 * app/pages/category/[slug].vue → /category/**
 * app/pages/index.vue           → /
 * app/pages/admin/links.vue     → /admin/links
 */
export function pageRoute(file: string): string {
  const rel = file.replace(/\\/g, "/").replace(/^app\/pages\//, "").replace(/\.vue$/, "");
  if (rel === "index") return "/";
  const segments = rel.split("/").filter(segment => segment !== "index");
  const staticSegments = segments.filter(segment => !segment.startsWith("["));
  if (staticSegments.length !== segments.length) {
    const prefix = staticSegments.join("/");
    return prefix ? `/${prefix}/**` : "/**";
  }
  return `/${segments.join("/")}`;
}

/** 路由是否命中某个路由通配（含 /** 前缀语义） */
export function routeMatches(route: string, pattern: string): boolean {
  if (pattern.endsWith("/**")) {
    const prefix = pattern.slice(0, -3);
    return route === prefix || route.startsWith(`${prefix}/`);
  }
  return route === pattern;
}
