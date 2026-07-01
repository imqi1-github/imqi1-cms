import utils from './utils';
import Icons from './icons';
import type APlayer from './player';

import type { DragEvent } from '~/types/aplayer';

const eventClientX = (e: DragEvent): number =>
    (e as MouseEvent).clientX || (e as TouchEvent).changedTouches[0]!.clientX;

const eventClientY = (e: DragEvent): number =>
    (e as MouseEvent).clientY || (e as TouchEvent).changedTouches[0]!.clientY;

class Controller {
    player: APlayer;

    // 拖拽中的 document 级监听 —— 保存引用以便 destroy 时移除（拖拽中销毁会泄露）
    private barThumbMove?: (e: DragEvent) => void;
    private barThumbUp?: (e: DragEvent) => void;
    private volumeThumbMove?: (e: DragEvent) => void;
    private volumeThumbUp?: (e: DragEvent) => void;

    constructor(player: APlayer) {
        this.player = player;

        this.initPlayButton();
        this.initPlayBar();
        this.initOrderButton();
        this.initLoopButton();
        this.initMenuButton();
        if (!utils.isMobile) {
            this.initVolumeButton();
        }
        this.initMiniSwitcher();
        this.initSkipButton();
        this.initLrcButton();
    }

    initPlayButton() {
        this.player.template.pic.addEventListener('click', () => {
            this.player.toggle();
        });
    }

    initPlayBar() {
        const thumbMove = (e: DragEvent) => {
            let percentage = (eventClientX(e) - this.player.template.barWrap.getBoundingClientRect().left) / this.player.template.barWrap.clientWidth;
            percentage = Math.max(percentage, 0);
            percentage = Math.min(percentage, 1);
            this.player.bar.set('played', percentage, 'width');
            this.player.lrc?.update(percentage * this.player.duration);
            this.player.template.ptime.innerHTML = utils.secondToTime(percentage * this.player.duration);
        };

        const thumbUp = (e: DragEvent) => {
            this.removeBarDragListeners();
            let percentage = (eventClientX(e) - this.player.template.barWrap.getBoundingClientRect().left) / this.player.template.barWrap.clientWidth;
            percentage = Math.max(percentage, 0);
            percentage = Math.min(percentage, 1);
            this.player.bar.set('played', percentage, 'width');
            this.player.seek(percentage * this.player.duration);
            this.player.disableTimeupdate = false;
        };

        this.barThumbMove = thumbMove;
        this.barThumbUp = thumbUp;

        this.player.template.barWrap.addEventListener(utils.nameMap.dragStart, () => {
            this.player.disableTimeupdate = true;
            document.addEventListener(utils.nameMap.dragMove, thumbMove as EventListener);
            document.addEventListener(utils.nameMap.dragEnd, thumbUp as EventListener);
        });
    }

    initVolumeButton() {
        this.player.template.volumeButton.addEventListener('click', () => {
            if (this.player.audio.muted) {
                this.player.volume(this.player.audio.volume, true);
            } else {
                this.player.audio.muted = true;
                this.player.switchVolumeIcon();
                this.player.bar.set('volume', 0, 'height');
            }
        });

        const thumbMove = (e: DragEvent) => {
            let percentage = 1 - (eventClientY(e) - this.player.template.volumeBar.getBoundingClientRect().top) / this.player.template.volumeBar.clientHeight;
            percentage = Math.max(percentage, 0);
            percentage = Math.min(percentage, 1);
            this.player.volume(percentage);
        };

        const thumbUp = (e: DragEvent) => {
            this.player.template.volumeBarWrap.classList.remove('aplayer-volume-bar-wrap-active');
            this.removeVolumeDragListeners();
            let percentage = 1 - (eventClientY(e) - this.player.template.volumeBar.getBoundingClientRect().top) / this.player.template.volumeBar.clientHeight;
            percentage = Math.max(percentage, 0);
            percentage = Math.min(percentage, 1);
            this.player.volume(percentage);
        };

        this.volumeThumbMove = thumbMove;
        this.volumeThumbUp = thumbUp;

        this.player.template.volumeBarWrap.addEventListener(utils.nameMap.dragStart, () => {
            this.player.template.volumeBarWrap.classList.add('aplayer-volume-bar-wrap-active');
            document.addEventListener(utils.nameMap.dragMove, thumbMove as EventListener);
            document.addEventListener(utils.nameMap.dragEnd, thumbUp as EventListener);
        });
    }

    // 移除进度条拖拽的 document 监听（thumbUp 正常触发时调用，destroy 时兜底）
    private removeBarDragListeners() {
        if (this.barThumbMove) {
            document.removeEventListener(utils.nameMap.dragMove, this.barThumbMove as EventListener);
        }
        if (this.barThumbUp) {
            document.removeEventListener(utils.nameMap.dragEnd, this.barThumbUp as EventListener);
        }
    }

    // 移除音量条拖拽的 document 监听
    private removeVolumeDragListeners() {
        if (this.volumeThumbMove) {
            document.removeEventListener(utils.nameMap.dragMove, this.volumeThumbMove as EventListener);
        }
        if (this.volumeThumbUp) {
            document.removeEventListener(utils.nameMap.dragEnd, this.volumeThumbUp as EventListener);
        }
    }

    /**
     * 销毁拖拽监听 —— player.destroy() 兜底调用，防止拖拽中销毁导致 document 监听泄露
     */
    destroy() {
        this.removeBarDragListeners();
        this.removeVolumeDragListeners();
    }

    initOrderButton() {
        this.player.template.order.addEventListener('click', () => {
            if (this.player.options.order === 'list') {
                this.player.options.order = 'random';
                this.player.template.order.innerHTML = Icons.orderRandom;
            } else if (this.player.options.order === 'random') {
                this.player.options.order = 'list';
                this.player.template.order.innerHTML = Icons.orderList;
            }
        });
    }

    initLoopButton() {
        this.player.template.loop.addEventListener('click', () => {
            if (this.player.list.audios.length > 1) {
                if (this.player.options.loop === 'one') {
                    this.player.options.loop = 'none';
                    this.player.template.loop.innerHTML = Icons.loopNone;
                } else if (this.player.options.loop === 'none') {
                    this.player.options.loop = 'all';
                    this.player.template.loop.innerHTML = Icons.loopAll;
                } else if (this.player.options.loop === 'all') {
                    this.player.options.loop = 'one';
                    this.player.template.loop.innerHTML = Icons.loopOne;
                }
            } else {
                if (this.player.options.loop === 'one' || this.player.options.loop === 'all') {
                    this.player.options.loop = 'none';
                    this.player.template.loop.innerHTML = Icons.loopNone;
                } else if (this.player.options.loop === 'none') {
                    this.player.options.loop = 'all';
                    this.player.template.loop.innerHTML = Icons.loopAll;
                }
            }
        });
    }

    initMenuButton() {
        this.player.template.menu.addEventListener('click', () => {
            this.player.list.toggle();
        });
    }

    initMiniSwitcher() {
        this.player.template.miniSwitcher.addEventListener('click', () => {
            this.player.setMode(this.player.mode === 'mini' ? 'normal' : 'mini');
        });
    }

    initSkipButton() {
        this.player.template.skipBackButton.addEventListener('click', () => {
            this.player.skipBack();
        });
        this.player.template.skipForwardButton.addEventListener('click', () => {
            this.player.skipForward();
        });
        this.player.template.skipPlayButton.addEventListener('click', () => {
            this.player.toggle();
        });
    }

    initLrcButton() {
        this.player.template.lrcButton.addEventListener('click', () => {
            if (this.player.template.lrcButton.classList.contains('aplayer-icon-lrc-inactivity')) {
                this.player.template.lrcButton.classList.remove('aplayer-icon-lrc-inactivity');
                this.player.lrc?.show();
            } else {
                this.player.template.lrcButton.classList.add('aplayer-icon-lrc-inactivity');
                this.player.lrc?.hide();
            }
        });
    }
}

export default Controller;
