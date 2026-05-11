import { getSetting, getSettings } from '../config/settings';
import {
  claimScheduledJobRun,
  completeJobRun,
  failJobRun,
  listJobRuns,
  markJobRunRunning,
  startManualJobRun,
} from './history';
import { toJsonSafeValue } from './jsonSafe';
import { shouldRunCronSchedule } from './schedule';
import type { JobRunContext, RegisteredJob } from './types';

const CHECK_INTERVAL_MS = 60_000;

const jobs = new Map<string, RegisteredJob>();

declare let globalThis: { __loreJobScheduler?: boolean } & typeof global;

export function registerJob(job: RegisteredJob): void {
  jobs.set(job.id, job);
}

export function listRegisteredJobs(): RegisteredJob[] {
  return Array.from(jobs.values());
}

export function clearJobRegistryForTest(): void {
  jobs.clear();
  globalThis.__loreJobScheduler = false;
}

function jobResultDetails(result: unknown): Record<string, unknown> {
  const safeResult = toJsonSafeValue(result);
  if (safeResult && typeof safeResult === 'object' && 'result_type' in safeResult) {
    return safeResult as Record<string, unknown>;
  }
  return { result: safeResult };
}

async function executeJob(job: RegisteredJob, context: JobRunContext): Promise<unknown> {
  const startedAt = Date.now();
  try {
    await markJobRunRunning(context.run_id);
    const result = await job.run(context);
    await completeJobRun(context.run_id, Date.now() - startedAt, jobResultDetails(result));
    return result;
  } catch (error) {
    await failJobRun(context.run_id, Date.now() - startedAt, error);
    throw error;
  }
}

export async function runDueJobsForTest(now: Date = new Date()): Promise<void> {
  for (const job of jobs.values()) {
    try {
      const enabled = await getSetting(job.schedule.enabledKey);
      if (enabled === false || enabled === 'false') continue;

      const settings = await getSettings([job.schedule.cronKey]);
      const cron = String(settings[job.schedule.cronKey] || job.schedule.defaultCron);
      const schedule = shouldRunCronSchedule(now, cron);
      if (!schedule.due) continue;

      const claim = await claimScheduledJobRun(job.id, schedule.slotKey, { date: schedule.date, hour: schedule.hour, minute: schedule.minute });
      if (!claim.claimed || claim.runId === null) continue;

      await executeJob(job, {
        job_id: job.id,
        trigger: 'scheduled',
        run_id: claim.runId,
        slot_key: schedule.slotKey,
      });
    } catch (error) {
      console.error('[job-scheduler] job failed', job.id, (error as Error)?.message || String(error));
    }
  }
}

export async function runJobNow(jobId: string): Promise<{ job_id: string; run_id: number; result: unknown }> {
  const job = jobs.get(jobId);
  if (!job) throw Object.assign(new Error(`Unknown job: ${jobId}`), { status: 404 });

  const { runId } = await startManualJobRun(jobId);
  const result = await executeJob(job, {
    job_id: job.id,
    trigger: 'manual',
    run_id: runId,
    slot_key: null,
  });
  return { job_id: job.id, run_id: runId, result };
}

export async function runJobNowInBackground(jobId: string): Promise<{ job_id: string; run_id: number }> {
  const job = jobs.get(jobId);
  if (!job) throw Object.assign(new Error(`Unknown job: ${jobId}`), { status: 404 });

  const { runId } = await startManualJobRun(jobId);
  void executeJob(job, {
    job_id: job.id,
    trigger: 'manual',
    run_id: runId,
    slot_key: null,
  }).catch((error: unknown) => {
    console.error('[job-scheduler] background job failed', job.id, (error as Error)?.message || String(error));
  });
  return { job_id: job.id, run_id: runId };
}

export async function listJobsWithRuns(): Promise<{ jobs: RegisteredJob[]; recent_runs: Awaited<ReturnType<typeof listJobRuns>> }> {
  const recent_runs = await listJobRuns({ limit: 50 });
  return { jobs: listRegisteredJobs(), recent_runs };
}

export function initJobScheduler(): void {
  if (globalThis.__loreJobScheduler) return;
  globalThis.__loreJobScheduler = true;
  setInterval(() => {
    runDueJobsForTest().catch((error: unknown) => {
      console.error('[job-scheduler] failed', (error as Error)?.message || String(error));
    });
  }, CHECK_INTERVAL_MS);
  console.log(`[job-scheduler] initialized, checking every ${CHECK_INTERVAL_MS / 1000}s`);
}
