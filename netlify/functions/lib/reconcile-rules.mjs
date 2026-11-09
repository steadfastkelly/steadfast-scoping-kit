// Decides what the nightly reconcile does for one proposal record against its ClickUp task. Pure, so it is tested
// without Blobs or the network. Returns an ordered list of actions: { event, reason } where event is one of the
// clickup.mjs events, plus "nudge", after which reconcile.mjs records nudgedAt (passed back in on meta.nudgedAt).

import { STATUS_ORDER, inPipeline, isDone } from "./clickup.mjs";

export const NUDGE_DAYS = 14;
const DAY = 86_400_000;
const rank = (s) => STATUS_ORDER.indexOf(String(s || "").toLowerCase());

export function decide(meta, task, now = Date.now()) {
  const out = [];
  if (!meta?.clickupTask) return out;
  if (!task) return [{ event: "skip", reason: "task not found" }];
  if (isDone(task)) return [{ event: "skip", reason: "task is complete" }];
  if (!inPipeline(task)) return [{ event: "skip", reason: "task is outside the Pipeline space" }];

  const cur = String(task.status?.status || "").toLowerCase();

  if (meta.signedAt) {
    if (rank(cur) < rank("signed")) out.push({ event: "sign", reason: `signed proposal but task is at "${cur}"` });
    return out;
  }

  if (cur === "lead") out.push({ event: "publish", reason: 'published proposal but task is still at "lead"' });

  const published = new Date(meta.publishedAt || 0).getTime();
  const age = Number.isFinite(published) && published > 0 ? now - published : 0;
  if (age >= NUDGE_DAYS * DAY && !meta.nudgedAt) out.push({ event: "nudge", reason: `unsigned for ${Math.floor(age / DAY)} days` });

  return out;
}
