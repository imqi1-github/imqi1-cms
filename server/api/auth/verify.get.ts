import { getUser } from "#server/lib/auth";
import { prisma } from "#server/utils/prisma";

/**
 * 验证当前会话是否有效
 * 用于检查是否在其他设备登录（单端登录）
 *
 * 顺带返回 hasUser（系统是否已存在可登录用户），供登录页判断是否展示
 * 「尚未创建管理员账户」首屏初始化提示。原独立的 /api/auth/status 探针接口
 * 已并入此处：本接口登录页 onMounted 本来就会调，合并后零新增请求。
 * 注意：hasUser 会随这个公开接口暴露给任何调用方——这在已上线的公网站点上
 * 并不构成额外风险（管理员存在是公开事实），换取的是少一个常驻探测端点。
 */
export default defineEventHandler(async event => {
  // 本接口返回当前会话对应用户的敏感信息（uid/mail 等），属 per-user GET，
  // 禁止代理/CDN 缓存，避免把某会话的用户数据伺给同址上的其他客户端。
  setResponseHeader(event, "Cache-Control", "no-store, no-cache, must-revalidate");

  const user = await getUser(event);

  if (!user) {
    // 未登录：查一次用户表，判断系统是否已初始化
    const userCount = await prisma.users.count();
    return {
      valid: false,
      message: "会话已失效，可能已在其他设备登录",
      user: null,
      hasUser: userCount > 0,
    };
  }

  return {
    valid: true,
    user: {
      uid: user.uid,
      name: user.name,
      nickname: user.nickname,
      mail: user.mail,
      avatar: user.avatar,
    },
    // 已登录必然存在用户，字面量 true 免查询；同时让两分支 shape 一致，
    // 前端类型推断不会出现联合歧义
    hasUser: true,
  };
});
