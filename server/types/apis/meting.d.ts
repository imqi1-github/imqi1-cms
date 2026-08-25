// Meting API 返回的歌曲数据结构
// 经 @meting/core 的 format(true) 归一化后，artist 恒为 string[]（net/qq/kuwo/kugou/baidu
// 各平台 provider 的 format() 都是 push 进数组），不存在裸字符串形态。
export interface MetingSong {
  name: string;
  artist: string[];
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
