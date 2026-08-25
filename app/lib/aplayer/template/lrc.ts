// 将 art-template 转换为 JavaScript 模板函数
import { escapeHtml } from '../utils';

import type { APlayerLrcData } from '~/types/aplayer';

export default function (data: APlayerLrcData): string {
  const { lyrics } = data

  return lyrics.map((item, i) => `
    <p${i === 0 ? ' class="aplayer-lrc-current"' : ''}>${escapeHtml(item[1])}</p>`).join('')
}
