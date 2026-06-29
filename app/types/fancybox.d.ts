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

export interface FancyboxConfig {
  on?: Record<string, FancyboxEventHandler>;
}