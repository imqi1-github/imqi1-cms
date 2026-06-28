import type {InternalApi} from "nitropack/types";

export type SubscribeItem = InternalApi["/api/admin/subscribes"]["get"][number];
export type SubscribesUpdateResponse = InternalApi["/api/admin/subscribes/update"]["post"];