import type { Directive } from "vue";

import type { ScrollRevealOptions } from "~/types/scroll-reveal";

declare module "vue" {
  export interface GlobalDirectives {
    vScrollReveal: Directive<HTMLElement, ScrollRevealOptions | undefined>;
  }
}

export {};
