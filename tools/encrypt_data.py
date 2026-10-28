"""Encrypt the workbook data for the site.

Reads data/catalog.xlsx, builds the site's data set, encrypts it with the password,
and writes data/catalog.enc.js. The site decrypts it in the browser after the
password is entered. The plain workbook and CSV stay in this folder and are
listed in .gitignore, so only the encrypted file is ever pushed.

Run after every edit to the workbook:

    python3 tools/encrypt_data.py                 (prompts for the password)
    python3 tools/encrypt_data.py --password "…"  (no prompt)

Changing the password is the same command with the new password; everyone
then needs the new one. Needs: pip3 install openpyxl cryptography
"""
import json, os, sys, base64, getpass, secrets, re
import openpyxl
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
ITER = 250_000

def build_data():
    wb = openpyxl.load_workbook(os.path.join(ROOT, "data", "catalog.xlsx"), data_only=True)
    def rows(name):
        if name not in wb.sheetnames: return []
        ws = wb[name]; it = ws.iter_rows(values_only=True); hdr = [str(h) if h is not None else "" for h in next(it)]
        return [dict(zip(hdr, [("" if v is None else v) for v in r])) for r in it if any(v not in (None, "") for v in r)]
    def num(v):
        try: return float(str(v).replace("$", "").replace(",", ""))
        except ValueError: return 0.0
    LV = {"Template": "T", "Level 1": "L1", "Level 2": "L2", "Level 3": "L3", "flat": "", "": ""}
    finder = {}
    for r in rows("Quick Finder"):
        k = r.get("Base SKU")
        if k: finder.setdefault(k, []).append(str(r.get("Client says...", "")).strip())
    items = []
    for r in rows("Catalog"):
        sku = str(r["SKU"]); bs = "-".join(sku.split("-")[:3])
        items.append(dict(sku=sku, name=r["Line item name (PandaDoc)"], base=r["Base deliverable"], cat=sku.split("-")[1], category=r["Service type"],
            section=r["SOW section"], level=LV.get(str(r["Level"]), ""), lname=r["Level name"], desc=r["Description (customer-facing)"],
            price=num(r["Flat price (2026)"]), unit=r["Unit"], billing=r["Billing"], rounds=r["Rev rounds"], basis=r.get("Price basis", ""),
            use=r["When to use"], find=", ".join(finder.get(bs, [])),
            h=dict(S=num(r["Strategy h"]), D=num(r["Design h"]), V=num(r["Dev h"]), A=num(r["Account h"]), C=num(r["Copy h"]), M=num(r["Medical copy h"]))))
    cats = []; seen = set()
    for i in items:
        if i["cat"] not in seen: seen.add(i["cat"]); cats.append(dict(code=i["cat"], name=i["category"]))
    uses = {r["Package"]: r["What it is for"] for r in rows("Packages")}
    pk = {}; order = []
    for r in rows("Package Detail"):
        p, s = r.get("Package"), r.get("SKU")
        if not p or not s: continue
        if p not in pk: pk[p] = []; order.append(p)
        pk[p].append(dict(sku=str(s), qty=int(num(r.get("Qty")) or 1)))
    packs = [dict(name=p, use=uses.get(p, ""), items=pk[p]) for p in order]
    levels = []
    for r in rows("Level Definitions"):
        rounds = {m.group(1): int(m.group(2)) for m in re.finditer(r"(Template|Level \d):\s*(\d+)", str(r["Revision rounds by level"]))}
        levels.append(dict(name=r["Service type"], test=r["Level test (what makes it Level 1, 2 or 3)"], rounds=rounds))
    terms = None; rates = None; g = {}; go = []
    for r in rows("Terms"):
        if r["Group"] == "Rates": rates = r["Text"]; continue
        if r["Group"] not in g: g[r["Group"]] = []; go.append(r["Group"])
        g[r["Group"]].append([r["Heading"], r["Text"]])
    if go: terms = [dict(h=h, items=g[h]) for h in go]
    return dict(items=items, cats=cats, packs=packs, levels=levels, terms=terms, rates=rates)

def main():
    pw = None
    if "--password" in sys.argv: pw = sys.argv[sys.argv.index("--password") + 1]
    if not pw: pw = getpass.getpass("Site password: ")
    data = build_data()
    plain = json.dumps(data, separators=(",", ":")).encode()
    salt = secrets.token_bytes(16); iv = secrets.token_bytes(12)
    key = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=ITER).derive(pw.encode())
    ct = AESGCM(key).encrypt(iv, plain, None)
    b64 = lambda b: base64.b64encode(b).decode()
    blob = dict(v=1, kdf="PBKDF2-SHA256", iter=ITER, salt=b64(salt), iv=b64(iv), ct=b64(ct))
    out = os.path.join(ROOT, "data", "catalog.enc.js")
    open(out, "w").write("window.SOWKIT_ENC = " + json.dumps(blob) + ";\n")
    print(f"encrypted {len(data['items'])} line items, {len(data['packs'])} packages -> data/catalog.enc.js ({os.path.getsize(out)//1024} KB)")

if __name__ == "__main__": main()
