# Steadfast SOW Kit

The account manager kit for building scopes at 2026 rates: The Brief, seven packages, the full catalog with hours by role, a scope builder, level tests, and the terms. Password protected.

## How it is wired

- `index.html` is the whole site. It opens on a password page.
- **The Google Sheet "Steadfast Services Catalog" is the source of truth.** The team edits it directly.
- `data/catalog.enc.js` is the catalog, encrypted with the team password. It is the only data file the site reads. Netlify rebuilds it from the Sheet on every deploy; the copy in the repo is the fallback if the Sheet can't be read.
- `tools/encrypt_data.py` reads the Sheet (or the local workbook), encrypts it and writes `catalog.enc.js`.
- `netlify.toml` tells Netlify to run that script on every build. `requirements.txt` lists what it needs.
- `tools/stage-site.sh` then copies only the files the site loads (`index.html`, `assets/viewer.js`, `assets/proposal.css`, `data/catalog.enc.js`) into `_site/`, and Netlify publishes that folder. Nothing else in the repo is served. If the site starts loading a new file, add it to that script.
- `tools/publish-menu.gs` is the Apps Script behind the Sheet's **Steadfast → Publish to kit** menu.
- `tools/pandadoc_sync.py` works out what in PandaDoc's product catalog has to change to match the Sheet (see "PandaDoc catalog sync" below).
- `data/catalog.xlsx`, `data/pandadoc-import.csv` and `data/pandadoc-catalog-map.json` are local only (see `.gitignore`).

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

## Options, waves and scope files

- **Options.** The Scope Builder can hold several named scopes (options) for one proposal. Pick one to edit from the strip above the table; "Copy this option" starts a variant. Mark one as the lead: the proposal is built on it, and a "Your Options" section compares the others side by side (price, launch date, payments, and what each changes against the lead), each expandable to its full scope, budget and payment schedule. With one option, nothing changes.
- **Signing one option.** The client picks an option in the Acceptance block before signing. The publish sends each option's id, name and total in plain text (like the total already is); at signing the client sends only the id, and the server records that option and its published total, and writes it to ClickUp. Proposals with one option sign as before.
- **Waves.** Tick "Run in two waves" under the timeline to give each row a wave (A, B or the whole program) and a start date for Wave B. Each wave runs its own phase waterfall. The timeline flags when Wave A overruns Wave B's start or when Wave B starts before Wave A's design is approved.
- **Parallel workstreams.** For a program with several teams, tick "Parallel workstreams". Each row gets a workstream (Strategy & messaging, Brand & campaign, Websites, Visual aid, Other materials, Wave B), picked from the deliverable and changeable per row. Each runs its own waterfall and MLR, starting when what it depends on has its direction approved: strategy at kickoff, brand and campaign once messaging does, websites once the brief does, the visual aid, other materials and Wave B once the campaign does. Websites run as launch sites are built: content and design go to MLR together, the build starts from approved templates, and QA runs alongside a final MLR review on staging; with two sites, each has its own team. Set "Team size" to level the plan: a row waits until the people are free (strategy is staffed first, Wave B last), and a "People needed" row shows each week's load against the team. Off by default; the waterfall is unchanged without it.
- **Trial data readout.** Set the date the client's data reads out, and tick "Needs trial data" on the rows that depend on it (a site's data pages can be their own row). Those rows start after the readout; a Claims Matrix row starts at the readout, and every other data row waits until its first round is approved.
- **Plan for the deck.** "Copy plan for the deck" gives the big blocks for a pitch deck before there is a final SOW: each workstream (or phase) with its months on the lead option and a price range across the options, the client-contracted items, and the rows that need a partner.
- **Work the client contracts directly.** A per-proposal list (for example a market research firm, or advisory board honoraria and venues) shown in the proposal with a rough estimate and kept out of the totals. A partner is named only when ticked.
- **Target launch.** Set the date the client needs. The timeline says whether the launch reaches it, and if not, which rows end latest.
- **Import and export.** Import takes a .json file or pasted text: a list of `{"sku","qty"}` rows (optional `"wave"`: "A" or "B") becomes one option, and `{"options":[{"name","lead","summary","rows"}]}` becomes several. SKUs not in the catalog are listed, not dropped silently. Export copies every option as JSON.
- **Large-program terms.** A per-proposal tick adds the Terms tab's rows marked `Applies` = "Opt-in", and an Assumptions and Risks section. The opt-in group named "Assumptions and Risks" is the risk table (Heading = the risk, Text = "Likelihood | How it's handled").
- **Voices.** A per-proposal section of endorsements, entered in the Proposal panel. Quotes are pasted exactly as the person approved them in writing; never write or reword one. An entry appears only when it is ticked to show and has the quote, name, title, who approved it, the date and a link to the written approval. The approval fields are never published. With no entry ready, the section stays hidden.
- **Integrated partners.** The Catalog's optional `Partner` column names who delivers a row with us (text starting "Optional" means we can deliver it ourselves), and `Partner h` holds partner hours, priced at the partner rate on the Levels page. The kit marks those rows in the catalog and the builder, warns before publishing, and lists partner hours in the hours export. Partner names never appear in client copy.

## Proposals: preview, publish, sign

The Proposal panel in the Scope Builder builds the client-facing proposal from the scope, the timeline and the proposal details. The layout follows the Complex (L3) proposal; Mid-range and Simple use fewer sections. The format is picked from the scope (Simple under $15,000 with one phase, Complex from $50,000 or with a site build, Mid-range between), and the AM can override it.

| Format | Sections |
|---|---|
| Simple (L1) | Project Overview, Budget, Timeline, Payment Schedule, Terms + Conditions, Acceptance |
| Mid-range (L2) | adds Scope of Work and Review + Feedback |
| Complex (L3) | Plan & Investment (summary, payment schedule, then Scope of Work, Budget and Timeline as expandable sections), Post-Launch Services when the scope has monthly work, Review + Feedback, Why Steadfast |

- **Preview Proposal** opens the proposal in its own tab, or in a panel over the kit when pop-ups are blocked. It redraws as the scope, timeline or details change.
- **Publish Proposal** asks for a web address (from the project title) and a password. The proposal is encrypted in the browser with that password (AES-GCM, PBKDF2-SHA256), and only the ciphertext goes to the server. It is then live at `steadfast-sow-kit.netlify.app/<address>`. Send the link and the password separately.
- **Engagement task** (optional, in the same dialog) takes the ClickUp task link or id for the engagement. Publishing then marks the task "proposal sent" with the proposal's value and link, a revision posts a comment, the client's signature marks it "signed" with a Signed Date, and unpublishing posts a "withdrawn" comment. The functions never set "lost" and never move a status backwards. This runs only when `CLICKUP_API_TOKEN` is set in Netlify; without it the functions log what they would send and nothing else changes. A nightly function (`reconcile.mjs`, 11:00 UTC) fixes any task the live call missed and posts one comment on a proposal unsigned for 14 days. Tests: `npm run test:functions`.
- **The client** opens the link, enters the password, reads, and signs in the Acceptance section: full name, title, a drawn or typed signature, and a consent box. The signature is encrypted with the same key. The page then shows the signed record with a document ID, and the client can save a PDF.
- **Published proposals** under the panel lists each proposal with its status. An unsigned proposal can be replaced or unpublished. A signed one can't be changed; publish a new version at a new address.

How it runs: the Netlify Functions in `netlify/functions` and the site's Netlify Blobs store `proposals`. Only the ClickUp link needs setting up (`CLICKUP_API_TOKEN`, see docs/proposal-tracking-solution.md); everything else works without configuration.

- `proposals.mjs` serves `/api/proposals`. Publishing, listing and unpublishing need the team password (the `SITE_PASSWORD` variable). Signing needs a token derived from the proposal password; the server keeps only its hash.
- `proposal-page.mjs` serves `/<address>`. Static files come first, so the kit itself is unaffected.

The client page's code is `assets/viewer.js`, and its styles are `assets/proposal.css`. The styles are copied into each proposal when it is published, so a signed proposal keeps its look. The client page also links the live `assets/proposal.css`, so add new class names rather than changing existing rules, or proposals already out (signed ones included) change too.

Steadfast's signature block is pre-filled with the signer named in the panel (default: Taylor Tsantles). Signing records the signer's name, title, email, signature image, the time, and the document's fingerprint. The server adds the IP address and browser.

`proposalMarkdown()` and `pandadocPayload()` in index.html still build a PandaDoc draft, for a plan with API access.

## PandaDoc catalog sync

PandaDoc's product catalog carries the same line items and packages as the Sheet, so account managers can add them to proposals in PandaDoc. The Sheet stays the source of truth: change it there, never in PandaDoc, or the next sync will overwrite the change.

| Sheet | PandaDoc |
|---|---|
| Catalog row | Catalog item. Name from "Line item name (PandaDoc)", the same SKU, price from "Flat price (2026)", one-time or recurring monthly from "Billing", description from "Client description" (500 characters at most) |
| Level, Level name, SOW section, Unit, Rev rounds, Includes, Deliverables, Note | Custom fields on the item |
| Service type | Category (a new Service type becomes a new category) |
| Packages + Package Detail | Bundle in the "Packages" category, SKU STF-PKG-001 and up, priced at "Package total". Bundles work in PandaDoc's Quote builder block, not the older pricing tables |

How it runs: PandaDoc's API isn't on our plan, so a Netlify build can't push to it. Instead, a scheduled Claude task on Kelly's Mac (`pandadoc-catalog-sync`) downloads the Sheet, runs `tools/pandadoc_sync.py plan`, applies the changes through the PandaDoc connector, and records them with `commit`. The task runs weekly, Mondays at 8am, while the Claude app is open; a run that was missed happens on the next launch. After an edit that can't wait, open the task in Claude and click Run now. The task's instructions are in `docs/pandadoc-sync-task.md` (local only).

- Only changed rows are pushed. The script keeps a fingerprint of what it last sent for each SKU in `data/pandadoc-catalog-map.json`, along with the PandaDoc ID of every item and category. Don't delete that file: without it the next run would create every item again.
- If a tab or column is renamed, or a row loses its PandaDoc name, Service type or price, nothing is pushed and the run reports what to fix.
- A run that would change more than 60 items stops and asks for a check first.
- Deleted rows are never deleted in PandaDoc. The run lists them; retire them in PandaDoc by hand.
- Existing proposals keep their prices. A sync changes only the catalog that new proposals pull from.

First import: November 8, 2026. 244 items, 14 categories and the 8 packages.

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
