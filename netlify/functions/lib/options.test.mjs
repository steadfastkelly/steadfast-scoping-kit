// Options on a proposal: the client signs one of several published scopes (see validate.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateOptions, pickOption } from "./validate.mjs";
import { plan } from "./clickup.mjs";

const three = [{ id: "oa1b2c3", name: "Full launch", total: 125000 }, { id: "od4e5f6", name: "Core launch", total: 98000 }, { id: "og7h8i9", name: "Lean launch", total: 81500 }];

test("validateOptions: no options, or one, is an ordinary proposal", () => {
  assert.deepEqual(validateOptions(undefined), { ok: true, value: null });
  assert.deepEqual(validateOptions(null), { ok: true, value: null });
  assert.deepEqual(validateOptions([three[0]]), { ok: true, value: null });
});

test("validateOptions: keeps id, name and total, and cleans the name", () => {
  const r = validateOptions([{ ...three[0], name: " Full\nlaunch ", extra: "x" }, three[1]]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value[0], { id: "oa1b2c3", name: "Full launch", total: 125000 });
});

test("validateOptions: rejects bad ids, repeats, empty names, bad totals and too many options", () => {
  assert.equal(validateOptions([three[0], { ...three[1], id: "BAD ID" }]).ok, false);
  assert.equal(validateOptions([three[0], { ...three[1], id: three[0].id }]).ok, false);
  assert.equal(validateOptions([three[0], { ...three[1], name: "  " }]).ok, false);
  assert.equal(validateOptions([three[0], { ...three[1], total: "98000" }]).ok, false);
  assert.equal(validateOptions([three[0], { ...three[1], total: -1 }]).ok, false);
  assert.equal(validateOptions("nope").ok, false);
  assert.equal(validateOptions(Array.from({ length: 7 }, (_, k) => ({ id: "o" + k + "x", name: "O" + k, total: 1 }))).ok, false);
});

test("pickOption: uses the published total, never one sent at signing", () => {
  const r = pickOption(three, "od4e5f6");
  assert.deepEqual(r, { ok: true, value: three[1] });
  assert.equal(pickOption(three, "nope").ok, false);
  assert.equal(pickOption(three, undefined).ok, false);
});

test("pickOption: a proposal without options needs no choice (older proposals sign as before)", () => {
  assert.deepEqual(pickOption(undefined, undefined), { ok: true, value: null });
  assert.deepEqual(pickOption(null, "anything"), { ok: true, value: null });
});

test("ClickUp sign: names the chosen option and writes its total", () => {
  const p = plan("sign", { address: "https://x/y", total: 98000, signedAt: "2026-12-01T15:00:00Z", docHash: "abcdef1234", option: "Core launch" }, null);
  assert.match(p.comment, /Option: Core launch\./);
  assert.deepEqual(p.fields.find(f => f.name === "Est. Value").value, 98000);
});

test("ClickUp sign: without an option the comment is unchanged", () => {
  const p = plan("sign", { address: "https://x/y", total: 5000, signedAt: "2026-12-01T15:00:00Z", docHash: "abcdef1234" }, null);
  assert.equal(p.comment, "Signed on 2026-12-01 15:00 UTC. Version abcdef12. Proposal: https://x/y.");
});
