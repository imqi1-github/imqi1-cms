import { getUser } from "#server/lib/auth";

export default defineEventHandler(async event => {
  const user = await getUser(event);

  if (!user) {
    return {
      user: null,
    };
  }

  return {
    user: {
      uid: user.uid,
      name: user.name,
      nickname: user.nickname,
      mail: user.mail,
      avatar: user.avatar,
      role: user.role,
    },
  };
});
