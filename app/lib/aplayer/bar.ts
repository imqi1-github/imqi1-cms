import type { APlayerBarTemplate, BarDirection, BarType } from '~/types/aplayer';

class Bar {
    elements: Record<BarType, HTMLElement>;

    constructor(template: APlayerBarTemplate) {
        this.elements = {} as Record<BarType, HTMLElement>;
        this.elements.volume = template.volume;
        this.elements.played = template.played;
        this.elements.loaded = template.loaded;
    }

    /**
     * Update progress
     *
     * @param type - Point out which bar it is
     * @param percentage
     * @param direction - Point out the direction of this bar, Should be height or width
     */
    set(type: BarType, percentage: number, direction: BarDirection) {
        // 防御 NaN/Infinity(如 0/0、切歌瞬间 duration=0),否则会写出非法 CSS 值 NaN%
        if (!Number.isFinite(percentage)) {
            percentage = 0;
        }
        percentage = Math.max(percentage, 0);
        percentage = Math.min(percentage, 1);
        this.elements[type].style[direction] = percentage * 100 + '%';
    }

    get(type: BarType, direction: BarDirection) {
        const value = parseFloat(this.elements[type].style[direction]);
        return isNaN(value) ? 0 : value / 100;
    }
}

export default Bar;
