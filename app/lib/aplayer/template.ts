import Icons from './icons';
import tplPlayer from './template/player';

import type { ResolvedAPlayerOptions } from '~/types/aplayer';

class Template {
    container: HTMLElement;

    options: ResolvedAPlayerOptions;

    randomOrder: number[];

    lrc!: HTMLElement;

    lrcWrap!: HTMLElement;

    ptime!: HTMLElement;

    info!: HTMLElement;

    time!: HTMLElement;

    barWrap!: HTMLElement;

    body!: HTMLElement;

    list!: HTMLElement;

    listCurs!: NodeListOf<HTMLElement>;

    played!: HTMLElement;

    loaded!: HTMLElement;

    thumb!: HTMLElement;

    volume!: HTMLElement;

    volumeBar!: HTMLElement;

    volumeButton!: HTMLElement;

    volumeBarWrap!: HTMLElement;

    loop!: HTMLElement;

    order!: HTMLElement;

    menu!: HTMLElement;

    pic!: HTMLElement;

    title!: HTMLElement;

    author!: HTMLElement;

    dtime!: HTMLElement;

    notice!: HTMLElement;

    miniSwitcher!: HTMLElement;

    skipBackButton!: HTMLElement;

    skipForwardButton!: HTMLElement;

    skipPlayButton!: HTMLElement;

    lrcButton!: HTMLElement;

    constructor(options: { container: HTMLElement; options: ResolvedAPlayerOptions; randomOrder: number[] }) {
        this.container = options.container;
        this.options = options.options;
        this.randomOrder = options.randomOrder;
        this.init();
    }

    init() {
        let cover = '';
        if (this.options.audio.length) {
            if (this.options.order === 'random') {
                cover = this.options.audio[this.randomOrder[0]!]!.cover || '';
            } else {
                cover = this.options.audio[0]!.cover || '';
            }
        }

        this.container.innerHTML = tplPlayer({
            options: this.options,
            icons: Icons,
            cover: cover,
            getObject: (obj) => obj,
        });

        this.lrc = this.container.querySelector('.aplayer-lrc-contents')!;
        this.lrcWrap = this.container.querySelector('.aplayer-lrc')!;
        this.ptime = this.container.querySelector('.aplayer-ptime')!;
        this.info = this.container.querySelector('.aplayer-info')!;
        this.time = this.container.querySelector('.aplayer-time')!;
        this.barWrap = this.container.querySelector('.aplayer-bar-wrap')!;
        this.body = this.container.querySelector('.aplayer-body')!;
        this.list = this.container.querySelector('.aplayer-list')!;
        this.listCurs = this.container.querySelectorAll('.aplayer-list-cur');
        this.played = this.container.querySelector('.aplayer-played')!;
        this.loaded = this.container.querySelector('.aplayer-loaded')!;
        this.thumb = this.container.querySelector('.aplayer-thumb')!;
        this.volume = this.container.querySelector('.aplayer-volume')!;
        this.volumeBar = this.container.querySelector('.aplayer-volume-bar')!;
        this.volumeButton = this.container.querySelector('.aplayer-time button')!;
        this.volumeBarWrap = this.container.querySelector('.aplayer-volume-bar-wrap')!;
        this.loop = this.container.querySelector('.aplayer-icon-loop')!;
        this.order = this.container.querySelector('.aplayer-icon-order')!;
        this.menu = this.container.querySelector('.aplayer-icon-menu')!;
        this.pic = this.container.querySelector('.aplayer-pic')!;
        this.title = this.container.querySelector('.aplayer-title')!;
        this.author = this.container.querySelector('.aplayer-author')!;
        this.dtime = this.container.querySelector('.aplayer-dtime')!;
        this.notice = this.container.querySelector('.aplayer-notice')!;
        this.miniSwitcher = this.container.querySelector('.aplayer-miniswitcher')!;
        this.skipBackButton = this.container.querySelector('.aplayer-icon-back')!;
        this.skipForwardButton = this.container.querySelector('.aplayer-icon-forward')!;
        this.skipPlayButton = this.container.querySelector('.aplayer-icon-play')!;
        this.lrcButton = this.container.querySelector('.aplayer-icon-lrc')!;
    }
}

export default Template;
