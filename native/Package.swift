// swift-tools-version:6.2
import PackageDescription

// Native Cosmic Atlas client. AtlasCore is platform-neutral logic (a 1:1 port of src/*.ts);
// AtlasRender is the Metal renderer, which also runs offscreen on macOS for tests.
let package = Package(
  name: "AtlasKit",
  platforms: [.iOS(.v26), .macOS(.v26)],
  products: [
    .library(name: "AtlasCore", targets: ["AtlasCore"]),
    .library(name: "AtlasRender", targets: ["AtlasRender"]),
  ],
  targets: [
    .target(name: "AtlasShaderTypes"),
    .target(name: "AtlasCore"),
    .target(name: "AtlasRender", dependencies: ["AtlasCore", "AtlasShaderTypes"]),
    .target(name: "AtlasTestSupport", dependencies: ["AtlasCore"]),
    .testTarget(name: "AtlasCoreTests", dependencies: ["AtlasCore", "AtlasTestSupport"]),
    .testTarget(name: "AtlasRenderTests", dependencies: ["AtlasRender", "AtlasTestSupport"]),
  ],
  swiftLanguageModes: [.v6]
)
