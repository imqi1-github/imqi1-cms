/**
 * 通过宝塔面板 API 重启 / 启动 / 停止服务器上的 Node 项目
 *
 * 用法：
 *   npm run restart:server            # 重启（默认）
 *   npm run restart:server -- start   # 启动
 *   npm run restart:server -- stop    # 停止
 *
 * 需在 .env 配置：
 *   BT_PANEL_URL     宝塔面板地址（含协议与端口），如 http://1.2.3.4:8888
 *   BT_API_KEY       宝塔接口密钥（面板 → API 接口 → 获取密钥）
 *   BT_PROJECT_NAME  宝塔「Node 项目管理器」里的项目名称
 *
 * 注意：
 *   - 宝塔 API 需在「API 接口」里开启，并把调用方（本机）公网 IP 加入 IP 白名单，否则请求会被拒绝。
 *   - 签名规则：request_token = md5(request_time + md5(api_key))
 *   - 接口：POST /mod/nodejs/com/set_project_status
 */
import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import dotenv from 'dotenv'

// 加载环境变量（锚定仓库根 .env，勿依赖调用 cwd——脚本可能从任意目录运行）
dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') })

const BT_PANEL_URL = process.env.BT_PANEL_URL
const BT_API_KEY = process.env.BT_API_KEY
const BT_PROJECT_NAME = process.env.BT_PROJECT_NAME

const missing = [
  ['BT_PANEL_URL', BT_PANEL_URL],
  ['BT_API_KEY', BT_API_KEY],
  ['BT_PROJECT_NAME', BT_PROJECT_NAME],
]
  .filter(([, v]) => !v)
  .map(([k]) => k)

if (missing.length > 0) {
  console.error('❌ 缺少环境变量，请在 .env 中配置：\n  ' + missing.join(', '))
  console.error('\n示例：')
  console.error('  BT_PANEL_URL=http://1.2.3.4:8888')
  console.error('  BT_API_KEY=你的宝塔接口密钥')
  console.error('  BT_PROJECT_NAME=宝塔Node项目名称')
  process.exit(1)
}

// 解析操作：start | stop | restart
const action = (process.argv[2] || 'restart').toLowerCase()
if (!['start', 'stop', 'restart'].includes(action)) {
  console.error('用法: npm run restart:server -- [start|stop|restart]')
  process.exit(1)
}

const panelUrl = BT_PANEL_URL.replace(/\/+$/, '')

// 生成签名：request_token = md5(request_time + md5(api_key))
const requestTime = Math.floor(Date.now() / 1000)
const requestToken = crypto
  .createHash('md5')
  .update(requestTime + crypto.createHash('md5').update(BT_API_KEY).digest('hex'))
  .digest('hex')

const form = new URLSearchParams({
  project_name: BT_PROJECT_NAME,
  project_type: 'general',
  status: action,
  request_time: String(requestTime),
  request_token: requestToken,
})

const label = { start: '启动', stop: '停止', restart: '重启' }[action]
console.log(`🔄 正在通过宝塔 API ${label}项目「${BT_PROJECT_NAME}」...`)

try {
  const res = await fetch(`${panelUrl}/mod/nodejs/com/set_project_status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  })

  const text = await res.text()
  let data
  try {
    data = JSON.parse(text)
  } catch {
    data = text
  }

  // 宝塔业务成功通常返回 { status: true, ... }；失败时 msg 有原因
  const btOk = typeof data === 'object' && data !== null && data.status === true

  if (res.ok && btOk) {
    console.log(`✅ ${label}成功`, typeof data === 'string' ? '' : `：${JSON.stringify(data)}`)
  } else {
    console.error(`⚠️  ${label}未成功（HTTP ${res.status}）：`)
    console.error(typeof data === 'string' ? data : JSON.stringify(data, null, 2))
    console.error('\n常见原因：未配置 IP 白名单、API 密钥错误、项目名不符、面板地址/端口不对。')
    process.exitCode = 1
  }
} catch (err) {
  console.error(`❌ 请求失败：${err.message}`)
  console.error('常见原因：面板地址/端口不对、网络不通、未配置 IP 白名单。')
  process.exitCode = 1
}
