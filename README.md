# Qura'ani – قرآني

A calm, offline Quran companion for a daily routine of **memorization (الحفظ)**, **revision (المراجعة)** and
**reading (القراءة)**. Set a daily goal for each, record the exact portion you did, rate your memorization and
revision, and get gentle reminders until the day's goal is done. Arabic and English, light and dark.

Built with Expo (SDK 58), React Native, TypeScript, Expo Router, SQLite and local notifications.
No account, no server, no internet needed.

## Run it

Requirements: Node 22.5+ (tests use `node:sqlite`), and Android Studio or Xcode for a development build.

```bash
npm install
npm test                 # unit + repository tests
npx tsc --noEmit         # typecheck
npx expo run:android     # dev build on device/emulator (or: npx expo run:ios on macOS)
```

Arabic right-to-left layout and notification actions need a development build; they don't fully work in Expo Go.
Cloud builds: `npx eas-cli@latest build --platform android|ios`.

### Local Android builds on Windows

React Native's C++ build breaks on long paths and on paths with spaces, so:
- Keep the project at a short path without spaces (e.g. `G:\dev\quraani`).
- Install the Android SDK at a path without spaces (e.g. `C:\Android\Sdk`) and set `ANDROID_HOME` to it.
- Use CMake 3.31+ (its `ninja` handles long paths): install `cmake/3.31.6` with the SDK manager and add
  `cmake.dir=C\:\\Android\\Sdk\\cmake\\3.31.6` to `android/local.properties` (per machine, git-ignored;
  re-add it after `npx expo prebuild --clean`).
- If Java tools fail with `Unable to establish loopback connection`, set
  `JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=C:\Temp\jdk` (a Java bug with some temp folder paths).

## How it works

- Quran references are stored as surah + ayah; ranges may cross surahs and are validated.
- Goals are in ayahs, pages or hizb (¼, ½, ¾, 1, 2). Pages and hizb follow the **Madani Mushaf (604 pages)**.
- Each day keeps its original goal separately from what you actually recorded, so partial days show
  "Started but not finished – بدأ ولم يكمل" without losing the target.
- Reminders are scheduled as local notifications for today and the next two days, inside your reminder window
  and outside quiet hours, and are cancelled as soon as a tracker is completed, postponed or paused.
  The OS may delay them slightly to save battery.

Architecture, decisions, database schema and status: see [progress.md](progress.md).
WhatsApp reminders (not active yet): see [docs/WHATSAPP.md](docs/WHATSAPP.md).

## Data source

Quran metadata (surahs, ayah counts, pages, hizb quarters, juz) is from the
[Tanzil Project](https://tanzil.net/docs/quran_metadata) — Quran Metadata v1.0, © 2008-2009 Tanzil.info,
licensed under [Creative Commons Attribution 3.0](https://creativecommons.org/licenses/by/3.0/).
It is converted, unmodified in content, by `scripts/convert-tanzil.js` into `src/quran/data.ts`.
The app does not include Quran text.
