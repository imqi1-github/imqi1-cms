import type { Coord } from "~~/shared/city-coords";

export type Bucket = "ok" | "overseas" | "unknown";
export type ResolvedPoint = { coord: Coord; locations: string[]; isps: string[] };
