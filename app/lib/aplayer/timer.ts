import type APlayer from './player';

class Timer {
    player: APlayer;

    types: string[];

    loadingChecker?: ReturnType<typeof setInterval>;

    enableloadingChecker?: boolean;

    constructor(player: APlayer) {
        this.player = player;

        // 原实现覆写了全局 window.requestAnimationFrame（polyfill 兼容远古浏览器），
        // 会污染宿主页面状态且随实例残留。现代浏览器原生支持，直接移除。
        this.types = ['loading'];

        this.init();
    }

    init() {
        this.types.forEach((item) => {
            (this as unknown as Record<string, () => void>)[`init${item}Checker`]!();
        });
    }

    initloadingChecker() {
        let lastPlayPos = 0;
        let currentPlayPos = 0;
        let bufferingDetected = false;
        this.loadingChecker = setInterval(() => {
            if (this.enableloadingChecker) {
                // whether the audio is buffering
                currentPlayPos = this.player.audio.currentTime;
                if (!bufferingDetected && currentPlayPos === lastPlayPos && !this.player.audio.paused) {
                    this.player.container.classList.add('aplayer-loading');
                    bufferingDetected = true;
                }
                if (bufferingDetected && currentPlayPos > lastPlayPos && !this.player.audio.paused) {
                    this.player.container.classList.remove('aplayer-loading');
                    bufferingDetected = false;
                }
                lastPlayPos = currentPlayPos;
            }
        }, 100);
    }

    enable(type: string) {
        (this as unknown as Record<string, unknown>)[`enable${type}Checker`] = true;

        if (type === 'fps') {
            (this as unknown as Record<string, (() => void) | undefined>)[`init${type}Checker`]?.();
        }
    }

    disable(type: string) {
        (this as unknown as Record<string, unknown>)[`enable${type}Checker`] = false;
    }

    destroy() {
        this.types.forEach((item) => {
            (this as unknown as Record<string, unknown>)[`enable${item}Checker`] = false;
            const checker = (this as unknown as Record<string, ReturnType<typeof setInterval> | undefined>)[`${item}Checker`];
            if (checker) {
                clearInterval(checker);
            }
        });
    }
}

export default Timer;
