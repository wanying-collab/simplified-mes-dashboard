# Classification-only production release

Production remains based on `e462853041d13dc8a7b0338207228f1bb3be9cd9`.
`production-classification.cjs` promotes only the product-name classification
delta approved in `53b7a57d9da0d1dc22fb477dbafde2fcef9d9004`.

- Nine named analysis functions must match their pre-classification versions
  exactly before replacement. The remaining integration points use unique,
  fail-closed anchors. Core time calculations are not replaced.
- Only the production `assets/simple-mes.js`, two portal HTML entries and the
  new `assets/product-spec-classification.js` module change. Production CSS,
  redirects and other assets remain byte-identical to the production baseline.
- Production has no Google synchronization module, GIS loader, authorization
  controls or Sheets API requests. Preview files still come from the working
  tree under `/testing/google-sync/` with isolated storage keys.
- Existing production storage keys are untouched. Classification uses the new
  `mes_product_classification_v1` key; preview uses its prefixed counterpart.
  There is no automatic settings transfer between environments.
- Before publishing, the live site must match either the complete previous
  release or this complete approved release. Mixed or unknown releases fail.
- The public artifact is an explicit allowlist. Tests, source documents,
  spreadsheets, credentials and local backups are not published.

The preview's Google spreadsheet remains readable by anyone with its link.
OAuth does not remove that pre-existing source-sharing risk. This release does
not change sharing permissions or write to Google Sheets/AppSheet.

Future promotions must explicitly update this release definition and tests.
Do not replace the production bundle with the preview application's bundle.

## Local verification (2026-10-19)

- 38 existing tests plus six production-isolation/regression tests passed.
- The same private 3,705-event fixture was imported through the browser into
  the pinned production baseline and the composed production release.
- Both returned 3,705 valid events, zero invalid events and 509 work orders.
  Processing: 43,105,678,000 ms; waiting: 256,455,523,000 ms, unchanged.
- The 2026 archive retained 419 work orders and 3,044 records. Per-order times,
  stations, anomalies and raw-reporting exports were identical.
- Seven exact suffix pairs were detected. Manual exclusion, reload, JSON
  download and import into a fresh browser context passed. Existing settings
  were preserved. No Google controls or Google requests occurred in production.
- Actual all-analysis and yearly XLSX downloads were reopened. Flow detail and
  statistics cells matched the shared UI/export model. Non-product columns in
  order/machine/archive detail reports were unchanged; raw events, waiting,
  utilization, anomaly, archive overview and archive-machine sheets matched.
- Preview setup analysis still returned 685 candidates, 133 adopted and 552
  excluded. Its application files remain unchanged at the approved test commit.
- Private fixtures, downloaded workbooks and settings backups remain outside
  the repository and are never included in the Pages artifact.

These checks do not represent a real Google OAuth login test.

## Comma/whitespace correction

The classification-only integration is still based on the pinned release above.
The new pure module is additionally approved by `MODULE_SHA256`; unknown module
changes fail the build. Four explicit UI/settings integration replacements and
versioned script URLs are the only changes to that production application.
The live-site gate now accepts the complete `250a98f` release or the complete
corrected release, including their matching module, never mixed versions.

Matching trims outer whitespace, equates fullwidth/ASCII commas and ignores
whitespace directly adjacent to commas. No other punctuation, dimensions,
internal spaces, case or process-stage text is normalized. Unpaired names remain
unchanged. Ambiguous multi-suffix matches remain disabled.

Version 1 settings preserve their original strings during JSON round trips.
Exclusions are matched using the same formatting rules; explicitly re-enabling
a pair removes all equivalent old exclusion keys, not unrelated settings.

Correction verification on the same private 3,705-event fixture:
- Exact enabled pairs: 7 before, 17 after (10 additional pairs).
- The 1000mm butterfly-valve bottom-cover group contains four distinct orders;
  the 600mm and 1200mm groups retain one distinct order each, without suffixes.
- Raw events, valid/invalid records, 509 orders, processing/waiting totals,
  station sequences and archive results are unchanged from `250a98f`.
- Preview setup analysis is identical: 685 candidates, 133 adopted, 552 excluded.
- Legacy JSON import/export, reload, fresh-context restore, disable/re-enable
  and preservation of unrelated LocalStorage settings pass browser checks.
- Actual XLSX exports retain raw, anomaly, waiting, utilization and archive
  statistics. Product grouping and display names are the intended differences.
- All 52 automated tests pass, including eight new formatting regressions.
