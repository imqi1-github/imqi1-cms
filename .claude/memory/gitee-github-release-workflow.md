---
name: gitee-github-release-workflow
description: "双仓库运营 SOP：Gitee 私有=源码第一落点(无 release/issues) + GitHub 公开=一版本一 Release、标题 vX.Y.Z-主题更新；判本人=git ls-remote origin 能连私有 Gitee"
metadata:
  node_type: memory
  type: project
---

本仓库**双仓库**、**单人运营**（站主=棋，见 [[imqi1-cms-db]] / [[single-user-site-invariant]]）。这套发版 SOP **只对站主本人有效**。

**AI 执行前先判本人**：`git ls-remote origin` 能连上 = 本人环境。`origin` 是**私有** Gitee `https://gitee.com/imqi1-gitee/imqi1-cms.git`（无 release/issues，纯源码存储）。只有本人有该凭据；他人 clone/fork 要么无此远程、要么连不上/401。连得上 → 本人，执行本 SOP；连不上 → 非本人（公开 fork），**别跑 owner-only 的写操作/发版**。

**角色分工**：
- `origin`（Gitee，私有）= **源码第一落点**，日常任何提交第一时间 `git push origin master`。它不带 release/issues，纯存储。
- `github`（GitHub，公开）= 完整开源套件（issues/releases 等），**一版本一 Release**，标题格式 **`vX.Y.Z-主题更新`**（例 `v1.0.2-cache更新`）。

**发版流程**（开源要有新版本时）：
1. `git fetch origin` → `git status -sb` 看本地 vs `origin/master` 是否**同一 tip**；本地落后则 `git merge --ff-only origin/master` 快进。
2. 保证 **本地 == Gitee == 最新一致**：本地有未推提交先 `git push origin master`（源码在 Gitee 最先）。
3. 同步 GitHub：`git push github master`。
4. 打 tag（**只 GitHub**，Gitee 无 tag）：`git tag -a vX.Y.Z -m "vX.Y.Z" origin/master && git push github vX.Y.Z`。
5. 发 Release（**只 GitHub**）：`gh release create vX.Y.Z --repo imqi1-github/imqi1-cms --title "vX.Y.Z-主题更新" --notes-file ...`。

**别搞混**：Gitee 是最早的数据源（写得早、最有），GitHub 是**对外发布面**（一版本一 release）。`git push` 默认只推当前分支到当前上游，须**分别对 `origin` 和 `github` 各 push 一次**；tag 默认不自动同步 Gitee，别指望一条命令把它带过去。

## 实际 git remote 配置（与上面 SOP 的差异）

仓库实际 `.git/config` 是**单 origin + 双 pushurl** 而非双 remote 名：

```ini
[remote "origin"]
    url = https://github.com/imqi1-github/imqi1-cms.git
    url = https://gitee.com/imqi1-gitee/imqi1-cms.git
    pushurl = https://github.com/imqi1-github/imqi1-cms.git
    pushurl = https://gitee.com/imqi1-gitee/imqi1-cms.git
```

效果：`git push origin master` 一次命令**同时推到两边**，等价于 SOP 的「分两次 push」。`git ls-remote` 校验两边 master tip SHA 一致才算成功。

**Gitee 那侧的 `remote: Powered by GITEE.COM` 不是 GitHub 镜像通知**，是 Gitee 自己的 push 成功响应；看到它不说明"已经同步"，要 `git ls-remote https://gitee.com/.../refs/heads/master` 拿 SHA 比对两边才知道是否一致。
