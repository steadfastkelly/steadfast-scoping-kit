#!/bin/sh
# Copies only the files the live site needs into _site/, which is what Netlify publishes.
# Everything else in the repo (README, tools, docs, the Webflow projects) stays off the web.
# A new file the site loads has to be added to the list below, or it will 404 once deployed.
set -eu
cd "$(dirname "$0")/.."
rm -rf _site
mkdir -p _site/assets _site/data
cp index.html _site/
cp assets/viewer.js assets/proposal.css _site/assets/
cp data/catalog.enc.js _site/data/
echo "staged $(find _site -type f | wc -l | tr -d ' ') files in _site/"
