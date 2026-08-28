import { mkdirSync, copyFileSync, existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

// 脚本可能从任意 cwd 运行（`bun run build` 若 cd 到子目录），用 __dirname 锚定项目根
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, "..");

// 运行时资源统一目录：打包后复制到 .output/server/runtime-assets/，便于部署时整体拷贝/挂载。
// 与 nuxt.config.ts 的 nitro compiled hook 同源同目标、幂等——两者清单必须保持一致。
console.log("Copying runtime assets to build output...");

const assetsDir = join(ROOT_DIR, "server", "runtime-assets");
const targetDir = join(ROOT_DIR, ".output", "server", "runtime-assets");

const ipdbSource = process.env.QQWRY_IPDB_PATH || join(assetsDir, "qqwry.ipdb");

const runtimeFiles = [
  {
    source: ipdbSource,
    target: join(targetDir, "qqwry.ipdb"),
    label: "qqwry.ipdb database",
  },
  {
    source: join(assetsDir, "DejaVuSans.ttf"),
    target: join(targetDir, "DejaVuSans.ttf"),
    label: "captcha font",
  },
  {
    source: join(ROOT_DIR, "node_modules", "svg2png-wasm", "svg2png_wasm_bg.wasm"),
    target: join(targetDir, "svg2png_wasm_bg.wasm"),
    label: "svg2png WASM",
  },
  {
    source: join(ROOT_DIR, "app", "assets", "emojis.json"),
    target: join(targetDir, "emojis.json"),
    label: "emojis.json (mail emoji)",
  },
];

mkdirSync(targetDir, { recursive: true });

for (const file of runtimeFiles) {
  if (!existsSync(file.source)) {
    console.warn(`⚠ ${file.label} not found: ${file.source}`);
    continue;
  }

  copyFileSync(file.source, file.target);
  console.log(`✓ Copied ${file.label} to ${file.target}`);
}
