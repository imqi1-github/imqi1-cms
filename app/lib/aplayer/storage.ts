import utils from './utils';
import type APlayer from './player';

class Storage {
    storageName: string;

    data: Record<string, unknown>;

    constructor(player: APlayer) {
        this.storageName = player.options.storageName;

        let parsed: unknown;
        try {
            parsed = JSON.parse(utils.storage.get(this.storageName) ?? 'null');
        } catch {
            parsed = null;
        }
        // 仅接受可写对象;损坏/非对象值一律重置,避免构造器抛错
        this.data = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
        if (typeof this.data.volume !== 'number') {
            this.data.volume = player.options.volume;
        }
    }

    get(key: string) {
        return this.data[key];
    }

    set(key: string, value: unknown) {
        this.data[key] = value;
        utils.storage.set(this.storageName, JSON.stringify(this.data));
    }
}

export default Storage;
