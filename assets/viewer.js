/* The client's side of a published proposal: unlock it with the password, read it, sign it.
   The page carries the proposal encrypted (AES-GCM, key from PBKDF2-SHA256 over the password). The same
   derivation gives a sign token; the server keeps only its hash, so a signature can only come from someone
   who opened the proposal. The signature record (name, title, the drawn or typed signature) is encrypted
   with the proposal key before it is sent, so it is as private as the proposal. */
(() => {
  const D = JSON.parse(document.getElementById("sp-data").textContent);
  const enc = new TextEncoder(), dec = new TextDecoder();
  const ub = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const b64e = buf => { const u = new Uint8Array(buf); let s = ""; for (let k = 0; k < u.length; k += 0x8000) s += String.fromCharCode.apply(null, u.subarray(k, k + 0x8000)); return btoa(s); };
  const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
  const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const $ = id => document.getElementById(id);
  const when = iso => { const d = new Date(iso); return { date: d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }), time: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" }) }; };
  let KEY = null, AUTH = null, DOC = null;

  async function derive(pw) {
    const km = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt: ub(D.cipher.salt), iterations: D.cipher.iter, hash: "SHA-256" }, km, 512));
    return { key: await crypto.subtle.importKey("raw", bits.slice(0, 32), "AES-GCM", false, ["encrypt", "decrypt"]), auth: hex(bits.slice(32)) };
  }
  async function unlock(pw) {
    const { key, auth } = await derive(pw);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ub(D.cipher.iv) }, key, ub(D.cipher.ct));
    KEY = key; AUTH = auth; DOC = JSON.parse(dec.decode(pt));
    try { sessionStorage.setItem("sp." + D.slug, pw); } catch (e) {}
    document.title = (DOC.title || "Proposal") + " | Steadfast Design Firm";
    $("sp-root").innerHTML = DOC.html;
    $("sp-gate").remove();
    window.scrollTo(0, 0);
    await mountSign();
  }

  const field = (k, v, right) => `<div class="sp-field"><div class="v">${v || ""}</div><div class="k"><span>${k}</span>${right ? `<span>${right}</span>` : ""}</div></div>`;

  async function mountSign() {
    const slot = $("sp-sign-slot"); if (!slot) return;
    if (D.sig) {
      try {
        const rec = JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: ub(D.sig.iv) }, KEY, ub(D.sig.ct))));
        return showSigned(slot, rec, D.sig.signedAt);
      } catch (e) { slot.innerHTML = `<div class="sp-done">Signed on ${esc(when(D.sig.signedAt).date)}.</div>`; return; }
    }
    showForm(slot);
  }

  function showSigned(slot, rec, signedAt) {
    const w = when(signedAt);
    slot.innerHTML = field("Full name", esc(rec.name)) + field("Title", esc(rec.title)) +
      field("Signature", `<img src="${esc(rec.signature)}" alt="Signature of ${esc(rec.name)}"><span class="date">${esc(w.date)}</span>`, "Date") +
      `<div class="sp-done"><b>Accepted.</b> Signed electronically by ${esc(rec.name)}${rec.email ? ` (${esc(rec.email)})` : ""} on ${esc(w.date)} at ${esc(w.time)}.<br><span class="sp-note">Document ID ${esc(String(D.docHash).slice(0, 16).toUpperCase())}</span>
       <div class="sp-padbar sp-noprint" style="margin-top:12px"><button class="sp-btn sm" type="button" id="sp-print">Save a copy (PDF)</button></div></div>`;
    $("sp-print").onclick = () => window.print();
  }

  function showForm(slot) {
    const company = DOC.company || "the client";
    slot.innerHTML = `<form class="sp-form sp-noprint" id="sp-sf" autocomplete="on">
      <label>Full name<input type="text" id="sp-name" autocomplete="name" value="${esc(DOC.contact || "")}" required></label>
      <label>Title<input type="text" id="sp-title" autocomplete="organization-title" required></label>
      <label>Email (for your records)<input type="email" id="sp-email" autocomplete="email"></label>
      <label>Signature<div class="sp-pad" id="sp-pad"><canvas id="sp-cv" aria-label="Signature pad: draw your signature"></canvas><div class="typed" id="sp-typed" hidden></div><span class="hint" id="sp-hint">Draw your signature here</span></div></label>
      <div class="sp-padbar"><button class="sp-btn sm" type="button" id="sp-mode">Type it instead</button><button class="sp-btn sm" type="button" id="sp-clear">Clear</button></div>
      <label class="sp-agree"><input type="checkbox" id="sp-ok"><span>I have read this proposal, including the Terms &amp; Conditions. I accept it on behalf of ${esc(company)}, and I agree that my electronic signature is the legal equivalent of my handwritten signature.</span></label>
      <div class="sp-err" id="sp-serr"></div>
      <div><button class="sp-btn pri" id="sp-go" type="submit">Sign and accept</button></div>
    </form>`;
    const cv = $("sp-cv"), pad = $("sp-pad"), ctx = cv.getContext("2d");
    let typed = false, inked = false, down = false, last = null;
    const size = () => { const r = pad.getBoundingClientRect(), dpr = Math.max(1, window.devicePixelRatio || 1); const keep = inked && !typed ? cv.toDataURL() : null;
      cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#0a0a0a";
      if (keep) { const im = new Image(); im.onload = () => ctx.drawImage(im, 0, 0, r.width, r.height); im.src = keep; } };
    size(); window.addEventListener("resize", size);
    const pt = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    cv.addEventListener("pointerdown", e => { if (typed) return; down = true; last = pt(e); cv.setPointerCapture(e.pointerId); ctx.beginPath(); ctx.arc(last.x, last.y, 1.1, 0, Math.PI * 2); ctx.fill(); inked = true; $("sp-hint").hidden = true; });
    cv.addEventListener("pointermove", e => { if (!down) return; const p = pt(e); ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p; });
    const up = () => { down = false; }; cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
    const clear = () => { ctx.clearRect(0, 0, cv.width, cv.height); inked = false; $("sp-hint").hidden = typed; };
    const syncTyped = () => { $("sp-typed").textContent = $("sp-name").value.trim(); };
    $("sp-clear").onclick = clear;
    $("sp-mode").onclick = () => { typed = !typed; clear(); $("sp-typed").hidden = !typed; $("sp-hint").hidden = typed; $("sp-mode").textContent = typed ? "Draw it instead" : "Type it instead"; syncTyped(); };
    $("sp-name").addEventListener("input", syncTyped);

    async function signatureImage() {
      if (!typed) return inked ? cv.toDataURL("image/png") : null;
      const name = $("sp-name").value.trim(); if (!name) return null;
      try { await document.fonts.load('48px "Caveat"'); } catch (e) {}
      const c = document.createElement("canvas"), r = pad.getBoundingClientRect(); c.width = Math.round(r.width * 2); c.height = Math.round(r.height * 2);
      const x = c.getContext("2d"); x.scale(2, 2); x.fillStyle = "#0a0a0a"; x.font = '500 46px "Caveat", "Bradley Hand", cursive'; x.textBaseline = "middle"; x.fillText(name, 18, r.height / 2, r.width - 36);
      return c.toDataURL("image/png");
    }

    $("sp-sf").addEventListener("submit", async e => {
      e.preventDefault();
      const err = $("sp-serr"), go = $("sp-go"); err.textContent = "";
      const name = $("sp-name").value.trim(), title = $("sp-title").value.trim(), email = $("sp-email").value.trim();
      if (!name || !title) { err.textContent = "Add your full name and title."; return; }
      const signature = await signatureImage();
      if (!signature) { err.textContent = typed ? "Type your name above to create the signature." : "Draw your signature in the box, or choose Type it instead."; return; }
      if (!$("sp-ok").checked) { err.textContent = "Tick the box to confirm you accept the proposal and agree to sign electronically."; return; }
      go.disabled = true; go.textContent = "Signing";
      try {
        const rec = { v: 1, name, title, email, signature, method: typed ? "typed" : "drawn", consent: true, signedAtClient: new Date().toISOString(), docHash: D.docHash, company: DOC.company || "" };
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, KEY, enc.encode(JSON.stringify(rec)));
        const r = await fetch("/api/proposals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "sign", slug: D.slug, auth: AUTH, docHash: D.docHash, sig: { iv: b64e(iv), ct: b64e(ct) } }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || "Something went wrong. Try again.");
        D.sig = { signedAt: j.signedAt }; showSigned(slot, rec, j.signedAt);
        slot.scrollIntoView({ behavior: "smooth", block: "center" });
      } catch (x) { err.textContent = x.message || String(x); go.disabled = false; go.textContent = "Sign and accept"; }
    });
  }

  // Printing (or saving as PDF) shows every section, including the collapsed detail.
  window.addEventListener("beforeprint", () => document.querySelectorAll("details").forEach(d => { d.dataset.wasOpen = d.open ? "1" : ""; d.open = true; }));
  window.addEventListener("afterprint", () => document.querySelectorAll("details").forEach(d => { if (d.dataset.wasOpen === "") d.open = false; }));

  const form = $("sp-gf"), btn = $("sp-gbtn"), gerr = $("sp-gerr");
  if (!window.crypto || !crypto.subtle) { gerr.textContent = "This browser can't open encrypted proposals. Try a current version of Chrome, Safari, Edge or Firefox."; btn.disabled = true; return; }
  form.addEventListener("submit", async e => {
    e.preventDefault(); gerr.textContent = ""; btn.disabled = true; btn.textContent = "Opening";
    try { await unlock($("sp-gpw").value); }
    catch (x) { gerr.textContent = "That password didn't open this proposal. Check it and try again."; btn.disabled = false; btn.textContent = "Open proposal"; }
  });
  let saved = ""; try { saved = sessionStorage.getItem("sp." + D.slug) || ""; } catch (e) {}
  if (saved) unlock(saved).catch(() => { try { sessionStorage.removeItem("sp." + D.slug); } catch (e) {} });
})();
