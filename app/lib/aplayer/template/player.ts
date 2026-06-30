// 将 art-template 转换为 JavaScript 模板函数
import type Icons from '../icons';

import tplListItem from './list-item'

import type { ResolvedAPlayerOptions } from '~/types/aplayer';

export default function (data: { options: ResolvedAPlayerOptions; icons: typeof Icons; cover: string; getObject?: (obj: unknown) => unknown }): string {
  const { options, icons, cover } = data

  if (!options.fixed) {
    return `
<div class="aplayer-body">
    <div class="aplayer-pic" style="background-color: ${options.theme};">
        ${cover ? `
            <div class="aplayer-pic-box">
                <img src="${cover}" alt="歌曲封面"/>
            </div>
        ` : ''}
    </div>
    <div class="aplayer-info">
        <div class="aplayer-music">
            <span class="aplayer-title">无音频</span>
            <span class="aplayer-author"></span>
        </div>
        <div class="aplayer-lrc">
            <div class="aplayer-lrc-contents" style="transform: translateY(0); -webkit-transform: translateY(0);"></div>
        </div>
        <div class="aplayer-controller">
            <div class="aplayer-bar-wrap">
                <div class="aplayer-bar">
                    <div class="aplayer-loaded" style="width: 0"></div>
                    <div class="aplayer-played" style="width: 0; background: ${options.theme};">
                        <span class="aplayer-thumb" style="background: ${options.theme};">
                            <span class="aplayer-loading-icon">${icons.loading}</span>
                        </span>
                    </div>
                </div>
            </div>
            <div class="aplayer-time">
                <span class="aplayer-time-inner">
                    <span class="aplayer-ptime">00:00</span> / <span class="aplayer-dtime">00:00</span>
                </span>
                <span class="aplayer-icon aplayer-icon-back">
                    ${icons.skip}
                </span>
                <span class="aplayer-icon aplayer-icon-play">
                    ${icons.play}
                </span>
                <span class="aplayer-icon aplayer-icon-forward">
                    ${icons.skip}
                </span>
                <div class="aplayer-volume-wrap">
                    <button type="button" class="aplayer-icon aplayer-icon-volume-down">
                        ${icons.volumeDown}
                    </button>
                    <div class="aplayer-volume-bar-wrap">
                        <div class="aplayer-volume-bar">
                            <div class="aplayer-volume" style="height: 80%; background: ${options.theme};"></div>
                        </div>
                    </div>
                </div>
                <button type="button" class="aplayer-icon aplayer-icon-order">
                    ${options.order === 'list' ? icons.orderList : options.order === 'random' ? icons.orderRandom : ''}
                </button>
                <button type="button" class="aplayer-icon aplayer-icon-loop">
                    ${options.loop === 'one' ? icons.loopOne : options.loop === 'all' ? icons.loopAll : options.loop === 'none' ? icons.loopNone : ''}
                </button>
                <button type="button" class="aplayer-icon aplayer-icon-menu">
                    ${icons.menu}
                </button>
                <button type="button" class="aplayer-icon aplayer-icon-lrc">
                    ${icons.lrc}
                </button>
            </div>
        </div>
    </div>
    <div class="aplayer-notice"></div>
    <div class="aplayer-miniswitcher"><button class="aplayer-icon">${icons.right}</button></div>
</div>
<div class="aplayer-list${options.listFolded ? ' aplayer-list-hide' : ''}">
    <ol>
        ${tplListItem({ theme: options.theme, audio: options.audio, index: 1 })}
    </ol>
</div>`
  } else {
    return `
<div class="aplayer-list${options.listFolded ? ' aplayer-list-hide' : ''}">
    <ol>
        ${tplListItem({ theme: options.theme, audio: options.audio, index: 1 })}
    </ol>
</div>
<div class="aplayer-body">
    <div class="aplayer-pic" style="background-color: ${options.theme};">
        ${cover ? `
            <div class="aplayer-pic-box">
                <img src="${cover}" alt="歌曲封面"/>
            </div>
        ` : ''}
    </div>
    <div class="aplayer-info" style="display: none;">
        <div class="aplayer-music">
            <span class="aplayer-title">无音频</span>
            <span class="aplayer-author"></span>
        </div>
        <div class="aplayer-controller">
            <div class="aplayer-bar-wrap">
                <div class="aplayer-bar">
                    <div class="aplayer-loaded" style="width: 0"></div>
                    <div class="aplayer-played" style="width: 0; background: ${options.theme};">
                        <span class="aplayer-thumb" style="background: ${options.theme};">
                            <span class="aplayer-loading-icon">${icons.loading}</span>
                        </span>
                    </div>
                </div>
            </div>
            <div class="aplayer-time">
                <span class="aplayer-time-inner">
                    <span class="aplayer-ptime">00:00</span> / <span class="aplayer-dtime">00:00</span>
                </span>
                <span class="aplayer-icon aplayer-icon-back">
                    ${icons.skip}
                </span>
                <span class="aplayer-icon aplayer-icon-play">
                    ${icons.play}
                </span>
                <span class="aplayer-icon aplayer-icon-forward">
                    ${icons.skip}
                </span>
                <div class="aplayer-volume-wrap">
                    <button type="button" class="aplayer-icon aplayer-icon-volume-down">
                        ${icons.volumeDown}
                    </button>
                    <div class="aplayer-volume-bar-wrap">
                        <div class="aplayer-volume-bar">
                            <div class="aplayer-volume" style="height: 80%; background: ${options.theme};"></div>
                        </div>
                    </div>
                </div>
                <button type="button" class="aplayer-icon aplayer-icon-order">
                    ${options.order === 'list' ? icons.orderList : options.order === 'random' ? icons.orderRandom : ''}
                </button>
                <button type="button" class="aplayer-icon aplayer-icon-loop">
                    ${options.loop === 'one' ? icons.loopOne : options.loop === 'all' ? icons.loopAll : options.loop === 'none' ? icons.loopNone : ''}
                </button>
                <button type="button" class="aplayer-icon aplayer-icon-menu">
                    ${icons.menu}
                </button>
                <button type="button" class="aplayer-icon aplayer-icon-lrc">
                    ${icons.lrc}
                </button>
            </div>
        </div>
    </div>
    <div class="aplayer-notice"></div>
    <div class="aplayer-miniswitcher"><button class="aplayer-icon">${icons.right}</button></div>
</div>
<div class="aplayer-lrc">
    <div class="aplayer-lrc-contents" style="transform: translateY(0); -webkit-transform: translateY(0);"></div>
</div>`
  }
}
