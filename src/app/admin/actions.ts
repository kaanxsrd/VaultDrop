"use server";

import { revalidatePath } from "next/cache";
import type { PlanId } from "@/config/plans";
import { setUserBanned, setUserPlan } from "@/server/admin";
import { requireAdmin } from "@/server/auth/session";
import { JOBS, type JobName, runJob } from "@/server/jobs/runner";

// Every action re-checks the admin role on the server; the UI hiding buttons is not a control.

export async function setPlanAction(formData: FormData) {
  const session = await requireAdmin();
  await setUserPlan(
    session.user.id,
    String(formData.get("userId")),
    String(formData.get("plan")) as PlanId,
  );
  revalidatePath("/admin");
}

export async function toggleBanAction(formData: FormData) {
  const session = await requireAdmin();
  await setUserBanned(
    session.user.id,
    String(formData.get("userId")),
    formData.get("banned") === "true",
  );
  revalidatePath("/admin");
}

export async function runJobAction(formData: FormData) {
  await requireAdmin();
  const job = String(formData.get("job"));
  if (job in JOBS) await runJob(job as JobName);
  revalidatePath("/admin");
}
