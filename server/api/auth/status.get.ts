import { prisma } from "#server/utils/prisma";

export default defineEventHandler(async () => {
  const count = await prisma.users.count();
  return { hasUser: count > 0 };
});
