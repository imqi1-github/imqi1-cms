import { clearSession } from "#server/lib/auth";

export default defineEventHandler(async event => {
  clearSession(event);

  return {
    success: true,
  };
});
