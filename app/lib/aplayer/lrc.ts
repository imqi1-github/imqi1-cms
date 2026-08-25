import tplLrc from './template/lrc';
import type APlayer from './player';

import type { APlayerLrcOptions, LrcLine } from '~/types/aplayer';

class Lrc {
    container: HTMLElement;

    async: boolean;

    player: APlayer;

    parsed: LrcLine[][];

    /** 各曲目是否正在异步加载(仅 async;避免占位符堵死缓存/重复发请求) */
    loading: boolean[];

    /** 当前在途歌词 XHR —— destroy 时 abort,防销毁后回写 DOM */
    pendingXhr?: XMLHttpRequest;

    index: number;

    current: LrcLine[];

    constructor(options: APlayerLrcOptions) {
        this.container = options.container;
        this.async = options.async;
        this.player = options.player;
        this.parsed = [];
        this.loading = [];
        this.index = 0;
        this.current = [];
    }

    show() {
        this.player.events.trigger('lrcshow');
        this.player.template.lrcWrap.classList.remove('aplayer-lrc-hide');
    }

    hide() {
        this.player.events.trigger('lrchide');
        this.player.template.lrcWrap.classList.add('aplayer-lrc-hide');
    }

    toggle() {
        if (this.player.template.lrcWrap.classList.contains('aplayer-lrc-hide')) {
            this.show();
        } else {
            this.hide();
        }
    }

    update(currentTime: number = this.player.audio.currentTime) {
        if (this.index > this.current.length - 1 || currentTime < this.current[this.index]![0] || (!this.current[this.index + 1] || currentTime >= this.current[this.index + 1]![0])) {
            for (let i = 0; i < this.current.length; i++) {
                if (currentTime >= this.current[i]![0] && (!this.current[i + 1] || currentTime < this.current[i + 1]![0])) {
                    this.index = i;
                    this.container.style.transform = `translateY(${-this.index * 18}px)`;
                    this.container.style.webkitTransform = `translateY(${-this.index * 18}px)`;
                    this.container.getElementsByClassName('aplayer-lrc-current')[0]?.classList.remove('aplayer-lrc-current');
                    this.container.getElementsByTagName('p')[i]?.classList.add('aplayer-lrc-current');
                }
            }
        }
    }

    /** 渲染指定曲目歌词于容器;未缓存时显示 Loading 占位(占位不写入缓存) */
    private render(index: number) {
        const lines: LrcLine[] = this.parsed[index] || ([[0, 'Loading']] as LrcLine[]);
        this.container.innerHTML = tplLrc({ lyrics: lines });
        this.current = lines;
        this.update(0);
    }

    switch(index: number) {
        if (this.async) {
            if (!this.parsed[index]) {
                if (this.loading[index]) {
                    // 已在加载:仅渲染 Loading,不重复发请求
                    this.render(index);
                    return;
                }
                const apiurl = this.player.list.audios[index]!.lrc;
                if (!apiurl) {
                    // 无歌词:不入加载态
                    this.parsed[index] = [[0, 'Not available']] as LrcLine[];
                    this.render(index);
                    return;
                }
                this.loading[index] = true;
                this.render(index); // 立即显示 Loading
                const xhr = new XMLHttpRequest();
                this.pendingXhr = xhr;
                xhr.onreadystatechange = () => {
                    // 只处理完成态：state 1→3 时 readyState 非 4、responseText 未就绪、status 仍为 0，
                    // 若都当成最终结果会闪 'Not available'/空 并提前清 loading 破坏去重
                    if (xhr.readyState !== 4) {
                        return;
                    }
                    this.pendingXhr = undefined;
                    this.loading[index] = false;
                    this.parsed[index] = ((xhr.status >= 200 && xhr.status < 300) || xhr.status === 304) ? this.parse(xhr.responseText) : ([[0, 'Not available']] as LrcLine[]);
                    // 真实结果始终落缓存(切回可直接命中);仅当前曲才刷 DOM(避免写已释放/被切走容器)
                    if (index === this.player.list.index) {
                        this.render(index);
                    }
                };
                xhr.onerror = () => {
                    this.pendingXhr = undefined;
                    this.loading[index] = false;
                    this.parsed[index] = [[0, 'Not available']] as LrcLine[];
                    if (index === this.player.list.index) {
                        this.render(index);
                    }
                };
                xhr.open('get', apiurl, true);
                xhr.send(null);
            } else {
                this.render(index);
            }
        } else {
            if (!this.parsed[index]) {
                const lrcUrl = this.player.list.audios[index]!.lrc;
                this.parsed[index] = lrcUrl ? this.parse(lrcUrl) : ([[0, 'Not available']] as LrcLine[]);
            }
            this.render(index);
        }
    }

    /**
     * Parse lrc, suppose multiple time tag
     *
     * @param lrc_s - Format:
     * [mm:ss]lyric
     * [mm:ss.xx]lyric
     * [mm:ss.xxx]lyric
     * [mm:ss.xx][mm:ss.xx][mm:ss.xx]lyric
     * [mm:ss.xx]<mm:ss.xx>lyric
     *
     * @return [[time, text], [time, text], [time, text], ...]
     */
    parse(lrc_s: string): LrcLine[] {
        if (lrc_s) {
            lrc_s = lrc_s.replace(/([^\]^\n])\[/g, (match, p1) => p1 + '\n[');
            const lyric = lrc_s.split('\n');
            let lrc: LrcLine[] = [];
            const lyricLen = lyric.length;
            for (let i = 0; i < lyricLen; i++) {
                // match lrc time
                const lrcTimes = lyric[i]!.match(/\[(\d{2}):(\d{2})(\.(\d{2,3}))?]/g);
                // match lrc text
                const lrcText = lyric[i]!
                    .replace(/.*\[(\d{2}):(\d{2})(\.(\d{2,3}))?]/g, '')
                    .replace(/<(\d{2}):(\d{2})(\.(\d{2,3}))?>/g, '')
                    .replace(/^\s+|\s+$/g, '');

                if (lrcTimes) {
                    // handle multiple time tag
                    const timeLen = lrcTimes.length;
                    for (let j = 0; j < timeLen; j++) {
                        const oneTime = /\[(\d{2}):(\d{2})(\.(\d{2,3}))?]/.exec(lrcTimes[j]!)!;
                        const min2sec = Number(oneTime[1]) * 60;
                        const sec2sec = parseInt(oneTime[2]!, 10);
                        const msec2sec = oneTime[4] ? parseInt(oneTime[4], 10) / ((oneTime[4] as string).length === 2 ? 100 : 1000) : 0;
                        const lrcTime = min2sec + sec2sec + msec2sec;
                        lrc.push([lrcTime, lrcText]);
                    }
                }
            }
            // sort by time
            lrc = lrc.filter((item) => item[1]);
            lrc.sort((a, b) => a[0] - b[0]);
            return lrc;
        } else {
            return [];
        }
    }

    remove(index: number) {
        this.parsed.splice(index, 1);
        this.loading.splice(index, 1);
    }

    clear() {
        this.parsed = [];
        this.loading = [];
        this.container.innerHTML = '';
    }

    destroy() {
        if (this.pendingXhr && this.pendingXhr.readyState !== 4) {
            this.pendingXhr.abort();
        }
        this.pendingXhr = undefined;
        this.parsed = [];
        this.loading = [];
        this.container.innerHTML = '';
    }
}

export default Lrc;
