---
name: compress-livephoto
description: 压缩实况照片（JPEG + 内嵌 MP4）：默认扫 .live-photos → 压到 .compressed-live-photos。sharp 压 JPEG、ffmpeg(libx264) 压 MP4，视频高度只缩不拉、默认去掉音轨、输出带 +faststart；需要 sharp / ffmpeg（FFMPEG_PATH 或用 ffmpeg-static/系统 PATH）。压制或优化实况照片、缩小体积时使用。
---

# /compress-livephoto — 压缩实况照片

对「JPEG 体 + 内嵌 MP4」的实况照片（Android Motion Photo）做体积缩减：`findMp4Start` 定位 `ftyp` 切出两段（与 `app/composables/useLivePhoto.ts` 同一逻辑）→ JPEG 用 sharp+mozjpeg、MP4 用 ffmpeg libx264（CRF/分辨率/预设可选）→ 重拼回单文件。**视频高度只缩小不放大**、默认 `-an` 去音轨、`+faststart` 让 moov 前置可边下边播。

## 前置：ffmpeg 可用性
脚本按 `FFMPEG_PATH`（env）→ `ffmpeg-static` → 系统 PATH 顺序探测，**第一个能真正 `-version` 的才用**（ffmpeg-static 可能下到截断二进制）。全部失败会报错退出。
- 缺 sharp → `npm install -D sharp`
- 缺 ffmpeg → `npm install -D ffmpeg-static`，或 Windows 装全局：`winget install Gyan.FFmpeg`（推荐，一次配好）
- `.env` 里 `FFMPEG_PATH`：当前**已配置**，脚本会优先用该路径。

## 常用工作流
```bash
# 1. 把待压缩的实况照片拖进 .live-photos/
# 2. 运行（默认）：扫 .live-photos 下所有 .jpg/.jpeg → 输出到 .compressed-live-photos/
bun run compress:livephoto
```
完成后从 `.compressed-live-photos/` 取成品。文件名 = 原名 + `_compressed`（默认不覆盖原文件）。

## 关键选项（`node scripts/compress-livephoto.mjs` 或 `bun run compress:livephoto`）
| 选项 | 作用 | 默认 |
|---|---|---|
| `-o --output <dir>` | 输出目录 | 原目录生成 `<name>_compressed.jpg`；默认模式下为 `.compressed-live-photos` |
| `-j --jpeg-quality <n>` | JPEG 质量 1-100 | 80 |
| `--video-height <n>` | 视频目标高度，宽等比缩放（只缩不放） | 1080 |
| `-c --crf <n>` | 31 越大体积越小 | 28 |
| `--preset <name>` | 编码预设 | veryfast |
| `--keep-audio` | 保留音轨 | 移除 |
| `--overwrite` | 覆盖原文件 | 生成新文件 |
| `--dry-run` | 只打印预期不实际写入 | 关 |

示例：
```bash
bun run compress:livephoto                        # 默认 .live-photos → .compressed-live-photos
node scripts/compress-livephoto.mjs photo.jpg
node scripts/compress-livephoto.mjs .attachments/2026/05 -o compressed/ --video-height 720
node scripts/compress-livephoto.mjs photo.jpg --overwrite --video-height 720 --crf 30
```

## 汇报 / 注意
- 输出格式：`相对路径 原始大小 → 压缩后大小`（无 MP4 仅显示总量；实况照片显示 `总量 (JPEG + MP4)`）。失败的文件单独标 `✘`。
- 非实况照片（无 `ftyp` 的纯 JPEG）会退化为纯 JPEG 压缩，尺寸显示不含 MP4。
- `.live-photos/`、`.compressed-live-photos/` 已在项目根 gitignore（素材不入库）。
- **只写压缩产物，不改数据库**；产物是否上传到 COS 由后续 upload 流程决定。
