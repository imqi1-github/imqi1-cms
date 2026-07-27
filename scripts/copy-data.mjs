import { mkdirSync, copyFileSync, existsSync } from "fs";
import { join } from "path";

// 运行时资源统一目录：打包后复制到 .output/server/runtime-assets/，便于部署时整体拷贝/挂载。
// 与 nuxt.config.ts 的 nitro compiled hook 同源同目标、幂等——两者清单必须保持一致。
// - qqwry.ipdb   IP 归属地库（server/utils/qqwry.ts 读取，源在 server/runtime-assets/）
// - DejaVuSans.ttf 验证码字体（server/utils/captcha.ts 读取，源在 server/runtime-assets/）
// - svg2png_wasm_bg.wasm  验证码渲染 WASM（来自 svg2png-wasm 依赖，随构建复制，避免版本漂移）
// - emojis.json  邮件 CID 表情渲染用（server/utils/emoji-mail.ts 读取，源在 app/assets/）
console.log("Copying runtime assets to build output...");

const assetsDir = join(process.cwd(), "server", "runtime-assets");
const targetDir = join(process.cwd(), ".output", "server", "runtime-assets");

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
    source: join(process.cwd(), "node_modules", "svg2png-wasm", "svg2png_wasm_bg.wasm"),
    target: join(targetDir, "svg2png_wasm_bg.wasm"),
    label: "svg2png WASM",
  },
  {
    source: join(process.cwd(), "app", "assets", "emojis.json"),
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
