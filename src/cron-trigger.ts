// Entry point for the Render cron job that starts the rebuild every three hours.
//
// Workflows have no built-in scheduler, so the schedule is an ordinary cron
// service that dispatches one run and exits. WORKFLOW_SLUG, CRON_TASK, and
// RENDER_API_KEY come from the Blueprint.
import { runCron } from "@render-lab/triggers";

// Statuses runCron can report for a dispatch that never started a run.
const DISPATCH_FAILED = new Set(["failed", "canceled", "cancelled", "errored"]);

const result = await runCron({ task: process.env.CRON_TASK ?? "grouplink.rebuild" });
console.log(`dispatched ${result.runId} (${result.status})`);

// This exit code covers the dispatch only. The run proceeds durably after this
// process exits, and reports through the dashboard and the Slack post.
if (DISPATCH_FAILED.has(result.status.toLowerCase())) {
  console.error(`dispatch reported ${result.status}`);
  process.exitCode = 1;
}
