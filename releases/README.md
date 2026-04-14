# Release Metadata

The public `FitnessMomentum` repository publishes release verification assets with each tagged release.

Expected release assets:
- signed APK file(s)
- `SHA256SUMS.txt`
- `release-manifest.json`
- `LICENSE`
- `THIRD_PARTY_NOTICES.md`

`release-manifest.json` records:
- source commit
- app version
- Android `versionCode`
- toolchain versions (Node, JDK, Android SDK)
- APK checksum

Use the checksums and manifest together to verify that a downloaded APK matches the published build metadata.
