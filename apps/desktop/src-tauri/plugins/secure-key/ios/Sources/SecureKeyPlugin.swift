// The iPad's dialog for the Claude key (spec 05 section 1.2, decision 0056): a system alert with
// a secure text field, so the key never enters the webview. Rust calls it; the webview can't, as
// the plugin has no commands. The key is stored by Rust, in the Keychain.

import SwiftRs
import Tauri
import UIKit
import WebKit

/// `text` is left out when the adult closed the dialog.
struct KeyReply: Encodable {
  let text: String?
}

class SecureKeyPlugin: Plugin {
  /// The dialog that's open. One at a time.
  private var open: UIAlertController?

  @objc public func ask(_ invoke: Invoke) throws {
    DispatchQueue.main.async {
      guard self.open == nil, let presenting = self.manager.viewController else {
        invoke.resolve(KeyReply(text: nil))
        return
      }
      let alert = UIAlertController(
        title: "Add your Claude key",
        message: "Paste the key from the Claude Console. It goes straight to this device's secure store.",
        preferredStyle: .alert)
      alert.addTextField { field in
        // Masked, with no dictation, autocorrect or suggestions. No content type, so iPadOS
        // doesn't offer to save it as a password.
        field.isSecureTextEntry = true
        field.autocorrectionType = .no
        field.autocapitalizationType = .none
        field.spellCheckingType = .no
        field.smartDashesType = .no
        field.smartQuotesType = .no
      }
      let answer = { (text: String?) in
        alert.textFields?.first?.text = ""
        self.open = nil
        invoke.resolve(KeyReply(text: text))
      }
      alert.addAction(
        UIAlertAction(title: "Cancel", style: .cancel) { _ in
          answer(nil)
        })
      alert.addAction(
        UIAlertAction(title: "Add", style: .default) { _ in
          answer(alert.textFields?.first?.text)
        })
      self.open = alert
      presenting.present(alert, animated: true)
    }
  }
}

@_cdecl("init_plugin_secure_key")
func initPlugin() -> Plugin {
  return SecureKeyPlugin()
}
