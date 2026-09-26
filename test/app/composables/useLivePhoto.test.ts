import { describe, expect, test } from "bun:test";

import { clearLivePhotoMediaCache, useLivePhoto } from "~/composables/useLivePhoto";

describe("useLivePhoto pure helpers", () => {
  test("isLivePhoto / cleanLivePhotoUrl 双向往返", () => {
    const { isLivePhoto, cleanLivePhotoUrl } = useLivePhoto();
    expect(isLivePhoto("https://x.com/a.jpg#live")).toBe(true);
    expect(isLivePhoto("https://x.com/a.jpg")).toBe(false);
    expect(cleanLivePhotoUrl("https://x.com/a.jpg#live")).toBe("https://x.com/a.jpg");
    expect(cleanLivePhotoUrl("https://x.com/a.jpg")).toBe("https://x.com/a.jpg");
    expect(isLivePhoto(cleanLivePhotoUrl("https://x.com/a.jpg#live") + "#live")).toBe(true);
  });

  test("peekLivePhotoImageUrl:未缓存时返回 null(不应抛)", () => {
    clearLivePhotoMediaCache();
    const { peekLivePhotoImageUrl } = useLivePhoto();
    expect(peekLivePhotoImageUrl("https://x.com/never-seen.jpg")).toBeNull();
  });
});