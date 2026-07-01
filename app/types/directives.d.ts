import type { Directive } from "vue";

import type { MenuElement, MenuItems } from "~/types/context-menu";
import type { ScrollRevealOptions } from "~/types/scroll-reveal";

declare module "vue" {
  export interface GlobalDirectives {
    vContextMenu: Directive<MenuElement, MenuItems>;
    vScrollReveal: Directive<HTMLElement, ScrollRevealOptions | undefined>;
  }
}

export {};
