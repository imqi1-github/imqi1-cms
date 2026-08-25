<script setup lang="ts">
import { onMounted, ref } from "vue";

// 仓库卡片：服务端渲染为 .markdown-repo-wrapper 占位，客户端组件化挂载并自管 fetch。
const props = defineProps<{ url: string }>();

type RepoData = {
  full_name?: string;
  name?: string;
  description?: string | null;
  language?: string | null;
  stargazers_count?: number;
  forks_count?: number;
  private?: boolean;
};

const state = ref<"loading" | "ok" | "invalid" | "error">("loading");
const data = ref<RepoData | null>(null);
const platform = ref<"github" | "gitee" | null>(null);

function parseRepo() {
  const url = props.url;
  let p: "github" | "gitee" | null = null;
  let owner = "";
  let repo = "";
  if (url.includes("github.com")) {
    const m = url.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (m) {
      p = "github";
      owner = m[1]!;
      repo = m[2]!.replace(/\.git$/, "");
    }
  } else if (url.includes("gitee.com")) {
    const m = url.match(/gitee\.com\/([^/]+)\/([^/]+)/);
    if (m) {
      p = "gitee";
      owner = m[1]!;
      repo = m[2]!.replace(/\.git$/, "");
    }
  }
  if (!p || !owner || !repo) {
    state.value = "invalid";
    return null;
  }
  platform.value = p;
  return { p, owner, repo };
}

onMounted(async () => {
  const parsed = parseRepo();
  if (!parsed) return;
  const { p, owner, repo } = parsed;
  try {
    const apiUrl = p === "github"
      ? `https://api.github.com/repos/${owner}/${repo}`
      : `https://gitee.com/api/v5/repos/${owner}/${repo}`;
    const response = await fetch(apiUrl);
    if (!response.ok) throw new Error("Failed to fetch repo data");
    data.value = (await response.json()) as RepoData;
    state.value = "ok";
  } catch {
    state.value = "error";
  }
});

const langDot = (language?: string | null) => {
  switch (language) {
    case "JavaScript": return "bg-yellow-400";
    case "TypeScript": return "bg-blue-500";
    case "Python": return "bg-green-500";
    case "Java": return "bg-red-500";
    case "Go": return "bg-cyan-500";
    case "Rust": return "bg-orange-500";
    case "C++": return "bg-blue-600";
    case "Vue": return "bg-green-400";
    default: return "bg-slate-400";
  }
};
</script>

<template>
  <div class="markdown-repo">
    <div v-if="state === 'loading'" class="markdown-repo-loading flex min-h-36 items-center justify-center p-8 border border-slate-200 dark:border-slate-700 rounded-lg">
      <div class="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-3"/>
      <span class="text-slate-600 dark:text-slate-400">加载仓库信息...</span>
    </div>

    <div v-else-if="state === 'invalid'" class="p-4 border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-600 dark:text-red-400">
      无效的仓库 URL
    </div>

    <div v-else-if="state === 'error'" class="p-4 border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 rounded-lg text-red-600 dark:text-red-400">
      加载仓库信息失败
    </div>

    <a v-else :href="url" target="_blank" rel="noopener noreferrer" class="block group">
      <div class="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-800 hover:border-blue-400 dark:hover:border-blue-500 transition-all duration-300">
        <div class="flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
          <div class="flex items-center gap-2">
            <span :class="platform === 'github' ? 'text-slate-600 dark:text-slate-400' : 'text-red-600 dark:text-red-400'">
              <svg v-if="platform === 'github'" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
              <svg v-else xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M11.984 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.016 0zm6.09 5.333c.328 0 .593.266.592.593v1.482a.594.594 0 0 1-.593.592H9.777c-.982 0-1.778.796-1.778 1.778v5.63c0 .327.266.592.593.592h5.63c.982 0 1.778-.796 1.778-1.778v-.296a.593.593 0 0 0-.592-.593h-4.037a.594.594 0 0 1-.592-.593v-1.482a.593.593 0 0 1 .593-.592h6.815c.327 0 .593.265.593.592v3.408a4 4 0 0 1-4 4H5.926a.593.593 0 0 1-.593-.593V9.778a4.444 4.444 0 0 1 4.445-4.444h8.296Z"/></svg>
            </span>
            <span class="text-xs font-medium text-slate-600 dark:text-slate-400">{{ platform === "github" ? "GitHub" : "Gitee" }}</span>
          </div>
          <div class="flex items-center gap-2">
            <span v-if="data?.private" class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400">
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="mr-1"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              私有
            </span>
            <span v-else class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="mr-1"><path d="m21 9-9 9-9-9"/><path d="M21 3 9 15l-5-5"/></svg>
              公开
            </span>
          </div>
        </div>

        <div class="p-4">
          <div class="flex items-start justify-between gap-2 mb-3">
            <h3 class="text-base font-bold text-slate-900 dark:text-slate-100 line-clamp-1">{{ data?.full_name || data?.name || "" }}</h3>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-slate-400 dark:text-slate-500 shrink-0 mt-0.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </div>

          <p v-if="data?.description" class="text-sm text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed mb-3">
            {{ data.description }}
          </p>

          <div class="flex items-center justify-between">
            <div class="flex items-center gap-4">
              <div class="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-yellow-500"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                <span class="font-semibold">{{ data?.stargazers_count?.toLocaleString() || 0 }}</span>
              </div>
              <div class="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-500"><line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>
                <span class="font-semibold">{{ data?.forks_count?.toLocaleString() || 0 }}</span>
              </div>
            </div>
            <div v-if="data?.language" class="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
              <span>{{ data.language }}</span>
              <span class="size-2 rounded-full" :class="langDot(data.language)" />
            </div>
          </div>
        </div>
      </div>
    </a>
  </div>
</template>
