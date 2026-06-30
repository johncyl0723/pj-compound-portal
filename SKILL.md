---
name: pj-compound-portal
description: Maintain and publish the P&J Compound portal website in this repository. Use when working on this project’s frontend pages, monthly report HTML files, Firebase admin pages, or any change that should appear on the live GitHub Pages site at johncyl0723.github.io/pj-compound-portal.
---

# P&J Compound Portal

This repository is the source of truth for the live GitHub Pages site:

- Production URL: `https://johncyl0723.github.io/pj-compound-portal/`
- Git remote: `origin = https://github.com/johncyl0723/pj-compound-portal.git`
- Publish branch: `main`

## Required workflow

When a change affects the website, do not stop at local edits.

Treat these as website-affecting changes:

- `portal.html`
- `index.html`
- `admin.html`
- `firebase-admin.html`
- files under monthly report folders such as `2026_03/`, `2026_04/`, or `2026_05/`
- shared assets, styles, scripts, or other files rendered by GitHub Pages

After finishing the change:

1. Verify the edited behavior locally when feasible.
2. Stage only the intended files.
3. Create a normal git commit with a clear message.
4. Push to `origin main`.
5. Tell the user that GitHub Pages may take a short time to refresh.

Do not leave website-affecting changes only in the local workspace unless the user explicitly says not to publish yet.

## Monthly report label rule

For monthly reports shown in the frontend portal, backend content manager, and published Firestore records:

- Always format report labels as `YYYY年MM月`
- The month must be zero-padded, for example `2026年03月`, `2026年04月`, `2026年05月`
- Use the same label format when creating or updating `portalMonthlyReports` documents, fallback UI labels, and any publish scripts
- In frontend and backend monthly report lists, prefer rendering the display label from `year` and `month` when those fields exist, instead of trusting a legacy `label` field
- If existing Firestore records contain inconsistent month labels, normalize the stored `label` values as well so data and UI stay aligned

## Version sync rule

When debugging “I still see the old page” or “your version is different from mine” problems:

1. Check whether the live URL is GitHub Pages or another host before debugging further.
2. Prefer adding a visible build/version marker when frontend cache confusion is possible.
3. Make sure the live URL and the local repository are discussing the same source.

## Safety rule

Before committing, review `git status` and avoid bundling unrelated changes.
If there are unrelated local edits you did not make, do not revert them; commit only the files needed for the requested website fix.
