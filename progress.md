# Qura'ani – قرآني · progress.md

Handover document. Read this first, then verify against the code (`git log`, `npm test`, `npx tsc --noEmit`).

## 1. Project Overview
Personal Quran companion with three independent daily trackers — Memorization (الحفظ), Revision (المراجعة),
Reading (القراءة). Each has its own goal (ayahs / pages / hizb), progress recorded as exact Quran ranges,
statuses, history, pause/resume, postpone, 0–5 self-rating (hifz/revision) and recurring local reminders
that stop once the day's goal is done. Arabic (RTL) + English. Local-first, offline, no account.

Repo: https://github.com/Talaat-hub/quraani (public).

## 2. Current Technology Stack
- Expo SDK 58 (`expo@~58.0.26`), React Native 0.88.1, React 19.3.0, TypeScript ~6.0
- Expo Router ~58.0.32 (routes in `src/app/`, JS tabs from `expo-router/js-tabs`)
- expo-sqlite ~58.0.18 (local DB, migrations via `PRAGMA user_version`)
- expo-notifications ~58.1.9 (local, one-shot DATE triggers)
- expo-localization (device language default, RTL plugin), expo-updates (`reloadAsync` after a direction change)
- @expo/vector-icons + expo-font (tab icons)
- Tests: jest 30 + jest-expo preset; repository tests run on Node's built-in `node:sqlite` (Node ≥ 22.5; dev machine has Node 24)
- `react-dom` pinned to 19.3.0 to satisfy expo-router's web peer (19.3.1 needs react 19.3.1 → ERESOLVE)

Environment notes (this dev machine): a global npm config `allow-scripts=@oracle/suitecloud-cli` breaks
project installs with `EALLOWSCRIPTS`. Workaround: run installs as `npm_config_allow_scripts= npm install`
(bash) or `$env:npm_config_allow_scripts=''; npm install` (PowerShell). No Android SDK / emulator installed;
iOS builds need macOS or EAS.

Skills/plugins: the available Claude Code skills/plugins are business/marketing oriented; none cover React
Native, Expo, SQLite or Quran data, so none were installed. Expo docs for SDK 58 were read directly.

## 3. Architecture and Technical Decisions
```
src/quran/        Quran metadata (generated) + pure range/page/hizb math
src/domain/       Pure business rules: statuses, reminder planning, dates, tracker ids
src/db/           Schema + migrations, repository (all writes/validation)
src/notifications Side-effect layer over expo-notifications (sync plan -> OS)
src/state.tsx     App context: db, today, settings, theme, `act()` (write → refresh → resync reminders)
src/app/          Expo Router screens (UI only)
```
Decisions:
1. **Quran data** = Tanzil Quran Metadata v1.0 (CC BY 3.0, attribution in About screen + README). Converted by
   `scripts/convert-tanzil.js` (regex parse, no eval) into `src/quran/data.ts`. Tests assert 114 surahs, 6236 ayahs,
   604 pages, 240 hizb quarters and known page/juz/hizb boundaries.
2. **Mushaf edition**: Madani Mushaf (604 pages) as encoded by Tanzil. Only edition supported; page/hizb math
   goes through `src/quran` so another edition = another data table.
3. **References** stored as (surah, ayah) pairs; a global index 1..6236 is derived for math only.
4. **Units**: goal in ayahs, pages or hizb *quarters* (¼=1 … 1 hizb=4, 2 hizb=8). Partial pages/quarters are
   weighted by ayah count (shortcut documented in `src/quran/index.ts`; upgrade = weight by letter count).
   `planPortion` and `measure` share the same weights so a planned portion always measures ≥ the goal.
5. **Target vs actual**: each `day_records` row snapshots the goal; actual progress is the union of `sessions`
   (overlaps on the same day counted once). Recording never touches the target.
6. **Statuses are derived, never stored** (`src/domain/status.ts`):
   completed (done ≥ target) > paused > in_progress (today, partial) / partial "بدأ ولم يكمل" (past day or
   postponed with progress) > postponed (nothing done) > missed (past) / not_started (today).
   Only not_started/in_progress trigger reminders.
7. **Days**: local `YYYY-MM-DD` keys. `ensureDays` backfills missing days (≤60) on every refresh with the
   current goal/pause state, and runs before any goal/pause change so history keeps the real past settings.
   Past days are read-only (corrections only on today).
8. **Continuation**: today's planned portion starts at the ayah after the last recorded session (wraps to
   Al-Fatiha after An-Nas). Nothing is silently carried over: the remaining portion simply becomes tomorrow's
   suggested start, shown as "Continues from your last recorded ayah". Revision plans are freely editable.
9. **Reminders** (`planReminders`, pure + tested): for today and the next 2 days, every `interval` minutes
   inside the reminder window, skipping quiet hours (may wrap midnight), capped per tracker per day and to 60
   pending total (iOS keeps 64). Future days are scheduled pessimistically so reminders continue if the app is
   never opened; any write or app foreground re-plans and diffs against scheduled notifications by
   deterministic id (`tracker-day-HH:MM`) → no duplicates. Snooze = suppress until now+30 min and fire once then.
   Sync calls are serialized through a promise queue.
10. **No backend** in MVP. WhatsApp is documented only (`docs/WHATSAPP.md`); the app collects no phone number.
11. **RTL**: `I18nManager.forceRTL` + `Updates.reloadAsync()` (`src/direction.ts`), attempted once per language
    to avoid reload loops; plus `LocaleProvider` for the router. Arabic uses Arabic-Indic digits (`fmtNum`).
12. **State**: no state library; a context with a `rev` counter, `useData()` re-queries after writes.

## 4. Implemented Features
- Quran metadata, range validation, page/hizb/juz lookup, measure, plan, continuation (tested)
- SQLite schema v1 + migration runner; repository with validation (tested on node:sqlite)
- Three independent trackers: goal (ayah/page/hizb presets + custom ayah/page amount), planned portion
  (auto + editable), record multiple portions/day, delete portion (today), mark planned as done, postpone/undo,
  pause/resume, 0–5 rating (only after an attempt; 0 ≠ not attempted; cleared if the attempt is removed)
- Dashboard: per-tracker card (goal, progress, % only once started, status, planned portion, quick actions),
  overall count, permission prompt, next scheduled reminder
- History per tracker with stats (completed days, 7/30-day rate, distinct memorized ayahs, revised ayahs,
  pages read, average rating) and "goal changed" markers
- Settings: language (AR/EN, persisted, RTL reload), theme (system/light/dark), reminders on/off, window,
  quiet hours, max per tracker per day, Mushaf info, WhatsApp note, delete all data, About/attribution
- Local reminders: Android channel, iOS/Android category with Snooze/Open actions, tap opens the tracker,
  cancel on completion/postpone/pause, re-plan on foreground (day/timezone changes)

## 5. In-Progress Features
- None half-written. UI has **not been run on a device/emulator yet** (no Android SDK here); only typecheck,
  unit tests, `expo export --platform android` bundle and expo-doctor (20/20) were verified.

## 6. Remaining Tasks (priority order)
1. [ ] Run on a real Android device + iOS (dev build: `npx expo run:android` or `eas build --profile development`;
       RTL switching does not work in Expo Go). Fix layout issues found, especially RTL.
2. [ ] Verify notifications on device: delivery while app is killed, Snooze action with app killed
       (iOS may not run JS for a background action; fallback = it fires at the next planned slot), tap → tracker.
3. [ ] Backup/restore (export/import JSON via share sheet + document picker).
4. [ ] Component/integration tests for the main flow (record → status → reminders cancelled) with
       @testing-library/react-native and mocked expo-sqlite/expo-notifications.
5. [ ] Arabic Quran-style font for surah names (e.g. Amiri / Noto Naskh via expo-font) — system fonts used now.
6. [ ] Optional streaks (gentle, no shaming) — deliberately skipped for now.
7. [ ] App icon/splash branding (template assets still in `assets/`).
8. [ ] WhatsApp provider (needs backend + Meta approval, see docs/WHATSAPP.md).
9. [ ] Re-check `today` when the app stays open across midnight (currently refreshed on foreground only).

## 7. Files and Components
- `scripts/convert-tanzil.js` — regenerates `src/quran/data.ts` from Tanzil `quran-data.js`
- `src/quran/data.ts` — generated metadata (do not edit); `src/quran/index.ts` — refs, ranges, units, plan/measure
- `src/domain/status.ts` · `reminders.ts` · `dates.ts` · `trackers.ts` — pure rules
- `src/db/schema.ts` — `Db` interface (subset of expo-sqlite), migrations, `migrate()`
- `src/db/repo.ts` — all reads/writes, `ensureDays`, stats
- `src/notifications/index.ts` — setup, permission, `syncReminders` (diff/schedule), snooze/tap handling
- `src/settings.ts` — typed settings with defaults · `src/direction.ts` — RTL switch
- `src/state.tsx` — `AppProvider`, `useApp`, `useData` · `src/ui.tsx` — Card/Button/Chip/Badge/ProgressBar/…
- `src/components/RangePicker.tsx` — surah search modal + ayah steppers + validation
- `src/app/_layout.tsx` (DB, boot, notification taps) · `(tabs)/index|history|settings.tsx` · `tracker/[id].tsx`
- `src/i18n/strings.ts` (EN/AR dictionaries, AR typed against EN keys) · `src/i18n/index.ts` (t, digits, amounts)
- `__tests__/` — quran, domain, repo tests

## 8. Database Status
Schema version 1 (`PRAGMA user_version = 1`), file `quraani.db`:
- `settings(key PK, value)` — lang, theme, notif_enabled, window_start/end, quiet_start/end (minutes), max_per_day, rtl_applied
- `trackers(id PK in hifz|muraja|tilawah, goal_unit, goal_amount, paused, reminder_enabled, reminder_interval_min ≥15, snoozed_until ms)`
- `day_records(id, tracker_id FK, day 'YYYY-MM-DD', goal snapshot, planned range, postponed, paused, rating 0–5|NULL, UNIQUE(tracker_id, day))`
- `sessions(id, record_id FK ON DELETE CASCADE, from/to surah+ayah, created_at)`
Migrations are append-only in `MIGRATIONS`; never edit a shipped one. A DB newer than the app throws.
Notification delivery history is not stored: the OS does not report local delivery to a killed app.

## 9. Testing Status
`npm test` → 3 suites, 43 tests, all passing (2026-11-22):
quran metadata integrity & boundaries, ref round-trip for all 6236 ayahs, range validation, measure/plan per
unit; status table; dates; reminder planning (window, quiet hours incl. midnight wrap, caps, snooze,
paused/disabled/completed, deterministic ids); repository (migrations, partial vs target, postpone→partial,
validation, past-day lock, rating rules, backfill + goal snapshots + continuation, pause isolation, stats
de-duplication, delete all). `npx tsc --noEmit` clean. `npx expo-doctor` 20/20.
Missing: UI/component tests, on-device notification tests, migration-upgrade tests (only v1 exists).

## 10. Known Issues and Risks
- Not run on device yet (see §5). RTL forcing requires a dev/production build, not Expo Go.
- Notification times can be delayed by Android Doze / OEM battery savers; exact alarms intentionally not requested.
- Snooze from a notification while the app is killed may not execute on iOS (no JS runtime for background actions).
- Page/hizb fractions weighted by ayah count, not letters (documented shortcut).
- Template icons/splash still in `assets/`.
- `LICENSE` is MIT with holder "Talaat-hub" — confirm the license choice. Tanzil data is CC BY 3.0 (attribution kept).
- npm `allow-scripts` warnings: some dependency install scripts (e.g. `@parcel/watcher`) were not run; no impact seen.

## 11. Last Completed Checkpoint
2026-11-22: Phases 1–5 MVP code complete (foundation, Quran engine, trackers, dashboard, history, settings,
local reminders), tests/typecheck/bundle green, docs written, initial push to GitHub.

## 12. Next Actions
1. Install Android Studio (or use EAS) and run `npx expo run:android`; walk the main flow in EN and AR.
2. Test reminders on device: set interval 30m, complete a tracker → its pending reminders disappear
   (`getAllScheduledNotificationsAsync`), pause → none, kill app → reminders still arrive.
3. Then implement backup/restore (Remaining Tasks #3) and UI tests (#4).
