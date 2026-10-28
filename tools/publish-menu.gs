/**
 * Adds "Steadfast → Publish to kit" to the catalog Sheet.
 * Clicking it asks Netlify to rebuild the site, which reads this Sheet,
 * encrypts it and publishes it in about a minute.
 *
 * Setup (once): Extensions → Apps Script, paste this file, save.
 * Project Settings → Script Properties → add NETLIFY_BUILD_HOOK
 * with the build hook URL from Netlify (Site configuration → Build & deploy → Build hooks).
 */
function onOpen() {
  SpreadsheetApp.getUi().createMenu("Steadfast")
    .addItem("Publish to kit", "publishToKit")
    .addToUi();
}

function publishToKit() {
  const ui = SpreadsheetApp.getUi();
  const hook = PropertiesService.getScriptProperties().getProperty("NETLIFY_BUILD_HOOK");
  if (!hook) { ui.alert("The build hook isn't set. Add NETLIFY_BUILD_HOOK under Project Settings → Script Properties."); return; }
  const res = UrlFetchApp.fetch(hook, { method: "post", payload: "{}", contentType: "application/json", muteHttpExceptions: true });
  if (res.getResponseCode() >= 300) { ui.alert("Netlify didn't accept the request (" + res.getResponseCode() + "). Nothing was published."); return; }
  SpreadsheetApp.getActive().toast("Publishing. The kit updates in about a minute.", "Steadfast", 8);
}
