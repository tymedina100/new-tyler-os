# TylerOS for iPhone

Native SwiftUI command and approval interface for the existing TylerOS service. iOS 18 or later. It stores a session and unsent capture draft in device-only Keychain; application records stay in canonical Postgres/Notion.

## Install on Tyler's registered iPhone

The separately delivered development-signed `TylerOS.ipa` uses Tyler's personal Apple Development team `5FBXR5M5PJ`. Its embedded profile expires March 18, 2027 and is limited to the registered device. This is not a TestFlight or App Store release.

Connect and unlock the registered iPhone, enable Developer Mode if requested, then drag the IPA to the Installed Apps section in Xcode's **Window → Devices and Simulators**. Alternatively open `TylerOS.xcodeproj`, choose the iPhone and Tyler's personal team, then Run. The currently unavailable physical iPhone has not been installed or tested in this run.

Enter `https://tyler-os-ashen.vercel.app` as the authenticated TylerOS deployment address and your existing TylerOS passphrase. Release builds reject plaintext HTTP. The passphrase is exchanged for a revocable mobile bearer session; privileged service credentials never belong in this app.

## Use

- Today shows canonical app tasks and requests the existing deterministic daily briefing.
- Capture creates tasks; prefix reference material with `note:`. Unsent drafts survive closing the app.
- Tasks edits canonical app records with optimistic conflict detection. Shared Notion tasks are explicitly dated, read-only snapshots with links to their originals.
- Miles shows runtime runs and proposed notes. Accept saves the proposal; dismiss makes no note. Existing standing authority remains server-controlled.
- Knowledge searches loaded notes and source-linked personal snapshots, and performs server search.
- Dictation requires on-device speech support for the phone's language. No server speech fallback is used. Settings can schedule a generic local 8 AM reminder; server push is not configured.

## Verify and rebuild

Use a derived-data directory outside Documents to avoid macOS extended attributes causing code-sign failures. Keep Simulator ad-hoc signing enabled: disabling code signing removes the entitlement needed by real Keychain tests.

```sh
xcodebuild -project TylerOS.xcodeproj -scheme TylerOS \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -derivedDataPath /tmp/tyleros-ios-build test
```

For a relocated checkout, set the test runner environment variable `TYLEROS_UI_CONFIGURATION` in the Xcode scheme Test arguments to an absolute private JSON path. Otherwise authenticated UI tests read the private `../../work/ios-ui-configuration.json` file with `server` and `passphrase` keys. Run against an isolated test database and deterministic worker only. They generate clearly synthetic tasks and check capture/edit persistence, a second client edit appearing after relaunch, and the request/run/approval UI. Never point this destructive fixture environment at personal production data. Without configuration, the integration test explicitly skips; a skip is not end-to-end verification.

```sh
xcodebuild -project TylerOS.xcodeproj -scheme TylerOS -configuration Release \
  -destination 'generic/platform=iOS' -derivedDataPath /tmp/tyleros-device-build \
  -archivePath /tmp/TylerOS.xcarchive DEVELOPMENT_TEAM=5FBXR5M5PJ \
  -allowProvisioningUpdates archive
```

No paid model calls are required for the implemented deterministic briefing flow. Arbitrary free-text autonomous requests and APNs are not implemented. Actual voice recognition and notification delivery require physical-device checks.

## Current verification

On September 9, 2026, an iPhone 16 Pro Simulator running iOS 18.3 passed all eight unit tests and the authenticated capture/edit/relaunch/second-client/Miles approval UI flow against the isolated Postgres backend. The saved-session run skipped the separate login-screen test; that test and real passphrase login passed in the earlier clean-session run. Tests also verify that success notices do not block Save or tab navigation. Screenshots, logs, and signed artifacts are delivered separately; they are not stored in this source repository.

The production URL is configured server-side; native production sign-in awaits Tyler's existing passphrase. The device archive and IPA are development signed, and installation, speech recognition, and notification delivery on the physical iPhone remain unverified while it is unavailable. iOS 26.1 Simulator startup and its asset compiler helper stalled on this host. The app was verified on iOS 18.3; bundled PNG icons use Apple's supported `CFBundleIcons` keys to avoid that asset compiler dependency.

### Morning operations — verified locally, release pending

Today now shows canonical saved briefing notes, pending decisions and failed jobs,
with a direct route to Miles. Counts include older pending decisions even beyond
the recent 50 jobs. Existing backends without this additive field still decode.
During proposal review, job polling pauses. Busy/failed decisions keep the sheet
open instead of silently appearing complete.

September 9 verification for this change: eleven unit tests and the authenticated
Simulator capture/edit/relaunch/second-client/worker/approval/Today-operations flow
passed on a fresh iOS 18.3.1 test device, using isolated local PostgreSQL. The
connection-screen test also passed on the initial clean-session run. Final
operations screenshot was inspected. No updated physical installation or
production deployment is claimed for this milestone.

### Source health

Knowledge displays each entry's import age and recorded review timing. A new import
batch is not a new review. Broken/missing sources are labeled separately; app notes
and tasks stay usable. Shared-task snapshot health is visible even when no cached
tasks can be loaded. New fields are optional for older backends.

The source-recovery UI test additionally needs `knowledgeFixturePath` in the private
UI configuration, pointing to the synthetic `work/knowledge-e2e.json` used by the
loopback fixture server. It corrupts and restores that named fixture. Run only with
an isolated local backend, never personal production imports. The test confirms
source detail, failure labeling, canonical Today access and recovery after repair.
