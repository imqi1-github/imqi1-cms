// @meting/core 仅在请求到达时动态加载，避免冷启动时拉入
// （仅在 /api/meting 路由内部使用）

import type { MetingSong, FormattedSong } from "#server/types/apis/meting";

// 允许的音乐服务域名白名单
const ALLOWED_REDIRECT_DOMAINS = [
  "music.126.net", // 网易云
  "qq.com", // 腾讯
  "kuwo.cn", // 酷我
  "kugou.com", // 酷狗
  "baidu.com", // 百度
  "xiami.com", // 虾米（已停止服务，但保留）
];

// 验证重定向 URL 是否安全
function validateRedirectUrl(url: string): boolean {
  try {
    const urlObj = new URL(url);
    // 检查域名是否在白名单中
    return ALLOWED_REDIRECT_DOMAINS.some(domain => urlObj.hostname === domain || urlObj.hostname.endsWith("." + domain));
  } catch (error) {
    console.error(error);
    return false;
  }
}

// 验证 JSONP callback 参数（防止 XSS）
function validateCallback(callback: string): boolean {
  // 只允许字母、数字、下划线、美元符号，且必须以字母或下划线开头
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(callback);
}

export default defineEventHandler(async event => {
  const query = getQuery(event);

  // 获取查询参数
  const type = (query.type as string) || "playlist";
  const id = query.id as string;
  const server = query.server as string;

  const format = query.format as string;
  const callback = query.callback as string;

  // 验证必要参数
  if (!id || !server) {
    throw createError({
      statusCode: 400,
      statusMessage: "Missing required parameters: id and server",
    });
  }

  // 验证 server 类型
  const validServers = ["netease", "tencent", "xiami", "kugou", "baidu", "kuwo"];
  if (!validServers.includes(server)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid server. Must be one of: ${validServers.join(", ")}`,
    });
  }

  // 验证 callback 参数（如果使用 JSONP）
  if (format === "jsonp" && callback && !validateCallback(callback)) {
    throw createError({
      statusCode: 400,
      statusMessage: "Invalid callback parameter. Only alphanumeric characters, $, and _ are allowed.",
    });
  }

  // 初始化 Meting 实例并启用格式化
  const { default: Meting } = await import("@meting/core");
  const api = new Meting(server).format(true);

  // 根据 type 处理不同的请求
  try {
    switch (type) {
      case "playlist": {
        const data = await api.playlist(id);
        let songs;
        try {
          songs = JSON.parse(data);
        } catch (error) {
          console.error(error);
          throw createError({
            statusCode: 500,
            statusMessage: "Failed to parse music API response",
          });
        }
        const playlist = songs.map((song: MetingSong) => ({
          name: song.name,
          artist: Array.isArray(song.artist) ? song.artist.join("/") : song.artist,
          url: `/api/meting?server=${song.source}&type=url&id=${song.url_id}`,
          pic: `/api/meting?server=${song.source}&type=pic&id=${song.pic_id}`,
          lrc: `/api/meting?server=${song.source}&type=lrc&id=${song.lyric_id}`,
        }));

        return formatResponse(playlist, format, callback);
      }

      case "song": {
        const data = await api.song(id);
        let songs;
        try {
          songs = JSON.parse(data);
        } catch (error) {
          console.error(error);
          throw createError({
            statusCode: 500,
            statusMessage: "Failed to parse music API response",
          });
        }
        const song = songs.map((s: MetingSong) => ({
          name: s.name,
          artist: Array.isArray(s.artist) ? s.artist.join("/") : s.artist,
          url: `/api/meting?server=${s.source}&type=url&id=${s.url_id}`,
          pic: `/api/meting?server=${s.source}&type=pic&id=${s.pic_id}`,
          lrc: `/api/meting?server=${s.source}&type=lrc&id=${s.lyric_id}`,
        }));

        return formatResponse(song, format, callback);
      }

      case "url": {
        const data = await api.url(id);
        let urlData;
        try {
          urlData = JSON.parse(data);
        } catch (error) {
          console.error(error);
          throw createError({
            statusCode: 500,
            statusMessage: "Failed to parse music API response",
          });
        }

        // 验证重定向 URL 是否在白名单中
        if (!validateRedirectUrl(urlData.url)) {
          throw createError({
            statusCode: 400,
            statusMessage: "Invalid redirect URL",
          });
        }

        return sendRedirect(event, urlData.url);
      }

      case "pic": {
        const data = await api.pic(id);
        let picData;
        try {
          picData = JSON.parse(data);
        } catch (error) {
          console.error(error);
          throw createError({
            statusCode: 500,
            statusMessage: "Failed to parse music API response",
          });
        }

        // 验证重定向 URL 是否在白名单中
        if (!validateRedirectUrl(picData.url)) {
          throw createError({
            statusCode: 400,
            statusMessage: "Invalid redirect URL",
          });
        }

        return sendRedirect(event, picData.url);
      }

      case "lrc": {
        const data = await api.lyric(id);
        let lyricData;
        try {
          lyricData = JSON.parse(data);
        } catch (error) {
          console.error(error);
          throw createError({
            statusCode: 500,
            statusMessage: "Failed to parse music API response",
          });
        }
        const lyrics = lyricData.lyric || "";

        // 设置纯文本响应
        setResponseHeader(event, "content-type", "text/plain; charset=utf-8");
        return lyrics;
      }

      case "name": {
        const data = await api.song(id);
        let songs;
        try {
          songs = JSON.parse(data);
        } catch (error) {
          console.error(error);
          throw createError({
            statusCode: 500,
            statusMessage: "Failed to parse music API response",
          });
        }
        const songName = songs.map((s: MetingSong) => s.name).join("\n");

        setResponseHeader(event, "content-type", "text/plain; charset=utf-8");
        return songName;
      }

      case "artist": {
        const data = await api.song(id);
        let songs;
        try {
          songs = JSON.parse(data);
        } catch (error) {
          console.error(error);
          throw createError({
            statusCode: 500,
            statusMessage: "Failed to parse music API response",
          });
        }
        const artistNames = songs.map((s: MetingSong) => (Array.isArray(s.artist) ? s.artist.join("/") : s.artist)).join("\n");

        setResponseHeader(event, "content-type", "text/plain; charset=utf-8");
        return artistNames;
      }

      default:
        throw createError({
          statusCode: 400,
          statusMessage: `Invalid type. Must be one of: playlist, song, url, pic, lrc, name, artist`,
        });
    }
  } catch (error) {
    console.error(error);

    // 如果是我们已经处理过的错误，直接抛出
    if (typeof error === "object" && error !== null && "statusCode" in error) {
      throw error;
    }
    // 其他未知错误
    throw createError({
      statusCode: 500,
      statusMessage: `Meting API error: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
});

// 格式化响应（支持 JSON 和 JSONP）
function formatResponse(data: FormattedSong[], format: string | undefined, callback: string | undefined) {
  if (format === "jsonp" && callback) {
    return `${callback}(${JSON.stringify(data)})`;
  }
  return data;
}
