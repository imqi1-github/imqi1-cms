import type Renderer from "markdown-it/lib/renderer.mjs";

export type RenderRule = NonNullable<Renderer["rules"]["link_open"]>;

export interface MusicPlatform {
  name: string;
  regex: RegExp;
  getServer: () => string;
  getType: (match: RegExpMatchArray) => string;
  getId: (match: RegExpMatchArray) => string;
}
