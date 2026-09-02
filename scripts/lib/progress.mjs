// 单行区域进度刷新工具（零依赖，纯 ANSI 转义）。
// 维护一个固定 2 行的区域：第 1 行显示最近完成的上传文件，第 2 行显示进度计数。
// TTY 下原地刷新；非 TTY（重定向/管道）退化为每行一条，避免刷出乱码。
export class ProgressConsole {
  #stream
  #lines = 2
  #printed = false
  #top = ''
  #bottom = ''

  constructor(stream = process.stdout) {
    this.#stream = stream
  }

  // 是否启用原地刷新（stdout 指向终端才启用；重定向到文件/管道时禁用）
  get enabled() {
    return !!this.#stream.isTTY
  }

  // 上移 #lines 行并逐行清空 → 回到进度区域起点
  #clear() {
    const s = this.#stream
    for (let i = 0; i < this.#lines; i++) {
      s.write('\x1b[1A\x1b[2K')
    }
  }

  // 刷新进度区域。top = 最近完成文件行，bottom = 进度计数行。
  // 首次写入两行，之后每次先清掉旧两行再重写，光标停在 bottom 行首以便下次覆盖。
  update({ top, bottom }) {
    if (!this.enabled) {
      if (bottom) this.#stream.write(bottom + '\n')
      return
    }
    if (top !== undefined) this.#top = top
    if (bottom !== undefined) this.#bottom = bottom
    const s = this.#stream
    if (this.#printed) this.#clear()
    s.write(this.#top + '\n' + this.#bottom + '\n')
    s.write('\x1b[1A')
    this.#printed = true
  }

  // 打印一条真正滚动到底部的日志（开场信息、最终统计、警告等）。
  // 先清掉进度区域再打印，避免残留；之后进度区域标记为未打印，下次 update 重新起两行。
  log(line) {
    if (this.enabled && this.#printed) this.#clear()
    this.#stream.write(line + '\n')
    this.#printed = false
  }
}

// 进度计数文案：完成数/总数，含失败数。
export function progressText(success, failed, total) {
  const done = success + failed
  const failedText = failed > 0 ? `，失败 ${failed}` : ''
  return `[进度 ${done}/${total}${failedText}]`
}
