// node --test: the publish-body validation shared by proposals.mjs, and the nightly reconcile rules.
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeTaskId, validateTracking } from "./validate.mjs";
import { decide, NUDGE_DAYS } from "./reconcile-rules.mjs";
import { PIPELINE_SPACE } from "./clickup.mjs";

test("normalizeTaskId accepts ids, links and #ids, and rejects the rest", () => {
  assert.equal(normalizeTaskId("86bcp24xe"), "86bcp24xe");
  assert.equal(normalizeTaskId("  86BCP24XE "), "86bcp24xe");
  assert.equal(normalizeTaskId("#86bcp24xe"), "86bcp24xe");
  assert.equal(normalizeTaskId("https://app.clickup.com/t/86bcp24xe"), "86bcp24xe");
  assert.equal(normalizeTaskId("https://app.clickup.com/t/86bcp24xe/some-title?x=1"), "86bcp24xe");
  assert.equal(normalizeTaskId(""), null);
  assert.equal(normalizeTaskId("abc"), null);
  assert.equal(normalizeTaskId("has spaces here"), null);
  assert.equal(normalizeTaskId("1234567890123"), null);
  assert.equal(normalizeTaskId("https://app.clickup.com/9014/v/l/li/901417216194"), null);
});

test("validateTracking: good body", () => {
  const r = validateTracking({ clickupTask: "https://app.clickup.com/t/86bcp24xe", total: "24500.5", sentBy: " Pat Example ", version: 3 });
  assert.deepEqual(r, { ok: true, value: { clickupTask: "86bcp24xe", total: 24500.5, sentBy: "Pat Example", version: 3 } });
});

test("validateTracking: a present but unreadable task id is an error", () => {
  const r = validateTracking({ clickupTask: "not a task" });
  assert.equal(r.ok, false);
  assert.match(r.error, /86bcp24xe/);
});

test("validateTracking: missing or bad optional values are nulls, not errors", () => {
  assert.deepEqual(validateTracking({}).value, { clickupTask: null, total: null, sentBy: null, version: null });
  assert.equal(validateTracking({ total: -5 }).value.total, null);
  assert.equal(validateTracking({ total: "NaN" }).value.total, null);
  assert.equal(validateTracking({ total: Infinity }).value.total, null);
  assert.equal(validateTracking({ total: 0 }).value.total, 0);
  assert.equal(validateTracking({ version: 0 }).value.version, null);
  assert.equal(validateTracking({ version: 1.5 }).value.version, null);
});

test("validateTracking: sentBy is cut at 80 characters", () => {
  const r = validateTracking({ sentBy: "x".repeat(200) });
  assert.equal(r.value.sentBy.length, 80);
});

const task = (status, space = PIPELINE_SPACE) => ({ status: { status }, space: { id: space } });
const DAY = 86_400_000;
const now = Date.parse("2026-12-01T11:00:00Z");
const meta = (over = {}) => ({ clickupTask: "86bcp24xe", publishedAt: new Date(now - 3 * DAY).toISOString(), signedAt: null, nudgedAt: null, ...over });

test("reconcile: nothing to do without a task link", () => {
  assert.deepEqual(decide({ publishedAt: "2026-01-01" }, task("lead"), now), []);
});

test("reconcile: complete or outside Pipeline is skipped, even when signed", () => {
  assert.equal(decide(meta({ signedAt: "2026-11-20" }), task("complete"), now)[0].event, "skip");
  assert.equal(decide(meta({ signedAt: "2026-11-20" }), task("lead", "90140000001"), now)[0].event, "skip");
  assert.equal(decide(meta(), null, now)[0].event, "skip");
});

test("reconcile: a signed proposal with a task below signed is fixed, and nothing else happens", () => {
  for (const s of ["lead", "discovery", "scoping", "proposal sent"])
    assert.deepEqual(decide(meta({ signedAt: "2026-11-20", publishedAt: new Date(now - 40 * DAY).toISOString() }), task(s), now).map((a) => a.event), ["sign"], s);
  assert.deepEqual(decide(meta({ signedAt: "2026-11-20" }), task("signed"), now), []);
  assert.deepEqual(decide(meta({ signedAt: "2026-11-20" }), task("lost"), now), []);
});

test("reconcile: a published proposal whose task is still lead is fixed", () => {
  assert.deepEqual(decide(meta(), task("lead"), now).map((a) => a.event), ["publish"]);
  assert.deepEqual(decide(meta(), task("scoping"), now), []);
});

test("reconcile: one nudge at 14 days, never twice", () => {
  const old = meta({ publishedAt: new Date(now - NUDGE_DAYS * DAY).toISOString() });
  assert.deepEqual(decide(old, task("proposal sent"), now).map((a) => a.event), ["nudge"]);
  assert.deepEqual(decide({ ...old, nudgedAt: "2026-11-30" }, task("proposal sent"), now), []);
  const young = meta({ publishedAt: new Date(now - 13 * DAY).toISOString() });
  assert.deepEqual(decide(young, task("proposal sent"), now), []);
  assert.deepEqual(decide(old, task("lead"), now).map((a) => a.event), ["publish", "nudge"]);
});

test("validateTracking: a null, empty or absurd total is null, never 0 (Number(null) is 0)", () => {
  assert.equal(validateTracking({ total: null }).value.total, null);
  assert.equal(validateTracking({ total: "" }).value.total, null);
  assert.equal(validateTracking({ total: "   " }).value.total, null);
  assert.equal(validateTracking({ total: true }).value.total, null);
  assert.equal(validateTracking({ total: [] }).value.total, null);
  assert.equal(validateTracking({ total: 1e12 }).value.total, null);
  assert.equal(validateTracking({ total: "16700" }).value.total, 16700);
  assert.equal(validateTracking({ total: 24500.456 }).value.total, 24500.46);
});

test("validateTracking: sentBy must be a string, and control characters are flattened", () => {
  assert.equal(validateTracking({ sentBy: { name: "x" } }).value.sentBy, null);
  assert.equal(validateTracking({ sentBy: 42 }).value.sentBy, null);
  assert.equal(validateTracking({ sentBy: "Pat\nExample\u0000" }).value.sentBy, "Pat Example");
});

test("reconcile: a deleted task (null) is a skip, and a lost task is left alone even when signed", () => {
  assert.deepEqual(decide(meta(), null, now), [{ event: "skip", reason: "task not found" }]);
  assert.deepEqual(decide(meta({ signedAt: "2026-11-20" }), task("lost"), now), []);
  assert.deepEqual(decide(meta(), task("lost"), now), []);
});
