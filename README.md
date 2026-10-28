# Steadfast SOW Kit

The account manager kit for building scopes at 2026 rates: The Brief, seven packages, the full catalog with hours by role, a scope builder, level tests, and the terms. Password protected.

## How it is wired

- `index.html` is the whole site. No build step. It opens on a password page.
- `data/catalog.xlsx` is the source of truth. It is never pushed (see `.gitignore`); it stays in this folder for editing.
- `data/catalog.enc.js` is the workbook data, encrypted with the team password. This is the only data file the site reads and the only one in the repo. Without the password the file is unreadable, on GitHub or anywhere else.
- `data/pandadoc-import.csv` is the PandaDoc import file. Not read by the site, not pushed.
- `tools/encrypt_data.py` turns the workbook into `catalog.enc.js`.

## Updating prices, descriptions, packages or terms

1. Edit `data/catalog.xlsx`. The tool reads these sheets: Catalog, Quick Finder, Packages, Package Detail, Level Definitions, Terms. Keep the column headers exactly as they are. Add rows freely; a new line item needs a unique SKU in the same pattern (STF-XXX-000-L1).
2. Run `python3 tools/encrypt_data.py` and enter the team password (or `--password "…"`). First time on a Mac: `pip3 install openpyxl cryptography`.
3. Commit and push. GitHub Pages updates in about a minute. Anyone with the page open sees the new data on their next reload.

## Changing the password

Run step 2 with the new password. Everyone needs the new one from then on; "Remember on this device" entries stop working and the page asks again.

## Publishing on GitHub Pages

Repository settings, Pages, Source: Deploy from a branch, branch `main`, folder `/ (root)`. The site address is `https://<org>.github.io/<repo>/`. A private repository works too; Pages serves the site either way.

## What the password does and does not protect

The catalog, packages, hours, level tests and terms are inside the encrypted file and cannot be read without the password. The page itself (the Start Here steps and The Brief product copy) is plain HTML and visible to anyone with the address. If the Brief copy should also be hidden, say so and it moves into the workbook.

The site loads fonts from Google Fonts; everything else is in this folder.
