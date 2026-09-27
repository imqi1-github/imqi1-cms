/**
 * useAudioPlayer 关键不变式:
 *  1) initPlayer 成功 → playlist/currentSong/isLoaded 有值;isInitialized=true 阻止二次
 *  2) 空 playlistConfig.id → 不初始化(留作刷新重试)
 *  3) $fetch /api/meting 失败累加 metingFailureCount;达 3 次后 isDisabled=true 永不再加载
 *  4) cleanup 复位 isInitialized=false
 *  5) dispose during await($fetch 返回前 cleanup)→ 不创建 audio、不写 state
 *  6) togglePlay 时 audio=null → 不动 isPlaying
 *  7) playNext:未播放过的优先;全部播过 → 重置 playedIndices 再选
 *
 * 注:模块级 metingFailureCount 跨 test 累积,bun:test 串行跑。
 * 测试顺序: 成功 → togglePlay/playNext(mfc=0) → 失败累积 → isDisabled → cleanup/dispose。
 * mfc 达 3 后永远不重置(产品行为),后续 init 全部走"立即 return"分支。
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Window } from "happy-dom";

let win: Window;
let origFetch: typeof globalThis.$fetch;

interface Song { name: string; url: string }
const fakeSongs: Song[] = [
  { name: "A", url: "https://x/a.mp3" },
  { name: "B", url: "https://x/b.mp3" },
  { name: "C", url: "https://x/c.mp3" },
];

beforeEach(() => {
  win = new Window();
  // happy-dom 不暴露 Audio 全局 → useAudioPlayer 内的 new Audio() 抛 ReferenceError
  // 把 win.Audio / win.HTMLAudioElement 注入 globalThis
  Object.assign(globalThis, {
    window: win,
    document: win.document,
    HTMLElement: win.HTMLElement,
    Audio: win.Audio,
    HTMLAudioElement: win.HTMLAudioElement,
  });
  origFetch = globalThis.$fetch;
});

afterEach(async () => {
  // 复位 audio 单例 + isInitialized(供下一个 test 干净跑)
  const { useAudioPlayer } = await import("~/composables/useAudioPlayer");
  useAudioPlayer().cleanup();
  // 重置 useState 共享状态(跨 useAudioPlayer() 调用共享)
  useState<Song[]>("audio:playlist", () => []).value = [];
  useState<Song | null>("audio:currentSong", () => null).value = null;
  useState<boolean>("audio:isPlaying", () => false).value = false;
  useState<boolean>("audio:isLoaded", () => false).value = false;
  useState<boolean>("audio:isDisabled", () => false).value = false;
  useState<number>("audio:progress", () => 0).value = 0;
  useState<boolean>("audio:shouldAutoPlay", () => false).value = false;
  useState<number[]>("audio:playedIndices", () => []).value = [];
  useState<number>("audio:playbackFailureCount", () => 0).value = 0;
  globalThis.$fetch = origFetch;
});

function setFetchOk(): void {
  globalThis.$fetch = (async () => fakeSongs) as typeof globalThis.$fetch;
}
function setFetchFail(): void {
  globalThis.$fetch = (async () => {
    throw new Error("meting 502");
  }) as typeof globalThis.$fetch;
}

describe("useAudioPlayer initPlayer 成功路径", () => {
  test("成功 → playlist/currentSong/isLoaded 有值;isInitialized=true 阻止二次", async () => {
    let calls = 0;
    globalThis.$fetch = (async () => {
      calls++;
      return fakeSongs;
    }) as typeof globalThis.$fetch;

    const { useAudioPlayer } = await import("~/composables/useAudioPlayer");
    const player = useAudioPlayer();
    await player.initPlayer({ id: "playlist-1", server: "netease" });
    expect(calls).toBe(1);
    expect(player.playlist.value).toEqual(fakeSongs);
    expect(player.currentSong.value).not.toBeNull();
    expect(player.isLoaded.value).toBe(true);
    expect(player.isDisabled.value).toBe(false);

    // 第二次 initPlayer → 立即 return,不调 fetch
    await player.initPlayer({ id: "playlist-2", server: "netease" });
    expect(calls).toBe(1);
  });

  test("playlistConfig.id 为空 → 不初始化、不调 fetch", async () => {
    let calls = 0;
    globalThis.$fetch = (async () => {
      calls++;
      return fakeSongs;
    }) as typeof globalThis.$fetch;

    const { useAudioPlayer } = await import("~/composables/useAudioPlayer");
    const player = useAudioPlayer();
    await player.initPlayer({ id: "", server: "netease" });
    expect(calls).toBe(0);
    expect(player.playlist.value).toEqual([]);
    expect(player.isLoaded.value).toBe(false);
  });
});

describe("useAudioPlayer togglePlay / dispose (mfc=0 时跑)", () => {
  test("togglePlay 时 audio 未创建 → 直接 return,不动 isPlaying", async () => {
    const { useAudioPlayer } = await import("~/composables/useAudioPlayer");
    const player = useAudioPlayer();
    expect(player.isPlaying.value).toBe(false);
    player.togglePlay();
    expect(player.isPlaying.value).toBe(false);
  });

  test("dispose during await($fetch 返回前 cleanup)→ 不写 state", async () => {
    let release!: (songs: Song[]) => void;
    globalThis.$fetch = (async () => new Promise<Song[]>((r) => {
      release = r;
    })) as typeof globalThis.$fetch;
    const { useAudioPlayer } = await import("~/composables/useAudioPlayer");
    const player = useAudioPlayer();
    const p = player.initPlayer({ id: "p", server: "netease" });
    player.cleanup(); // fetch 返回前 → 触发 isDisposed=true
    expect(typeof release).toBe("function");
    release(fakeSongs);
    await p;
    expect(player.playlist.value).toEqual([]);
    expect(player.isLoaded.value).toBe(false);
  });

  test("playNext:从未播放过的优先;全部播过 → 重置 playedIndices 再选", async () => {
    setFetchOk();
    const { useAudioPlayer } = await import("~/composables/useAudioPlayer");
    const player = useAudioPlayer();
    await player.initPlayer({ id: "p", server: "netease" });
    const firstSong = player.currentSong.value;
    expect(firstSong).not.toBeNull();

    // 调 playNext 多次直到全部 3 首都播过
    const seen: Song[] = [firstSong!];
    let safety = 20;
    while (safety-- > 0) {
      player.playNext();
      const cur = player.currentSong.value;
      if (!cur) break;
      seen.push(cur);
      const distinct = new Set(seen.map(s => s.url));
      if (distinct.size === 3) break;
    }
    expect(new Set(seen.map(s => s.url)).size).toBe(3);
  });
});

describe("useAudioPlayer initPlayer 失败闸门(累积)", () => {
  test("mfc=0:首次失败 → 失败计数累加;isDisabled 未触发", async () => {
    setFetchFail();
    const { useAudioPlayer } = await import("~/composables/useAudioPlayer");
    const player = useAudioPlayer();
    await player.initPlayer({ id: "p", server: "netease" });
    // 之前 mfc=0(playNext 测试成功 reset 过一次)+本次 1 次 = 1;未达上限
    expect(player.isDisabled.value).toBe(false);
    expect(player.playlist.value).toEqual([]);
  });

  test("mfc=1:再失败 1 次 → 累计到 2,isDisabled 仍未触发", async () => {
    setFetchFail();
    const { useAudioPlayer } = await import("~/composables/useAudioPlayer");
    const player = useAudioPlayer();
    await player.initPlayer({ id: "p", server: "netease" });
    expect(player.isDisabled.value).toBe(false);
  });

  test("mfc=2:再失败 1 次 → 累计到 3,isDisabled=true", async () => {
    setFetchFail();
    const { useAudioPlayer } = await import("~/composables/useAudioPlayer");
    const player = useAudioPlayer();
    await player.initPlayer({ id: "p", server: "netease" });
    expect(player.isDisabled.value).toBe(true);
  });

  test("mfc=3 已禁用:后续 initPlayer 立即 return,不调 fetch", async () => {
    let calls = 0;
    globalThis.$fetch = (async () => {
      calls++;
      return fakeSongs;
    }) as typeof globalThis.$fetch;
    const { useAudioPlayer } = await import("~/composables/useAudioPlayer");
    const player = useAudioPlayer();
    await player.initPlayer({ id: "p", server: "netease" });
    expect(calls).toBe(0);
    expect(player.isDisabled.value).toBe(true);
    expect(player.playlist.value).toEqual([]);
  });
});

describe("useAudioPlayer cleanup (mfc 已 3 后)", () => {
  test("cleanup → isInitialized=false(mfc 已 3 不变),不调 fetch 时不影响 isDisabled", async () => {
    setFetchOk();
    const { useAudioPlayer } = await import("~/composables/useAudioPlayer");
    const player = useAudioPlayer();
    player.cleanup();
    // cleanup 后 isInitialized=false,但 mfc=3 → init 仍立即 return
    let calls = 0;
    globalThis.$fetch = (async () => {
      calls++;
      return fakeSongs;
    }) as typeof globalThis.$fetch;
    await player.initPlayer({ id: "p", server: "netease" });
    expect(calls).toBe(0);
    expect(player.isDisabled.value).toBe(true);
  });
});