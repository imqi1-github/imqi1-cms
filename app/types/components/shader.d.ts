import type { HTMLAttributes } from "vue";

/** Inspira 着色器（ShaderToy / SingularityBackground）共享类型与组件 Props */

export interface ShaderConfig {
  source: string;
}

export interface MouseState {
  x: number;
  y: number;
  clickX: number;
  clickY: number;
}

export interface HSVControls {
  hue: number; // 0-360
  saturation: number; // 0-1
  brightness: number; // 0-1
}

export type MouseMode = "click" | "hover";

export interface ShaderToyProps {
  mouseMode?: MouseMode;
  class?: HTMLAttributes["class"];
  shaderCode: string;
  hue?: number;
  saturation?: number;
  brightness?: number;
  speed?: number;
  mouseSensitivity?: number;
  damping?: number;
}

export interface SingularityBackgroundProps {
  class?: HTMLAttributes["class"];
  mouseMode?: MouseMode;
  hue?: number;
  saturation?: number;
  brightness?: number;
  speed?: number;
  mouseSensitivity?: number;
  damping?: number;
}
