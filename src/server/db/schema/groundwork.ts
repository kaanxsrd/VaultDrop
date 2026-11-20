import { groundworkTables } from "@vantedev/groundwork/schema";

/**
 * groundwork's tables, migrated with the rest of this schema. They are exported under `gw` names
 * because this app's older rate_limits, idempotency_keys and job_runs tables still exist while
 * the move settles.
 */
export const {
  rateLimits: gwRateLimits,
  idempotencyKeys: gwIdempotencyKeys,
  jobs: gwJobs,
  jobSchedules: gwJobSchedules,
} = groundworkTables();
