// swift-tools-version:5.3
// iPad's own Files dialogs, for StoryStage's file picker (spec 05 section 6.5).

import PackageDescription

let package = Package(
  name: "tauri-plugin-files-export",
  platforms: [
    .macOS(.v11),
    .iOS(.v14),
  ],
  products: [
    .library(
      name: "tauri-plugin-files-export",
      type: .static,
      targets: ["tauri-plugin-files-export"])
  ],
  dependencies: [
    .package(name: "Tauri", path: "../.tauri/tauri-api")
  ],
  targets: [
    .target(
      name: "tauri-plugin-files-export",
      dependencies: [
        .byName(name: "Tauri")
      ],
      path: "Sources")
  ]
)
