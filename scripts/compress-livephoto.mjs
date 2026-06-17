#!/usr/bin/env node
/**
 * 压缩实况照片(JPEG + 内嵌 MP4)
 *
 * 实况照片文件结构: [JPEG 数据][MP4 数据]
 * MP4 起始位置通过查找 "ftyp" 标记定位(与 app/composables/useLivePhoto.ts 完全一致)
 *
 * 压缩策略:
 *   - JPEG 部分:sharp + mozjpeg(高质量低体积)
 *   - MP4 部分:ffmpeg libx264(可配置 CRF、分辨率、预设)
 *   - 视频高度只缩小不放大(避免低清源被拉大)
 *   - 默认移除音轨(实况照片通常不需要),可用 --keep-audio 保留
 *   - 输出 MP4 带 +faststart,moov atom 前置,网页 fetch 后可立即播放
 *
 * 用法:
 *   node scripts/compress-livephoto.mjs [文件或目录] [选项]
 *
 * 默认行为(无参数):
 *   扫描 .live-photos 目录下所有 .jpg/.jpeg,压缩到 .compressed-live-photos
 *   工作流:把待压缩的实况照片拖进 .live-photos → 运行 npm run compress:livephoto
 *           → 取走 .compressed-live-photos 里的成品
 *
 * 选项:
 *   -o, --output <dir>       输出目录(默认:原目录下生成 <name>_compressed.jpg)
 *   -j, --jpeg-quality <n>   JPEG 质量 1-100(默认 80)
 *       --video-height <n>   视频目标高度,宽度等比缩放(默认 1080)
 *   -c, --crf <n>            视频 CRF 0-51,越大体积越小(默认 28)
 *       --preset <name>      ffmpeg 编码预设(默认 veryfast)
 *       --keep-audio         保留视频音轨(默认移除)
 *       --overwrite          覆盖原文件(默认生成新文件)
 *       --dry-run            仅打印预期,不实际写入
 *   -h, --help               显示帮助
 *
 * 依赖:
 *   npm install -D sharp ffmpeg-static
 *   未装 ffmpeg-static 时自动回退到 PATH 中的 ffmpeg
 */

import { readFile, writeFile, stat, mkdir, readdir, rm } from "node:fs/promises";
import { join, dirname, parse, extname, resolve, relative } from "node:path";
import { argv, exit } from "node:process";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

// 加载项目根目录 .env(读取 FFMPEG_PATH 等工具链配置)
import dotenv from "dotenv";
dotenv.config({
  path: join(dirname(fileURLToPath(import.meta.url)), "..", ".env"),
  quiet: true,
});

// ---------- 依赖加载 ----------
// ffmpeg-static 的 postinstall 偶尔会下到截断的二进制(PE 头完整但段数据缺失),
// 此时 import 不抛错,但实际 spawn 会失败(Windows 报"不是有效应用程序")。
// 因此这里只拿路径,真正选用延后到 resolveFfmpeg() 做实测。
let ffmpegStaticPath;
try {
  // @ts-ignore
  ffmpegStaticPath = (await import("ffmpeg-static")).default;
} catch {
  ffmpegStaticPath = null;
}
// 实际使用的 ffmpeg 路径,在 main() 中由 resolveFfmpeg() 赋值
let ffmpegBin = null;
const IS_WIN = process.platform === "win32";

let sharpFn;
try {
  sharpFn = (await import("sharp")).default;
} catch {
  console.error("✘ 缺少依赖:sharp");
  console.error("  请运行: npm install -D sharp");
  exit(1);
}

// ---------- 帮助文本 ----------
const USAGE = `压缩实况照片(JPEG + 内嵌 MP4)

用法:
  node scripts/compress-livephoto.mjs [文件或目录] [选项]

默认行为(无参数):
  扫描 .live-photos 目录下所有 .jpg/.jpeg,压缩到 .compressed-live-photos
  工作流:把待压缩的实况照片拖进 .live-photos → 运行 npm run compress:livephoto
          → 取走 .compressed-live-photos 里的成品

选项:
  -o, --output <dir>       输出目录(默认:原目录下生成 <name>_compressed.jpg)
  -j, --jpeg-quality <n>   JPEG 质量 1-100(默认 80)
      --video-height <n>   视频目标高度,宽度等比缩放(默认 1080)
  -c, --crf <n>            视频 CRF 0-51,越大体积越小(默认 28)
      --preset <name>      ffmpeg 编码预设(默认 veryfast)
      --keep-audio         保留视频音轨(默认移除)
      --overwrite          覆盖原文件(默认生成新文件)
      --dry-run            仅打印预期,不实际写入
  -h, --help               显示帮助

依赖:
  npm install -D sharp ffmpeg-static

示例:
  npm run compress:livephoto                        # 默认: .live-photos → .compressed-live-photos
  node scripts/compress-livephoto.mjs photo.jpg
  node scripts/compress-livephoto.mjs .attachments/2026/05 -o compressed/
  node scripts/compress-livephoto.mjs photo.jpg --overwrite --video-height 720
`;

// ---------- 参数解析 ----------
function parseArgs(args) {
  const opts = {
    input: null,
    output: null,
    jpegQuality: 80,
    videoHeight: 1080,
    crf: 28,
    preset: "veryfast",
    keepAudio: false,
    overwrite: false,
    dryRun: false,
    defaultMode: false,
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    switch (a) {
      case "-o":
      case "--output":
        opts.output = args[++i];
        break;
      case "-j":
      case "--jpeg-quality":
        opts.jpegQuality = parseInt(args[++i], 10);
        break;
      case "--video-height":
        opts.videoHeight = parseInt(args[++i], 10);
        break;
      case "-c":
      case "--crf":
        opts.crf = parseInt(args[++i], 10);
        break;
      case "--preset":
        opts.preset = args[++i];
        break;
      case "--keep-audio":
        opts.keepAudio = true;
        break;
      case "--overwrite":
        opts.overwrite = true;
        break;
      case "--dry-run":
        opts.dryRun = true;
        break;
      case "-h":
      case "--help":
        console.log(USAGE);
        exit(0);
      default:
        if (a.startsWith("-")) {
          console.error(`✘ 未知参数: ${a}\n`);
          console.error(USAGE);
          exit(1);
        }
        opts.input = a;
    }
  }
  if (!opts.input) {
    // 无参数时进入默认模式:扫描 .live-photos → 输出到 .compressed-live-photos
    opts.input = ".live-photos";
    opts.defaultMode = true;
  }
  return opts;
}

// ---------- 工具函数 ----------

// 与 useLivePhoto.ts 完全一致的 ftyp 查找逻辑
function findMp4Start(bytes) {
  for (let i = 0; i < bytes.length - 8; i++) {
    if (
      bytes[i + 4] === 0x66 && // f
      bytes[i + 5] === 0x74 && // t
      bytes[i + 6] === 0x79 && // y
      bytes[i + 7] === 0x70 // p
    ) {
      return i;
    }
  }
  return -1;
}

function formatBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(2)} MB`;
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegBin, args, {
      stdio: ["ignore", "ignore", "pipe"],
      shell: IS_WIN,
    });
    let stderr = "";
    proc.stderr.on("data", c => (stderr += c.toString()));
    proc.on("error", err =>
      reject(new Error(`无法启动 ffmpeg(${ffmpegBin}): ${err.message}`)),
    );
    proc.on("close", code => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg 退出码 ${code}\n${stderr.slice(-800)}`));
    });
  });
}

// 探测某个 ffmpeg 候选是否真的能跑(ffmpeg-static 可能下到截断的二进制)
function tryFfmpeg(bin) {
  return new Promise(resolve => {
    const proc = spawn(bin, ["-version"], {
      stdio: ["ignore", "pipe", "ignore"],
      shell: IS_WIN,
    });
    let hasOutput = false;
    proc.stdout.on("data", () => {
      hasOutput = true;
    });
    proc.on("error", () => resolve(false));
    proc.on("close", code => resolve(code === 0 && hasOutput));
  });
}

// 依次探测候选,返回第一个可用的 ffmpeg 路径;全部不可用返回 null
async function resolveFfmpeg() {
  const candidates = [];
  // 优先级最高:显式环境变量 FFMPEG_PATH 指定的路径
  if (process.env.FFMPEG_PATH) candidates.push(process.env.FFMPEG_PATH);
  if (ffmpegStaticPath) candidates.push(ffmpegStaticPath);
  candidates.push("ffmpeg"); // 系统 PATH
  for (const bin of candidates) {
    if (await tryFfmpeg(bin)) return bin;
  }
  return null;
}

// ---------- 压缩单个文件 ----------
async function compressOne(inputPath, opts) {
  const inputBuffer = await readFile(inputPath);
  const inputSize = inputBuffer.byteLength;
  const bytes = new Uint8Array(inputBuffer);
  const mp4Start = findMp4Start(bytes);

  // 1. 压缩 JPEG 部分(无内嵌视频时压缩整个文件)
  const jpegSource = mp4Start === -1 ? inputBuffer : inputBuffer.subarray(0, mp4Start);
  const compressedJpeg = await sharpFn(jpegSource)
    .jpeg({ quality: opts.jpegQuality, mozjpeg: true })
    .toBuffer();

  // 非实况照片:直接写 JPEG
  if (mp4Start === -1) {
    await writeOutput(inputPath, compressedJpeg, opts);
    logResult(inputPath, inputSize, undefined, compressedJpeg.byteLength, undefined, opts);
    return;
  }

  // 2. 压缩 MP4 部分(临时文件中转)
  const tmpId = randomUUID();
  const tmpIn = join(tmpdir(), `lp-${tmpId}-in.mp4`);
  const tmpOut = join(tmpdir(), `lp-${tmpId}-out.mp4`);
  await writeFile(tmpIn, inputBuffer.subarray(mp4Start));

  try {
    // 高度只缩小不放大:min(目标高度, 原始高度)
    const scaleExpr = `scale=-2:'min(${opts.videoHeight},ih)'`;
    const ffArgs = [
      "-y",
      "-i",
      tmpIn,
      "-vf",
      scaleExpr,
      "-c:v",
      "libx264",
      "-crf",
      String(opts.crf),
      "-preset",
      opts.preset,
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
    ];
    if (opts.keepAudio) {
      ffArgs.push("-c:a", "aac", "-b:a", "96k");
    } else {
      ffArgs.push("-an");
    }
    ffArgs.push(tmpOut);

    await runFfmpeg(ffArgs);
    const compressedMp4 = await readFile(tmpOut);

    // 3. 拼接 JPEG + MP4,保持实况照片文件结构
    const final = Buffer.concat([compressedJpeg, compressedMp4]);
    await writeOutput(inputPath, final, opts);
    logResult(inputPath, mp4Start, inputSize - mp4Start, compressedJpeg.byteLength, compressedMp4.byteLength, opts);
  } finally {
    await Promise.allSettled([
      rm(tmpIn, { force: true }),
      rm(tmpOut, { force: true }),
    ]);
  }
}

// 静默写入,不产生日志
async function writeOutput(inputPath, buffer, opts) {
  if (opts.dryRun) return;
  let outPath;
  const parsed = parse(inputPath);
  if (opts.overwrite) {
    outPath = inputPath;
  } else if (opts.output) {
    outPath = join(resolve(opts.output), parsed.base);
  } else {
    outPath = join(parsed.dir, `${parsed.name}_compressed${parsed.ext}`);
  }
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, buffer);
}

// 格式化尺寸明细:总量 (JPEG xx + MP4 xx),无 MP4 时仅显示总量
function formatSizes(jpeg, mp4) {
  if (mp4 !== undefined) {
    return `${formatBytes(jpeg + mp4)} (JPEG ${formatBytes(jpeg)} + MP4 ${formatBytes(mp4)})`;
  }
  return formatBytes(jpeg);
}

// 单行输出压缩结果:相对路径 原始 → 压缩后
function logResult(inputPath, origJpeg, origMp4, newJpeg, newMp4, opts) {
  const rel = relative(process.cwd(), inputPath) || inputPath;
  const tag = opts.dryRun ? "[dry] " : "";
  console.log(`${tag}${rel} ${formatSizes(origJpeg, origMp4)} → ${formatSizes(newJpeg, newMp4)}`);
}

// ---------- 入口 ----------
async function main() {
  const opts = parseArgs(argv.slice(2));

  const resolved = await resolveFfmpeg();
  if (!resolved) {
    console.error("✘ 没有可用的 ffmpeg");
    if (ffmpegStaticPath) {
      console.error(`  ffmpeg-static 二进制存在但无法执行:`);
      console.error(`    ${ffmpegStaticPath}`);
      console.error("  常见原因:postinstall 下载被截断/损坏。请重装:");
      console.error("    rm -rf node_modules/ffmpeg-static && npm install");
    } else {
      console.error("  未安装 ffmpeg-static。请运行:");
      console.error("    npm install -D ffmpeg-static");
    }
    console.error("  或在系统 PATH 中安装 ffmpeg(推荐,一次配好全局可用):");
    console.error("    winget install Gyan.FFmpeg");
    exit(1);
  }
  ffmpegBin = resolved;
  if (resolved === process.env.FFMPEG_PATH) {
    console.log(`i 使用 FFMPEG_PATH 指定的 ffmpeg:${resolved}\n`);
  } else if (resolved === "ffmpeg") {
    console.log("i 使用系统 PATH 中的 ffmpeg");
  } else {
    console.log(`i 使用 ffmpeg-static:${resolved}`);
  }

  // 默认模式:无参数时,输出目录自动指向 .compressed-live-photos
  if (opts.defaultMode && !opts.output && !opts.overwrite) {
    opts.output = ".compressed-live-photos";
  }

  // 检查输入路径是否存在,默认模式下给出更友好的提示
  let inputStat;
  try {
    inputStat = await stat(opts.input);
  } catch {
    if (opts.defaultMode) {
      console.error(`✘ 默认目录 ${opts.input} 不存在`);
      console.error("  请先创建该目录并把待压缩的实况照片放进去:");
      console.error(`    mkdir ${opts.input}`);
      console.error(`    (然后将 .jpg/.jpeg 文件拖入 ${opts.input})`);
      console.error("  或显式指定路径: node scripts/compress-livephoto.mjs <文件或目录>");
      exit(1);
    }
    console.error(`✘ 输入路径不存在: ${opts.input}`);
    exit(1);
  }
  const files = [];
  if (inputStat.isFile()) {
    files.push(resolve(opts.input));
  } else if (inputStat.isDirectory()) {
    const entries = await readdir(opts.input, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isFile()) continue;
      const ext = extname(e.name).toLowerCase();
      if (ext === ".jpg" || ext === ".jpeg") {
        files.push(resolve(join(opts.input, e.name)));
      }
    }
  }

  if (files.length === 0) {
    if (opts.defaultMode) {
      console.log(`目录 ${opts.input} 中没有 .jpg/.jpeg 文件`);
      console.log("  把待压缩的实况照片拖进 .live-photos 后再运行本命令");
    } else {
      console.log("没有找到可处理的 .jpg/.jpeg 文件");
    }
    return;
  }

  if (opts.defaultMode) {
    console.log(`▶ 默认模式:${opts.input}/ → ${opts.output}/\n`);
  }
  console.log(`找到 ${files.length} 个文件，开始压缩...\n`);
  let ok = 0;
  let fail = 0;
  for (const f of files) {
    try {
      await compressOne(f, opts);
      ok++;
    } catch (err) {
      console.error(`✘ ${relative(process.cwd(), f) || f} - ${err.message}`);
      fail++;
    }
  }
  console.log(`\n✓ 完成 ${ok} 个${fail > 0 ? `,失败 ${fail}` : ""}`);
}

main().catch(err => {
  console.error("✘", err);
  exit(1);
});
