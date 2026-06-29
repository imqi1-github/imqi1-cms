import "vue-router";

export interface RouterOptionsWithScrollType {
  scrollBehaviorType?: ScrollBehavior["behavior"];
}

declare module "vue-router" {
  interface RouteMeta {
    scrollToTop?: boolean | ((to: RouteLocationNormalized, from: RouteLocationNormalized) => boolean);
  }
}

type NuxtAppWithTransition = ReturnType<typeof useNuxtApp> & {
  "~transitionPromise"?: Promise<unknown>;
};