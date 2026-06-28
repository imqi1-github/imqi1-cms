import type {InternalApi} from "nitropack/types";

export type LinkItem = NonNullable<InternalApi["/api/links"]["get"]["data"]>[number];