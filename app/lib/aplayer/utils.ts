const isMobile = /mobile/i.test(window.navigator.userAgent);

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
            localStorage.setItem(key, value);
        },

        get: (key: string): string | null => localStorage.getItem(key),
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
