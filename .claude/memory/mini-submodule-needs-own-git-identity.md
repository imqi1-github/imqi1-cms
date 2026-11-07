---
name: mini-submodule-needs-own-git-identity
description: mini/ 是独立 git 子模块，主仓库的 user.name/email 不继承；提交前要在 mini 目录单独设 identity
metadata:
  type: feedback
---

`mini/` 是 git submodule（独立仓库，`mini/.git`），不是普通目录。主仓库的 `git config user.name/email` **不会**自动应用到子模块的 commit —— 在 mini 目录里 `git commit` 会报 `fatal: unable to auto-detect email address`。

**Why:** submodule 的设计就是"独立仓库嵌在父仓库里"，git CLI 在子模块目录操作时读 `mini/.git/config`，不读主仓库 `.git/config`。

**How to apply:**
- 提交 mini 前在 mini 目录里设一次 identity（**不加 `--global`**，只作用于 mini 仓库）：
  ```bash
  cd mini
  git config user.name "棋"
  git config user.email "imqi1@qq.com"
  ```
- 批量给所有子模块设：`git submodule foreach 'git config user.name "棋" && git config user.email "imqi1@qq.com"'`
- 主仓库提交子模块指针更新（`git add mini && git commit`）用主仓库 identity，不受影响。
- 报 "unable to auto-detect email address" 且当前不在仓库根目录 ⇒ 先 `pwd` 看是不是误入子模块目录。

相关：[[single-user-site-invariant]]
