// node --test: ClickUp helper rules with a mocked fetch. Run with `npm run test:functions`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { run, notify, plan, getTask, FIELDS, PIPELINE_SPACE, BUDGET_MS, API } from "./clickup.mjs";

const TOKEN = "test-token";
const task = (status, space = PIPELINE_SPACE) => ({ id: "86bcp24xe", status: { status }, space: { id: space }, list: { id: "901417216194" } });
const ctx = { taskId: "86bcp24xe", address: "https://kit.example/acme-site", total: 24500, sentBy: "Pat Example", version: 2, signedAt: "2026-11-08T15:04:00.000Z", docHash: "abcdef0123456789" };

// A fetch mock that answers GET /task with the given task and records every write.
function mock(current, { fail } = {}) {
  const calls = [];
  const http = async (url, init = {}) => {
    const path = url.replace(API, "");
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method: init.method, path, body, auth: init.headers?.Authorization, hasSignal: init.signal instanceof AbortSignal });
    if (fail && path.includes(fail)) return new Response(JSON.stringify({ err: "boom" }), { status: 500 });
    if (init.method === "GET") return new Response(JSON.stringify(current), { status: 200 });
    return new Response("{}", { status: 200 });
  };
  return { http, calls, writes: () => calls.filter((c) => c.method !== "GET") };
}
const quiet = () => {};

test("publish from lead: status to proposal sent, three fields, comment with version", async () => {
  const m = mock(task("lead"));
  const r = await run("publish", ctx, { fetch: m.http, token: TOKEN, log: quiet });
  assert.equal(m.calls[0].method, "GET");
  assert.equal(m.calls[0].path, "/task/86bcp24xe");
  assert.equal(m.calls[0].auth, TOKEN);
  assert.deepEqual(m.writes().map((c) => [c.method, c.path, c.body]), [
    ["PUT", "/task/86bcp24xe", { status: "proposal sent" }],
    ["POST", `/task/86bcp24xe/field/${FIELDS.estValue}`, { value: 24500 }],
    ["POST", `/task/86bcp24xe/field/${FIELDS.url}`, { value: "https://kit.example/acme-site" }],
    ["POST", `/task/86bcp24xe/field/${FIELDS.sentBy}`, { value: "Pat Example" }],
    ["POST", "/task/86bcp24xe/comment", { comment_text: "Proposal v2 published: https://kit.example/acme-site. Awaiting signature." }],
  ]);
  assert.equal(r.status, "proposal sent");
});

test("publish from discovery and scoping also moves to proposal sent", async () => {
  for (const s of ["discovery", "scoping"]) {
    const m = mock(task(s));
    await run("publish", ctx, { fetch: m.http, token: TOKEN, log: quiet });
    assert.ok(m.writes().some((c) => c.method === "PUT" && c.body.status === "proposal sent"), s);
  }
});

test("publish never moves a task backwards: proposal sent, signed and lost keep their status", async () => {
  for (const s of ["proposal sent", "signed", "lost"]) {
    const m = mock(task(s));
    const r = await run("publish", ctx, { fetch: m.http, token: TOKEN, log: quiet });
    assert.equal(m.writes().filter((c) => c.method === "PUT").length, 0, s);
    assert.equal(r.status, null);
    assert.ok(m.writes().some((c) => c.path.endsWith("/comment")), "comment still posted for " + s);
  }
});

test("publish without a version omits it from the comment; no Sent By when blank", async () => {
  const m = mock(task("lead"));
  await run("publish", { ...ctx, version: null, sentBy: null }, { fetch: m.http, token: TOKEN, log: quiet });
  const c = m.writes().find((c) => c.path.endsWith("/comment"));
  assert.equal(c.body.comment_text, "Proposal published: https://kit.example/acme-site. Awaiting signature.");
  assert.ok(!m.writes().some((c) => c.path.endsWith(FIELDS.sentBy)));
});

test("overwrite: value and URL update, comment, no status change", async () => {
  const m = mock(task("proposal sent"));
  await run("overwrite", ctx, { fetch: m.http, token: TOKEN, log: quiet });
  assert.deepEqual(m.writes().map((c) => [c.method, c.path.split("/").pop()]), [
    ["POST", FIELDS.estValue], ["POST", FIELDS.url], ["POST", "comment"],
  ]);
  assert.equal(m.writes()[2].body.comment_text, "Proposal revised: https://kit.example/acme-site.");
});

test("sign from proposal sent: status signed, Signed Date as ms epoch with time, Est. Value, comment with hash", async () => {
  const m = mock(task("proposal sent"));
  const r = await run("sign", ctx, { fetch: m.http, token: TOKEN, log: quiet });
  const put = m.writes().find((c) => c.method === "PUT");
  assert.deepEqual(put.body, { status: "signed" });
  const date = m.writes().find((c) => c.path.endsWith(FIELDS.signedDate));
  assert.deepEqual(date.body, { value: Date.parse("2026-11-08T15:04:00.000Z"), value_options: { time: true } });
  assert.ok(m.writes().some((c) => c.path.endsWith(FIELDS.estValue) && c.body.value === 24500));
  const c = m.writes().find((c) => c.path.endsWith("/comment"));
  assert.equal(c.body.comment_text, "Signed on 2026-11-08 15:04 UTC. Version abcdef01. Proposal: https://kit.example/acme-site.");
  assert.equal(r.status, "signed");
});

test("sign straight from lead still moves to signed (never backwards, forwards is fine)", async () => {
  const m = mock(task("lead"));
  const r = await run("sign", ctx, { fetch: m.http, token: TOKEN, log: quiet });
  assert.equal(r.status, "signed");
});

test("sign when already signed: fields and comment, no status write", async () => {
  const m = mock(task("signed"));
  const r = await run("sign", ctx, { fetch: m.http, token: TOKEN, log: quiet });
  assert.equal(m.writes().filter((c) => c.method === "PUT").length, 0);
  assert.equal(r.status, null);
  assert.ok(m.writes().some((c) => c.path.endsWith(FIELDS.signedDate)));
});

test("sign when complete: comment only", async () => {
  const m = mock(task("complete"));
  await run("sign", ctx, { fetch: m.http, token: TOKEN, log: quiet });
  assert.deepEqual(m.writes().map((c) => c.path.split("/").pop()), ["comment"]);
});

test("Tasks-space skip: a task outside the Pipeline space only gets a comment, for every event", async () => {
  for (const ev of ["publish", "overwrite", "sign"]) {
    const m = mock(task("proposal sent", "90140000001"));
    const r = await run(ev, ctx, { fetch: m.http, token: TOKEN, log: quiet });
    assert.deepEqual(m.writes().map((c) => c.path.split("/").pop()), ["comment"], ev);
    assert.match(r.reason, /outside the Pipeline/);
  }
});

test("withdraw: comment only, whatever the status", async () => {
  const m = mock(task("proposal sent"));
  await run("withdraw", ctx, { fetch: m.http, token: TOKEN, log: quiet });
  assert.deepEqual(m.writes().map((c) => [c.path.split("/").pop(), c.body]), [["comment", { comment_text: "Proposal withdrawn: https://kit.example/acme-site." }]]);
});

test("the helper never sets lost", () => {
  for (const ev of ["publish", "overwrite", "sign", "withdraw", "nudge"])
    for (const s of ["lead", "discovery", "scoping", "proposal sent", "signed", "complete", "lost"])
      assert.notEqual(plan(ev, ctx, task(s)).status, "lost");
});

test("dry run: no token means no request, and the plan is logged", async () => {
  const m = mock(task("lead"));
  const lines = [];
  const r = await run("publish", ctx, { fetch: m.http, token: "", log: (l) => lines.push(l) });
  assert.equal(m.calls.length, 0);
  assert.equal(r.dryRun, true);
  assert.equal(r.status, "proposal sent");
  assert.equal(lines.length, 1);
  assert.match(lines[0], /\[clickup dry-run\] publish task 86bcp24xe/);
  assert.match(lines[0], /Est\. Value=24500/);
  assert.doesNotMatch(lines[0], /test-token/);
});

test("every request carries an abort signal and the default budget is 5 s", async () => {
  const m = mock(task("lead"));
  await run("publish", ctx, { fetch: m.http, token: TOKEN, log: quiet });
  assert.ok(m.calls.every((c) => c.hasSignal));
  assert.equal(BUDGET_MS, 5000);
});

test("timeout: a hanging ClickUp is abandoned when the budget runs out, and notify() does not throw", async () => {
  const hang = (url, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason)));
  const errors = [];
  const t0 = Date.now();
  const r = await notify("publish", ctx, { fetch: hang, token: TOKEN, budgetMs: 60, log: (l) => errors.push(l) });
  assert.ok(Date.now() - t0 < 2000);
  assert.ok(r.error);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /\[clickup\] publish task 86bcp24xe/);
});

test("a failed write is logged, not thrown, and the token never appears in the log", async () => {
  const m = mock(task("lead"), { fail: "/field/" });
  const lines = [];
  const r = await notify("publish", ctx, { fetch: m.http, token: TOKEN, log: (l) => lines.push(l) });
  assert.ok(r.error);
  assert.match(lines.join("\n"), /answered 500/);
  assert.doesNotMatch(lines.join("\n"), /test-token/);
});

test("a task with no id is skipped without a request", async () => {
  const m = mock(task("lead"));
  const r = await notify("publish", { ...ctx, taskId: "" }, { fetch: m.http, token: TOKEN, log: quiet });
  assert.equal(r.skipped, "no task");
  assert.equal(m.calls.length, 0);
});

test("requests use the raw personal token (no Bearer prefix) and JSON content type", async () => {
  const m = mock(task("lead"));
  await run("publish", ctx, { fetch: m.http, token: TOKEN, log: quiet });
  for (const c of m.calls) assert.equal(c.auth, TOKEN);
  assert.doesNotMatch(m.calls[0].auth, /^Bearer/);
});

test("sign on a lost task: fields and comment, status stays lost (never backwards, never lost)", async () => {
  const m = mock(task("lost"));
  const r = await run("sign", ctx, { fetch: m.http, token: TOKEN, log: quiet });
  assert.equal(m.writes().filter((c) => c.method === "PUT").length, 0);
  assert.equal(r.status, null);
  assert.ok(m.writes().some((c) => c.path.endsWith("/comment")));
});

test("reconcile path: a task passed in is not fetched again", async () => {
  const m = mock(task("lead"));
  const r = await run("sign", ctx, { fetch: m.http, token: TOKEN, log: quiet, task: task("proposal sent") });
  assert.equal(m.calls.filter((c) => c.method === "GET").length, 0);
  assert.equal(r.from, "proposal sent");
  assert.equal(r.status, "signed");
});

test("getTask: a deleted task (404) is null, any other failure throws with its status", async () => {
  const gone = async () => new Response(JSON.stringify({ err: "Task not found" }), { status: 404 });
  assert.equal(await getTask("86bcp24xe", { fetch: gone, token: TOKEN }), null);
  const down = async () => new Response("bad gateway", { status: 502 });
  await assert.rejects(getTask("86bcp24xe", { fetch: down, token: TOKEN }), (e) => e.status === 502 && /answered 502/.test(e.message));
});
