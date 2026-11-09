// Validation for the proposal-tracking fields the kit sends with a publish (see docs/proposal-tracking-solution.md).
// Kept apart from proposals.mjs so it can be unit tested without Netlify Blobs.

export const TASK_ID = /^[a-z0-9]{6,12}$/;
export const SENT_BY_MAX = 80;
export const TOTAL_MAX = 100_000_000; // a proposal total above this is a kit bug, not a value to write to ClickUp

// Accepts a ClickUp task id ("86bcp24xe"), a task URL ("https://app.clickup.com/t/86bcp24xe", with or without a
// trailing path) or "#86bcp24xe". Returns the lower-case id, or null when nothing usable is there.
export function normalizeTaskId(input) {
  const s = String(input ?? "").trim();
  if (!s) return null;
  const fromUrl = s.match(/\/t\/([A-Za-z0-9]+)/);
  const id = (fromUrl ? fromUrl[1] : s.replace(/^#/, "")).toLowerCase();
  return TASK_ID.test(id) ? id : null;
}

// Returns { ok: true, value: { clickupTask, total, sentBy, version } } or { ok: false, error }.
// A task that is present but unreadable is an error (the AM typed it wrong); a bad total or name is dropped, not fatal.
export function validateTracking(body = {}) {
  const raw = String(body.clickupTask ?? "").trim();
  const clickupTask = raw ? normalizeTaskId(raw) : null;
  if (raw && !clickupTask) return { ok: false, error: "The Engagement task should be a ClickUp task link or id, like 86bcp24xe." };

  // Only a number or a numeric string counts: Number(null) and Number("") are 0, which would write Est. Value 0.
  const t = typeof body.total === "number" ? body.total : typeof body.total === "string" && body.total.trim() ? Number(body.total) : NaN;
  const total = Number.isFinite(t) && t >= 0 && t <= TOTAL_MAX ? Math.round(t * 100) / 100 : null;

  const sentBy = typeof body.sentBy === "string" ? body.sentBy.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, SENT_BY_MAX) || null : null;

  const v = Number(body.version);
  const version = Number.isInteger(v) && v >= 1 && v <= 999 ? v : null;

  return { ok: true, value: { clickupTask, total, sentBy, version } };
}

// Options: a proposal can offer several scopes and the client signs one. The kit sends [{id, name, total}] with the
// publish, in plain text like the total; the server keeps them, and at signing the client sends only the id, so the
// total recorded and written to ClickUp is the one published, never a figure from the signing browser.
export const OPTION_ID = /^[a-z0-9]{2,16}$/;
export const OPTIONS_MAX = 6;

// Returns { ok: true, value: [{id, name, total}] | null } or { ok: false, error }. One option (or none) means no choice.
export function validateOptions(input) {
  if (input == null) return { ok: true, value: null };
  if (!Array.isArray(input) || input.length > OPTIONS_MAX) return { ok: false, error: "The proposal's options didn't arrive intact. Try again." };
  if (input.length < 2) return { ok: true, value: null };
  const out = [], seen = new Set();
  for (const o of input) {
    const id = String(o?.id ?? "");
    const name = typeof o?.name === "string" ? o.name.replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, 80) : "";
    const total = typeof o?.total === "number" && Number.isFinite(o.total) && o.total >= 0 && o.total <= TOTAL_MAX ? Math.round(o.total * 100) / 100 : null;
    if (!OPTION_ID.test(id) || seen.has(id) || !name || total === null) return { ok: false, error: "The proposal's options didn't arrive intact. Try again." };
    seen.add(id); out.push({ id, name, total });
  }
  return { ok: true, value: out };
}

// At signing: the option the client chose, looked up in what was published. Returns { ok, value } or { ok: false, error }.
export function pickOption(published, chosen) {
  if (!Array.isArray(published) || published.length < 2) return { ok: true, value: null }; // nothing to choose
  const o = published.find(x => x.id === String(chosen ?? ""));
  return o ? { ok: true, value: o } : { ok: false, error: "Choose the option you accept, then sign again." };
}
