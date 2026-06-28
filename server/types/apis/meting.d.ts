// Meting API 返回的歌曲数据结构
export interface MetingSong {
  name: string;
  artist: string | string[];
  source: string;
  url_id: string;
  pic_id: string;
  lyric_id: string;
}

// 格式化后的歌曲信息
export interface FormattedSong {
  name: string;
  artist: string;
  url: string;
  pic: string;
  lrc: string;
}
