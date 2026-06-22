import { mkdirSync, copyFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const sourceDir = join(process.cwd(), 'data');
const targetDir = join(process.cwd(), '.output', 'server', 'data');
const ipdbSource = process.env.QQWRY_IPDB_PATH || join(process.cwd(), 'data', 'qqwry.ipdb');

console.log('Copying data files to build output...');

if (!existsSync(sourceDir)) {
  console.warn('⚠ data/ directory not found');
}

const runtimeFiles = [
  {
    source: join(process.cwd(), 'server', 'fonts', 'DejaVuSans.ttf'),
    target: join(process.cwd(), '.output', 'server', 'server', 'fonts', 'DejaVuSans.ttf'),
    targetDir: join(process.cwd(), '.output', 'server', 'server', 'fonts'),
    label: 'captcha font',
  },
  {
    source: join(process.cwd(), 'node_modules', 'svg2png-wasm', 'svg2png_wasm_bg.wasm'),
    target: join(process.cwd(), '.output', 'server', 'wasm', 'svg2png_wasm_bg.wasm'),
    targetDir: join(process.cwd(), '.output', 'server', 'wasm'),
    label: 'svg2png WASM',
  },
  {
    source: ipdbSource,
    target: join(process.cwd(), '.output', 'server', 'data', 'qqwry.ipdb'),
    targetDir: join(process.cwd(), '.output', 'server', 'data'),
    label: 'qqwry.ipdb database',
  },
];

for (const file of runtimeFiles) {
  if (!existsSync(file.source)) {
    const prefix = file.optional ? 'ℹ' : '⚠';
    console.warn(`${prefix} ${file.label} not found: ${file.source}`);
    continue;
  }

  mkdirSync(file.targetDir, { recursive: true });
  copyFileSync(file.source, file.target);
  console.log(`✓ Copied ${file.label} to ${file.target}`);
}
