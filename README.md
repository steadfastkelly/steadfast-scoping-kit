# Steadfast SOW Kit

The account manager kit for building scopes at 2026 rates: The Brief, seven packages, the full catalog with hours by role, a scope builder, level tests, and the terms. Password protected.

## How it is wired

- `index.html` is the whole site. It opens on a password page.
- **The Google Sheet "Steadfast Services Catalog" is the source of truth.** The team edits it directly.
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

## Timeline and MLR

The Scope Builder draws a rough waterfall timeline under the scope. Each row's length comes from its hours (about 30 production hours per person per week, two people once a role passes 150 hours on one row) plus its revision rounds (our send-off, the client's feedback time, then our revisions). Inside a phase, the next step starts once the previous one has its first round approved. Phases run Analysis & Strategy, Design, Build & Integration, then QA. A phase that holds promotional work ends in an MLR stage sized to the client's process (pick it in the builder, or "Not known yet" for a new client, which shows the range). Work after an MLR stage waits for approval. Hatched bars show how far each stage can stretch.

Calibrated in October 2026 against project-tracker history for eight past SOWs. Our production time matched the model; client review was the swing factor (2 days to 6 weeks per project, a median near 7 business days for the first round, faster after). So the builder defaults to 7 days of client feedback, later rounds take half that, and our own review, revisions and send-off add about a week per project. Projects whose clients had medical or legal review landed inside the "Not known yet" MLR range. Re-check once a few more projects close.

Two optional Catalog columns override the defaults per row; leave them blank to use the calculation:

- `Lead time (weeks)`: a fixed length for that row.
- `MLR review`: Yes or No, to override whether the row goes through MLR.

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
