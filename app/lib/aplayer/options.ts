import type { APlayerOptions, ResolvedAPlayerOptions } from '~/types/aplayer';

export default (options: APlayerOptions): ResolvedAPlayerOptions => {
    // default options
    const defaultOption = {
        container: options.element || document.getElementsByClassName('aplayer')[0] as HTMLElement,
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
    audio.map((item) => {
        item.name = item.name || item.title || 'Audio name';
        item.artist = item.artist || item.author || 'Audio artist';
        item.cover = item.cover || item.pic;
        item.type = item.type || 'normal';
        return item;
    });
    options.audio = audio;

    if (audio.length <= 1 && options.loop === 'one') {
        options.loop = 'all';
    }

    return options as ResolvedAPlayerOptions;
};
