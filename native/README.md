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

Device runs need a signing team on the command line (or once in the Xcode Signing tab); keep the team ID out of git
(this checkout keeps it in the ignored `.deploy/ios.env`). The phone must be unlocked, and on the first install iOS asks
you to trust the developer app under Settings → General → VPN & Device Management.

**Always judge performance on a Release build.** `xcodebuild test` installs a Debug build whose unoptimised Swift makes
the per-frame streaming code many times slower; the device journey test below builds Release for that reason. To try
the app by hand, install a Release build directly:

```sh
source .deploy/ios.env
xcodebuild -project native/App/CosmicAtlas.xcodeproj -scheme CosmicAtlas -configuration Release \
  -destination "platform=iOS,id=$ATLAS_IPHONE_UDID" -allowProvisioningUpdates DEVELOPMENT_TEAM="$ATLAS_TEAM_ID" \
  -derivedDataPath native/.cache/DerivedData-release build
xcrun devicectl device install app --device "$ATLAS_IPHONE_UDID" \
  native/.cache/DerivedData-release/Build/Products/Release-iphoneos/CosmicAtlas.app
```


```sh
xcodebuild test -project native/App/CosmicAtlas.xcodeproj -scheme CosmicAtlas -configuration Release \
  -destination "platform=iOS,id=$ATLAS_IPHONE_UDID" -allowProvisioningUpdates DEVELOPMENT_TEAM="$ATLAS_TEAM_ID" \
  -only-testing:CosmicAtlasDeviceTests -resultBundlePath native/.cache/device.xcresult
```

Layout: `Sources/AtlasCore` (1:1 ports of `src/*.ts`), `Sources/AtlasShaderTypes` (uniform structs shared with MSL),
`Sources/AtlasRender` (Metal passes), `Tests/` (XCTest ports of `tests/*.test.ts` using the repo fixtures via `#filePath`),
`App/` (xcodegen spec, app sources, device tests). Reference JSON, photos and credits are folder references into the
web tree, copied at build time only.
