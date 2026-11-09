"""Sync the Google Sheet "Steadfast Services Catalog" to PandaDoc's product catalog.

The Sheet is the source of truth. This script never talks to PandaDoc itself (our PandaDoc plan has
no API access); it works out what has to change, and the scheduled Claude task "pandadoc-catalog-sync"
applies those changes through the PandaDoc connector, then records them here.

State lives in data/pandadoc-catalog-map.json (local only, see .gitignore): the PandaDoc uuid for every
SKU and category, plus a fingerprint of what was last pushed for each SKU. A row only gets pushed again
when its fingerprint changes, so an unchanged Sheet produces an empty plan.

    python3 tools/pandadoc_sync.py plan   SHEET [--out plan.json]
    python3 tools/pandadoc_sync.py commit plan.json results.json

SHEET is the workbook: an .xlsx file, or the JSON the Google Drive connector saves when it downloads
the Sheet as .xlsx ({"content": "<base64>", ...}).

`plan` writes one phase at a time, so later phases can refer to uuids created by earlier ones:
  1. categories  new Service types to create as PandaDoc categories
  2. items       line items to create or update (Catalog tab)
  3. bundles     packages to create or update (Packages + Package Detail tabs), once all their items exist
Run plan, apply it, commit, and repeat until the plan says "phase": "done".

results.json maps each created or updated key to its PandaDoc uuid:
  {"categories": {"<name>": "<uuid>"}, "items": {"<SKU>": "<uuid>"}}
Anything in the plan that is missing from results.json is left as it was, so the next plan retries it.

Rows deleted from the Sheet are listed under "removed" and never deleted from PandaDoc automatically.
"""
import base64, hashlib, io, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
MAP = os.path.join(ROOT, "data", "pandadoc-catalog-map.json")
PACKAGE_CATEGORY = "Packages"

def load_workbook(path):
    import openpyxl
    raw = open(path, "rb").read()
    if raw[:2] != b"PK":  # not a zip: the Drive connector's JSON wrapper
        raw = base64.b64decode(json.loads(raw)["content"])
    return openpyxl.load_workbook(io.BytesIO(raw), data_only=True)

def tab(wb, name):
    rows = list(wb[name].iter_rows(values_only=True))
    hdr = [str(h).strip() if h is not None else "" for h in rows[0]]
    return [dict(zip(hdr, r)) for r in rows[1:] if any(v not in (None, "") for v in r)]

def s(v): return "" if v is None else str(v).strip()
def lines(v): return "\n".join(re.sub(r"^\s*[-•*]\s*", "", x).strip() for x in s(v).splitlines() if x.strip())
def num(v):
    try: return float(str(v).replace("$", "").replace(",", ""))
    except ValueError: return 0.0

REQUIRED = {"Catalog": ["SKU", "Service type", "SOW section", "Level", "Level name", "Line item name (PandaDoc)", "Client description", "Includes",
                        "Deliverables", "Note", "Unit", "Billing", "Rev rounds", "Flat price (2026)"],
            "Packages": ["Package", "What it is for", "Package total"], "Package Detail": ["Package", "SKU", "Qty"]}

def check_sheet(wb):
    """Stop before pushing anything if a tab or header was renamed, or a row lost its name or price."""
    problems = []
    for name, cols in REQUIRED.items():
        if name not in wb.sheetnames: problems.append(f"missing tab '{name}'"); continue
        hdr = [str(c.value).strip() for c in wb[name][1] if c.value is not None]
        problems += [f"tab '{name}' is missing the column '{c}'" for c in cols if c not in hdr]
    if not problems:
        for d in tab(wb, "Catalog"):
            if s(d.get("SKU")) and not (s(d.get("Line item name (PandaDoc)")) and s(d.get("Service type")) and s(d.get("Flat price (2026)"))):
                problems.append(f"{s(d['SKU'])} has no PandaDoc name, Service type or price")
    if problems: sys.exit("Nothing planned. Fix the Sheet first:\n  " + "\n  ".join(problems))

def items_from_sheet(wb):
    """SKU -> (Service type, payload for catalog_item_create minus category_id)."""
    out = {}
    for d in tab(wb, "Catalog"):
        sku = s(d.get("SKU"))
        if not sku: continue
        pc = {"pricing_model": "fixed", "currency": "USD", "price": num(d.get("Flat price (2026)")), "billing_type": s(d.get("Billing")) or "one_time"}
        if pc["billing_type"] == "recurring": pc["billing_cycle"] = "monthly"
        rr = d.get("Rev rounds")
        rr = "" if rr in (None, "") else (str(int(float(rr))) if float(rr).is_integer() else str(rr))
        cf = [("Level", s(d.get("Level"))), ("Level name", s(d.get("Level name"))), ("SOW section", s(d.get("SOW section"))), ("Unit", s(d.get("Unit"))),
              ("Revision rounds", rr), ("Includes", lines(d.get("Includes"))), ("Deliverables", lines(d.get("Deliverables"))), ("Note", s(d.get("Note")))]
        out[sku] = (s(d.get("Service type")), {"sku": sku, "title": s(d.get("Line item name (PandaDoc)")), "description": s(d.get("Client description"))[:500],
                    "price_configuration": pc, "custom_fields": [{"name": n, "value": v} for n, v in cf if v]})
    return out

def packages_from_sheet(wb):
    """Package name -> (description, total, [(SKU, qty)]), in Sheet order."""
    lines_by = {}
    for d in tab(wb, "Package Detail"):
        if d.get("Package") and d.get("SKU"): lines_by.setdefault(s(d["Package"]), []).append((s(d["SKU"]), int(num(d.get("Qty")) or 1)))
    return {s(p["Package"]): (s(p.get("What it is for"))[:500], num(p.get("Package total")), lines_by.get(s(p["Package"]), []))
            for p in tab(wb, "Packages") if p.get("Package")}

def fp(obj): return hashlib.sha256(json.dumps(obj, sort_keys=True).encode()).hexdigest()[:16]

def load_state():
    st = json.load(open(MAP)) if os.path.exists(MAP) else {}
    st.setdefault("categories", {}); st.setdefault("items", {}); st.setdefault("packages", {})
    return st

def plan(sheet, out):
    wb = load_workbook(sheet); check_sheet(wb); st = load_state()
    items = items_from_sheet(wb); packs = packages_from_sheet(wb)
    removed = sorted(k for k in st["items"] if k not in items and not k.startswith("STF-PKG-"))
    removed += sorted(f"{st['packages'][n]['sku']} ({n})" for n in st["packages"] if n not in packs)
    res = {"removed": removed, "create": [], "update": []}

    need = sorted({c for c, _ in items.values() if c} | ({PACKAGE_CATEGORY} if packs else set()))
    new_cats = [c for c in need if c not in st["categories"]]
    if new_cats:
        res.update(phase="categories", create=[{"name": c} for c in new_cats])
    else:
        for sku, (cat, p) in items.items():
            p = dict(p, category_id=st["categories"][cat]); f = fp(p); cur = st["items"].get(sku)
            if not cur: res["create"].append({"key": sku, "fingerprint": f, "args": p})
            elif cur.get("fingerprint") != f: res["update"].append({"key": sku, "fingerprint": f, "args": dict(p, uuid=cur["uuid"])})
        if res["create"] or res["update"]:
            res["phase"] = "items"
        else:
            res["phase"] = "bundles"; nxt = 1 + max([int(v["sku"][-3:]) for v in st["packages"].values()] or [0])
            for name, (desc, total, members) in packs.items():
                missing = [k for k, _ in members if k not in st["items"]]
                if missing: res.setdefault("skipped", []).append(f"{name}: no PandaDoc item for {', '.join(missing)}"); continue
                cur = st["packages"].get(name)
                sku = cur["sku"] if cur else f"STF-PKG-{nxt:03d}"
                if not cur: nxt += 1
                p = {"title": f"{name} | Package", "sku": sku, "description": desc, "category_id": st["categories"][PACKAGE_CATEGORY],
                     "price_configuration": {"pricing_model": "fixed", "currency": "USD", "price": total, "billing_type": "one_time"},
                     "bundle_items": [{"item": {"kind": "catalog_item", "uuid": st["items"][k]["uuid"]}, "quantity": q} for k, q in members]}
                f = fp(p)
                if not cur: res["create"].append({"key": sku, "package": name, "fingerprint": f, "args": dict(p, type="bundle")})
                elif cur.get("fingerprint") != f: res["update"].append({"key": sku, "package": name, "fingerprint": f, "args": dict(p, uuid=cur["uuid"])})
            if not (res["create"] or res["update"]): res["phase"] = "done"
    json.dump(res, open(out, "w"), indent=1)
    print(f"phase: {res['phase']}  create: {len(res['create'])}  update: {len(res['update'])}  removed from Sheet: {len(removed)}  -> {out}")
    for k in ("skipped",):
        for x in res.get(k, []): print("skipped:", x)

def commit(plan_path, results_path):
    p = json.load(open(plan_path)); r = json.load(open(results_path)); st = load_state(); done = 0
    if p["phase"] == "categories":
        for c in p["create"]:
            if c["name"] in r.get("categories", {}): st["categories"][c["name"]] = r["categories"][c["name"]]; done += 1
    elif p["phase"] in ("items", "bundles"):
        for a in p["create"] + p["update"]:
            uuid = r.get("items", {}).get(a["key"])
            if not uuid: continue
            if "package" in a: st["packages"][a["package"]] = {"sku": a["key"], "uuid": uuid, "fingerprint": a["fingerprint"]}
            st["items"][a["key"]] = {"uuid": uuid, "fingerprint": a["fingerprint"]}; done += 1
    json.dump(st, open(MAP, "w"), indent=1)
    total = len(p["create"]) + len(p["update"])
    print(f"recorded {done} of {total} ({p['phase']})" + ("" if done == total else " - the rest will be retried on the next plan"))

if __name__ == "__main__":
    a = sys.argv[1:]
    if a[:1] == ["plan"] and len(a) >= 2: plan(a[1], a[a.index("--out") + 1] if "--out" in a else "pandadoc-plan.json")
    elif a[:1] == ["commit"] and len(a) == 3: commit(a[1], a[2])
    else: sys.exit(__doc__)
