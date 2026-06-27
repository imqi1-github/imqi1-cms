import { prisma } from "#server/utils/prisma";
import { getUser } from "#server/lib/auth";
import { validateUserData } from "#server/utils/validation";
import { validateCsrfToken } from "#server/utils/csrf";

export default defineEventHandler(async event => {
  // 验证用户登录
  const user = await getUser(event);

  if (!user) {
    throw createError({
      statusCode: 401,
      message: "请先登录",
    });
  }

  const id = getRouterParam(event, "id");
  if (!id) {
    throw createError({
      statusCode: 400,
      message: "缺少用户 ID",
    });
  }

  const body = await readBody(event);
  const { csrfToken, ...updateBody } = body;

  // CSRF 验证
  if (!validateCsrfToken(event, csrfToken)) {
    throw createError({
      statusCode: 403,
      message: "CSRF token 验证失败，请刷新页面重试",
    });
  }

  const { name, nickname, mail, password, avatar, role } = updateBody;

  if (!name || !mail) {
    throw createError({
      statusCode: 400,
      message: "用户名和邮箱不能为空",
    });
  }

  // 验证字段长度
  validateUserData({ name, mail, nickname, avatar });

  try {
    // 检查用户是否存在
    const existingUser = await prisma.users.findUnique({
      where: { uid: Number(id) },
    });

    if (!existingUser) {
      throw createError({
        statusCode: 404,
        message: "用户不存在",
      });
    }

    // 检查邮箱是否被其他用户占用
    const mailUser = await prisma.users.findUnique({
      where: { mail },
    });

    if (mailUser && mailUser.uid !== Number(id)) {
      throw createError({
        statusCode: 400,
        message: "邮箱已被其他用户使用",
      });
    }

    // 检查用户名是否被其他用户占用
    const nameUser = await prisma.users.findUnique({
      where: { name },
    });

    if (nameUser && nameUser.uid !== Number(id)) {
      throw createError({
        statusCode: 400,
        message: "用户名已被其他用户使用",
      });
    }

    // 构建更新数据
    const updateData: any = {
      name,
      nickname: nickname || null,
      mail,
      avatar: avatar || null,
      role: role !== undefined ? Number(role) : existingUser.role,
    };

    // 如果提供了新密码，则更新密码
    if (password && password.trim() !== "") {
      const { default: bcrypt } = await import("bcryptjs");
      updateData.password = await bcrypt.hash(password, 10);
    }

    // 更新用户
    const updatedUser = await prisma.users.update({
      where: { uid: Number(id) },
      data: updateData,
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

    return {
      success: true,
      data: updatedUser,
    };
  } catch (error: any) {
    console.error(error);
    if (error.statusCode === 404 || error.statusCode === 400) {
      throw error;
    }
    throw createError({
      statusCode: 500,
      message: "更新用户失败",
    });
  }
});
