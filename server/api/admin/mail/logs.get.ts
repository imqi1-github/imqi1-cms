import { getRecentLogs } from '#server/utils/mail'

export default defineEventHandler(async () => {
  try {
    const logs = getRecentLogs(50)
    return { success: true, logs }
  } catch (error) {
    return { success: true, logs: [] }
  }
})
