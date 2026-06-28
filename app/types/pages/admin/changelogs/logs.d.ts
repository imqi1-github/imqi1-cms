import type {InternalApi} from "nitropack/types";

export type ChangelogItem = InternalApi["/api/admin/changelogs"]["get"][number];