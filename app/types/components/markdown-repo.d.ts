// MarkdownRepo 组件拉取 GitHub/Gitee 仓库信息的响应结构（原内联在 MarkdownRepo.vue，挪到此）。
export type RepoData = {
  full_name?: string;
  name?: string;
  description?: string | null;
  language?: string | null;
  stargazers_count?: number;
  forks_count?: number;
  private?: boolean;
};
