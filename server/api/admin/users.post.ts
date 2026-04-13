import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
import * as bcrypt from "bcryptjs";

export default defineEventHandler(async event => {
  // 验证用户登录
  const user = await getUser(event);

  if (!user) {
    throw createError({
      statusCode: 401,
      message: "请先登录",
    });
  }

  const body = await readBody(event);
  const { name, nickname, mail, password, role } = body;

  if (!name || !mail || !password) {
    throw createError({
      statusCode: 400,
      message: "用户名、邮箱和密码不能为空",
    });
  }

  try {
    // 检查邮箱是否已被使用
    const existingMail = await prisma.user.findUnique({
      where: { mail },
    });

    if (existingMail) {
      throw createError({
        statusCode: 400,
        message: "邮箱已被使用",
      });
    }

    // 检查用户名是否已被使用
    const existingName = await prisma.user.findUnique({
      where: { name },
    });

    if (existingName) {
      throw createError({
        statusCode: 400,
        message: "用户名已被使用",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await prisma.user.create({
      data: {
        name,
        nickname: nickname || null,
        mail,
        password: hashedPassword,
        role: role !== undefined ? Number(role) : 0,
      },
      select: {
        uid: true,
        name: true,
        nickname: true,
        mail: true,
        avatar: true,
        role: true,
        create: true,
      },
    });
    return newUser;
  } catch (error: any) {
    if (error.statusCode === 400) {
      throw error;
    }
    throw createError({
      statusCode: 500,
      message: "创建用户失败",
    });
  }
});
