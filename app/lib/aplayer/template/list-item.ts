// 将 art-template 转换为 JavaScript 模板函数
import type { APlayerAudio } from '~/types/aplayer';

export default function (data: { theme: string; audio: APlayerAudio[]; index: number }): string {
  const { theme, audio, index } = data

  return audio.map((item, i) => `
    <li>
        <span class="aplayer-list-cur" style="background-color: ${item.theme || theme};"></span>
        <span class="aplayer-list-index">${i + index}</span>
        <span class="aplayer-list-title">${item.name}</span>
        <span class="aplayer-list-author">${item.artist}</span>
    </li>`).join('')
}
