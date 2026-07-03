// 小程序音乐接口：对接 @meting/core，取歌单/单曲第一首，
// 把 url/pic/lrc 全部在服务端解析为真实地址后返回，
// 使小程序端 innerAudioContext 拿到即可播放，无需再打 /api/meting 或跟随重定向。

import type { MetingSong } from "#server/types/apis/meting";
import type { MiniMusic, MiniMusicResponse } from "#server/types/apis/mini";

// 允许的音乐服务域名白名单（与 /api/meting 保持一致）
const ALLOWED_MEDIA_DOMAINS = [
  "music.126.net", // 网易云
  "qq.com", // 腾讯
  "kuwo.cn", // 酷我
  "kugou.com", // 酷狗
  "baidu.com", // 百度
  "xiami.com", // 虾米
];

function isAllowedMediaUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return ALLOWED_MEDIA_DOMAINS.some(domain => hostname === domain || hostname.endsWith("." + domain));
  } catch {
    return false;
  }
}

// 安全解析 JSON，失败返回 null（meting 各接口返回均为 JSON 字符串）
function safeParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export default defineEventHandler(async event => {
  setHeader(event, "Cache-Control", "public, max-age=300, s-maxage=300");

  const query = getQuery(event);
  const server = (query.server as string) || "netease";
  const type = (query.type as string) || "playlist";
  const id = query.id as string;

  if (!id) {
    throw createError({ statusCode: 400, message: "缺少必要参数 id" });
  }

  const validServers = ["netease", "tencent", "xiami", "kugou", "baidu", "kuwo"];
  if (!validServers.includes(server)) {
    throw createError({ statusCode: 400, message: `不支持的音乐平台：${server}` });
  }

  try {
    const { default: Meting } = await import("@meting/core");
    const api = new Meting(server).format(true);

    // 按类型取歌曲列表，只保留第一首
    const listRaw = type === "song" ? await api.song(id) : await api.playlist(id);
    const songs = safeParse<MetingSong[]>(listRaw);
    const first = songs?.[0];

    if (!first) {
      throw createError({ statusCode: 404, message: "未找到可播放的音乐" });
    }

    // 服务端解析真实音频 / 封面 / 歌词地址
    const [urlRaw, picRaw, lrcRaw] = await Promise.all([
      first.url_id ? api.url(first.url_id) : Promise.resolve(""),
      first.pic_id ? api.pic(first.pic_id) : Promise.resolve(""),
      first.lyric_id ? api.lyric(first.lyric_id) : Promise.resolve(""),
    ]);

    const urlData = safeParse<{ url?: string }>(urlRaw);
    const picData = safeParse<{ url?: string }>(picRaw);
    const lrcData = safeParse<{ lyric?: string }>(lrcRaw);

    const audioUrl = urlData?.url ?? "";
    if (!audioUrl || !isAllowedMediaUrl(audioUrl)) {
      throw createError({ statusCode: 404, message: "音频地址无效或不可用" });
    }

    const picUrl = picData?.url && isAllowedMediaUrl(picData.url) ? picData.url : "";

    const data: MiniMusic = {
      name: first.name,
      artist: Array.isArray(first.artist) ? first.artist.join("/") : first.artist,
      url: audioUrl,
      pic: picUrl,
      lrc: lrcData?.lyric ?? "",
    };

    return { success: true, data } satisfies MiniMusicResponse;
  } catch (error) {
    // 已带 statusCode 的错误原样抛出，其余归为 500
    if (typeof error === "object" && error !== null && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    throw createError({ statusCode: 500, message: "获取音乐失败" });
  }
});
