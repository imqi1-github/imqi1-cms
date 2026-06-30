import type APlayer from './player';

class Timer {
    player: APlayer;

    types: string[];

    loadingChecker?: ReturnType<typeof setInterval>;

    enableloadingChecker?: boolean;

    constructor(player: APlayer) {
        this.player = player;

        // requestAnimationFrame polyfill (vendor prefixed + setTimeout fallback)
        const w = window as unknown as Record<string, unknown>;
        window.requestAnimationFrame = (w.requestAnimationFrame ||
            w.webkitRequestAnimationFrame ||
            w.mozRequestAnimationFrame ||
            w.oRequestAnimationFrame ||
            w.msRequestAnimationFrame ||
            ((callback: FrameRequestCallback) => window.setTimeout(callback, 1000 / 60))) as typeof window.requestAnimationFrame;

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
