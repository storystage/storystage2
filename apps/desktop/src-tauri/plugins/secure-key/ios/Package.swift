// swift-tools-version:5.3
// The iPad's dialog for the Claude key (spec 05 section 1.2).

import PackageDescription

let package = Package(
  name: "tauri-plugin-secure-key",
  platforms: [
    .macOS(.v11),
    .iOS(.v14),
  ],
  products: [
    .library(
      name: "tauri-plugin-secure-key",
      type: .static,
      targets: ["tauri-plugin-secure-key"])
  ],
  dependencies: [
    .package(name: "Tauri", path: "../.tauri/tauri-api")
  ],
  targets: [
    .target(
      name: "tauri-plugin-secure-key",
      dependencies: [
        .byName(name: "Tauri")
      ],
      path: "Sources")
  ]
)
