
import Bar from './bar';
import Controller from './controller';
import Events from './events';
import Icons from './icons';
import List from './list';
import Lrc from './lrc';
import handleOption from './options';
import Storage from './storage';
import Template from './template';
import Timer from './timer';
import utils from './utils';

import type { APlayerAudio, APlayerOptions, HlsInstance, ResolvedAPlayerOptions } from '~/types/aplayer';

const instances: APlayer[] = [];

class APlayer {
    options: ResolvedAPlayerOptions;

    container: HTMLElement;

    paused: boolean;

    mode: 'normal' | 'mini';

    randomOrder: number[];

    template!: Template;

    lrc?: Lrc;

    events!: Events;

    storage!: Storage;

    bar!: Bar;

    controller!: Controller;

    timer!: Timer;

    list!: List;

    audio!: HTMLAudioElement;

    hls?: HlsInstance | null;

    arrow: boolean;

    disableTimeupdate?: boolean;

    noticeTime?: ReturnType<typeof setTimeout>;

    // 错误重试定时器 —— destroy 时清理，避免销毁后 skipForward 触发
    skipTime?: ReturnType<typeof setTimeout>;

    // audio 事件绑定的 handler 引用 —— destroy 时逐个 removeEventListener（原实现只 add 不 remove，依赖 audio 被 GC）
    private audioHandlers: { name: string; handler: (e: Event) => void }[] = [];

    /**
     * APlayer constructor function
     *
     * @param options - See README
     * @constructor
     */
    constructor(options: APlayerOptions) {
        this.options = handleOption(options);
        this.container = this.options.container;
        this.paused = true;
        this.mode = 'normal';

        this.randomOrder = utils.randomOrder(this.options.audio.length);

        this.container.classList.add('aplayer');
        if (this.options.lrcType && !this.options.fixed) {
            this.container.classList.add('aplayer-withlrc');
        }
        if (this.options.audio.length > 1) {
            this.container.classList.add('aplayer-withlist');
        }
        if (utils.isMobile) {
            this.container.classList.add('aplayer-mobile');
        }
        this.arrow = this.container.offsetWidth <= 300;
        if (this.arrow) {
            this.container.classList.add('aplayer-arrow');
        }

        // save lrc
        if (this.options.lrcType === 2 || this.options.lrcType === true) {
            const lrcEle = this.container.getElementsByClassName('aplayer-lrc-content');
            for (let i = 0; i < lrcEle.length; i++) {
                if (this.options.audio[i]) {
                    this.options.audio[i]!.lrc = lrcEle[i]!.innerHTML;
                }
            }
        }

        this.template = new Template({
            container: this.container,
            options: this.options,
            randomOrder: this.randomOrder,
        });

        if (this.options.fixed) {
            this.container.classList.add('aplayer-fixed');
            this.template.body.style.width = this.template.body.offsetWidth - 18 + 'px';
        }
        if (this.options.mini) {
            this.setMode('mini');
            this.template.info.style.display = 'block';
        }
        if (this.template.info.offsetWidth < 200) {
            this.template.time.classList.add('aplayer-time-narrow');
        }

        if (this.options.lrcType) {
            this.lrc = new Lrc({
                container: this.template.lrc,
                async: this.options.lrcType === 3,
                player: this,
            });
        }
        this.events = new Events();
        this.storage = new Storage(this);
        this.bar = new Bar(this.template);
        this.controller = new Controller(this);
        this.timer = new Timer(this);
        this.list = new List(this);

        this.initAudio();
        this.bindEvents();
        if (this.options.order === 'random') {
            this.list.switch(this.randomOrder[0]);
        } else {
            this.list.switch(0);
        }

        instances.push(this);
    }

    initAudio() {
        this.audio = document.createElement('audio');
        this.audio.preload = this.options.preload;

        for (let i = 0; i < this.events.audioEvents.length; i++) {
            const eventName = this.events.audioEvents[i]!;
            const handler = (e: Event) => {
                this.events.trigger(eventName, e);
            };
            this.audio.addEventListener(eventName, handler);
            this.audioHandlers.push({ name: eventName, handler });
        }

        this.volume(this.storage.get('volume') as number, true);
    }

    bindEvents() {
        this.on('play', () => {
            if (this.paused) {
                this.setUIPlaying();
            }
            // document.getElementById("music-box").pause()
        });

        this.on('pause', () => {
            if (!this.paused) {
                this.setUIPaused();
            }
        });

        this.on('timeupdate', () => {
            if (!this.disableTimeupdate) {
                this.bar.set('played', this.audio.currentTime / this.duration, 'width');
                this.lrc?.update();
                const currentTime = utils.secondToTime(this.audio.currentTime);
                if (this.template.ptime.innerHTML !== currentTime) {
                    this.template.ptime.innerHTML = currentTime;
                }
            }
        });

        // show audio time: the metadata has loaded or changed
        this.on('durationchange', () => {
            if (this.duration !== 1) {
                // compatibility: Android browsers will output 1 at first
                this.template.dtime.innerHTML = utils.secondToTime(this.duration);
            }
        });

        // Can seek now
        this.on('loadedmetadata', () => {
            this.seek(0);
            if (!this.paused) {
                this.audio.play();
            }
        });

        // show audio loaded bar: to inform interested parties of progress downloading the media
        this.on('canplay', () => {
            const percentage = this.audio.buffered.length ? this.audio.buffered.end(this.audio.buffered.length - 1) / this.duration : 0;
            this.bar.set('loaded', percentage, 'width');
        });
        this.on('progress', () => {
            const percentage = this.audio.buffered.length ? this.audio.buffered.end(this.audio.buffered.length - 1) / this.duration : 0;
            this.bar.set('loaded', percentage, 'width');
        });

        // audio download error: an error occurs
        let errorTimes = 0;
        this.on("error", () => {
            if (this.list.audios.length > 1) {
                errorTimes++;
                if (errorTimes > 2) {
                    this.notice("歌曲播放出现错误，两秒后播放新歌曲。");
                    this.skipTime = setTimeout(() => {
                        this.skipForward();
                        if (!this.paused) {
                            this.play();
                        }
                    }, 2000);
                    errorTimes = 0;
                } else {
                    this.audio.src = this.list.audios[this.list.index]!.url as string;
                    if (!this.paused) {
                        this.play();
                    }
                }
            } else if (this.list.audios.length === 1) {
                const error = this.audio.error!;
                if (error.code === 4) return;
                errorTimes++;
                if (errorTimes > 2) {
                    this.notice("播放歌曲时遇到错误。");
                } else {
                    this.audio.src = this.list.audios[0]!.url as string;
                    if (!this.paused) {
                        this.play();
                    }
                }
            }
        });
        this.events.on('listswitch', () => {
            if (this.skipTime) {
                clearTimeout(this.skipTime);
            }
        });

        // multiple audio play
        this.on('ended', () => {
            if (this.options.loop === 'none') {
                if (this.options.order === 'list') {
                    if (this.list.index < this.list.audios.length - 1) {
                        this.list.switch((this.list.index + 1) % this.list.audios.length);
                        this.play();
                    } else {
                        this.list.switch((this.list.index + 1) % this.list.audios.length);
                        this.pause();
                    }
                } else if (this.options.order === 'random') {
                    if (this.randomOrder.indexOf(this.list.index) < this.randomOrder.length - 1) {
                        this.list.switch(this.nextIndex());
                        this.play();
                    } else {
                        this.list.switch(this.nextIndex());
                        this.pause();
                    }
                }
            } else if (this.options.loop === 'one') {
                this.list.switch(this.list.index);
                this.play();
            } else if (this.options.loop === 'all') {
                this.skipForward();
                this.play();
            }
        });
    }

    setAudio(audio: APlayerAudio) {
        if (this.hls) {
            this.hls.destroy();
            this.hls = null;
        }
        let type = audio.type;
        if (this.options.customAudioType && this.options.customAudioType[type as string]) {
            if (typeof this.options.customAudioType[type as string] === 'function') {
                this.options.customAudioType[type as string]!(this.audio, audio, this);
            } else {
                console.error(`Illegal customType: ${type}`);
            }
        } else {
            if (!type || type === 'auto') {
                if (/m3u8(#|\?|$)/i.exec(audio.url as string)) {
                    type = 'hls';
                } else {
                    type = 'normal';
                }
            }
            if (type === 'hls') {
                if (window.Hls!.isSupported()) {
                    this.hls = new window.Hls!();
                    this.hls.loadSource(audio.url as string);
                    this.hls.attachMedia(this.audio);
                } else if (this.audio.canPlayType('application/x-mpegURL') || this.audio.canPlayType('application/vnd.apple.mpegURL')) {
                    this.audio.src = audio.url as string;
                } else {
                    this.notice('Error: HLS is not supported.');
                }
            } else if (type === 'normal') {
                this.audio.src = audio.url as string;
            }
        }
    }

    theme(color: string = this.list.audios[this.list.index]!.theme || this.options.theme, index: number = this.list.index, isReset: boolean = true) {
        if (isReset) {
            if (this.list.audios[index]) {
                this.list.audios[index]!.theme = color;
            }
        }
        if (this.template.listCurs[index]) {
            this.template.listCurs[index]!.style.backgroundColor = color;
        }
        if (index === this.list.index) {
            this.template.pic.style.backgroundColor = color;
            this.template.played.style.background = color;
            this.template.thumb.style.background = color;
            this.template.volume.style.background = color;
        }
    }

    seek(time: number) {
        time = Math.max(time, 0);
        time = Math.min(time, this.duration);
        this.audio.currentTime = time;
        this.bar.set('played', time / this.duration, 'width');
        this.template.ptime.innerHTML = utils.secondToTime(time);
    }

    get duration(): number {
        return isNaN(this.audio.duration) ? 0 : this.audio.duration;
    }

    setUIPlaying() {
        if (this.paused) {
            this.paused = false;
            this.template.skipPlayButton.innerHTML = Icons.pause;
            this.template.pic.classList.add("playing");
        }

        this.timer.enable("loading");

        if (this.options.mutex) {
            for (let i = 0; i < instances.length; i++) {
                if (this !== instances[i]) {
                    instances[i]!.pause();
                }
            }
        }
    }

    play() {
        this.setUIPlaying();

        const playPromise = this.audio.play();
        if (playPromise) {
            playPromise.catch((e) => {
                console.warn(e);
                if ((e as DOMException).name === 'NotAllowedError') {
                    this.setUIPaused();
                }
            });
        }
    }

    setUIPaused() {
        if (!this.paused) {
            this.paused = true;
            this.template.skipPlayButton.innerHTML = Icons.play;
            this.template.pic.classList.remove("playing");
        }

        this.container.classList.remove("aplayer-loading");
        this.timer.disable("loading");
    }

    pause() {
        // 先暂停音频播放，再更新UI状态，避免状态混乱
        this.audio.pause();
        this.setUIPaused();
    }

    switchVolumeIcon() {
        if (this.volume() >= 0.95) {
            this.template.volumeButton.innerHTML = Icons.volumeUp;
        } else if (this.volume() > 0) {
            this.template.volumeButton.innerHTML = Icons.volumeDown;
        } else {
            this.template.volumeButton.innerHTML = Icons.volumeOff;
        }
    }

    /**
     * Set volume
     */
    volume(percentage?: number, nostorage?: boolean): number {
        percentage = parseFloat(String(percentage));
        if (!isNaN(percentage)) {
            percentage = Math.max(percentage, 0);
            percentage = Math.min(percentage, 1);
            this.bar.set('volume', percentage, 'height');
            if (!nostorage) {
                this.storage.set('volume', percentage);
            }

            this.audio.volume = percentage;
            if (this.audio.muted) {
                this.audio.muted = false;
            }

            this.switchVolumeIcon();
        }

        return this.audio.muted ? 0 : this.audio.volume;
    }

    /**
     * bind events
     */
    on(name: string, callback: (data?: unknown) => void) {
        this.events.on(name, callback);
    }

    /**
     * toggle between play and pause
     */
    toggle() {
        if (this.paused) {
            this.play();
        } else {
            this.pause();
        }
    }

    // abandoned
    switchAudio(index: number) {
        this.list.switch(index);
    }

    // abandoned
    addAudio(audios: APlayerAudio | APlayerAudio[]) {
        this.list.add(audios);
    }

    // abandoned
    removeAudio(index: number) {
        this.list.remove(index);
    }

    /**
     * destroy this player
     */
    destroy() {
        const instanceIndex = instances.indexOf(this);
        if (instanceIndex !== -1) {
            instances.splice(instanceIndex, 1);
        }
        this.pause();
        // 清理待执行的定时器，避免销毁后回调操作已释放的资源
        if (this.skipTime) {
            clearTimeout(this.skipTime);
        }
        if (this.noticeTime) {
            clearTimeout(this.noticeTime);
        }
        // 移除 audio 事件监听（原实现仅靠 audio 被 GC，MetingPlayer 子应用持引用时不保证释放）
        for (const { name, handler } of this.audioHandlers) {
            this.audio.removeEventListener(name, handler);
        }
        this.audioHandlers = [];
        this.controller.destroy();
        this.lrc?.destroy();
        this.container.innerHTML = '';
        this.audio.src = '';
        this.timer.destroy();
        this.events.trigger('destroy');
    }

    setMode(mode: 'normal' | 'mini' = 'normal') {
        this.mode = mode;
        if (mode === 'mini') {
            this.container.classList.add('aplayer-narrow');
        } else if (mode === 'normal') {
            this.container.classList.remove('aplayer-narrow');
        }
    }

    notice(text: string, time: number = 2000, opacity: number = 0.8) {
        this.template.notice.innerHTML = text;
        this.template.notice.style.opacity = String(opacity);
        if (this.noticeTime) {
            clearTimeout(this.noticeTime);
        }
        this.events.trigger('noticeshow', {
            text: text,
        });
        if (time) {
            this.noticeTime = setTimeout(() => {
                this.template.notice.style.opacity = String(0);
                this.events.trigger('noticehide');
            }, time);
        }
    }

    prevIndex(): number {
        if (this.list.audios.length <= 1) {
            return 0;
        }
        if (this.options.order === 'list') {
            return this.list.index - 1 < 0 ? this.list.audios.length - 1 : this.list.index - 1;
        }
        // order === 'random'
        const index = this.randomOrder.indexOf(this.list.index);
        if (index === 0) {
            return this.randomOrder[this.randomOrder.length - 1]!;
        }
        return this.randomOrder[index - 1]!;
    }

    nextIndex(): number {
        if (this.list.audios.length <= 1) {
            return 0;
        }
        if (this.options.order === 'list') {
            return (this.list.index + 1) % this.list.audios.length;
        }
        // order === 'random'
        const index = this.randomOrder.indexOf(this.list.index);
        if (index === this.randomOrder.length - 1) {
            return this.randomOrder[0]!;
        }
        return this.randomOrder[index + 1]!;
    }

    skipBack() {
        this.list.switch(this.prevIndex());
    }

    skipForward() {
        this.list.switch(this.nextIndex());
    }
}

export default APlayer;
