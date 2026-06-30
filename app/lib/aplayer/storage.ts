import utils from './utils';
import type APlayer from './player';

class Storage {
    storageName: string;

    data: Record<string, unknown>;

    constructor(player: APlayer) {
        this.storageName = player.options.storageName;

        this.data = JSON.parse(utils.storage.get(this.storageName) ?? 'null') as Record<string, unknown>;
        if (!this.data) {
            this.data = {};
        }
        this.data.volume = (this.data.volume as number) || player.options.volume;
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
