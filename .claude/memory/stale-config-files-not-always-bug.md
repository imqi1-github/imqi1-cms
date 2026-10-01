---
name: stale-config-files-not-always-bug
description: 「久未触碰」文件不等于 bug,实测后再下结论;shadcn 组件与 components.json 是典型误报
metadata:
  type: project
---

扫仓库「长期没改」文件时,**不要仅凭日期就判定为风险**,要实测:tailwindcss:lint 跑一遍 / 真实 fs 检查 alias / 跑相关命令。

**实证案例(2026-10-01 排查):**

- `app/components/ui/{dialog,dropdown-menu,select,sheet}/` 共 16 个 shadcn 组件 6 个月未动(2026-04-02)— 跑 `bun run tailwindcss:lint` 0 错 0 警告,与 Tailwind v4 仍兼容
- `components.json` 6 个月未动(2026-04-02)— alias `lib: @/lib` 与根 `lib/site-config.ts` 不一致,但代码用的是 tsconfig alias 兜底(`~/lib/utils` → `app/lib/utils.ts`,根 `lib/` 只放 site-config),运行时无影响;components.json 仅是 shadcn CLI 的 metadata,不是运行时 alias 源

**Why:** 减少「假阳性调研」,避免扫一次仓库就把 6 个月没改的全标黄;用户对 lint exit 0 有强要求,无证据的改动只增加技术债。

**How to apply:** 报告「is xxx 风险没改」前先跑 `bun run tailwindcss:lint` + `git ls-files | head -N` 核对真实依赖链路;只有实测确认运行时受影响才标「需要修」,否则写一条 memory 说明「验证过不是真问题」防下次重判。