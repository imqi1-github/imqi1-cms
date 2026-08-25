import type { APlayerOptions, ResolvedAPlayerOptions } from '~/types/aplayer';

export default (options: APlayerOptions): ResolvedAPlayerOptions => {
    // 需要明确的自有 container:不留全局 .aplayer 兜底(会抢走已存在实例的 DOM)
    if (!options.element && !options.container) {
        throw new Error('APlayer: container is required');
    }
    // default options
    const defaultOption = {
        container: options.element || options.container,
        mini: options.narrow || options.fixed || false,
        fixed: false,
        mutex: true,
        lrcType: options.showlrc || options.lrc || 0,
        preload: 'metadata',
        theme: '#3a3c42',
        loop: 'all',
        order: 'list',
        volume: 0.7,
        listFolded: options.fixed,
        listMaxHeight: options.listmaxheight || 260,
        audio: options.music || [],
        storageName: 'aplayer-setting',
    };
    for (const defaultKey in defaultOption) {
        if (Object.prototype.hasOwnProperty.call(defaultOption, defaultKey) && !Object.prototype.hasOwnProperty.call(options, defaultKey)) {
            (options as Record<string, unknown>)[defaultKey] = (defaultOption as Record<string, unknown>)[defaultKey];
        }
    }

    options.listMaxHeight = parseFloat(String(options.listMaxHeight));

    let audio = options.audio;
    if (!Array.isArray(audio)) {
        audio = audio ? [audio] : [];
    }
    audio = audio.map((item) => {
        item.name = item.name || item.title || 'Audio name';
        item.artist = item.artist || item.author || 'Audio artist';
        item.cover = item.cover || item.pic;
        item.type = item.type || 'auto'; // 无 type 给 'auto'，让 setAudio 的 m3u8/HLS 自动识别生效（勿强制 'normal' 跳过）
        return item;
    }).filter((item) => item.url); // 缺 url 的条目过滤,避免 <audio src="undefined">
    options.audio = audio;

    if (audio.length <= 1 && options.loop === 'one') {
        options.loop = 'all';
    }

    return options as ResolvedAPlayerOptions;
};
