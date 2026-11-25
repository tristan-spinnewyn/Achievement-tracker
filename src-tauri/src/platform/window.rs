//! The main window: created from its configuration with the navigation and
//! permission guards, brought back to the front on demand.

use tauri::webview::{NewWindowResponse, PermissionResponse};
use tauri::{AppHandle, Emitter, Manager, Runtime, Url, WebviewWindow, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

use super::navigation::{browser_link, is_app_url};
use super::window_bounds::restore_electron_bounds;
use crate::store::electron_migration::ElectronWindowState;

pub const MAIN_WINDOW: &str = "main";
/// Event asking the renderer to show a view (payload: the view name).
pub const NAVIGATE_EVENT: &str = "navigate-to";

fn open_in_browser<R: Runtime>(app: &AppHandle<R>, url: &Url) {
    if let Some(link) = browser_link(url) {
        if let Err(err) = app.opener().open_url(link, None::<&str>) {
            eprintln!("[window] cannot open {link}: {err}");
        }
    }
}

/// Builds the main window (`create: false` in the config). It stays on the app pages,
/// sends web links to the browser and refuses every web permission (camera, location…).
/// `electron_bounds`: the size and position the Electron app saved, on the first launch.
pub fn create_main_window<R: Runtime>(
    app: &AppHandle<R>,
    electron_bounds: Option<&ElectronWindowState>,
) -> tauri::Result<WebviewWindow<R>> {
    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|w| w.label == MAIN_WINDOW)
        .cloned()
        .unwrap_or_default();
    let dev_url = if tauri::is_dev() {
        app.config().build.dev_url.clone()
    } else {
        None
    };
    let (navigation_app, popup_app) = (app.clone(), app.clone());
    let window = WebviewWindowBuilder::from_config(app, &config)?
        .on_navigation(move |url| {
            let allowed = is_app_url(url, dev_url.as_ref());
            if !allowed {
                open_in_browser(&navigation_app, url);
            }
            allowed
        })
        .on_new_window(move |url, _features| {
            open_in_browser(&popup_app, &url);
            NewWindowResponse::Deny
        })
        .on_permission_request(|_webview, _kind| PermissionResponse::Deny)
        .build()?;
    // Hidden until the window-state plugin has restored its size and position,
    // or the bounds of the Electron app are applied.
    if let Some(bounds) = electron_bounds {
        if let Err(err) = restore_electron_bounds(&window, bounds) {
            eprintln!("[window] cannot restore the Electron window bounds: {err}");
        }
    }
    window.show()?;
    Ok(window)
}

/// Restores, shows and focuses the main window (second launch, notification click).
pub fn focus_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let shown = window
            .unminimize()
            .and_then(|()| window.show())
            .and_then(|()| window.set_focus());
        if let Err(err) = shown {
            eprintln!("[window] cannot focus the main window: {err}");
        }
    }
}

/// Brings the window to the front on the recurring tasks view.
pub fn show_recurring_view<R: Runtime>(app: &AppHandle<R>) {
    focus_main_window(app);
    if let Err(err) = app.emit_to(MAIN_WINDOW, NAVIGATE_EVENT, "recurring") {
        eprintln!("[window] cannot open the recurring view: {err}");
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use tauri::test::mock_app;
    use tauri::Listener;

    use super::*;

    #[test]
    fn creates_the_main_window_shown() {
        let app = mock_app();
        let window = create_main_window(app.handle(), None).unwrap();
        assert_eq!(window.label(), MAIN_WINDOW);
        assert!(window.is_visible().unwrap());
    }

    #[test]
    fn creates_the_main_window_shown_with_the_electron_bounds() {
        let app = mock_app();
        let bounds = ElectronWindowState {
            width: 1280.0,
            height: 868.0,
            x: Some(640.0),
            y: Some(190.0),
            maximized: false,
        };
        let window = create_main_window(app.handle(), Some(&bounds)).unwrap();
        assert!(window.is_visible().unwrap());
    }

    #[test]
    fn a_notification_click_opens_the_recurring_view() {
        let app = mock_app();
        create_main_window(app.handle(), None).unwrap();
        let views = Arc::new(Mutex::new(Vec::new()));
        let seen = Arc::clone(&views);
        app.listen_any(NAVIGATE_EVENT, move |event| {
            seen.lock().unwrap().push(event.payload().to_owned());
        });

        show_recurring_view(app.handle());

        assert_eq!(*views.lock().unwrap(), ["\"recurring\""]);
    }

    #[test]
    fn focusing_without_a_window_does_nothing() {
        let app = mock_app();
        focus_main_window(app.handle());
        assert!(app.get_webview_window(MAIN_WINDOW).is_none());
    }
}
