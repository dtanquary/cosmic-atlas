# Cosmic Atlas native client (iOS / iPadOS)

A Swift + Metal + SwiftUI client for the same published Cosmic Atlas catalog release the web app streams. Nothing in
`public/data` is bundled; the app fetches `catalog.json` and the fingerprinted release from the public origin.
Plan, phases and device-record rules: [`docs/native-ios.md`](../docs/native-ios.md).

```sh
cd native && swift test                       # AtlasCore logic + offscreen Metal checks on the Mac
cd native/App && xcodegen generate            # brew install xcodegen; the .xcodeproj is ignored by git
xcodebuild -project native/App/CosmicAtlas.xcodeproj -scheme CosmicAtlas \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' build
```

Device runs need a signing team on the command line (or once in the Xcode Signing tab); keep the team ID out of git:

```sh
xcodebuild test -project native/App/CosmicAtlas.xcodeproj -scheme CosmicAtlas \
  -destination "platform=iOS,id=$UDID" -allowProvisioningUpdates DEVELOPMENT_TEAM="$ATLAS_TEAM_ID" \
  -only-testing:CosmicAtlasDeviceTests -resultBundlePath native/.cache/device.xcresult
```

Layout: `Sources/AtlasCore` (1:1 ports of `src/*.ts`), `Sources/AtlasShaderTypes` (uniform structs shared with MSL),
`Sources/AtlasRender` (Metal passes), `Tests/` (XCTest ports of `tests/*.test.ts` using the repo fixtures via `#filePath`),
`App/` (xcodegen spec, app sources, device tests). Reference JSON, photos and credits are folder references into the
web tree, copied at build time only.
