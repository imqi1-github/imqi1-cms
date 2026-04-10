import Meting from '@meting/core';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);

  // 获取查询参数
  const type = (query.type as string) || 'playlist';
  const id = query.id as string;
  const server = query.server as string;
  const auth = query.auth as string;
  const format = query.format as string;
  const callback = query.callback as string;

  // 验证必要参数
  if (!id || !server) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing required parameters: id and server',
    });
  }

  // 验证 server 类型
  const validServers = ['netease', 'tencent', 'xiami', 'kugou', 'baidu', 'kuwo'];
  if (!validServers.includes(server)) {
    throw createError({
      statusCode: 400,
      statusMessage: `Invalid server. Must be one of: ${validServers.join(', ')}`,
    });
  }

  // 初始化 Meting 实例并启用格式化
  const api = new Meting(server).format(true);

  // 根据 type 处理不同的请求
  try {
    switch (type) {
      case 'playlist': {
        const data = await api.playlist(id);
        const songs = JSON.parse(data);
        const playlist = songs.map((song: any) => ({
          name: song.name,
          artist: Array.isArray(song.artist) ? song.artist.join('/') : song.artist,
          url: `/api/meting?server=${song.source}&type=url&id=${song.url_id}`,
          pic: `/api/meting?server=${song.source}&type=pic&id=${song.pic_id}`,
          lrc: `/api/meting?server=${song.source}&type=lrc&id=${song.lyric_id}`,
        }));

        return formatResponse(playlist, format, callback);
      }

      case 'song': {
        const data = await api.song(id);
        const songs = JSON.parse(data);
        const song = songs.map((s: any) => ({
          name: s.name,
          artist: Array.isArray(s.artist) ? s.artist.join('/') : s.artist,
          url: `/api/meting?server=${s.source}&type=url&id=${s.url_id}`,
          pic: `/api/meting?server=${s.source}&type=pic&id=${s.pic_id}`,
          lrc: `/api/meting?server=${s.source}&type=lrc&id=${s.lyric_id}`,
        }));

        return formatResponse(song, format, callback);
      }

      case 'url': {
        // 验证 auth（可选功能，根据需求启用）
        // if (!validateAuth(auth, server, type, id)) {
        //   throw createError({
        //     statusCode: 403,
        //     statusMessage: 'Invalid authentication',
        //   });
        // }

        const data = await api.url(id);
        const urlData = JSON.parse(data);
        return sendRedirect(event, urlData.url);
      }

      case 'pic': {
        // 验证 auth（可选功能，根据需求启用）
        // if (!validateAuth(auth, server, type, id)) {
        //   throw createError({
        //     statusCode: 403,
        //     statusMessage: 'Invalid authentication',
        //   });
        // }

        const data = await api.pic(id);
        const picData = JSON.parse(data);
        return sendRedirect(event, picData.url);
      }

      case 'lrc': {
        // 验证 auth（可选功能，根据需求启用）
        // if (!validateAuth(auth, server, type, id)) {
        //   throw createError({
        //     statusCode: 403,
        //     statusMessage: 'Invalid authentication',
        //   });
        // }

        const data = await api.lyric(id);
        const lyricData = JSON.parse(data);
        const lyrics = lyricData.lyric || '';

        // 设置纯文本响应
        setResponseHeader(event, 'content-type', 'text/plain; charset=utf-8');
        return lyrics;
      }

      case 'name': {
        const data = await api.song(id);
        const songs = JSON.parse(data);
        const songName = songs.map((s: any) => s.name).join('\n');

        setResponseHeader(event, 'content-type', 'text/plain; charset=utf-8');
        return songName;
      }

      case 'artist': {
        const data = await api.song(id);
        const songs = JSON.parse(data);
        const artistNames = songs
          .map((s: any) =>
            Array.isArray(s.artist) ? s.artist.join('/') : s.artist
          )
          .join('\n');

        setResponseHeader(event, 'content-type', 'text/plain; charset=utf-8');
        return artistNames;
      }

      default:
        throw createError({
          statusCode: 400,
          statusMessage: `Invalid type. Must be one of: playlist, song, url, pic, lrc, name, artist`,
        });
    }
  } catch (error: any) {
    throw createError({
      statusCode: 500,
      statusMessage: `Meting API error: ${error.message}`,
    });
  }
});

// 格式化响应（支持 JSON 和 JSONP）
function formatResponse(data: any, format: string | undefined, callback: string | undefined) {
  if (format === 'jsonp' && callback) {
    return `${callback}(${JSON.stringify(data)})`;
  }
  return data;
}

// 验证 auth（如果需要的话）
function validateAuth(auth: string, server: string, type: string, id: string): boolean {
  // 这里可以实现 HMAC SHA1 验证
  // 暂时返回 true，可以根据需求启用
  return true;
}
