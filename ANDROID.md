# AIR Journal for Android

AIR Journal uses Capacitor to package the existing React application as a native Android app. The web/PWA and Android builds share the same components, Dexie database, sync engine, authentication, and tests. The APK contains the UI bundle locally; it is not a remote website inside a thin browser.

The user-directed `android:live:release` variant is the exception: it is a signed shell pinned to `https://air-journal-omega.vercel.app`. It receives React, CSS, and content updates from Vercel without another APK installation. It requires an online first launch, then uses the production service worker for cached offline launches. Native code and plugin changes still require a new signed APK.

## Product guarantees

- Solo study writes remain Dexie-first and work offline after the first authenticated launch.
- Supabase sync resumes when connectivity or the app foreground returns.
- Android back dismisses the keyboard first, then navigates, then backgrounds the app from a root screen.
- System bars and every fixed surface respect notches and gesture-navigation insets.
- Haptics are best-effort, restrained, and switchable under Settings → Focus & density.
- The Android build does not register the PWA service worker, preventing stale bundled screens after an APK upgrade.
- Cleartext traffic and Android cloud backup are disabled. No secret or signing key is committed.
- Buddy-message push is opt-in per device, uses a dedicated high-priority notification channel, and deep-links to the correct chat.

## Toolchain

- Node 22 or newer (`nvm use` reads `.nvmrc`)
- Android Studio Otter 2025.2.1 or newer
- Android SDK Platform 36 and matching build tools
- JDK 21 (Android Studio's bundled JDK is recommended)

The generated project supports Android 7/API 24 and newer. The application ID is `in.airjournal.app`; changing it after distribution creates a different Android application and must not be done casually.

## First local build

```bash
npm ci
cp .env.capacitor.example .env.capacitor.local
# Fill the VITE_* values used by the production Supabase deployment.

npm run android:apk
```

The debug APK is written to:

```text
android/app/build/outputs/apk/debug/airjournal.apk
```

Install it on a connected device with Android Studio, or with:

```bash
adb install -r android/app/build/outputs/apk/debug/airjournal.apk
```

For iterative device work, use `npm run android:run`. To inspect the native project, use `npm run android:open`.

## Firebase push setup

The Android plugin uses Firebase Cloud Messaging. Create one Firebase Android app with package name `in.airjournal.app`, then:

1. Download `google-services.json` to `android/app/google-services.json` (gitignored).
2. Create a least-privilege Firebase service account allowed to send Cloud Messaging messages.
3. Store its compact JSON as the Supabase secret `FCM_SERVICE_ACCOUNT_JSON`; never place it in a `VITE_*` variable or commit it.
4. Run `npx cap sync android`, build a new APK/AAB, install it, and enable **Settings → Buddy message alerts**.

The web/PWA path uses VAPID instead and does not require Firebase. Native plugin changes, including first-time push setup, require a new APK; a Vercel-only live-shell update cannot add the plugin to an older installed binary.

## Signed production release

Generate the upload key once and store it outside the repository:

```bash
mkdir -p ../release
keytool -genkeypair -v \
  -keystore ../release/air-journal-upload.jks \
  -alias air-journal-upload \
  -keyalg RSA -keysize 4096 -validity 10000
```

Copy `android/keystore.properties.example` to `android/keystore.properties`, fill the four values, and build a signed APK:

```bash
AIR_VERSION_CODE=1 AIR_VERSION_NAME=1.0.0 npm run android:release
```

The direct-install release artifact is:

```text
android/app/build/outputs/apk/release/airjournal-release.apk
```

For a Play Store bundle, run `npm run android:bundle`. The artifact is:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

Keep the upload keystore and passwords in a password manager and an encrypted offline backup. Losing the signing key can prevent future direct-install updates from replacing the existing app.

## One-time live-shell release

Before replacing an older bundled-shell APK, open it online and wait until its pending-sync count reaches zero. The live shell uses the production HTTPS origin instead of the old local WebView origin, so unsynced local-only rows are not visible after the upgrade.

Build the signed live shell with a version code higher than every prior APK/AAB:

```bash
AIR_VERSION_CODE=4 AIR_VERSION_NAME=1.1.1 npm run android:live:release
```

The artifact is:

```text
android/app/build/outputs/apk/release/airjournal-live-release.apk
```

For devices that already have the original direct-share debug-signed APK, use the
matching optimized artifact instead so Android can upgrade it without uninstalling:

```text
android/app/build/outputs/apk/release/airjournal-live-friend.apk
```

After this APK is installed once, normal web releases are delivered by pushing a verified commit to `main`; Vercel updates the production origin and the app checks on launch/resume and every 15 minutes while open. Do not use this path for native permission, plugin, or signing changes.

## Release verification matrix

Before sharing a build, verify all of the following on at least one physical phone and one emulator:

1. Fresh install → sign in → Dashboard.
2. Kill and reopen → session remains authenticated.
3. Start a session offline, tag questions, reopen, restore internet → pending count reaches zero.
4. Camera capture and image selection both return to the question editor.
5. PIN entry, planner forms, and Buddy composer remain visible above the keyboard.
6. Android back hides the keyboard, closes navigation naturally, and backgrounds from a root screen.
7. Status bar, bottom navigation, dialogs, and toasts avoid cutouts and gesture areas.
8. Haptics feel subtle and stop immediately when Tactile feedback is disabled.
9. Font scale and compact mode remain usable at 360 px width and Android's enlarged system text.
10. Upgrade over the previous APK preserves IndexedDB data and the active session.
11. Airplane-mode cold launch reaches previously cached local data without a blank screen.
12. With the app killed, a Buddy message produces one alert, tapping it opens the correct chat, and the currently open chat stays quiet.
13. `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, and `npm audit` remain clean.

## HTTPS app links

The APK handles custom links such as `airjournal://auth` immediately. To make production email links open the installed app directly, add an HTTPS intent filter for the final production domain and publish `/.well-known/assetlinks.json` containing the release certificate SHA-256 fingerprint. Do this only after the domain and signing certificate are final; until then, invitation links safely open the web app.

## Performance budget

- Initial application JavaScript: under 450 kB minified and under 140 kB gzip.
- Normal route chunks: under 50 kB minified unless a clearly isolated heavy tool requires more.
- Interaction feedback begins in the same frame; motion uses transform/opacity and lasts 150–300 ms.
- No autoplay loops, motion-gated actions, remote fonts, or remote HTML shell.

The route-level lazy boundaries and locally bundled fonts are intentional. Do not collapse pages back into one eager import graph.
