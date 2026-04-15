import { clearSession } from "#server/lib/auth";

export default defineEventHandler(async event => {
  await clearSession(event);

  return {
    success: true,
  };
});
