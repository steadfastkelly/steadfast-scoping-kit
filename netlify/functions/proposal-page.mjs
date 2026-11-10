// /<address>: the client's view of a published proposal. Static files win (preferStatic), so the kit, its data
// and its assets are untouched; any other one-segment path is looked up in the "proposals" store. The page
// carries only the encrypted proposal: /assets/viewer.js asks for the password, decrypts it in the browser,
// and handles the signature.
import { getStore } from "@netlify/blobs";

// Steadfast badge (filled mark) from the Steadfast Styles Figma file.
const BADGE = `<svg class="logo" role="img" aria-label="Steadfast" viewBox="0 0 62 76" fill="none" xmlns="http://www.w3.org/2000/svg"> <path fill-rule="evenodd" clip-rule="evenodd" d="M4.45425 3.40095C18.5938 -1.1308 43.4021 -1.1308 57.5416 3.40095H57.5458C60.215 4.25428 62.0041 6.7107 62.0041 9.51508V39.1454C61.8347 59.3395 53.2031 64.012 32.3491 75.3L31.0558 76.0001L29.7542 75.3C8.84239 64.0369 0.19007 59.3726 0.0123959 39.1289L0 9.51922C0 6.71484 1.78914 4.25842 4.45425 3.40095ZM32.1377 27.6936C32.9594 27.9887 33.8043 28.2921 34.5927 28.6279V28.6238C40.1791 30.9932 47.2902 35.1687 44.5879 44.0417C42.9475 49.4226 37.576 52.3802 33.6548 54.5384C33.097 54.845 32.5681 55.1391 32.0846 55.4166L31.1054 55.9883L29.2708 54.9817L29.2247 54.9564C26.1626 53.279 22.3558 51.1936 17.7922 47.5088L20.3168 44.3689C24.5562 47.7905 28.0064 49.696 31.0558 51.3654C31.1274 51.3212 31.199 51.2807 31.2707 51.2402C31.3065 51.2199 31.3423 51.1997 31.3781 51.179C34.3903 49.4682 35.2745 48.9007 35.5927 47.1609C36.0802 44.5222 34.3696 43.4493 29.7253 41.2746C29.6368 41.233 29.5483 41.1914 29.4595 41.1497C29.0799 40.9715 28.6981 40.7923 28.3163 40.6076L28.2812 40.5907C27.9659 40.4387 27.6432 40.283 27.3205 40.1313L27.3144 40.1284C22.7331 37.9541 17.0319 35.2484 17.0319 28.1101C17.0319 24.5684 18.569 21.3125 21.3581 18.9472C23.8125 16.8636 27.0726 15.6499 30.3286 15.5919H30.3533C33.473 15.4469 36.3116 16.3914 39.1709 18.5537L40.8237 16.8719L43.6913 19.7011L39.3982 24.0713L37.9685 22.783C34.6919 19.8337 32.2912 19.5354 30.5682 19.6183H30.5145C28.2874 19.7343 26.0478 20.8071 26.0478 22.9612C26.0478 25.343 28.337 26.333 32.1094 27.6835L32.1377 27.6936ZM39.5965 45.1145C40.0924 44.4228 40.489 43.6813 40.7369 42.8694C41.9104 39.017 41.0468 35.7486 33.0226 32.3436C32.3326 32.0537 31.5681 31.7761 30.7541 31.4861C27.3783 30.2766 22.8621 28.6569 22.1266 24.2453C21.4283 25.4631 21.0523 26.8011 21.0523 28.1101C21.0523 32.3892 24.0686 34.129 29.0394 36.486C29.3823 36.6517 29.7212 36.8132 30.06 36.9748C30.5186 37.1943 30.9773 37.4097 31.4277 37.621L31.4278 37.6211C34.8243 39.2117 38.9106 41.1255 39.5965 45.1145Z" fill="currentColor"/> </svg>`;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FONTS = "https://fonts.googleapis.com/css2?family=Zalando+Sans+SemiExpanded:wght@400;500;600&family=Zalando+Sans+Expanded:wght@400;500;600&family=Google+Sans+Flex:wght@400;500;600&family=JetBrains+Mono:wght@400;500&family=Caveat:wght@500&display=swap";
const HEADERS = { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex, nofollow", "referrer-policy": "no-referrer", "x-frame-options": "DENY" };

const page = (body, data) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex, nofollow"><title>Proposal | Steadfast Design Firm</title>
<link rel="stylesheet" href="${FONTS}"><link rel="stylesheet" href="/assets/proposal.css">
<style>.sp-gate{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px 16px;background:#0a0a0a}
.sp-gate form{background:var(--sp-bg);border-radius:10px;padding:30px;width:100%;max-width:400px;display:grid;gap:14px}
.sp-gate .logo{display:block;width:34px;height:auto;color:#0a0a0a}
.sp-gate h1{font-family:var(--sp-display);font-weight:500;font-size:1.5rem;margin:0}
.sp-gate p{margin:0;color:var(--sp-fg2);font-size:.92rem}
.sp-gate input{font:inherit;font-size:1rem;padding:11px 12px;border:1px solid var(--sp-line);border-radius:6px;background:#fff;color:var(--sp-fg);width:100%}
.sp-gate .eb{font-family:var(--sp-label);font-size:.62rem;letter-spacing:.22em;text-transform:uppercase;color:var(--sp-fg2)}</style>
</head><body>${body}${data ? `<script id="sp-data" type="application/json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script><script src="/assets/viewer.js"></script>` : ""}</body></html>`;

const notFound = () => new Response(page(`<div class="sp-gate"><form>${BADGE}<h1>Nothing here</h1><p>This proposal isn't published at this address. If you followed a link from Steadfast, ask your contact for a fresh one.</p><p><a href="https://www.steadfastdesignfirm.com/">steadfastdesignfirm.com</a></p></form></div>`), { status: 404, headers: HEADERS });

export default async (req, context) => {
  const slug = context?.params?.slug || new URL(req.url).pathname.replace(/^\/+|\/+$/g, "");
  if (!SLUG.test(slug)) return notFound();
  const rec = await getStore({ name: "proposals", consistency: "strong" }).get(slug, { type: "json" });
  if (!rec) return notFound();
  const data = { slug, cipher: rec.cipher, docHash: rec.docHash, sig: rec.sig ? { iv: rec.sig.iv, ct: rec.sig.ct, signedAt: rec.sig.signedAt } : null };
  const gate = `<div class="sp-gate" id="sp-gate"><form id="sp-gf" autocomplete="off">${BADGE}<div><div class="eb">Steadfast Design Firm</div><h1>Your proposal</h1></div><p>Enter the password Steadfast sent you to open it.</p><input type="password" id="sp-gpw" aria-label="Password" autofocus><div class="sp-err" id="sp-gerr"></div><button class="sp-btn pri" id="sp-gbtn">Open proposal</button></form></div><div id="sp-root"></div>`;
  return new Response(page(gate, data), { headers: HEADERS });
};

export const config = { path: "/:slug", preferStatic: true };
