import type { BarDirection, BarType } from '~/types/aplayer';

class Bar {
    elements: Record<BarType, HTMLElement>;

    constructor(template: { volume: HTMLElement; played: HTMLElement; loaded: HTMLElement }) {
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
        percentage = Math.max(percentage, 0);
        percentage = Math.min(percentage, 1);
        this.elements[type].style[direction] = percentage * 100 + '%';
    }

    get(type: BarType, direction: BarDirection) {
        return parseFloat(this.elements[type].style[direction]) / 100;
    }
}

export default Bar;
