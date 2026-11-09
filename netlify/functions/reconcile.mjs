// Nightly check that ClickUp matches the proposal records (docs/proposal-tracking-solution.md, section 4).
// For every proposal linked to a task: a signed proposal whose task is below "signed" is fixed; a published
// proposal whose task is still "lead" is fixed; an unsigned proposal older than 14 days gets one comment.
// Tasks at "complete" or outside the Pipeline space are left alone. Without CLICKUP_API_TOKEN it only logs.
// The nudge marker is kept in its own store ("proposal-tracking", key nudge/<address>) so this function never
// rewrites a proposal record: a client signature arriving mid-run can never be overwritten by the nightly check.
import { getStore } from "@netlify/blobs";
import { getTask, notify } from "./lib/clickup.mjs";
import { decide } from "./lib/reconcile-rules.mjs";

const SITE = (process.env.URL || process.env.DEPLOY_PRIME_URL || "https://steadfast-sow-kit.netlify.app").replace(/\/+$/, "");
export const RUN_BUDGET_MS = 20_000; // stop cleanly before Netlify's scheduled-function limit; the rest waits a day

export default async () => {
  const dry = !(process.env.CLICKUP_API_TOKEN || "").trim();
  const s = getStore({ name: "proposals", consistency: "strong" });
  const tracking = getStore({ name: "proposal-tracking", consistency: "strong" });
  const { blobs } = await s.list();
  const summary = { checked: 0, actions: 0, skipped: 0, errors: 0, left: 0, dryRun: dry };
  const stopAt = Date.now() + RUN_BUDGET_MS;

  for (const [i, b] of blobs.entries()) {
    if (Date.now() > stopAt) { summary.left = blobs.length - i; console.log(`[reconcile] out of time, ${summary.left} proposals wait for tomorrow`); break; }
    let meta;
    try { meta = (await s.getMetadata(b.key))?.metadata; } catch (e) { summary.errors++; console.error(`[reconcile] ${b.key}: ${e?.message || e}`); continue; }
    if (!meta?.clickupTask) continue;
    summary.checked++;
    const address = `${SITE}/${b.key}`;
    const ctx = { taskId: meta.clickupTask, address, total: meta.total ?? null, sentBy: meta.sentBy ?? null, version: meta.version ?? null, signedAt: meta.signedAt ?? null, docHash: meta.docHash ?? null };

    if (dry) {
      console.log(`[reconcile dry-run] ${b.key} -> task ${meta.clickupTask}: would GET the task and apply the rules (signedAt=${meta.signedAt || "none"}, publishedAt=${meta.publishedAt})`);
      continue;
    }

    let task = null;
    try { task = await getTask(meta.clickupTask); } catch (e) { summary.errors++; console.error(`[reconcile] ${b.key} task ${meta.clickupTask}: ${e?.message || e}`); continue; }

    let nudgedAt = null;
    try { nudgedAt = (await tracking.get(`nudge/${b.key}`, { type: "json" }))?.nudgedAt ?? null; } catch (e) { summary.errors++; console.error(`[reconcile] ${b.key}: could not read the nudge marker: ${e?.message || e}`); continue; }

    for (const a of decide({ ...meta, nudgedAt }, task)) {
      if (a.event === "skip") { summary.skipped++; console.log(`[reconcile] ${b.key}: skipped, ${a.reason}`); continue; }
      const r = await notify(a.event, ctx, { task });
      if (r?.error) { summary.errors++; continue; }
      summary.actions++;
      console.log(`[reconcile] ${b.key}: ${a.event} (${a.reason})`);
      if (a.event === "nudge" && r?.comment) {
        try { await tracking.setJSON(`nudge/${b.key}`, { nudgedAt: new Date().toISOString(), taskId: meta.clickupTask }); }
        catch (e) { summary.errors++; console.error(`[reconcile] ${b.key}: could not record the nudge: ${e?.message || e}`); }
      }
    }
  }
  console.log(`[reconcile] done: ${JSON.stringify(summary)}`);
  return new Response(JSON.stringify(summary), { headers: { "content-type": "application/json" } });
};

export const config = { schedule: "0 11 * * *" };
