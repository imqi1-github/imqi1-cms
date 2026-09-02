// 底部悬浮进度工具（零依赖，纯 ANSI 转义）。
// 维护一个固定 N 行、始终位于**终端输出流末尾**的区域：
//   - 第 1 行：最近完成的上传文件
//   - 第 2 行：进度计数（完成/总数 + 失败数）
// 上方日志照常滚动，进度块作为流的最后几行原地刷新、停留贴底、不残留。
// TTY 下原地刷新；非 TTY（重定向/管道）退化为逐行真实日志，避免刷出乱码。

const CSI = '\x1b['
const up = (n) => `${CSI}${n}A`   // 上移 n 行
const clearLine = `${CSI}2K`      // 清整行

export class ProgressConsole {
  #stream
  #lines
  #shown = false
  #top = ''
  #bottom = ''

  constructor(stream = process.stdout, lines = 2) {
    this.#stream = stream
    this.#lines = lines
  }

  // stdout 指向终端才启用原地刷新；重定向到文件/管道时禁用
  get enabled() {
    return !!this.#stream.isTTY
  }

  // 光标当前在进度块最后一行行首时，上移 (lines-1) 行回到进度块第一行行首。
  // 每步先清当前行再上移，顺带把下方向上收拢，避免残留。首次（未 shown）不做任何事。
  #home() {
    if (!this.#shown) return
    this.#stream.write((clearLine + up(1)).repeat(this.#lines - 1))
  }

  // 从进度块第一行行首开始，清掉整块（lines 行），结束时光标移到进度块上方一行行首。
  #clearBlock() {
    this.#stream.write((clearLine + up(1)).repeat(this.#lines))
  }

  // 写入进度块两行并让光标停在最后一行行首（进入时须已 home：光标位于进度块第一行行首）。
  #render() {
    const content = this.#top + '\n' + this.#bottom
    this.#stream.write(content + '\n' + up(1))
    this.#shown = true
  }

  // 刷新进度块。进入时光标在"进度块末行行首"（shown）或"流末尾"（!shown = 即为进度块第一行行首）。
  update({ top, bottom }) {
    if (!this.enabled) {
      if (bottom) this.#stream.write(bottom + '\n')
      return
    }
    if (top !== undefined) this.#top = top
    if (bottom !== undefined) this.#bottom = bottom

    this.#home()   // shown → 光标回进度块第一行行首；!shown → 已在此处，无需移动
    this.#render() // 重写进度块，光标停在最后一行行首
  }

  // 打印一条真正滚动到底部的日志，并让进度块继续保持贴底（清掉 → 写日志 → 重显进度块）。
  log(line) {
    if (!this.enabled) {
      this.#stream.write(line + '\n')
      return
    }
    if (this.#shown) this.#clearBlock()
    this.#stream.write(line + '\n')
    if (this.#shown) this.#render()
  }

  // 明确结束进度块（清掉整块），用于上传循环结束后不再需要进度、准备打印统计。
  end() {
    if (!this.enabled) return
    if (this.#shown) this.#clearBlock()
    this.#shown = false
  }
}

// 进度计数文案：完成数/总数，含失败数。
export function progressText(success, failed, total) {
  const done = success + failed
  const failedText = failed > 0 ? `，失败 ${failed}` : ''
  return `[进度 ${done}/${total}${failedText}]`
}
