/** session 中存储的用户信息 */
export interface SessionUser {
  uid: number;
  name: string;
  nickname: string | null;
  mail: string;
  avatar: string | null;
  role: number;
  authCode: string;
}
