// 将 art-template 转换为 JavaScript 模板函数
import { escapeHtml } from '../utils';

import type { APlayerListItemData } from '~/types/aplayer';

export default function (data: APlayerListItemData): string {
  const { theme, audio, index } = data

  return audio.map((item, i) => `
    <li>
        <span class="aplayer-list-cur" style="background-color: ${escapeHtml(item.theme || theme)};"></span>
        <span class="aplayer-list-index">${i + index}</span>
        <span class="aplayer-list-title">${escapeHtml(item.name)}</span>
        <span class="aplayer-list-author">${escapeHtml(item.artist)}</span>
    </li>`).join('')
}
