// Entry point for the Render cron job that starts the daily rebuild.
//
// Workflows have no built-in scheduler, so the schedule is an ordinary cron
// service that dispatches one run and exits. WORKFLOW_SLUG, CRON_TASK, and
// RENDER_API_KEY come from the Blueprint.
import { runCron } from "@render-lab/triggers";

const result = await runCron({ task: process.env.CRON_TASK ?? "grouplink.rebuild" });
console.log(`dispatched ${result.runId} (${result.status})`);
