// /api/proposals: publish, list, unpublish and sign the client proposals the Scope Builder creates.
// Proposals live in the site's Netlify Blobs store "proposals", one record per address. The server only ever
// holds ciphertext: the kit encrypts each proposal in the browser with a password the AM sets, and the client's
// signature is encrypted with the same key before it is sent. Publishing, listing and unpublishing need the
// team password (SITE_PASSWORD); signing needs a token derived from the proposal password.
import { getStore } from "@netlify/blobs";
import { createHash, timingSafeEqual } from "node:crypto";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED = new Set(["api", "assets", "data", "tools", "netlify", "index", "admin", "proposals"]);
const HEX64 = /^[0-9a-f]{64}$/;
const B64 = /^[A-Za-z0-9+/]+={0,2}$/;

const store = () => getStore({ name: "proposals", consistency: "strong" });
const sha = (x) => createHash("sha256").update(x).digest("hex");
const same = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

function teamOk(req) {
  const want = (process.env.SITE_PASSWORD || "").trim();
  return !!want && same(sha(req.headers.get("x-team-password") || ""), sha(want));
}

export default async (req) => {
  const url = new URL(req.url);
  const s = store();
  try {
    if (req.method === "GET") {
      if (!teamOk(req)) return json({ error: "Team password required." }, 401);
      const { blobs } = await s.list();
      const out = [];
      for (const b of blobs) {
        const m = await s.getMetadata(b.key);
        if (m) out.push({ slug: b.key, ...m.metadata });
      }
      out.sort((a, b) => String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
      return json({ proposals: out });
    }

    if (req.method === "DELETE") {
      if (!teamOk(req)) return json({ error: "Team password required." }, 401);
      const slug = url.searchParams.get("slug") || "";
      const cur = SLUG.test(slug) ? await s.get(slug, { type: "json" }) : null;
      if (!cur) return json({ error: "No proposal at that address." }, 404);
      if (cur.sig) return json({ error: "A signed proposal stays published as the record of the agreement." }, 409);
      await s.delete(slug);
      return json({ ok: true });
    }

    if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);
    let body;
    try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
    const slug = String(body.slug || "");
    if (!SLUG.test(slug) || slug.length > 80 || RESERVED.has(slug))
      return json({ error: "That address can't be used. Use lowercase letters, numbers and single hyphens." }, 400);

    if (body.action === "publish") {
      if (!teamOk(req)) return json({ error: "Team password required. Lock the kit and open it again." }, 401);
      const c = body.cipher || {};
      if (!B64.test(c.salt || "") || !B64.test(c.iv || "") || !B64.test(c.ct || "") || !Number.isInteger(c.iter) || c.iter < 100000 || !HEX64.test(body.authHash || ""))
        return json({ error: "The proposal didn't arrive intact. Try again." }, 400);
      const cur = await s.get(slug, { type: "json" });
      if (cur?.sig) return json({ code: "signed", error: "signed" }, 409);
      if (cur && !body.overwrite) return json({ code: "exists", error: "exists" }, 409);
      const now = new Date().toISOString();
      const rec = { v: 1, slug, cipher: { v: 1, iter: c.iter, salt: c.salt, iv: c.iv, ct: c.ct }, authHash: body.authHash, docHash: sha(c.ct),
        publishedAt: cur?.publishedAt || now, updatedAt: now, sig: null };
      const metadata = { title: String(body.title || "").slice(0, 200), company: String(body.company || "").slice(0, 200), tier: String(body.tier || "").slice(0, 4),
        publishedAt: rec.publishedAt, updatedAt: now, signedAt: null, docHash: rec.docHash };
      await s.setJSON(slug, rec, { metadata });
      return json({ ok: true, slug, url: `${url.origin}/${slug}` });
    }

    if (body.action === "sign") {
      const cur = await s.get(slug, { type: "json" });
      if (!cur) return json({ error: "This proposal is no longer published." }, 404);
      if (!HEX64.test(body.auth || "") || !same(sha(Buffer.from(body.auth, "hex")), cur.authHash))
        return json({ error: "This page couldn't confirm the password. Reload and try again." }, 403);
      if (cur.sig) return json({ error: "This proposal has already been signed." }, 409);
      if (body.docHash !== cur.docHash) return json({ error: "Steadfast updated this proposal after you opened it. Reload to read the current version." }, 409);
      const g = body.sig || {};
      if (!B64.test(g.iv || "") || !B64.test(g.ct || "") || g.ct.length > 3_000_000) return json({ error: "The signature didn't arrive intact. Try again." }, 400);
      const signedAt = new Date().toISOString();
      cur.sig = { iv: g.iv, ct: g.ct, signedAt, docHash: cur.docHash,
        ip: req.headers.get("x-nf-client-connection-ip") || "", ua: (req.headers.get("user-agent") || "").slice(0, 300) };
      const m = (await s.getMetadata(slug))?.metadata || {};
      await s.setJSON(slug, cur, { metadata: { ...m, signedAt } });
      return json({ ok: true, signedAt });
    }

    return json({ error: "Unknown action." }, 400);
  } catch (e) {
    return json({ error: "Server error: " + (e?.message || e) }, 500);
  }
};

export const config = { path: "/api/proposals" };
