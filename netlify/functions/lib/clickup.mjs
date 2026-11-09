// ClickUp side of proposal tracking (docs/proposal-tracking-solution.md). The kit's publish, overwrite, sign and
// unpublish events call notify(); it reads the task first, then writes status, fields and a comment under the rules
// below. Nothing here ever throws to the caller, and nothing runs longer than BUDGET_MS. With no CLICKUP_API_TOKEN
// the helper runs dry: it logs what it would send and makes no request.
//
// Rules: never set "lost", never move a status backwards, "signed" is the last status we set, and a task at
// "complete" or outside the Pipeline space only ever receives a comment.

export const API = "https://api.clickup.com/api/v2";
export const PIPELINE_SPACE = "90146032103";
export const BUDGET_MS = 5000;
export const FIELDS = {
  estValue: "47eed85c-6518-4b85-aabb-e3ebbd1c3c1f",
  url: "58cc8a33-f1d8-4151-b91b-7f24056e0f4d",
  sentBy: "52afd04f-1168-40c9-86f7-b92e4efd442f",
  signedDate: process.env.CLICKUP_SIGNED_DATE_FIELD || "a687725a-d5c7-4b33-b3ad-c92f665dceb6",
};
export const STATUS_ORDER = ["lead", "discovery", "scoping", "proposal sent", "signed", "complete", "lost"];
const rank = (s) => STATUS_ORDER.indexOf(String(s || "").toLowerCase());
const canSendFrom = new Set(["lead", "discovery", "scoping"]);

export const inPipeline = (task) => String(task?.space?.id ?? "") === PIPELINE_SPACE;
export const isDone = (task) => String(task?.status?.status || "").toLowerCase() === "complete";

const fmtDate = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toISOString().slice(0, 16).replace("T", " ") + " UTC";
};

// Decides what to send for one event, given the task as ClickUp returned it (or null in dry run).
// Returns { status: newStatus|null, fields: [{id, name, value, value_options?}], comment, reason }.
export function plan(event, ctx, task) {
  const { address, total, sentBy, version, signedAt, docHash, option } = ctx;
  const cur = task ? String(task.status?.status || "").toLowerCase() : null;
  const fields = [];
  let status = null;
  let comment = "";
  let reason = "";
  const live = task ? inPipeline(task) && !isDone(task) : true; // dry run assumes the task is still in play
  const money = total != null ? [{ id: FIELDS.estValue, name: "Est. Value", value: total }] : [];
  const link = [{ id: FIELDS.url, name: "URL", value: address }];

  if (event === "publish") {
    comment = `Proposal${version ? " v" + version : ""} published: ${address}. Awaiting signature.`;
    if (live) {
      fields.push(...money, ...link);
      if (sentBy) fields.push({ id: FIELDS.sentBy, name: "Sent By", value: sentBy });
      if (cur === null || canSendFrom.has(cur)) status = "proposal sent";
      else reason = `status stays "${cur}" (only lead, discovery and scoping move to proposal sent)`;
    } else reason = "task is complete or outside the Pipeline space, comment only";
  } else if (event === "overwrite") {
    comment = `Proposal revised: ${address}.`;
    if (live) fields.push(...money, ...link);
    else reason = "task is complete or outside the Pipeline space, comment only";
  } else if (event === "sign") {
    comment = `Signed on ${fmtDate(signedAt)}. Version ${String(docHash || "").slice(0, 8)}.${option ? ` Option: ${option}.` : ""} Proposal: ${address}.`;
    if (live) {
      fields.push(...money);
      const ms = new Date(signedAt).getTime();
      if (Number.isFinite(ms)) fields.push({ id: FIELDS.signedDate, name: "Signed Date", value: ms, value_options: { time: true } });
      if (cur === null || rank(cur) < rank("signed")) status = "signed";
      else reason = `status stays "${cur}" (already signed or later)`;
    } else reason = "task is complete or outside the Pipeline space, comment only";
  } else if (event === "withdraw") {
    comment = `Proposal withdrawn: ${address}.`;
  } else if (event === "nudge") {
    comment = `Proposal unsigned for 14 days: ${address}`;
  } else {
    throw new Error("Unknown ClickUp event: " + event);
  }
  return { status, fields, comment, reason };
}

// One bounded ClickUp request. The deadline is shared by every request in a run.
async function call(http, token, deadline, method, path, body) {
  const left = deadline - Date.now();
  if (left <= 0) throw new Error("ClickUp budget exhausted before " + method + " " + path);
  const res = await http(API + path, {
    method,
    headers: { Authorization: token, "content-type": "application/json", accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(left),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 300) }; }
  if (!res.ok) {
    const err = new Error(`ClickUp ${method} ${path} answered ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// Returns the task, or null when ClickUp says it no longer exists (404). Other failures throw.
export async function getTask(taskId, opts = {}) {
  const token = opts.token ?? process.env.CLICKUP_API_TOKEN;
  const http = opts.fetch ?? globalThis.fetch;
  const deadline = Date.now() + (opts.budgetMs ?? BUDGET_MS);
  try {
    return await call(http, token, deadline, "GET", `/task/${encodeURIComponent(taskId)}`);
  } catch (e) {
    if (e?.status === 404) return null;
    throw e;
  }
}

// Runs one event against one task. Throws on failure (notify() swallows). Returns what was sent, for logs and tests.
export async function run(event, ctx, opts = {}) {
  const taskId = ctx.taskId;
  if (!taskId) return { skipped: "no task" };
  const token = (opts.token ?? process.env.CLICKUP_API_TOKEN ?? "").trim();
  const log = opts.log ?? ((...a) => console.log(...a));
  const http = opts.fetch ?? globalThis.fetch;
  const budget = opts.budgetMs ?? BUDGET_MS;

  if (!token) {
    const p = plan(event, ctx, null);
    log(`[clickup dry-run] ${event} task ${taskId}: would GET /task/${taskId}, then` +
      (p.status ? ` set status "${p.status}" (if the guard allows),` : "") +
      (p.fields.length ? ` set ${p.fields.map((f) => `${f.name}=${JSON.stringify(f.value)}`).join(", ")},` : "") +
      ` comment: ${JSON.stringify(p.comment)}`);
    return { dryRun: true, taskId, ...p };
  }

  const deadline = Date.now() + budget;
  const task = opts.task ?? await call(http, token, deadline, "GET", `/task/${encodeURIComponent(taskId)}`);
  const p = plan(event, ctx, task);
  const sent = { taskId, from: task?.status?.status ?? null, status: null, fields: [], comment: null, reason: p.reason };

  if (p.status) {
    await call(http, token, deadline, "PUT", `/task/${encodeURIComponent(taskId)}`, { status: p.status });
    sent.status = p.status;
  }
  for (const f of p.fields) {
    const body = { value: f.value };
    if (f.value_options) body.value_options = f.value_options;
    await call(http, token, deadline, "POST", `/task/${encodeURIComponent(taskId)}/field/${f.id}`, body);
    sent.fields.push(f.name);
  }
  if (p.comment) {
    await call(http, token, deadline, "POST", `/task/${encodeURIComponent(taskId)}/comment`, { comment_text: p.comment });
    sent.comment = p.comment;
  }
  log(`[clickup] ${event} task ${taskId}: status ${sent.from ?? "?"} -> ${sent.status ?? "(unchanged)"}; fields ${sent.fields.join(", ") || "none"}; comment posted${p.reason ? "; " + p.reason : ""}`);
  return sent;
}

// What proposals.mjs calls: never throws, never blocks longer than the budget.
export async function notify(event, ctx, opts = {}) {
  try {
    return await run(event, ctx, opts);
  } catch (e) {
    (opts.log ?? console.error)(`[clickup] ${event} task ${ctx?.taskId}: ${e?.message || e}`);
    return { error: String(e?.message || e) };
  }
}
