// /<address>: the client's view of a published proposal. Static files win (preferStatic), so the kit, its data
// and its assets are untouched; any other one-segment path is looked up in the "proposals" store. The page
// carries only the encrypted proposal: /assets/viewer.js asks for the password, decrypts it in the browser,
// and handles the signature.
import { getStore } from "@netlify/blobs";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FONTS = "https://fonts.googleapis.com/css2?family=Zalando+Sans+SemiExpanded:wght@400;500;600&family=Zalando+Sans+Expanded:wght@400;500;600&family=Google+Sans+Flex:wght@400;500;600&family=JetBrains+Mono:wght@400;500&family=Caveat:wght@500&display=swap";
const HEADERS = { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow", "referrer-policy": "no-referrer", "x-frame-options": "DENY" };

const page = (body, data) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow"><title>Proposal | Steadfast Design Firm</title>
<link rel="stylesheet" href="${FONTS}"><link rel="stylesheet" href="/assets/proposal.css">
<style>.sp-gate{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 16px;background:#0a0a0a}
.sp-gate form{background:var(--sp-bg);border-radius:10px;padding:30px;width:100%;max-width:400px;display:grid;gap:14px}
.sp-gate .mark{width:40px;height:40px;border-radius:0 0 20px 20px;background:#0a0a0a;color:#f2efe9;display:flex;align-items:center;justify-content:center;font-family:var(--sp-display);font-weight:600}
.sp-gate h1{font-family:var(--sp-display);font-weight:500;font-size:1.5rem;margin:0}
.sp-gate p{margin:0;color:var(--sp-fg2);font-size:.92rem}
.sp-gate input{font:inherit;font-size:1rem;padding:11px 12px;border:1px solid var(--sp-line);border-radius:6px;background:#fff;color:var(--sp-fg);width:100%}
.sp-gate .eb{font-family:var(--sp-label);font-size:.62rem;letter-spacing:.22em;text-transform:uppercase;color:var(--sp-fg2)}</style>
</head><body>${body}${data ? `<script id="sp-data" type="application/json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script><script src="/assets/viewer.js"></script>` : ""}</body></html>`;

const notFound = () => new Response(page(`<div class="sp-gate"><form><div class="mark">S</div><h1>Nothing here</h1><p>This proposal isn't published at this address. If you followed a link from Steadfast, ask your contact for a fresh one.</p><p><a href="https://www.steadfastdesignfirm.com/">steadfastdesignfirm.com</a></p></form></div>`), { status: 404, headers: HEADERS });

export default async (req, context) => {
  const slug = context?.params?.slug || new URL(req.url).pathname.replace(/^\/+|\/+$/g, "");
  if (!SLUG.test(slug)) return notFound();
  const rec = await getStore({ name: "proposals", consistency: "strong" }).get(slug, { type: "json" });
  if (!rec) return notFound();
  const data = { slug, cipher: rec.cipher, docHash: rec.docHash, sig: rec.sig ? { iv: rec.sig.iv, ct: rec.sig.ct, signedAt: rec.sig.signedAt } : null };
  const gate = `<div class="sp-gate" id="sp-gate"><form id="sp-gf" autocomplete="off"><div class="mark">S</div><div><div class="eb">Steadfast Design Firm</div><h1>Your proposal</h1></div><p>Enter the password Steadfast sent you to open it.</p><input type="password" id="sp-gpw" aria-label="Password" autofocus><div class="sp-err" id="sp-gerr"></div><button class="sp-btn pri" id="sp-gbtn">Open proposal</button></form></div><div id="sp-root"></div>`;
  return new Response(page(gate, data), { headers: HEADERS });
};

export const config = { path: "/:slug", preferStatic: true };
