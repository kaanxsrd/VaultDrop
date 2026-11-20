import { groundworkTables } from "@vantedev/groundwork/schema";

/**
 * groundwork's tables, migrated with the rest of this schema. They are exported under `gw` names
 * because this app's older rate_limits table still exists while the move settles.
 */
export const { rateLimits: gwRateLimits } = groundworkTables();
