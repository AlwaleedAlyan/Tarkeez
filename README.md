# Tarkeez 🎯

Tarkeez is a comprehensive, offline-first study time tracker and productivity application designed to monitor student activity while reading materials. Users can upload PDFs, track their study sessions, take rich notes with drawing capabilities, and seamlessly sync their progress across devices.

Available on iOS, Android, and Desktop (PWA).

## ✨ Features

- **Study Time Tracking**: Monitor focus time with session timers and idle detection.
- **PDF Integration**: Upload, view, and annotate PDFs locally.
- **Rich Notes & Drawing Canvas**: Take rich HTML notes and sketch directly using a highly performant drawing canvas.
- **Collections**: Group related PDFs and notes into categorized collections.
- **Smart URL & YouTube Classifier**: Automatically categorizes browser and YouTube activity to ensure you're spending time on educational content.
- **Offline-First Architecture**: View your library, take notes, and complete study sessions entirely offline. The app automatically pushes changes to the cloud when your connection is restored.

## 🛠️ Tech Stack

- **Frontend**: Expo / React Native (`expo-router`)
- **Language**: TypeScript (Strict)
- **Backend**: Supabase (Auth, Database, Storage, Realtime)
- **Local DB (Offline)**: `expo-sqlite` + `Drizzle ORM`
- **State Management**: React Context
- **Drawing Canvas**: `@shopify/react-native-skia`

## 🚀 Getting Started

### Prerequisites
This project uses `@shopify/react-native-skia` for note drawing, which requires a **development build**. It cannot be run inside standard Expo Go.

- Node.js & `pnpm` package manager
- Xcode (for iOS development)
- Android Studio (for Android development)

### Installation

1. Clone the repository and install dependencies:
```bash
pnpm install
```

2. Configure environment variables. Create a `.env` file in the root directory:
```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```
*(Note: Never hardcode these variables into the source code).*

3. Build and run the development client natively:

**For iOS:**
```bash
pnpm exec expo run:ios
```

**For Android:**
```bash
pnpm exec expo run:android
```

**EAS Build (Alternative):**
```bash
pnpm exec eas build --profile development --platform <ios|android>
```

Once installed on your device or simulator, start the bundler:
```bash
pnpm exec expo start --dev-client
```

## 🏗️ Architecture

Tarkeez follows a strict **Offline-First** pattern. All user actions (mutations) write to the local SQLite database first. Changes queue in a generic outbox engine (`sync_outbox`), and a push worker drains the queue automatically when the app is foregrounded or the network reconnects.

## ⏭️ Deferred: Crash Reporting (Sentry)

Crash reporting was flagged as a pre-launch critical item in the deployment audit (FIX-02 in `DEPLOYMENT_FIXES.md`) and was **intentionally deferred** — the app currently has **no remote crash reporting**; crashes are only visible in device logs. The `ErrorBoundary` (`components/ErrorBoundary.tsx`) already supports an `onError(error, componentStack)` prop, but nothing is wired to it yet.

**When ready to enable:**

1. Create a Sentry project (React Native) at [sentry.io](https://sentry.io) and copy the DSN.
2. `pnpm exec expo install @sentry/react-native`
3. Add `EXPO_PUBLIC_SENTRY_DSN=<dsn>` to `.env`.
4. Create `lib/monitoring.ts` (fail-soft: no-op when the DSN is missing) with `Sentry.init`, an `ErrorUtils` global handler for fatal JS errors, and a `captureException` helper. Add a `lib/monitoring.web.ts` no-op stub so web bundles stay clean.
5. Wire it up in `app/_layout.tsx`: call `initMonitoring()` at module scope, pass `onError` to `<ErrorBoundary>` (~line 160), and report non-benign unhandled rejections from the existing Hermes rejection tracker.
6. Rebuild the native apps (`pnpm exec expo run:ios` / `pnpm exec expo run:android`) — `@sentry/react-native` contains native code.
7. *(Optional)* Add the `@sentry/react-native/expo` plugin to `app.json` for source-map upload.