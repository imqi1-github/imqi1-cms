// 将 art-template 转换为 JavaScript 模板函数
export default function (data) {
  const { lyrics } = data

  return lyrics.map((item, i) => `
    <p${i === 0 ? ' class="aplayer-lrc-current"' : ''}>${item[1]}</p>`).join('')
}
