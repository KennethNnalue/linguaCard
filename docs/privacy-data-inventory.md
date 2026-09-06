# LinguaCard privacy and data inventory

Use this inventory to produce the public privacy policy, Apple App Privacy answers, and Google Play Data Safety answers. It is an engineering audit, not legal advice. Product/legal owners must verify retention, vendors, and purposes before submission.

## Observed data categories

| Category | Examples observed in the repository | Purpose | Storage/processor to verify | Store disclosure status |
|---|---|---|---|---|
| Account identifiers | Name, email address, internal user ID | Account creation, login, sharing | PostgreSQL/API, email provider | Required; final answers TBD |
| Authentication data | Password hash, access token, password-reset request | Authentication and account security | PostgreSQL, device local storage | Required; final answers TBD |
| User content | Words, collections, notes, imported image-derived content, stories | Core learning features | PostgreSQL, device storage, object storage | Required; final answers TBD |
| Learning activity | Reviews, scheduling state, sessions, mastery, streaks, rewards, goals | Personalization and progress | PostgreSQL, device storage | Required; final answers TBD |
| Audio and media | Generated audio URLs, story/podcast listening position, cached audio/images | Listening and offline use | Object storage, TTS providers, device filesystem | Required; final answers TBD |
| Shared content | Sender/recipient email and name, shared-resource metadata | User-requested sharing | PostgreSQL, email provider | Required; final answers TBD |
| Device notification data | Web push subscription | Reminders/notifications | PostgreSQL, browser push service | Required if enabled in distributed build |
| Diagnostics | Server/application logs | Reliability and security | Hosting provider/logging system | Confirm fields, retention, and IP handling |
| AI inputs and outputs | Vocabulary, prompts, generated stories or transcriptions | AI-assisted learning features | Anthropic, Google, OpenAI and/or configured routing provider | Confirm exact production routing and retention |

## Native permissions and local access

- Camera: optional, user initiated, for importing words from a photographed image.
- Photo library: optional, user initiated, for importing words from an existing image.
- Filesystem: stores offline image/audio cache inside app-controlled storage.
- Preferences/local storage/IndexedDB: stores authentication state, settings, offline learning data, and pending synchronization operations.
- Network: connects to the production API and media providers through HTTPS.
- Text to speech: plays text using native speech functionality.
- Native push notifications are not currently integrated; web push code does not provide native APNs notifications in the Capacitor app.

## Required verification before declarations

- [ ] Enumerate every production third-party processor and subprocesser.
- [ ] Confirm whether providers retain AI prompts, generated content, audio, IP addresses, or diagnostic data.
- [ ] Confirm all production endpoints and domains by inspecting a release build’s network traffic.
- [ ] Define retention periods for active accounts, deleted accounts, logs, backups, generated media, support requests, and fraud/security records.
- [ ] Confirm encryption in transit and at rest for each store declaration.
- [ ] Confirm whether any data is used for analytics, advertising, profiling, or cross-app tracking.
- [ ] Confirm whether data is linked to identity and whether any category is shared under Apple/Google definitions.
- [ ] Confirm child-directed status and minimum user age.
- [x] Queue user-owned story audio for retrying deletion, including recursively shared copies.
- [ ] Apply and production-test the object-deletion migrations and worker against R2.
- [ ] Verify deletion from email providers, logs, backups, and downstream content-generation providers where applicable.
- [ ] Publish a privacy policy consistent with the verified inventory.
- [ ] Re-audit after dependency or provider changes.

## Account deletion implementation status

- Authenticated deletion endpoint: implemented.
- Password confirmation: implemented.
- Transactional deletion of known user-owned database records: implemented.
- Device authentication and offline-cache cleanup: implemented.
- Readily discoverable in-app action: implemented in the account menu.
- External deletion webpage required by Google Play: implemented, awaiting production deployment and HTTPS verification.
- Object-storage deletion: durable queue implemented, awaiting production migration and R2 verification.
- Downstream-provider deletion: requires production infrastructure verification.
- Backup/log retention disclosure: requires an operational policy.
