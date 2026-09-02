// 底部悬浮进度工具（零依赖，纯 ANSI 转义）。
// 终端输出流末尾固定 N 行区域：
//   - 第 1 行：最近完成的上传文件（按终端宽度裁切，避免 wrap 造成残留）
//   - 第 2 行：进度条 bar（同样裁到宽度内）
// 上方日志照常滚动，进度块贴底原地刷新、不残留。
// 关键点：每次渲染前必须「\r 归零列 → 清整行 → 写文本」，且每条裁切到 ≤ 宽度，
// 否则短文本会留旧尾、长文本 wrap 会清行错位。
// TTY 下原地刷新；非 TTY（重定向/管道）逐行输出真实日志，避免刷出乱码。

const CSI = '\x1b['
const up = (n) => `${CSI}${n}A`       // 上移 n 行
const clearLine = `${CSI}2K`          // 清整行
const CR = '\r'                       // 光标归列 0

// 估算字符串显示宽度（2 列宽的东亚/全角/emoji 记为 2，其余 1）。
export function strWidth(s) {
  let w = 0
  for (const ch of s) {
    const cp = ch.codePointAt(0)
    if (
      (cp >= 0x1100 && cp <= 0x115F) ||
      (cp >= 0x2E80 && cp <= 0x303E) ||
      (cp >= 0x3041 && cp <= 0x33FF) ||
      (cp >= 0x3400 && cp <= 0x4DBF) ||
      (cp >= 0x4E00 && cp <= 0x9FFF) ||
      (cp >= 0xA000 && cp <= 0xA4CF) ||
      (cp >= 0xAC00 && cp <= 0xD7A3) ||
      (cp >= 0xF900 && cp <= 0xFAFF) ||
      (cp >= 0xFE30 && cp <= 0xFE4F) ||
      (cp >= 0xFF00 && cp <= 0xFF60) ||
      (cp >= 0xFFE0 && cp <= 0xFFE6) ||
      (cp >= 0x1F300 && cp <= 0x1FAFF) ||
      (cp >= 0x20000 && cp <= 0x2FFFD)
    ) w += 2
    else w += 1
  }
  return w
}

// 保留头 + 尾、中间省略号，裁到 maxWidth 内；超宽无非单字符时保证不 wrap。
export function fitWide(s, maxWidth) {
  if (maxWidth <= 0) return ''
  if (strWidth(s) <= maxWidth) return s
  const ell = '…'
  const avail = maxWidth - strWidth(ell)
  if (avail <= 0) return ell
  const chars = [...s]
  const half = Math.floor(avail / 2)
  let head = '', hw = 0
  for (const ch of chars) {
    const cw = strWidth(ch)
    if (hw + cw > half) break
    head += ch
    hw += cw
  }
  let tail = '', tw = 0
  for (let i = chars.length - 1; i >= 0; i--) {
    const cw = strWidth(chars[i])
    if (tw + cw > avail - hw) break
    tail = chars[i] + tail
    tw += cw
  }
  return head + ell + tail
}

// 进度条：▕████░░░▏ 完成/总数（含失败数）。长度严格 ≤ maxWidth，不经过 fitWide。
// barW = maxWidth − 标签宽 − 2（▕▏两列边框）。barW 过小则退化为纯标签并裁切。
export function progressBar(success, failed, total, maxWidth) {
  const done = success + failed
  const label = ` ${done}/${total}${failed ? ` 失败${failed}` : ''}`
  if (maxWidth <= 0 || !Number.isFinite(maxWidth)) {
    return fitWide(`${done}/${total}${failed ? ` 失败${failed}` : ''}`, 60)
  }
  const braceW = 2 // ▕ ▏ 两列
  let barW = maxWidth - strWidth(label) - braceW
  if (barW < 3) {
    // 空间不足，退化为纯标签并裁到宽度内
    return fitWide(label, maxWidth)
  }
  const pct = total > 0 ? Math.min(1, done / total) : 0
  const filled = Math.round(pct * barW)
  const bar = '█'.repeat(filled) + '░'.repeat(barW - filled)
  return `▕${bar}▏${label}`
}

export class ProgressConsole {
  #stream
  #lines
  #shown = false
  #top = ''
  #bar = null

  constructor(stream = process.stdout, lines = 2) {
    this.#stream = stream
    this.#lines = lines
  }

  get enabled() {
    return !!this.#stream.isTTY
  }

  // 安全列宽：多留 1 列，双宽字贴边也不 wrap；无宽度信息时用 80。
  #cols() {
    return Math.max(12, (this.#stream.columns || 80) - 1)
  }

  // 从「块底行行首」上移到「块顶行行首」，并归列 0。未显示时不动。
  #toTop() {
    if (this.#shown) this.#stream.write(up(this.#lines - 1))
    this.#stream.write(CR)
  }

  // 写入进度块（两行），结束光标停「块底行行首」。
  // 每行先 clearLine 再写，且宽度已裁，保证短文本不残留、长文本不 wrap。
  #render() {
    const col = this.#cols()
    const top = fitWide(this.#top, col)
    const bottom = this.#bar ? progressBar(this.#bar.success, this.#bar.failed, this.#bar.total, col) : ''
    const s = this.#stream
    this.#toTop()
    s.write(clearLine + top + '\n')
    s.write(CR + clearLine + bottom)
    this.#shown = true
  }

  // 刷新进度块。bar 形如 { success, failed, total }。
  update({ top, bar }) {
    if (!this.enabled) {
      if (top) this.#stream.write(top + '\n')
      return
    }
    if (top !== undefined) this.#top = top
    if (bar !== undefined) this.#bar = bar
    this.#render()
  }

  // 打印一条真正滚动到底部的日志，并让进度块重新贴底（清块 → 写日志 → 重显块）。
  log(line) {
    if (!this.enabled) {
      this.#stream.write(line + '\n')
      return
    }
    if (this.#shown) {
      // 清掉整块：从块顶行行首往下，逐行清，最后回到块上方一行行首
      this.#stream.write(up(this.#lines - 1) + CR)
      this.#stream.write((clearLine + CR + up(1)).repeat(this.#lines))
    }
    this.#stream.write(line + '\n')
    if (this.#shown) this.#render()
  }

  // 结束并清掉进度块，供结尾统计干净打印在其上方。
  end() {
    if (!this.enabled) return
    if (this.#shown) {
      this.#stream.write(up(this.#lines - 1) + CR)
      this.#stream.write((clearLine + CR + up(1)).repeat(this.#lines))
    }
    this.#shown = false
  }
}
