import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

// canonical 类建议走 @tailwindcss/node 的引擎（和 VS Code IntelliSense 的
// suggestCanonicalClasses 同一实现）。该包当前是 @tailwindcss/postcss 的传递依赖，
// 因此无需单独声明，但显式依赖它更稳妥（想 pin 就去 package.json 加 @tailwindcss/node）。
import { __unstable__loadDesignSystem } from '@tailwindcss/node'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const req = createRequire(path.join(ROOT, 'package.json'))
const postcss = req('postcss')
const tailwind = req('@tailwindcss/postcss')
const autoprefixer = req('autoprefixer')
const { twMerge } = req('tailwind-merge')
const acorn = req('acorn')

// ============================================================
// 一、CSS 指令（@apply/@theme 等）检查
// ============================================================
function collectCss() {
  const files = []
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f)
      if (fs.statSync(p).isDirectory()) walk(p)
      else if (p.endsWith('.css')) files.push(p)
    }
  }
  walk(path.join(ROOT, 'app', 'assets', 'css'))
  return files
}

// 递归内联本地相对 @import "./x.css"，保留 @import "tailwindcss" 与外部导入
function inlineImports(cssText, baseDir, seen = new Set()) {
  return cssText.replace(/@import\s+["'](\.[^"']+\.css)["']\s*;/g, (_, rel) => {
    const p = path.resolve(baseDir, rel)
    if (seen.has(p)) return ''
    seen.add(p)
    if (!fs.existsSync(p)) return `/* @import 缺失: ${rel} */`
    return inlineImports(fs.readFileSync(p, 'utf8'), path.dirname(p), seen)
  })
}

async function scanCss(file) {
  const abs = path.resolve(file)
  let css = inlineImports(fs.readFileSync(abs, 'utf8'), path.dirname(abs))
  // Tailwind 命中未知 @apply / 非法 theme() 会先向 stderr 打原始堆栈再抛错；静音 stderr，聚焦简洁报告
  const stderrWrite = process.stderr.write
  process.stderr.write = () => true
  try {
    const result = await postcss([tailwind(), autoprefixer()]).process(css, { from: abs })
    return {
      errors: [],
      warnings: result.warnings().map(w => ({ line: w.line, col: w.column, plugin: w.plugin ?? '', text: w.text })),
    }
  } catch (e) {
    return {
      errors: [{ line: e.line ?? '', col: e.column ?? '', plugin: e.plugin ?? 'tailwindcss', text: e.reason ?? e.message }],
      warnings: [],
    }
  } finally {
    process.stderr.write = stderrWrite
  }
}

// ============================================================
// 二、类名冲突/重复检查（只对无条件共同出现的类，twMerge 去重）
// ============================================================
function collectVue(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f)
    if (fs.statSync(p).isDirectory()) collectVue(p, out)
    else if (p.endsWith('.vue')) out.push(p)
  }
  return out
}

function parseExpr(exprStr) {
  try {
    return acorn.parse(exprStr, { ecmaVersion: 'latest', sourceType: 'module' }).body[0]?.expression
  } catch {
    return null
  }
}

// 只取裸字符串字面量（array 元素/调用实参），跳过 ?:/&&/||/对象值等条件态分支 —— 供类名冲突去重用
function alwaysOnLiterals(exprStr) {
  const rootExpr = parseExpr(exprStr)
  if (!rootExpr) return []
  const out = []
  const isStr = (n) => n && n.type === 'Literal' && typeof n.value === 'string'
  function walk(node) {
    if (!node || typeof node !== 'object') return
    if (node.type === 'ArrayExpression') {
      for (const el of node.elements) if (isStr(el)) out.push(el.value)
      return
    }
    if (node.type === 'CallExpression') {
      for (const a of node.arguments) if (isStr(a)) out.push(a.value)
      return
    }
    if (node.type === 'ConditionalExpression' || node.type === 'LogicalExpression' || node.type === 'ObjectExpression') return
    for (const key of Object.keys(node)) {
      const v = node[key]
      if (v && typeof v === 'object' && v.type) walk(v)
      else if (Array.isArray(v)) for (const item of v) if (item && typeof item === 'object') walk(item)
    }
  }
  walk(rootExpr)
  return out
}

// 取所有字符串字面量（含条件态分支内）—— 供 canonical 建议用，覆盖三元/&& 里的类名
function allStringLiterals(exprStr) {
  const rootExpr = parseExpr(exprStr)
  if (!rootExpr) return []
  const out = []
  function walk(node) {
    if (!node || typeof node !== 'object') return
    if (node.type === 'Literal' && typeof node.value === 'string') {
      out.push(node.value)
      return
    }
    // :class="`static...${x}`" 里的静态段也当作类候选（动态 ${} 递归收集其字符串字面量）
    if (node.type === 'TemplateLiteral') {
      for (const q of node.quasis) if (typeof q.value.cooked === 'string') out.push(q.value.cooked)
      for (const e of node.expressions) walk(e)
      return
    }
    for (const key of Object.keys(node)) {
      const v = node[key]
      if (v && typeof v === 'object') walk(v)
      else if (Array.isArray(v)) for (const item of v) if (item && typeof item === 'object') walk(item)
    }
  }
  walk(rootExpr)
  return out
}

function captureBalanced(src, openIdx) {
  let depth = 0
  for (let i = openIdx; i < src.length; i++) {
    const ch = src[i]
    if (ch === '(') depth++
    else if (ch === ')') { depth--; if (depth === 0) return src.slice(openIdx, i + 1) }
  }
  return null
}

// literalFn 决定动态类取字面量的严格度：冲突检查用 alwaysOnLiterals，canonical 用 allStringLiterals
function collectClassLists(src, literalFn) {
  const lists = []
  let m
  const staticRe = /(?<![\w:-])class\s*=\s*"([^"]*)"/g
  while ((m = staticRe.exec(src))) lists.push({ text: m[1], at: m.index })
  const staticRe2 = /(?<![\w:-])class\s*=\s*'([^']*)'/g
  while ((m = staticRe2.exec(src))) lists.push({ text: m[1], at: m.index })
  const bindRe = /:class\s*=\s*"([^"]*)"/g
  while ((m = bindRe.exec(src))) { const l = literalFn(m[1]); if (l.length) lists.push({ text: l, at: m.index }) }
  const bindRe2 = /:class\s*=\s*'([^']*)'/g
  while ((m = bindRe2.exec(src))) { const l = literalFn(m[1]); if (l.length) lists.push({ text: l, at: m.index }) }
  const callRe = /\b(cn|clsx|classNames|classes)\s*\(/g
  while ((m = callRe.exec(src))) {
    const callText = captureBalanced(src, src.indexOf('(', m.index))
    if (!callText) continue
    const l = literalFn(callText)
    if (l.length) lists.push({ text: l, at: m.index })
  }
  return lists
}

function listTokens(list) {
  return typeof list.text === 'string'
    ? list.text.trim().split(/\s+/).filter(Boolean)
    : list.text.flatMap(t => t.trim().split(/\s+/).filter(Boolean))
}

function lineAt(src, index) {
  let line = 1
  for (let i = 0; i < index; i++) if (src[i] === '\n') line++
  return line
}

function scanClasses(file) {
  const src = fs.readFileSync(file, 'utf8')
  const findings = []
  for (const list of collectClassLists(src, alwaysOnLiterals)) {
    const tokens = listTokens(list)
    if (tokens.length < 2) continue
    const mergedTokens = twMerge(tokens).split(/\s+/).filter(Boolean)
    const removed = tokens.filter(t => !mergedTokens.includes(t))
    if (!removed.length) continue
    findings.push({
      line: lineAt(src, list.at),
      input: tokens.join(' '),
      merged: mergedTokens.join(' '),
      removed: removed.join(' '),
    })
  }
  return findings
}

// ============================================================
// 三、canonical 类建议 —— 复用 Tailwind 引擎 canonicalizeCandidates
//     与 IntelliSense 的 suggestCanonicalClasses 完全一致
// ============================================================
function buildDesignSystem() {
  const cssPath = path.join(ROOT, 'app', 'assets', 'css', 'main.css')
  // 相对 @import "./x.css" 先内联（resolver 按 base 解析、不是 css 所在目录），bare @import 保留
  const inlineLocal = (css, dir) => css.replace(/@import\s+["'](\.[^"']+\.css)["']\s*;/g, (_, rel) => {
    const p = path.resolve(dir, rel)
    if (!fs.existsSync(p)) return ''
    return inlineLocal(fs.readFileSync(p, 'utf8'), path.dirname(p))
  })
  const css = inlineLocal(fs.readFileSync(cssPath, 'utf8'), path.dirname(cssPath))
  return __unstable__loadDesignSystem(css, { base: ROOT })
}

const canonicalCache = new Map()
async function scanCanonical(file, ds) {
  const src = fs.readFileSync(file, 'utf8')
  const findings = []
  const seen = new Set()
  for (const list of collectClassLists(src, allStringLiterals)) {
    for (const t of listTokens(list)) {
      if (seen.has(t)) continue
      seen.add(t)
      let canon = canonicalCache.get(t)
      if (canon === undefined) {
        canon = ds.canonicalizeCandidates([t])[0] ?? t
        canonicalCache.set(t, canon)
      }
      if (canon !== t) findings.push({ line: lineAt(src, list.at), from: t, to: canon })
    }
  }
  return findings
}

// ============================================================
// 主流程
// ============================================================
async function main() {
  let errorCount = 0
  let warningCount = 0
  const report = []

  // ① CSS 指令
  const cssFiles = collectCss()
  for (const f of cssFiles) {
    const rel = path.relative(ROOT, f)
    const r = await scanCss(f)
    for (const e of r.errors) { errorCount++; report.push(`✗ 指令 ${rel}:${e.line ?? '?'}:${e.col ?? '?'} [${e.plugin}] ${e.text}`) }
    for (const w of r.warnings) { warningCount++; report.push(`⚠ 指令 ${rel}:${w.line ?? '?'}:${w.col ?? '?'} [${w.plugin}] ${w.text}`) }
  }

  // ② 类名冲突
  const vueFiles = collectVue(path.join(ROOT, 'app'))
  for (const f of vueFiles) {
    const rel = path.relative(ROOT, f)
    for (const c of scanClasses(f)) {
      errorCount++
      report.push(`✗ 类名 ${rel}:${c.line}`)
      report.push(`    输入:   "${c.input}"`)
      report.push(`    去重后: "${c.merged}"`)
      report.push(`    被覆盖/冗余: ${c.removed}`)
    }
  }

  // ③ canonical 建议（Tailwind 引擎，与扩展一致）
  let ds
  try {
    ds = await buildDesignSystem()
  } catch (e) {
    errorCount++
    report.push(`✗ canonical 引擎构建失败: ${e.message}`)
    ds = null
  }
  if (ds) {
    for (const f of vueFiles) {
      const rel = path.relative(ROOT, f)
      for (const cn of await scanCanonical(f, ds)) {
        warningCount++
        report.push(`⚠ 类名 ${rel}:${cn.line}  "${cn.from}" 建议改用 canonical "${cn.to}"`)
      }
    }
  }

  console.log(`🎨 Tailwind CSS 检查：${cssFiles.length} 个 CSS 文件 + ${vueFiles.length} 个 Vue 文件（①指令 ②类名冲突 ③canonical 建议）\n`)
  if (report.length) console.log(report.join('\n') + '\n')

  console.log('='.repeat(50))
  console.log(`📊 结果:  错误/冲突 ${errorCount} 处   警告 ${warningCount} 处`)
  if (errorCount === 0 && warningCount === 0) console.log('  ✅ 无 Tailwind 报错/警告/类名冲突')
  console.log('='.repeat(50))

  if (errorCount > 0) process.exitCode = 1
}

main().catch((e) => {
  console.error('❌ 扫描失败:', e.message)
  process.exit(1)
})
