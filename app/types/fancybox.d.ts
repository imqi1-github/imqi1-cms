import type { FancyboxOptions } from "@fancyapps/ui";

export interface FancyboxLike {
  getContainer?: () => HTMLElement;
  getSlide?: () => FancyboxSlide | undefined;
}

export interface FancyboxSlide {
  el?: HTMLElement;
  src?: string;
  triggerEl?: HTMLElement & { src?: string };
  livePhoto?: unknown;
}

export type FancyboxEventHandler = (...args: unknown[]) => void;

export interface FancyboxConfig extends Partial<FancyboxOptions> {
  on?: Record<string, FancyboxEventHandler>;
  l10n?: Record<string, string>;
}