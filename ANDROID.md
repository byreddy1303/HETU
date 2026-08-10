# HETU for Android

HETU uses Capacitor to package the existing React application as a native Android app. The web/PWA and Android builds share the same components, Dexie database, sync engine, authentication, and tests. Every APK contains its UI bundle locally; website deployments do not change installed Android apps. All UI, content, and native updates require a newly versioned APK installation.

The bundled app keeps `https://hetu-app.vercel.app` as its local WebView origin so users upgrading from the former live shell retain their session and origin-scoped storage. It does not load the website as its application shell.

## Product guarantees

- Solo study writes remain Dexie-first and work offline after the first authenticated launch.
- Supabase sync resumes when connectivity or the app foreground returns.
- Android back dismisses the keyboard first, then navigates, then backgrounds the app from a root screen.
- System bars and every fixed surface respect notches and gesture-navigation insets.
- Haptics are best-effort, restrained, and switchable under Settings → Focus & density.
- The Android build removes prior PWA service workers and never registers one, preventing website deployments or stale caches from replacing bundled screens.
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
android/app/build/outputs/apk/debug/hetu.apk
```

Install it on a connected device with Android Studio, or with:

```bash
adb install -r android/app/build/outputs/apk/debug/hetu.apk
```

For iterative device work, use `npm run android:run`. To inspect the native project, use `npm run android:open`.

## Firebase push setup

The Android plugin uses Firebase Cloud Messaging. Create one Firebase Android app with package name `in.airjournal.app`, then:

1. Download `google-services.json` to `android/app/google-services.json` (gitignored).
2. Create a least-privilege Firebase service account allowed to send Cloud Messaging messages.
3. Store its compact JSON as the Supabase secret `FCM_SERVICE_ACCOUNT_JSON`; never place it in a `VITE_*` variable or commit it.
4. Run `npx cap sync android`, build a new APK/AAB, install it, and enable **Settings → Buddy message alerts**.

The web/PWA path uses VAPID instead and does not require Firebase. Native plugin changes, including first-time push setup, require a new APK.

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
AIR_VERSION_CODE=11 AIR_VERSION_NAME=1.2.2 npm run android:release
```

The production-signed direct-install artifact is:

```text
android/app/build/outputs/apk/release/hetu-release.apk
```

The same command also produces a debug-signed APK for friends whose existing
direct-share installation uses the Android debug certificate:

```text
android/app/build/outputs/apk/release/hetu-friend.apk
```

Install a friend update without clearing its data:

```bash
adb install -r android/app/build/outputs/apk/release/hetu-friend.apk
```

Increment `AIR_VERSION_CODE` for every release. Android rejects same- or
lower-version updates, and website deployments never update these APKs.

For a Play Store bundle, run `npm run android:bundle`. The artifact is:

```text
android/app/build/outputs/bundle/release/app-release.aab
```

Keep the upload keystore and passwords in a password manager and an encrypted offline backup. Losing the signing key can prevent future direct-install updates from replacing the existing app.

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
12. With the app killed, two successive Buddy messages produce two separate alerts; neither replaces the other.
13. Reply from each alert without opening the app; the reply appears in the correct chat and reaches the other device once.
14. Tapping a Buddy alert opens the correct chat, and the currently open chat stays quiet.
15. `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`, and `npm audit` remain clean.

## HTTPS app links

The APK handles custom links such as `airjournal://auth` immediately. To make production email links open the installed app directly, add an HTTPS intent filter for the final production domain and publish `/.well-known/assetlinks.json` containing the release certificate SHA-256 fingerprint. Do this only after the domain and signing certificate are final; until then, invitation links safely open the web app.

## Performance budget

- Initial application JavaScript: under 450 kB minified and under 140 kB gzip.
- Normal route chunks: under 50 kB minified unless a clearly isolated heavy tool requires more.
- Interaction feedback begins in the same frame; motion uses transform/opacity and lasts 150–300 ms.
- No autoplay loops, motion-gated actions, remote fonts, or remote HTML shell.

The route-level lazy boundaries and locally bundled fonts are intentional. Do not collapse pages back into one eager import graph.
