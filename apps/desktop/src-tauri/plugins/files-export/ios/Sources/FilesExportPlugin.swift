// iPad's own Files dialogs (spec 05 section 6.5): export copies of files the app wrote, and pick
// a file to open as a copy. Rust calls these; the webview can't, as the plugin has no commands.

import SwiftRs
import Tauri
import UIKit
import UniformTypeIdentifiers
import WebKit

class ExportArgs: Decodable {
  let paths: [String]
}

class PickArgs: Decodable {
  /// "production" or "zip".
  let kind: String
}

struct ExportReply: Encodable {
  let saved: Bool
}

/// `path` is left out when the person closed the dialog.
struct PickReply: Encodable {
  let path: String?
}

/// Answers once, whichever way the dialog ends.
class PickerDelegate: NSObject, UIDocumentPickerDelegate {
  private var done: (([URL]?) -> Void)?

  init(_ done: @escaping ([URL]?) -> Void) {
    self.done = done
  }

  private func finish(_ urls: [URL]?) {
    let answer = done
    done = nil
    answer?(urls)
  }

  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    finish(urls)
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    finish(nil)
  }
}

class FilesExportPlugin: Plugin {
  /// The dialog that's open, kept so its delegate lives until it answers. One at a time.
  private var open: PickerDelegate?

  private func show(_ picker: UIDocumentPickerViewController, _ invoke: Invoke, _ done: @escaping ([URL]?) -> Void) {
    DispatchQueue.main.async {
      guard self.open == nil, let presenting = self.manager.viewController else {
        invoke.reject("busy")
        return
      }
      let delegate = PickerDelegate { urls in
        self.open = nil
        done(urls)
      }
      self.open = delegate
      picker.delegate = delegate
      picker.modalPresentationStyle = .formSheet
      presenting.present(picker, animated: true)
    }
  }

  /// Exports copies of the files together, to one place the person picks.
  @objc public func export(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(ExportArgs.self)
    let urls = args.paths.map { URL(fileURLWithPath: $0) }
    guard !urls.isEmpty else {
      invoke.reject("internal")
      return
    }
    let picker = UIDocumentPickerViewController(forExporting: urls, asCopy: true)
    show(picker, invoke) { picked in
      invoke.resolve(ExportReply(saved: picked != nil))
    }
  }

  /// A copy, inside the app, of one file the person picks.
  @objc public func pick(_ invoke: Invoke) throws {
    let args = try invoke.parseArgs(PickArgs.self)
    let type: UTType
    switch args.kind {
    case "production":
      type = UTType(filenameExtension: "storystage", conformingTo: .data) ?? .data
    case "zip":
      type = .zip
    default:
      invoke.reject("internal")
      return
    }
    let picker = UIDocumentPickerViewController(forOpeningContentTypes: [type], asCopy: true)
    picker.allowsMultipleSelection = false
    show(picker, invoke) { picked in
      invoke.resolve(PickReply(path: picked?.first?.path))
    }
  }
}

@_cdecl("init_plugin_files_export")
func initPlugin() -> Plugin {
  return FilesExportPlugin()
}
