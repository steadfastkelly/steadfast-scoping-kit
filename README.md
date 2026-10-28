# Steadfast SOW Kit

The account manager kit for building scopes at 2026 rates: The Brief, seven packages, the full catalog with hours by role, a scope builder, level tests, and the terms. Password protected.

## How it is wired

- `index.html` is the whole site. It opens on a password page.
- **The Google Sheet "Steadfast Services Catalog" is the source of truth.** Tori, Brittney, Rebecca and Kelly edit it directly.
- `data/catalog.enc.js` is the catalog, encrypted with the team password. It is the only data file the site reads. Netlify rebuilds it from the Sheet on every deploy; the copy in the repo is the fallback if the Sheet can't be read.
- `tools/encrypt_data.py` reads the Sheet (or the local workbook), encrypts it and writes `catalog.enc.js`.
- `netlify.toml` tells Netlify to run that script on every build. `requirements.txt` lists what it needs.
- `tools/publish-menu.gs` is the Apps Script behind the Sheet's **Steadfast → Publish to kit** menu.
- `data/catalog.xlsx` and `data/pandadoc-import.csv` are local only (see `.gitignore`).

## Updating prices, descriptions, packages or terms

1. Edit the Google Sheet. The site reads these tabs: Catalog, Quick Finder, Packages, Package Detail, Level Definitions, Terms. Keep the column headers and tab names exactly as they are. Client-facing copy lives in the Catalog tab's Client description, Includes, Deliverables and Note columns (one bullet per line in Includes and Deliverables); it is what the kit shows first and what the Scope Builder exports. Add rows freely; a new line item needs a unique SKU in the same pattern (STF-XXX-000-L1).
2. Choose **Steadfast → Publish to kit** in the Sheet.
3. In about a minute the site has the new data. Anyone with the page open sees it on their next reload.

If a publish fails (a renamed tab, for example), Netlify keeps the previous version live. The error is under Deploys in Netlify.

## Changing the password

In Netlify: Site configuration → Environment variables → `SITE_PASSWORD`. Change it, then Deploys → Trigger deploy. Everyone needs the new one from then on; "Remember on this device" entries stop working and the page asks again.

## One-time setup (done October 2026; here for reference)

1. Google Cloud: a project with the Google Sheets API enabled and a service account with a JSON key. Share the Sheet with the service account's email as **Viewer**.
2. Netlify, Site configuration → Environment variables: `CATALOG_SHEET_ID` (the long ID in the Sheet's URL), `GOOGLE_SERVICE_ACCOUNT_JSON` (the whole key file), `SITE_PASSWORD`.
3. Netlify, Build & deploy → Build hooks: add one named "Google Sheet". In the Sheet: Extensions → Apps Script, paste `tools/publish-menu.gs`, and add the hook URL as the Script Property `NETLIFY_BUILD_HOOK`.

To work without the Sheet (testing on a Mac): `pip3 install -r requirements.txt`, then `python3 tools/encrypt_data.py` reads `data/catalog.xlsx` and prompts for the password. Commit and push the new `catalog.enc.js`. Netlify will replace it from the Sheet on its next build once the Sheet is set up.

## What the password does and does not protect

The catalog, packages, hours, level tests and terms are inside the encrypted file and cannot be read without the password. The page itself (the Start Here steps and The Brief product copy) is plain HTML and visible to anyone with the address. If the Brief copy should also be hidden, say so and it moves into the workbook.

The site loads fonts from Google Fonts; everything else is in this folder.
