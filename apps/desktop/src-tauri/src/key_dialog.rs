//! The system dialog the key is typed into (spec 05 section 1.2, decision 0049). It's made from
//! the platform's own controls, so the key never enters a webview. These can only be tried by
//! hand on each platform. What happens after them is tested in `storystage_transport::add`.

/// Asks for the key on its own thread, with its own message loop, so the app keeps running.
#[cfg(windows)]
pub async fn ask(_app: &tauri::AppHandle) -> Option<String> {
    tauri::async_runtime::spawn_blocking(windows::ask).await.ok().flatten()
}

/// An `NSAlert` has to run on the main thread.
#[cfg(target_os = "macos")]
pub async fn ask(app: &tauri::AppHandle) -> Option<String> {
    let (reply, answer) = tokio::sync::oneshot::channel();
    app.run_on_main_thread(move || {
        let _ = reply.send(macos::ask());
    })
    .ok()?;
    answer.await.ok().flatten()
}

/// The dialog is in the app's Kotlin plugin, with the store.
#[cfg(target_os = "android")]
pub async fn ask(app: &tauri::AppHandle) -> Option<String> {
    use tauri::Manager;
    use tauri_plugin_secure_key::SecureKey;

    let app = app.clone();
    let asked = tauri::async_runtime::spawn_blocking(move || {
        app.state::<SecureKey<tauri::Wry>>().ask().ok().flatten()
    });
    asked.await.ok().flatten()
}

/// The iPad's dialog waits for the Apple developer account (WP15.5), because it can't be built
/// or run before that. Closing the dialog is the safe answer: no key, so no Prompter.
#[cfg(target_os = "ios")]
pub async fn ask(_app: &tauri::AppHandle) -> Option<String> {
    None
}

#[cfg(target_os = "macos")]
mod macos {
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSAlert, NSAlertFirstButtonReturn, NSSecureTextField};
    use objc2_foundation::{ns_string, NSPoint, NSRect, NSSize};

    pub fn ask() -> Option<String> {
        let main = MainThreadMarker::new()?;
        let alert = NSAlert::new(main);
        alert.setMessageText(ns_string!("Add your Claude key"));
        alert.setInformativeText(ns_string!(
            "Paste the key from the Claude Console. It goes straight to this device's secure store."
        ));
        alert.addButtonWithTitle(ns_string!("Add"));
        alert.addButtonWithTitle(ns_string!("Cancel"));
        let frame = NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(360.0, 24.0));
        let field = NSSecureTextField::initWithFrame(NSSecureTextField::alloc(main), frame);
        alert.setAccessoryView(Some(&field));
        (alert.runModal() == NSAlertFirstButtonReturn).then(|| field.stringValue().to_string())
    }
}

#[cfg(windows)]
mod windows {
    use std::cell::RefCell;
    use std::ptr::{null, null_mut};

    use windows_sys::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
    use windows_sys::Win32::Graphics::Gdi::{GetStockObject, COLOR_BTNFACE, DEFAULT_GUI_FONT, HBRUSH};
    use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::SetFocus;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, GetDlgItem, GetMessageW,
        GetWindowTextLengthW, GetWindowTextW, IsDialogMessageW, LoadCursorW, PostQuitMessage,
        RegisterClassW, SendMessageW, SetWindowTextW, TranslateMessage, BS_DEFPUSHBUTTON,
        CW_USEDEFAULT, ES_AUTOHSCROLL, ES_PASSWORD, HMENU, IDCANCEL, IDC_ARROW, IDOK, MSG, WM_CLOSE,
        WM_COMMAND, WM_DESTROY, WM_SETFONT, WNDCLASSW, WS_BORDER, WS_CAPTION, WS_CHILD,
        WS_EX_DLGMODALFRAME, WS_EX_TOPMOST, WS_SYSMENU, WS_TABSTOP, WS_VISIBLE,
    };
    use zeroize::Zeroize;

    const FIELD: i32 = 100;

    thread_local! {
        static TYPED: RefCell<Option<String>> = const { RefCell::new(None) };
    }

    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(Some(0)).collect()
    }

    /// Copies the field's text out, then clears both the buffer and the control.
    unsafe fn take_text(window: HWND) -> String {
        let field = GetDlgItem(window, FIELD);
        let length = GetWindowTextLengthW(field);
        let mut buffer = vec![0u16; length as usize + 1];
        let copied = GetWindowTextW(field, buffer.as_mut_ptr(), buffer.len() as i32);
        let text = String::from_utf16_lossy(&buffer[..copied.max(0) as usize]);
        buffer.zeroize();
        SetWindowTextW(field, wide("").as_ptr());
        text
    }

    unsafe extern "system" fn messages(
        window: HWND,
        message: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        match message {
            WM_COMMAND => {
                match (wparam & 0xffff) as i32 {
                    IDOK => {
                        let text = take_text(window);
                        TYPED.with(|typed| *typed.borrow_mut() = Some(text));
                        DestroyWindow(window);
                    }
                    IDCANCEL => {
                        DestroyWindow(window);
                    }
                    _ => {}
                }
                0
            }
            WM_CLOSE => {
                DestroyWindow(window);
                0
            }
            WM_DESTROY => {
                PostQuitMessage(0);
                0
            }
            _ => DefWindowProcW(window, message, wparam, lparam),
        }
    }

    unsafe fn control(
        parent: HWND,
        class: &str,
        text: &str,
        style: u32,
        place: (i32, i32, i32, i32),
        id: i32,
    ) -> HWND {
        let (x, y, width, height) = place;
        let created = CreateWindowExW(
            0,
            wide(class).as_ptr(),
            wide(text).as_ptr(),
            WS_CHILD | WS_VISIBLE | style,
            x,
            y,
            width,
            height,
            parent,
            id as isize as HMENU,
            GetModuleHandleW(null()),
            null(),
        );
        SendMessageW(created, WM_SETFONT, GetStockObject(DEFAULT_GUI_FONT) as WPARAM, 1);
        created
    }

    /// Shows the dialog, and returns once it closes. Runs on one thread throughout: a window
    /// and its message loop must share a thread.
    pub fn ask() -> Option<String> {
        let class = wide("StoryStageKeyDialog");
        // SAFETY: every handle is created on this thread and used only here. `class` and the
        // title outlive the calls that read them.
        unsafe {
            let instance = GetModuleHandleW(null());
            let description = WNDCLASSW {
                style: 0,
                lpfnWndProc: Some(messages),
                cbClsExtra: 0,
                cbWndExtra: 0,
                hInstance: instance,
                hIcon: null_mut(),
                hCursor: LoadCursorW(null_mut(), IDC_ARROW),
                hbrBackground: (COLOR_BTNFACE as isize + 1) as HBRUSH,
                lpszMenuName: null(),
                lpszClassName: class.as_ptr(),
            };
            // Fails harmlessly if the dialog has been shown before.
            RegisterClassW(&description);

            let window = CreateWindowExW(
                WS_EX_TOPMOST | WS_EX_DLGMODALFRAME,
                class.as_ptr(),
                wide("Add your Claude key").as_ptr(),
                WS_CAPTION | WS_SYSMENU | WS_VISIBLE,
                CW_USEDEFAULT,
                CW_USEDEFAULT,
                460,
                190,
                null_mut(),
                null_mut(),
                instance,
                null(),
            );
            if window.is_null() {
                return None;
            }
            let note = "Paste the key from the Claude Console. It goes straight to this device's secure store.";
            control(window, "STATIC", note, 0, (16, 14, 420, 40), 0);
            let style = WS_BORDER | WS_TABSTOP | ES_PASSWORD as u32 | ES_AUTOHSCROLL as u32;
            let field = control(window, "EDIT", "", style, (16, 60, 420, 24), FIELD);
            let default = WS_TABSTOP | BS_DEFPUSHBUTTON as u32;
            control(window, "BUTTON", "Add", default, (250, 104, 88, 28), IDOK);
            control(window, "BUTTON", "Cancel", WS_TABSTOP, (348, 104, 88, 28), IDCANCEL);
            SetFocus(field);

            let mut message: MSG = std::mem::zeroed();
            while GetMessageW(&mut message, null_mut(), 0, 0) > 0 {
                // This gives the dialog its keyboard: Tab, Enter and Escape.
                if IsDialogMessageW(window, &message) == 0 {
                    TranslateMessage(&message);
                    DispatchMessageW(&message);
                }
            }
        }
        TYPED.with(|typed| typed.borrow_mut().take())
    }
}
