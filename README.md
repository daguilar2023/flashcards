# Flashcards — Make it stick

A local-first React app for creating flashcard sets, browsing questions and answers, and practicing at your own pace.

**Live app:** https://daguilar2023.github.io/flashcards/

GitHub Pages and the Supabase database are configured. Choose **Sync devices → Create an account**, confirm your email, and sign in with that same account on your phone and computer. The seeded Android midterm set is already included.

## Run locally

Requires Node.js 20.19+ or 22.12+.

```sh
cd flashcards # from the parent Flashcard folder
npm install
npm run dev -- --host 127.0.0.1
```

Open the URL printed by Vite, usually http://127.0.0.1:5173. Use the same browser and address each time: browser storage is specific to an origin.

## What's included

- Responsive library dashboard, searchable sets, and color customization.
- Card editor with formatted text, lists, images up to 5 MB, and code blocks.
- Browse cards without changing study progress.
- Switch Browse to **All questions & answers** to read full fronts and backs together, search them, or open any card for editing.
- Ordered or random study, three confidence piles, saved progress, and undo for the last rating.
- **Restart study** resets every card in the current set to red and starts again. Resets sync across devices.
- Optional sections can be added, renamed, reordered, or removed in the Card editor. Each card can belong to a section or have no section. Removing a section keeps its cards and offers Undo.
- Ordered study stays in the earliest unfinished section: review its red cards, then its yellow cards, until every card is green. Only then does the next section unlock. Unsectioned cards come last. Random study mixes unfinished cards across all sections and both colors. Green is available for reviewing mastered cards. Yellow cards can stay yellow or move to green.
- Space to flip; 1, 2, and 3 to rate after revealing an answer. Shortcuts pause while typing in a field or using a dialog.
- Unfinished card drafts survive navigation and set switches during the current app session. Save a card before refreshing or closing the tab.
- Delete cards or sets with a temporary Undo action.
- Export all sets as JSON. Import validates and sanitizes older and newer backups, merges sets by ID, and keeps unrelated local sets. Importing the same set ID replaces its saved contents.

## Storage

Cards, images, and study progress are stored in IndexedDB (`flashcardsDB`) with a localStorage backup (`flashcards_app_v1`). The existing app's storage format is supported. Writes are serialized and timestamped so the newest successful copy loads after a refresh. Storage failures are surfaced in the interface; unreadable data is preserved instead of being automatically replaced.

Local saving works without an account. Once Supabase is configured, **Sync devices** lets you create/sign in to an account and share cards and red/yellow/green progress across devices. Local changes are saved immediately; cloud changes are merged against the last synced snapshot, so different cards rated on two devices do not overwrite each other. Changes made offline retry when connected. While signed in, the app checks for updates every 15 seconds and when it regains focus. Fonts use Google Fonts with local system fallbacks.

## GitHub Pages and cloud setup

The site is published by `.github/workflows/pages.yml`. In GitHub Settings → Pages, choose **GitHub Actions** as the source. The workflow derives the correct repository base path, builds the app, and publishes `dist`. Hash routes (for example `/flashcards/#/learn`) allow direct links and refreshing on GitHub Pages.

1. Create a Supabase project and run `supabase/setup.sql` in its SQL Editor. The table and save function allow each authenticated user to access only their own state; version checks reject a stale concurrent save.
2. Add repository **Actions variables** `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`, using the project URL and public publishable key (or legacy anon key). Never use a secret/service-role key. For local development, put those public values in an ignored `.env.local` file.
3. In Supabase Authentication → URL Configuration, set Site URL to the published GitHub Pages URL and allow that URL as an email-confirmation redirect.
4. Re-run the Pages workflow after updating variables. Choose **Sync devices** in the app, create an account and confirm its email, then sign in with the same account on both devices. Alternatively, the project owner can create the app's account in Supabase Authentication → Users; this avoids needing signup email delivery for a personal study app.

Progress from the old localhost URL stays in that browser's storage. To carry it to the published site, Export it from localhost and Import it on the published site once; then sign in to sync it. A fresh device downloads the cloud version without resetting its ratings to red. Export remains available as a backup. Use the same published URL on each device.

## Android midterm study set

The app includes **Android Midterm · October 8, 2026**, with 86 cards in the review sheet's order. Every main bullet and widget/layout/navigation sub-bullet is represented, including the eight reading reminders. Section counts are 6, 6, 7, 8, 24, 16, 7, and 12. Answers include relevant Java/XML practice fragments and PDF page references to the supplied professor slides (lectures 1, 2, 4, 5, 6, 7, 8, 10, 11, and 12). Supplemental explanations are labeled for gaps such as the Java compiler, R.java, ViewPager, and navigation patterns; textbook content was not added. Version answers explicitly follow the lecture table.

The set installs once, alongside existing sets, without replacing their cards or progress. Its 86 cards are assigned to the eight review topics as sections. Previously installed copies gain these sections once, preserving edits and ratings; deliberate unassignment is preserved afterward. Edits and deliberate deletions are preserved after refreshing. Its source is `src/data/android-midterm.json`; `src/lib/midterm.js` handles the one-time installation. Bundled overview cards are self-contained; a versioned content repair updates only unchanged original text in existing local and cloud copies, preserving personal edits, deletions, assignments, and ratings. Use Export for a transferable backup.

## Validation

```sh
npm run lint
npm test
npm run test:database # Node.js 24 recommended for the isolated Postgres test
npm run build
npm audit
```

Browser tests use an installed Google Chrome and isolated desktop/mobile contexts. They cover editing, draft navigation, code and images, study progression and shortcuts, old backups, HTML sanitization, storage failures, and responsive layout. Screenshots are written to `test-results/`.

Tests also cover ordered section completion, optional assignments, section changes, restart persistence, and merging section edits and resets across devices. Browser tests run on an isolated local port with cloud credentials disabled. Sync tests exercise concurrent updates, offline recovery, updates during pending requests, cloud downloads, and hash routes. The database test runs the actual setup SQL in isolated Postgres (PGlite), checking row-level isolation, anonymous access denial, and stale-write rejection. Live account saving and downloading were verified against the provisioned Supabase project.

## Source

- `src/FlashcardsApp.jsx`: library, routing, set and card actions, study sessions.
- `src/components.jsx`: dialogs, rich editor, card rendering, icons.
- `src/lib/model.js`: validation, sanitization, progress, and traversal.
- `src/lib/storage.js`: backward-compatible loading and queued persistence.
- `src/App.css` and `src/index.css`: app styling and responsive layouts.
