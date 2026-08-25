/**
 * 通过宝塔面板 API 清空 Redis 数据库（清缓存）
 *
 * 用法：
 *   bun run clear:redis
 *
 * 需在 .env 配置：
 *   BT_PANEL_URL     宝塔面板地址（含协议与端口），如 http://1.2.3.4:8888
 *   BT_API_KEY       宝塔接口密钥（面板 → API 接口 → 获取密钥）
 *   BT_PROJECT_NAME  宝塔「Node 项目管理器」里的项目名称
 *
 * 注意：
 *   - 宝塔 API 需在「API 接口」里开启，并把调用方（本机）公网 IP 加入 IP 白名单，否则请求会被拒绝。
 *   - 签名规则：request_token = md5(request_time + md5(api_key))
 *   - 接口：POST /database/redis/clear_flushdb
 *   - 该接口会清空 Redis 全部 16 个 DB（0-15），请勿在生产随意执行。
 */
import crypto from 'node:crypto'

import dotenv from 'dotenv'

dotenv.config()

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

const panelUrl = BT_PANEL_URL.replace(/\/+$/, '')

// 生成签名：request_token = md5(request_time + md5(api_key))
const requestTime = Math.floor(Date.now() / 1000)
const requestToken = crypto
  .createHash('md5')
  .update(requestTime + crypto.createHash('md5').update(BT_API_KEY).digest('hex'))
  .digest('hex')

const form = new URLSearchParams()

form.append(
  'data',
  JSON.stringify({
    ids: '[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15]',
    sid: 0,
  })
)

form.append('request_time', String(requestTime))
form.append('request_token', requestToken)

console.log(`🔄 正在通过宝塔 API 清空 Redis 数据库...`)

try {
  const res = await fetch(`${panelUrl}/database/redis/clear_flushdb`, {
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
  const btOk = data.status === true

  if (res.ok && btOk) {
    console.log(`✅ 清空 Redis 数据库成功`, typeof data === 'string' ? '' : `：${JSON.stringify(data)}`)
  } else {
    console.error(`⚠️  清空 Redis 数据库未成功（HTTP ${res.status}）：`)
    console.error(typeof data === 'string' ? data : JSON.stringify(data, null, 2))
    console.error('\n常见原因：未配置 IP 白名单、API 密钥错误、项目名不符、面板地址/端口不对。')
    process.exitCode = 1
  }
} catch (err) {
  console.error(`❌ 请求失败：${err.message}`)
  console.error('常见原因：面板地址/端口不对、网络不通、未配置 IP 白名单。')
  process.exitCode = 1
}
