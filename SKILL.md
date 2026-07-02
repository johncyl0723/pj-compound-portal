---
name: pj-compound-portal
description: Maintain and publish the P&J Compound portal website in this repository. Use when working on this project’s frontend pages, monthly report HTML files, Firebase admin pages, or any change that should appear on the live GitHub Pages site at johncyl0723.github.io/pj-compound-portal.
---

# P&J Compound Portal

This repository is the source of truth for the live website surfaces:

- Production URL: `https://johncyl0723.github.io/pj-compound-portal/`
- Firebase Hosting URL: `https://pnj-compound-company-limited.web.app/`
- Git remote: `origin = https://github.com/johncyl0723/pj-compound-portal.git`
- Publish branch: `main`

## Required workflow

When a change affects the website, do not stop at local edits.

Treat these as website-affecting changes:

- `portal.html`
- `index.html`
- `admin.html`
- `firebase-admin.html`
- `structured-statements-admin.html`
- files under monthly report folders such as `2026_03/`, `2026_04/`, or `2026_05/`
- shared assets, styles, scripts, or other files rendered by GitHub Pages

After finishing the change:

1. Verify the edited behavior locally when feasible.
2. Stage only the intended files.
3. Create a normal git commit with a clear message.
4. Push to `origin main`.
5. If the change affects a Firebase-hosted admin page or its browser assets, deploy Firebase Hosting too.
6. Tell the user which live host was updated and that a hard refresh such as `Ctrl+F5` may still be needed.

Do not leave website-affecting changes only in the local workspace unless the user explicitly says not to publish yet.

## Publish workflow for GitHub and Firebase

Use this release flow when the request touches frontend pages plus Firebase-backed admin behavior.

### GitHub Pages release

1. Finish the code change and verify the relevant page locally when feasible.
2. Run `git status --short` and confirm only intended files are included.
3. Stage only the required files.
4. Commit with a focused message.
5. Push to `origin main`.
6. Tell the user the live GitHub Pages URL may need a hard refresh such as `Ctrl+F5`.

### Firebase Hosting release

Use this whenever the user is viewing or testing a `web.app` URL, or when the change touches Firebase admin pages such as:

- `firebase-admin.html`
- `structured-statements-admin.html`
- `firebase-portal.js`
- `assets/shareholder-statement-template.js`

Required release flow:

1. Finish the code change and verify locally when feasible.
2. Run `git status --short` and confirm only intended files are included.
3. Stage only the required files.
4. Commit with a focused message.
5. Push to `origin main`.
6. Deploy Firebase Hosting from the repository root:

```powershell
npx firebase-tools deploy --only hosting --project pnj-compound-company-limited --non-interactive
```

7. Verify the live `web.app` page source contains the expected build marker, import cache-buster, or version string before telling the user it is fixed.
8. Tell the user to hard refresh the exact `web.app` URL they are testing.

Do not assume that pushing to GitHub updates `https://pnj-compound-company-limited.web.app/`. GitHub Pages and Firebase Hosting are separate release targets in this project.

### Firestore rules release

If the change updates Firestore security rules, deploy them from the repository root:

```powershell
npx firebase-tools deploy --only firestore:rules --project pnj-compound-company-limited --non-interactive
```

### Firebase Functions release

If the change updates callable Functions or Firebase-backed admin workflows, do not assume the repo-local `functions/node_modules` is healthy. This project lives in a deep Google Drive path, and local dependency installs can become incomplete.

Preferred successful flow:

1. Prefer deploying from a clean local temp copy instead of the Google Drive workspace itself.
2. Use this fixed temp path first:

```text
C:\Users\NB_03\AppData\Local\Temp\pj-compound-deploy
```

3. Rebuild the deploy copy from the repository root with a mirrored copy that excludes transient folders such as `.git`, `.firebase`, `tmp`, `functions/node_modules`, and `functions/node_modules-google-drive-partial`.
4. Deploy from the temp copy root, not from the Google Drive path.
5. In `C:\Users\NB_03\AppData\Local\Temp\pj-compound-deploy\functions`, run:

```powershell
npm install
```

6. If `npm install` fails inside the Google Drive workspace but succeeds in the temp copy, treat that as expected behavior for this repository. Do not waste time retrying installs in the synced workspace.
7. Deploy only the intended functions from `C:\Users\NB_03\AppData\Local\Temp\pj-compound-deploy` instead of deploying all functions blindly. This avoids non-interactive failure when Firebase finds an older cloud function that is not present in the local source.

Example successful pattern:

```powershell
npx firebase-tools deploy --only "functions:approveShareholder,functions:setShareholderPassword,functions:setShareholderActive,functions:getShareholderAdminData,functions:getPortalAdminData,functions:getPortalAnnouncementsAdminData,functions:savePortalAnnouncement,functions:setPortalAnnouncementActive,functions:deletePortalAnnouncement" --project pnj-compound-company-limited --non-interactive
```

8. If the release includes frontend files, Firestore rules/indexes, and Functions together, the known-good full deploy command from the temp copy root is:

```powershell
npx firebase-tools deploy --project pnj-compound-company-limited --only firestore,functions,hosting
```

9. If Firebase reports that an old function exists in the project but not in local source, do not let non-interactive deploy abort the whole release. Either:
   - deploy only the required functions with the `--only "functions:..."` pattern above, or
   - explicitly delete the obsolete cloud function later in a separate step.

10. The local machine may have a newer global Node version than the Functions runtime. If deploy analysis fails in the synced workspace, prefer the clean temp-copy flow before changing runtime settings.

### Admin announcement fix pattern

For Firebase admin features such as portal announcements, prefer this architecture:

1. Frontend admin page calls callable Functions.
2. Functions enforce admin permission checks.
3. Functions write to Firestore.
4. Frontend portal reads published records for display.

This is more reliable than letting the admin page write directly to Firestore when permission and token-claim behavior may vary.

## Monthly report label rule

For monthly reports shown in the frontend portal, backend content manager, and published Firestore records:

- Always format report labels as `YYYY年MM月`
- The month must be zero-padded, for example `2026年03月`, `2026年04月`, `2026年05月`
- Use the same label format when creating or updating `portalMonthlyReports` documents, fallback UI labels, and any publish scripts
- In frontend and backend monthly report lists, prefer rendering the display label from `year` and `month` when those fields exist, instead of trusting a legacy `label` field
- If existing Firestore records contain inconsistent month labels, normalize the stored `label` values as well so data and UI stay aligned

## Monthly report generator guardrail

When updating or generating monthly report HTML with `tools/build-monthly-report.mjs`:

1. Treat generated inline JavaScript as a release artifact that must parse cleanly.
2. After generating a report HTML file, run a syntax check against the page script body, not only a visual spot check.
3. Be especially careful with replacement strings for chart labels inside `replaceRegex(...)`.
4. Prefer ASCII-safe chart labels in generated script replacements when the source file already shows encoding noise. Do not inject fragile mixed-encoding text into inline JavaScript labels.
5. If one chart block fails to parse, assume later charts may silently disappear because the whole script stops executing. Check the first syntax error before reviewing missing visuals.

Known failure mode from the 2026-02 monthly report:

- The generator replaced the `chartPnl` labels with a malformed quoted array inside inline JavaScript.
- Result: browser script parsing stopped, and the monthly performance chart area rendered blank even though the HTML cards and containers existed.
- Required fix pattern: correct the generator replacement string first, then regenerate or patch the affected monthly HTML file, then re-run script syntax validation.

## Version sync rule

When debugging “I still see the old page” or “your version is different from mine” problems:

1. Check whether the live URL is GitHub Pages or another host before debugging further.
2. Prefer adding a visible build/version marker when frontend cache confusion is possible.
3. Make sure the live URL and the local repository are discussing the same source.

### Firebase Hosting version mismatch rule

If the user is on `pnj-compound-company-limited.web.app`, treat Firebase Hosting as the source of truth for that session, not GitHub Pages.

Required checks:

1. Verify which exact live URL the user opened.
2. If code was only pushed to GitHub but not deployed to Firebase Hosting, treat the fix as incomplete.
3. Verify the live page source shows the expected `APP_VERSION`, build badge string, or cache-busted import URLs before telling the user it is fixed.

Known failure mode:

- Local code and `main` already contained a newer fix such as `adminwritefix3`, but `https://pnj-compound-company-limited.web.app/structured-statements-admin.html` still served `adminwritefix2`.
- Cause: GitHub push completed, but Firebase Hosting deploy was skipped.
- Required fix pattern: deploy Hosting, then verify the live page source shows the new `APP_VERSION` and import version strings.

## Safety rule

Before committing, review `git status` and avoid bundling unrelated changes.
If there are unrelated local edits you did not make, do not revert them; commit only the files needed for the requested website fix.

## Structured statement admin guardrails

Use these checks whenever touching `structured-statements-admin.html`, `firebase-admin.html`, `functions/index.js`, or shareholder statement imports.

### Data flow checklist

Before concluding that "the import failed", verify all three layers separately:

1. Firestore layer
   - Read one known document directly from `statements/{uid}/months/{yyyymm}` and confirm fields such as `renderMode`, `shareholderName`, `navPerUnit`, and `ownershipPercent` are present.
2. Callable function layer
   - Verify `getShareholderAdminData` returns the matching statement in its `statements` array for the same month.
   - Verify each shareholder entry includes a stable identifier usable by the frontend. Prefer returning `uid: doc.id` explicitly for `shareholders`.
3. Frontend layer
   - Verify the admin page version marker matches the expected build.
   - Verify the selected shareholder id used by the dropdown can actually match the ids inside `statementDocs`.

Do not stop after checking only Firestore. This project already had a real failure mode where Firestore data existed, the page was on the newest build, but the callable function omitted `uid`, so the frontend could not match shareholder rows to statement rows and silently fell back to blank defaults.

### ID mapping rule

For all admin/shareholder payloads:

- Treat Firestore document ids as first-class data, not implicit metadata.
- When returning shareholder docs from Functions, include `uid: doc.id`.
- In frontend admin pages, use a helper pattern equivalent to `uid || id` when matching records, so the UI remains tolerant during mixed-version rollouts.

Whenever a page uses shareholder dropdown option values, `statementFor(uid)`, account management actions, or publish/upload actions, verify they all use the same id source.

### Import parsing rule

For Excel statement imports:

- Do not assume the workbook is flat/tabular. This project uses one worksheet per shareholder with report-style layout.
- Skip summary rows such as total lines instead of importing them as contribution rows.
- Normalize percentage fields into display-ready percent values if the frontend expects `7.11` rather than `0.0711`.
- Handle exceptional name layouts such as `王慶煌(登記為：...)` explicitly instead of assuming a single-cell name.

### Deploy rule for admin workflow changes

If a fix touches both frontend admin pages and callable function behavior, deploy both:

1. Firebase Functions
2. Firebase Hosting

Do not assume a Hosting deploy is enough when the bug involves data loading, and do not assume a Functions deploy is enough when the page contains versioned client logic.

If a fix touches only frontend admin pages or shared browser assets used by them, you must still deploy Firebase Hosting. A GitHub push alone is not enough for `web.app` admin URLs.

### Post-deploy verification rule

After deploying a statement-admin fix, always verify in this order:

1. The target page URL returns `200`.
2. The live HTML contains the expected build/version string.
3. One known Firestore statement document exists.
4. One known shareholder can load non-empty fields in the live admin UI.

Use `CS001` or another known shareholder as a canary record.

If the user reported a Firebase Hosting URL, step 1 and step 2 must be checked against that exact `web.app` URL, not only the GitHub Pages URL.

### Release hygiene rule

This repo commonly accumulates transient files such as `.firebase/`, `tmp/`, `_portal_script_check.js`, and local CSV scratch files.

Before commit or deploy, confirm these are not accidentally staged unless the change explicitly requires them.

### Git lock recovery rule

This workspace can leave behind `.git/packed-refs.lock` or `.git/index.lock` after a successful commit with a noisy cleanup failure.

If `git commit` succeeds but prints a lock-file error:

1. Verify the commit actually exists with `git log -1 --oneline`
2. Remove only the stale lock file
3. Continue with push

Do not re-run the same commit blindly before checking whether the commit already landed.
