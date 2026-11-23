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
(bash) or `$env:npm_config_allow_scripts=''; npm install` (PowerShell). `npx expo install` fails at its npm
step the same way: it still edits package.json, then run the npm install workaround.
Android toolchain (set up 2026-11-23): JDK 17 (Adoptium), SDK at `C:\Android\Sdk` (`ANDROID_HOME`, user PATH),
platform 37, build-tools 37.0.0, NDK 27.1.12297006, CMake 3.22.1 + 3.31.6, emulator AVD `Quraani_API36`
(Android 16, x86_64, WHPX). Windows build gotchas, all hit and fixed (see README "Local Android builds on Windows"):
SDK path with a space breaks NDK linking; the old project path `G:\Mahmoud\Under Deployment\Quraani` exceeds
ninja's path limit → project now lives at **`G:\dev\quraani`**; CMake 3.22's ninja 1.10 ignores long paths →
`cmake.dir` → 3.31.6 in `android/local.properties`; Java NIO loopback bug → user env
`JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=C:\Temp\jdk`. The agent shell sets
`NoDefaultCurrentDirectoryInExePath=1`, so call `.\gradlew.bat` with a path. iOS builds need macOS or EAS.

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
   Users pick presets or type any amount: whole ayahs (≤6236), whole pages (≤604) or hizb in ¼ steps (≤60),
   Western or Arabic-Indic digits (`toGoalAmount`, `parseNum`). Changing the goal re-plans today from the same
   start, even after recording (recorded portions keep counting).
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
   inside the reminder window, skipping quiet hours. Both may cross midnight (window 14:00 → 04:00 reminds
   14:00–23:59 and 00:00–04:00; equal start/end = all day). Interval: presets or any 1–1440 min.
   **Exact alarms (Android 12+)**: without "Alarms & reminders" (`SCHEDULE_EXACT_ALARM`, declared in app.json,
   denied by default on Android 14+) expo-notifications falls back to inexact alarms with a ~1 h window — this
   is why 1-minute reminders "didn't work" in 1.0.0. Today screen asks for it; `doSync` cancels and
   reschedules everything when the permission state changes (stored as setting `exact_alarms`).
   USE_EXACT_ALARM deliberately not used (Play policy: alarm/calendar apps only).
   Per-tracker daily cap is optional (default "No limit" = remind until done). Total pending is capped by
   what the OS holds: 60 on iOS (limit 64), 400 on Android (~500 alarms/app), earliest first; with very short
   intervals that is how far ahead reminders reach until the next re-plan. Future days are scheduled pessimistically so reminders continue if the app is
   never opened; any write or app foreground re-plans and diffs against scheduled notifications by
   deterministic id (`tracker-day-HH:MM`) → no duplicates. Snooze = suppress until now+30 min and fire once then.
   Sync calls are serialized through a promise queue.
10. **No backend** in MVP. WhatsApp is documented only (`docs/WHATSAPP.md`); the app collects no phone number.
11. **RTL**: `I18nManager.forceRTL` + `Updates.reloadAsync()` (`src/direction.ts`), attempted once per language
    to avoid reload loops; plus `LocaleProvider` for the router. Arabic uses Arabic-Indic digits (`fmtNum`).
12. **State**: no state library; a context with a `rev` counter, `useData()` re-queries after writes.

## 4. Implemented Features
- Quran metadata, range validation, page/hizb/juz lookup, measure, plan, continuation (tested)
- SQLite schema v2 + migration runner; repository with validation (tested on node:sqlite)
- Three independent trackers: goal (presets + custom amount in ayahs, pages or hizb), custom reminder
  interval (1 min – 24 h), planned portion
  (auto + editable), record multiple portions/day, delete portion (today), mark planned as done, postpone/undo,
  pause/resume, 0–5 rating (only after an attempt; 0 ≠ not attempted; cleared if the attempt is removed)
- Dashboard: per-tracker card (goal, progress, % only once started, status, planned portion, quick actions),
  overall count, permission prompt, next scheduled reminder
- History per tracker with stats (completed days, 7/30-day rate, distinct memorized ayahs, revised ayahs,
  pages read, average rating) and "goal changed" markers
- Settings: language (AR/EN, persisted, RTL reload), theme (system/light/dark), reminders on/off, window,
  quiet hours (tap a time → bottom-sheet wheel picker, drag hour/minute/AM-PM, 12/24-hour toggle saved as
  setting `clock`, default from the device), max per tracker per day, "Send a test reminder", Mushaf info,
  WhatsApp note, delete all data, About/attribution
- Local reminders: Android channel, iOS/Android category with Snooze/Open actions, tap opens the tracker,
  cancel on completion/postpone/pause, re-plan on foreground (day/timezone changes)

## 5. In-Progress Features
- None half-written. Debug build runs on the Android 16 emulator (2026-11-23): dashboard renders, "Mark planned
  as done" → Completed, AR/EN switch reloads into the correct RTL/LTR layout. Not yet walked: record form,
  surah picker, history, settings time fields, notifications; no real phone or iOS run yet.

## 6. Remaining Tasks (priority order)
1. [~] Run on device. Done: local Android dev build + emulator, dashboard and RTL switch. Left: walk every
       screen in EN and AR on the emulator, then a real Android phone and iOS (EAS, no Mac here).
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
Schema version 2 (`PRAGMA user_version = 2`), file `quraani.db`:
- `settings(key PK, value)` — lang, theme, notif_enabled, window_start/end, quiet_start/end (minutes), max_per_day (0/absent = no limit), rtl_applied
- `trackers(id PK in hifz|muraja|tilawah, goal_unit, goal_amount, paused, reminder_enabled, remind_every_min ≥1, snoozed_until ms)`
  — v2 added `remind_every_min` (copied from v1's `reminder_interval_min`, whose CHECK ≥15 can't be relaxed
  without a table rebuild); `reminder_interval_min` is unused from v2 on.
- `day_records(id, tracker_id FK, day 'YYYY-MM-DD', goal snapshot, planned range, postponed, paused, rating 0–5|NULL, UNIQUE(tracker_id, day))`
- `sessions(id, record_id FK ON DELETE CASCADE, from/to surah+ayah, created_at)`
Migrations are append-only in `MIGRATIONS`; never edit a shipped one. A DB newer than the app throws.
Notification delivery history is not stored: the OS does not report local delivery to a killed app.

## 9. Testing Status
`npm test` → 3 suites, 73 tests, all passing (2026-11-23). Added since 2026-11-22: goal re-plan after
recording, custom goal amounts per unit, Arabic-digit parsing, 1-minute/no-limit/OS-cap reminder plans,
v1→v2 migration keeps intervals. Earlier coverage:
quran metadata integrity & boundaries, ref round-trip for all 6236 ayahs, range validation, measure/plan per
unit; status table; dates; reminder planning (window, quiet hours incl. midnight wrap, caps, snooze,
paused/disabled/completed, deterministic ids); repository (migrations, partial vs target, postpone→partial,
validation, past-day lock, rating rules, backfill + goal snapshots + continuation, pause isolation, stats
de-duplication, delete all). `npx tsc --noEmit` clean. `npx expo-doctor` 20/20.
Missing: UI/component tests, on-device notification delivery tests.

## 10. Known Issues and Risks
- Only partly exercised on an emulator (see §5). RTL forcing requires a dev/production build, not Expo Go.
  In debug builds `Updates.reloadAsync()` throws, so `syncDirection` falls back to `DevSettings.reload()`;
  The release path (`reloadAsync`) was checked on the emulator with the 1.0.0 APK: AR ↔ EN reloads correctly.
- Release APKs are signed with the template's debug keystore (`android/app/debug.keystore`, same for every
  prebuild). Fine for sideloading and in-place updates; a Play Store release needs a private upload key
  (EAS credentials or a keystore + signing config plugin) — switching keys means reinstalling the app.
- Display: a quarter-hizb goal shows progress as "0.1 of Quarter hizb" (done in hizb vs goal phrase);
  should read in the same unit as the goal.
- Local Android builds on Windows need the short project path and `cmake.dir` setup (§2, README).
- Dev only: a Fast Refresh while boot is running can log "boot failed: Access to closed resource" (old SQLite
  handle closed by the remount). Not seen on cold start; restart the app if it appears.
- Lint (`npx expo lint`, eslint-config-expo) added 2026-11-23 and clean; two rule suppressions are commented in place.
- Notification times: on time once "Alarms & reminders" is allowed; without it Android can delay them up to
  ~1 h. Some OEMs (Samsung, Xiaomi…) still defer alarms for apps under battery optimization — if reminders
  are late on a phone, set the app's battery usage to "Unrestricted".
- Pending-reminder cap: with very short intervals reminders run out after cap × interval (e.g. 1 min, one
  tracker: ~6.6 h on Android, 1 h on iOS) unless the app re-plans (open, any change, tapping a reminder).
  Possible upgrade: Android background task (expo-background-task) to top up while the app is closed.
- Snooze from a notification while the app is killed may not execute on iOS (no JS runtime for background actions).
- Page/hizb fractions weighted by ayah count, not letters (documented shortcut).
- Template icons/splash still in `assets/`.
- `LICENSE` is MIT with holder "Talaat-hub" — confirm the license choice. Tanzil data is CC BY 3.0 (attribution kept).
- npm `allow-scripts` warnings: some dependency install scripts (e.g. `@parcel/watcher`) were not run; no impact seen.

## 11. Last Completed Checkpoint
2026-11-22: Phases 1–5 MVP code complete (foundation, Quran engine, trackers, dashboard, history, settings,
local reminders), tests/typecheck/bundle green, docs written, initial push to GitHub.
2026-11-23: Android toolchain installed, project moved to `G:\dev\quraani`, debug APK built and running on the
emulator; added `expo-system-ui` (Android dark/light UI style) and the dev-build RTL reload fallback.
Later: goal change re-plans after recording; custom amounts for all units incl. hizb; custom reminder interval
(≥1 min, DB v2); "No limit" daily cap (new default); per-platform pending cap. Checked on the emulator in AR.
Release 1.0.0: `assembleRelease` for arm64-v8a + x86_64 (54.7 MB), installed over the debug build on the
emulator (data kept), standalone launch + language switch verified, published as GitHub release `v1.0.0`.
Next release: bump `version` and add/bump `android.versionCode` in app.json (then prebuild) so each APK is a
distinct, newer version (Android refuses only lower versionCodes). Note: a prebuild that regenerates `android/`
deletes `android/local.properties` — re-add `cmake.dir` (README) before building.
1.1.0 (versionCode 2): emulator showed 1-min reminders never arriving — alarms were inexact with a 1 h window.
Added SCHEDULE_EXACT_ALARM + Today prompt + reschedule on change; reminder window may cross midnight; wheel
time picker with 12/24-hour; test-reminder button (delivery verified on the emulator); "Open settings" when
notifications are blocked; plain "Save" label in number fields.
Web version (for iPhone users; App Store Expo Go stops at SDK 54 and TestFlight needs a paid Apple account):
react-native-web + `web.output: single`, `experiments.baseUrl: /quraani`, hosted on GitHub Pages (gh-pages
branch, `npm run deploy:web`). expo-sqlite web stores data in OPFS; COOP/COEP headers are only needed for its sync
API, which the app doesn't use. `REMINDERS` (notifications module) hides all reminder UI on web; web confirm/alert
replace RN Alert (a no-op on web). Checked in a desktop browser at phone width; not yet on an iPhone.

## 12. Next Actions
1. Walk every screen in EN and AR on the emulator (`npx expo run:android`, AVD `Quraani_API36`); fix what breaks.
2. On the user's phone (1.1.0): allow notifications + "Alarms & reminders", tap "Send a test reminder", set
   a 1-min interval inside the window → reminders arrive each minute; complete the goal → they stop; kill the
   app → they still arrive.
   Dev tip: this project has no expo-dev-client, so debug builds load JS from device `localhost:8081`
   (`adb reverse tcp:8081 tcp:<metro port>`).
3. Then implement backup/restore (Remaining Tasks #3) and UI tests (#4).
