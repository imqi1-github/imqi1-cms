// 小程序音乐接口：对接 @meting/core，解析歌单/单曲的全部歌曲，
// 把每首的 url/pic/lrc 都在服务端解析为真实地址后返回，
// 使小程序端 innerAudioContext 拿到即可播放，无需再打 /api/meting 或跟随重定向。

import type { MetingSong } from "#server/types/apis/meting";
import type { MiniMusic, MiniMusicResponse } from "#server/types/apis/mini";
import { toHttps } from "#server/utils/mini";

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

// 单个歌单最多解析的歌曲数：逐首解析 url/pic/lyric 均需请求上游，
// 上限兼顾接口耗时与端上列表长度。
const MAX_SONGS = 50;

// 并发解析的批次大小：每批最多发起 RESOLVE_BATCH * 3 个上游请求。
// 避免一次性 50 首 × 3 个接口 = 150 个并发上游请求，
// 触发音乐服务商限流/封 IP，同时拖慢单次响应。
const RESOLVE_BATCH = 5;

// 解析单首歌曲的真实 url/pic/lrc；音频地址无效则返回 null（该首丢弃）。
async function resolveSong(
  api: { url: (id: string) => Promise<string>; pic: (id: string) => Promise<string>; lyric: (id: string) => Promise<string> },
  song: MetingSong,
): Promise<MiniMusic | null> {
  const [urlRaw, picRaw, lrcRaw] = await Promise.all([
    song.url_id ? api.url(song.url_id) : Promise.resolve(""),
    song.pic_id ? api.pic(song.pic_id) : Promise.resolve(""),
    song.lyric_id ? api.lyric(song.lyric_id) : Promise.resolve(""),
  ]);

  const urlData = safeParse<{ url?: string }>(urlRaw);
  const picData = safeParse<{ url?: string }>(picRaw);
  const lrcData = safeParse<{ lyric?: string }>(lrcRaw);

  const audioUrl = urlData?.url ?? "";
  // 音频地址无效（未授权/下架/非白名单域名）时丢弃该首，不影响其余歌曲。
  if (!audioUrl || !isAllowedMediaUrl(audioUrl)) {
    return null;
  }

  const picUrl = picData?.url && isAllowedMediaUrl(picData.url) ? picData.url : "";

  return {
    name: song.name,
    artist: Array.isArray(song.artist) ? song.artist.join("/") : song.artist,
    // url/pic 统一升级到 https，规避 CSP / 混合内容拦截。
    url: toHttps(audioUrl),
    pic: picUrl ? toHttps(picUrl) : "",
    lrc: lrcData?.lyric ?? "",
  };
}

export default defineEventHandler(async event => {
  setHeader(event, "Cache-Control", "public, max-age=300, s-maxage=300");

  const query = getQuery(event);

  // getQuery 对重复参数会返回数组，这里强制按字符串处理，缺省走后端默认。
  const server = typeof query.server === "string" && query.server ? query.server : "netease";
  const type = typeof query.type === "string" && query.type ? query.type : "playlist";
  const id = query.id;

  // id 必须是字符串，防止数组/对象等异常值被传给上游。
  if (typeof id !== "string" || id.length === 0) {
    throw createError({ statusCode: 400, message: "缺少必要参数 id" });
  }

  const validServers = ["netease", "tencent", "xiami", "kugou", "baidu", "kuwo"];
  if (!validServers.includes(server)) {
    throw createError({ statusCode: 400, message: `不支持的音乐平台：${server}` });
  }

  // 仅支持单曲/歌单两类（与本接口响应契约一致）；其他类型报 400，
  // 而不是静默按歌单解析导致返回与请求不符的数据。
  const validTypes = ["playlist", "song"];
  if (!validTypes.includes(type)) {
    throw createError({ statusCode: 400, message: `不支持的音乐类型：${type}` });
  }

  try {
    const { default: Meting } = await import("@meting/core");
    const api = new Meting(server).format(true);

    // 按类型取歌曲列表：单曲仅一首，歌单取全部并截断到上限。
    const listRaw = type === "song" ? await api.song(id) : await api.playlist(id);
    const songs = safeParse<MetingSong[]>(listRaw);

    // meting 异常时可能返回非数组，先判数组再判空，避免 .slice 抛 TypeError。
    if (!Array.isArray(songs) || songs.length === 0) {
      throw createError({ statusCode: 404, message: "未找到可播放的音乐" });
    }

    // 分批并发解析真实地址（保留原始顺序），丢弃无法播放的歌曲。
    const toResolve = songs.slice(0, MAX_SONGS);
    const resolved: (MiniMusic | null)[] = [];
    for (let i = 0; i < toResolve.length; i += RESOLVE_BATCH) {
      const batch = toResolve.slice(i, i + RESOLVE_BATCH);
      const batchResolved = await Promise.all(batch.map(song => resolveSong(api, song)));
      resolved.push(...batchResolved);
    }
    const list = resolved.filter((item): item is MiniMusic => item !== null);

    const [first] = list;
    if (!first) {
      throw createError({ statusCode: 404, message: "歌单内无可播放的音乐" });
    }

    // data 保留第一首以兼容旧端；list 为完整歌单。
    return { success: true, data: first, list } satisfies MiniMusicResponse;
  } catch (error) {
    // 已带 statusCode 的错误原样抛出，其余归为 500
    if (typeof error === "object" && error !== null && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    throw createError({ statusCode: 500, message: "获取音乐失败" });
  }
});
