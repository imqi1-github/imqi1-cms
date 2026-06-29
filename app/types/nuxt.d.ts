import type { App } from "vue";

export interface NuxtVueApp extends App {
  _context: App["context"];
}