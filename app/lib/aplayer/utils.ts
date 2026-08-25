const isMobile = /mobile/i.test(window.navigator.userAgent);

/** 模板插值 HTML 转义(防 DOM XSS);icons.* 这类内联 SVG 应保持原样,勿由此转义 */
export const escapeHtml = (input: unknown): string =>
    String(input == null ? '' : input)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const utils = {
    /**
     * Parse second to time string
     *
     * @param second
     * @return 00:00 or 00:00:00
     */
    secondToTime: (second: number): string => {
        const add0 = (num: number): string => (num < 10 ? '0' + num : '' + num);
        const hour = Math.floor(second / 3600);
        const min = Math.floor((second - hour * 3600) / 60);
        const sec = Math.floor(second - hour * 3600 - min * 60);
        return (hour > 0 ? [hour, min, sec] : [min, sec]).map(add0).join(':');
    },

    isMobile,

    storage: {
        set: (key: string, value: string): void => {
            try {
                localStorage.setItem(key, value);
            } catch {
                /* 隐私模式/满容/沙箱抛错时静默降级,避免打断音量/初始化 */
            }
        },

        get: (key: string): string | null => {
            try {
                return localStorage.getItem(key);
            } catch {
                return null;
            }
        },
    },

    nameMap: {
        dragStart: isMobile ? 'touchstart' : 'mousedown',
        dragMove: isMobile ? 'touchmove' : 'mousemove',
        dragEnd: isMobile ? 'touchend' : 'mouseup',
    },

    /**
     * get random order, using Fisher–Yates shuffle
     */
    randomOrder: (length: number): number[] => {
        function shuffle(arr: number[]): number[] {
            for (let i = arr.length - 1; i >= 0; i--) {
                const randomIndex = Math.floor(Math.random() * (i + 1));
                const itemAtIndex = arr[randomIndex]!;
                arr[randomIndex] = arr[i]!;
                arr[i] = itemAtIndex;
            }
            return arr;
        }
        return shuffle(
            Array.from({ length }, (_item, i) => i),
        );
    },
};

export default utils;
