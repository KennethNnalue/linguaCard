# LinguaCard mobile deployment plan

Last verified: 2026-09-04

## Release decisions

- Product name: `LinguaCard`
- Production application identifier: `app.linguacard`
- Initial public version: `1.0`
- iOS minimum version: iOS 15
- Android minimum SDK: 24
- Distribution order: iOS TestFlight first, then Google Play production
- Production API: `https://linguacard-api.onrender.com/api/v1`

The identifier uses the reverse-DNS form of the owned `lingua-card.app` domain. The domain hyphen is omitted because Android package segments must be valid Java identifiers. The production identifier becomes permanent after the first store build upload.

## Current readiness audit

### Ready

- Capacitor 8.3.1 native projects exist for iOS and Android.
- Production Angular build succeeds.
- Xcode 26.1 is installed; Apple requires the iOS 26 SDK or later for uploads made after 2026-04-28.
- iOS app icon includes the required 1024 × 1024 source.
- Android targets API 36, satisfying the Google Play requirement effective 2026-08-31.
- Android uses min SDK 24 and already declares Internet access.
- Production API uses HTTPS.

### Release gates

- Implement in-app account deletion and server-side deletion of the account and associated personal data. Both Apple and Google require this because the app supports registration.
- Publish a privacy policy URL. Both stores require one.
- For Google Play, publish a separate discoverable web account-deletion page or request form and provide its URL in Play Console.
- Inventory server-side and third-party data processing, then complete Apple App Privacy and Google Data Safety accurately.
- Create a review/demo account with representative content and no privileged access.
- Confirm subscription behavior. If the app unlocks digital features or content using payments or redemption codes, store billing rules need a dedicated compliance review before public release.
- Confirm support URL, support email, copyright owner, age rating answers, content rights, and store categories.
- Confirm that the Apple Developer Program and Google Play Console accounts are verified and agreements are current.

## Phase 1 — iOS TestFlight

### 1. Repository preparation

- [x] Change the production app identifier to `app.linguacard`.
- [x] Normalize the display name to `LinguaCard`.
- [x] Add an explicit production iOS build-and-sync command: `npm run build:ios:release`.
- [x] Add camera and photo-library usage descriptions.
- [x] Add the app privacy manifest with Capacitor Filesystem (`C617.1`) and Preferences (`CA92.1`) required-reason declarations.
- [x] Build and sync production web assets into the iOS project.
- [x] Add `npm run validate:ios:release` to detect identifier, development-server, permission, and privacy-manifest mistakes before upload.
- [x] Implement account deletion across the authenticated API and mobile account menu.
- [ ] Verify production object-storage cleanup for any user-generated image/audio assets before declaring deletion fully compliant.
- [ ] Review whether development-only local-network plist entries should be split into a Debug-only plist before the final App Store submission.
- [x] Run focused account-deletion unit tests, lint, translation validation, plist validation, and the iOS release validator after compliance work.
- [x] Run the full API build, production mobile build, and test suite (90 suites / 308 tests).
- [ ] Restore a green repository-wide mobile lint; 18 pre-existing errors remain outside the deployment changes.
- [x] Run a Release simulator build.
- [ ] Run a signed physical-device smoke test after Apple Developer Program enrollment.
- [x] Add deployable privacy, support, and external account-deletion pages at the store metadata paths.
- [ ] Deploy `lingua-card.app` and verify the three public compliance URLs over HTTPS.

### 2. Apple account and identifier setup

Requires the Apple Account Holder/Admin:

1. After purchasing the Apple Developer Program membership, select the newly activated team in Xcode. The stale team value previously committed to the project has been removed.
2. Register an explicit App ID for `app.linguacard`.
3. Enable only capabilities the binary actually uses. No native push-notification plugin is currently present; do not enable Push Notifications merely because the PWA uses web push.
4. In App Store Connect, create the iOS app record before upload:
   - name: LinguaCard
   - primary language: chosen product language
   - bundle ID: `app.linguacard`
   - SKU: an internal immutable value such as `linguacard-ios-001`
   - user access: appropriate team access
5. In Xcode Signing & Capabilities, select the team and automatic signing for the App target.

### 3. TestFlight metadata and compliance

Prepare before inviting external testers:

- Beta app description
- Feedback email
- “What to Test” instructions
- Beta review contact details
- Review notes describing login, image import, offline behavior, audio, and any gated features
- Demo account credentials
- Export-compliance answers; verify whether the app only uses exempt encryption supplied by the OS/HTTPS stack
- Privacy policy URL and accurate App Privacy questionnaire
- Content rights and age-rating answers

Internal testing supports up to 100 App Store Connect users. External testing supports up to 10,000 testers and the first external build requires TestFlight App Review. A TestFlight build expires after 90 days.

### 4. Archive and upload

1. Run `npm ci`.
2. Run `npm run build:ios:release`.
3. Open `ios/App/App.xcodeproj` in Xcode.
4. Confirm Release version `1.0` and build `1`. Increment the build number for every upload.
5. Select “Any iOS Device (arm64)” and run Product → Archive.
6. In Organizer, run Validate App, resolve all errors, then Distribute App → App Store Connect → Upload.
7. Wait for processing and resolve export-compliance or privacy warnings.
8. Add the build to an internal group and complete the smoke-test matrix.
9. Add the stable build to an external group, provide “What to Test,” and submit it for Beta App Review.

### 5. iOS smoke-test matrix

- Fresh install, launch, registration, login, logout, password reset
- Account deletion, reauthentication/confirmation, and inability to log in afterward
- Onboarding and language changes, including RTL Arabic layout
- Create/import/edit/delete vocabulary and collections
- Camera capture and photo-library import, including denial and later permission recovery
- Reviews, streak/progress reconciliation, stories, podcasts, audio and text-to-speech
- Offline launch/read/write queue, reconnection, and conflict/sync behavior
- Background/foreground transitions and interrupted audio
- Small and large iPhones plus at least one iPad if iPad remains supported
- Latest iOS and the minimum supported iOS 15 device/simulator
- Poor network, expired token, API error, and Render cold-start behavior
- No development server URL, cleartext API, debug UI, secrets, or admin access exposed to normal users

## Phase 2 — Google Play production

Start after the TestFlight build is stable.

### 1. Android repository preparation

- Change Android namespace, application ID, Java package/path, URL scheme, and resource strings from `.dev` to `app.linguacard`.
- Set a deliberate `versionName` and monotonically increasing `versionCode`.
- Generate and securely back up an upload keystore outside Git; keep passwords out of source control and CI logs.
- Configure release signing from protected environment/Gradle properties.
- Build a signed Android App Bundle (`.aab`), not a release APK.
- Run lint, tests, a release build, bundle inspection, and physical-device smoke tests.
- Verify icon, adaptive icon, splash screen, edge-to-edge behavior, back navigation, camera permissions, text-to-speech, file storage, and API 36 behavior changes.

### 2. Play Console setup and policy declarations

1. Verify the developer identity and Android-device verification if requested.
2. Create the app with package `app.linguacard`; this cannot be changed after the first artifact is uploaded.
3. Enroll in Play App Signing and retain the separate upload key securely.
4. Complete the main store listing, localized text, phone screenshots, high-resolution icon, feature graphic, category, tags, support contacts, and privacy policy.
5. Complete App Content: Data Safety, account deletion URL, ads, app access/demo account, target audience and content, content rating, news status, data practices, and any financial/health declarations that apply.
6. Declare all collected/shared data based on the same audited data map used for Apple.
7. Choose countries/regions and pricing.

### 3. Testing eligibility and production release

- First upload to Internal testing and run the Android smoke-test matrix.
- If the developer account is a personal account created after 2023-11-13, run a Closed test with at least 12 testers continuously opted in for 14 days, then apply for production access. This prevents going literally “straight to production” on affected accounts.
- Upload the production AAB, review automated pre-launch/device reports and policy warnings, fix blocking findings, then submit a staged production rollout.
- Prefer a small initial rollout, monitor Android vitals/crashes/ANRs and backend errors, then increase to 100%.

## Versioning and release operation

- User-facing versions follow semantic product versions (`1.0`, `1.0.1`, `1.1`).
- iOS `CURRENT_PROJECT_VERSION` and Android `versionCode` must increase for every store upload.
- Tag the exact tested commit used for each uploaded binary.
- Record build number, commit SHA, production API URL, privacy declaration version, tester group, and release notes.
- Never commit Apple certificates, provisioning profiles, Android keystores, passwords, App Store Connect API keys, or Play service-account keys.

## Authoritative references

- [Apple submission SDK requirements](https://developer.apple.com/app-store/submitting/)
- [Apple TestFlight overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview)
- [Apple upload builds](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/)
- [Apple app privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/)
- [Apple privacy manifests](https://developer.apple.com/documentation/bundleresources/adding-a-privacy-manifest-to-your-app-or-third-party-sdk)
- [Apple account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/)
- [Google Play target API requirements](https://developer.android.com/google/play/requirements/target-sdk)
- [Google Play app signing](https://developer.android.com/studio/publish/app-signing)
- [Google Play personal-account testing](https://support.google.com/googleplay/android-developer/answer/14151465)
- [Google Play Data Safety](https://support.google.com/googleplay/android-developer/answer/10787469)
- [Google Play account deletion](https://support.google.com/googleplay/android-developer/answer/13327111)
