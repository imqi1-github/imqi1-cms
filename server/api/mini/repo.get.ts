// 小程序仓库卡片接口：服务端代理 GitHub / Gitee API，
// 归一化字段后返回，使小程序合法域名只需站点自身、无需额外配置 api.github.com。

import type { MiniRepo, MiniRepoResponse, RepoApiData } from "#server/types/apis/mini";

export default defineEventHandler(async event => {
  setHeader(event, "Cache-Control", "public, max-age=300, s-maxage=300");

  const query = getQuery(event);

  // getQuery 对重复参数会返回数组，这里强制按字符串处理，避免数组/异常值触发 .trim() 抛错变成 500。
  const platform = typeof query.platform === "string" ? query.platform : "";
  const owner = (typeof query.owner === "string" ? query.owner : "").trim();
  const repo = (typeof query.repo === "string" ? query.repo : "").trim();

  if ((platform !== "github" && platform !== "gitee") || !owner || !repo) {
    throw createError({ statusCode: 400, message: "缺少或非法的仓库参数" });
  }

  const apiUrl = platform === "github"
    ? `https://api.github.com/repos/${owner}/${repo}`
    : `https://gitee.com/api/v5/repos/${owner}/${repo}`;

  const pageUrl = `https://${platform}.com/${owner}/${repo}`;

  try {
    // GitHub 要求带 User-Agent，否则拒绝请求
    const data = await $fetch<RepoApiData>(apiUrl, {
      // redirect:"error"：拒绝任何重定向，防止上游 30x 跳转到其他主机（SSRF 防护）
      redirect: "error",
      headers: {
        "User-Agent": "imqi1-mini",
        Accept: "application/json",
      },
    });

    const result: MiniRepo = {
      platform,
      fullName: data.full_name || data.name || `${owner}/${repo}`,
      description: data.description || "",
      language: data.language || "",
      stars: data.stargazers_count ?? 0,
      forks: data.forks_count ?? 0,
      isPrivate: data.private ?? false,
      url: pageUrl,
    };

    return { success: true, data: result } satisfies MiniRepoResponse;
  } catch (error) {
    console.error("获取仓库信息失败:", error);
    throw createError({ statusCode: 502, message: "获取仓库信息失败" });
  }
});
