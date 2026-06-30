import type { EventHandler } from '~/types/aplayer';

class Events {
    events: Record<string, EventHandler[]>;

    audioEvents: string[];

    playerEvents: string[];

    constructor() {
        this.events = {};

        this.audioEvents = [
            'abort',
            'canplay',
            'canplaythrough',
            'durationchange',
            'emptied',
            'ended',
            'error',
            'loadeddata',
            'loadedmetadata',
            'loadstart',
            'mozaudioavailable',
            'pause',
            'play',
            'playing',
            'progress',
            'ratechange',
            'seeked',
            'seeking',
            'stalled',
            'suspend',
            'timeupdate',
            'volumechange',
            'waiting',
        ];
        this.playerEvents = ['destroy', 'listshow', 'listhide', 'listadd', 'listremove', 'listswitch', 'listclear', 'noticeshow', 'noticehide', 'lrcshow', 'lrchide'];
    }

    on(name: string, callback: EventHandler) {
        if (this.type(name) && typeof callback === 'function') {
            const list = this.events[name];
            if (list) {
                list.push(callback);
            } else {
                this.events[name] = [callback];
            }
        }
    }

    trigger(name: string, data?: unknown) {
        const list = this.events[name];
        if (list && list.length) {
            for (let i = 0; i < list.length; i++) {
                list[i]!(data);
            }
        }
    }

    type(name: string): 'player' | 'audio' | null {
        if (this.playerEvents.indexOf(name) !== -1) {
            return 'player';
        } else if (this.audioEvents.indexOf(name) !== -1) {
            return 'audio';
        }

        console.error(`Unknown event name: ${name}`);
        return null;
    }
}

export default Events;
