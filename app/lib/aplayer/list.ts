import smoothScroll from 'smoothscroll';

import tplListItem from './template/list-item';
import type APlayer from './player';
import utils from './utils';

import type { APlayerAudio } from '~/types/aplayer';

class List {
    player: APlayer;

    index: number;

    audios: APlayerAudio[];

    showing: boolean;

    hideTimer?: ReturnType<typeof setTimeout>;

    constructor(player: APlayer) {
        this.player = player;
        this.index = 0;
        this.audios = this.player.options.audio;
        this.showing = true;
        this.player.template.list.style.height = `${Math.min(this.player.template.list.scrollHeight, this.player.options.listMaxHeight)}px`;

        this.bindEvents();
    }

    bindEvents() {
        this.player.template.list.addEventListener('click', (e: MouseEvent) => {
            let target: HTMLElement;
            if ((e.target as HTMLElement).tagName.toUpperCase() === 'LI') {
                target = e.target as HTMLElement;
            } else {
                target = (e.target as HTMLElement).parentElement!;
            }
            const audioIndex = parseInt(target.getElementsByClassName('aplayer-list-index')[0]!.innerHTML, 10) - 1;
            if (audioIndex !== this.index) {
                this.switch(audioIndex);
                this.player.play();
            } else {
                this.player.toggle();
            }
        });
    }

    show() {
        this.showing = true;
        if (this.hideTimer) {
            clearTimeout(this.hideTimer);
        }
        this.player.template.list.scrollTop = this.index * 33;
        this.player.template.list.style.height = `${Math.min(this.player.template.list.scrollHeight, this.player.options.listMaxHeight)}px`;
        this.player.events.trigger('listshow');
    }

    hide() {
        this.showing = false;
        this.player.template.list.style.height = `${Math.min(this.player.template.list.scrollHeight, this.player.options.listMaxHeight)}px`;
        if (this.hideTimer) {
            clearTimeout(this.hideTimer);
        }
        this.hideTimer = setTimeout(() => {
            if (this.showing) {
                // show() 已抢先,不再收起
                return;
            }
            this.player.template.list.style.height = '0px';
            this.player.events.trigger('listhide');
        }, 0);
    }

    toggle() {
        if (this.showing) {
            this.hide();
        } else {
            this.show();
        }
    }

    add(audios: APlayerAudio | APlayerAudio[]) {
        this.player.events.trigger('listadd', {
            audios: audios,
        });

        if (!Array.isArray(audios)) {
            audios = [audios];
        }
        if (audios.length === 0) {
            // 空批次直接返回,避免 listCurs[-1]!/innerHTML 拼接出问题
            return;
        }
        audios.map((item) => {
            item.name = item.name || item.title || 'Audio name';
            item.artist = item.artist || item.author || 'Audio artist';
            item.cover = item.cover || item.pic;
            item.type = item.type || 'auto'; // 无 type 给 'auto'，让 setAudio 的 m3u8/HLS 自动识别生效
            return item;
        });

        const wasSingle = !(this.audios.length > 1);
        const wasEmpty = this.audios.length === 0;

        // 插入到外层 .aplayer-list 的内层 <ol> 里（直接 append 到 div 会绕过 ol，新条目丢样式/滚动）
        const listOl = this.player.template.list.querySelector('ol');
        (listOl ?? this.player.template.list).insertAdjacentHTML('beforeend', tplListItem({
            theme: this.player.options.theme,
            audio: audios,
            index: this.audios.length + 1,
        }));

        this.audios = this.audios.concat(audios);

        if (wasSingle && this.audios.length > 1) {
            this.player.container.classList.add('aplayer-withlist');
        }

        this.player.randomOrder = utils.randomOrder(this.audios.length);
        this.player.template.listCurs = this.player.container.querySelectorAll('.aplayer-list-cur');

        const lastAdded = audios[audios.length - 1]!;
        this.player.template.listCurs[this.audios.length - 1]!.style.backgroundColor = lastAdded.theme || this.player.options.theme;

        if (wasEmpty) {
            if (this.player.options.order === 'random') {
                this.switch(this.player.randomOrder[0]);
            } else {
                this.switch(0);
            }
        }
    }

    remove(index: number) {
        this.player.events.trigger('listremove', {
            index: index,
        });
        if (this.audios[index]) {
            if (this.audios.length > 1) {
                const list = this.player.container.querySelectorAll('.aplayer-list li');
                list[index]!.remove();

                this.audios.splice(index, 1);
                this.player.lrc?.remove(index);

                if (index === this.index) {
                    if (this.audios[index]) {
                        this.switch(index);
                    } else {
                        this.switch(index - 1);
                    }
                }
                if (this.index > index) {
                    this.index--;
                }

                for (let i = index; i < list.length; i++) {
                    list[i]!.getElementsByClassName('aplayer-list-index')[0]!.textContent = String(i);
                }
                if (this.audios.length === 1) {
                    this.player.container.classList.remove('aplayer-withlist');
                }

                this.player.template.listCurs = this.player.container.querySelectorAll('.aplayer-list-cur');
                // 删除后重建 randomOrder,避免 random 模式 nextIndex/prevIndex 引用过期/越界下标
                this.player.randomOrder = utils.randomOrder(this.audios.length);
            } else {
                this.clear();
            }
        }
    }

    switch(index?: number) {
        this.player.events.trigger('listswitch', {
            index: index,
        });

        if (typeof index !== 'undefined' && this.audios[index]) {
            this.index = index;

            const audio = this.audios[this.index]!;

            // set html
            this.player.template.pic.style.backgroundImage = audio.cover ? `url('${audio.cover}')` : '';
            // 同步旋转封面盘的 <img>(模板只注入首曲封面,切歌不更新会显示旧封面)
            const picBoxImg = this.player.container.querySelector('.aplayer-pic-box img') as HTMLImageElement | null;
            if (picBoxImg) {
                picBoxImg.src = audio.cover || '';
            }
            this.player.theme(this.audios[this.index]!.theme || this.player.options.theme, this.index, false);
            this.player.template.title.innerHTML = audio.name || '';
            this.player.template.author.innerHTML = audio.artist ? ' - ' + audio.artist : '';

            const light = this.player.container.getElementsByClassName('aplayer-list-light')[0];
            if (light) {
                light.classList.remove('aplayer-list-light');
            }
            this.player.container.querySelectorAll('.aplayer-list li')[this.index]!.classList.add('aplayer-list-light');

            smoothScroll(this.index * 33, 500, null, this.player.template.list);

            this.player.setAudio(audio);

            this.player.lrc?.switch(this.index);
            this.player.lrc?.update(0);

            // set duration time
            if (this.player.duration !== 1) {
                // compatibility: Android browsers will output 1 at first
                this.player.template.dtime.innerHTML = utils.secondToTime(this.player.duration);
            }
        }
    }

    clear() {
        this.player.events.trigger('listclear');
        this.index = 0;
        this.player.container.classList.remove('aplayer-withlist');
        this.player.pause();
        this.audios = [];
        this.player.lrc?.clear();
        this.player.audio.src = '';
        this.player.template.list.innerHTML = '';
        this.player.template.pic.style.backgroundImage = '';
        const picBoxImg = this.player.container.querySelector('.aplayer-pic-box img') as HTMLImageElement | null;
        if (picBoxImg) {
            picBoxImg.src = '';
        }
        this.player.theme(this.player.options.theme, this.index, false);
        this.player.template.title.innerHTML = 'No audio';
        this.player.template.author.innerHTML = '';
        this.player.bar.set('loaded', 0, 'width');
        this.player.template.dtime.innerHTML = utils.secondToTime(0);
    }
}

export default List;
