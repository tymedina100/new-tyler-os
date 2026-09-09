# Native iPhone companion

Use SwiftUI and the existing authenticated `/api/mobile` contract. Canonical
personal records belong to the existing server/Notion services. Keychain may hold
the device session and unsent draft; never add privileged service credentials.

Follow the build and verification instructions in `README.md`. Keep Simulator
signing enabled for real Keychain tests. Use a derived-data directory outside
Documents. Authenticated UI tests require a private `TYLEROS_UI_CONFIGURATION`
file and an isolated backend database; never run synthetic mutations against
personal production data. Keep source snapshots, credentials, signed artifacts,
and test results outside Git. Preserve server approval and standing-authority
decisions. Inspect actual screenshots after layout changes.
