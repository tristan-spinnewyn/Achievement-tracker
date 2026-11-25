//! Desktop notifications (Windows toasts); a click opens the recurring tasks view.

use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager, Runtime};

use crate::services::reminders::Notifier;

const TITLE: &str = "FFXIV Achievement Tracker";

/// The bundled icon, as a plain path: toasts cannot load a `file:` URI of a verbatim path.
fn toast_icon(resource_dir: &Path) -> Option<PathBuf> {
    let icon = dunce::simplified(resource_dir)
        .join("resources")
        .join("icon.png");
    icon.is_file().then_some(icon)
}

pub struct DesktopNotifier<R: Runtime> {
    app: AppHandle<R>,
    /// AppUserModelID the toasts are shown under (the installer registers the app identifier).
    app_id: String,
    icon: Option<PathBuf>,
}

impl<R: Runtime> DesktopNotifier<R> {
    pub fn new(app: &AppHandle<R>) -> Self {
        #[cfg(windows)]
        let dev_app_id = tauri_winrt_notification::Toast::POWERSHELL_APP_ID;
        #[cfg(not(windows))]
        let dev_app_id = "";
        let app_id = if tauri::is_dev() {
            // A development build is not registered with Windows.
            dev_app_id.to_owned()
        } else {
            app.config().identifier.clone()
        };
        let icon = app
            .path()
            .resource_dir()
            .ok()
            .and_then(|dir| toast_icon(&dir));
        Self {
            app: app.clone(),
            app_id,
            icon,
        }
    }
}

impl<R: Runtime> Notifier for DesktopNotifier<R> {
    #[cfg(windows)]
    fn notify(&self, body: &str) {
        use tauri_winrt_notification::{IconCrop, Toast};

        let app = self.app.clone();
        let mut toast = Toast::new(&self.app_id)
            .title(TITLE)
            .text1(body)
            .on_activated(move |_action| {
                super::window::show_recurring_view(&app);
                Ok(())
            });
        if let Some(icon) = &self.icon {
            toast = toast.icon(icon, IconCrop::Square, TITLE);
        }
        if let Err(err) = toast.show() {
            eprintln!("[notifications] cannot show a notification: {err}");
        }
    }

    #[cfg(not(windows))]
    fn notify(&self, body: &str) {
        let _ = (&self.app, &self.app_id, &self.icon);
        eprintln!("[notifications] {TITLE}: {body}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_toast_icon_is_a_plain_path_to_the_bundled_icon() {
        let dir = tempfile::tempdir().unwrap();
        let resources = dir.path().join("resources");
        std::fs::create_dir_all(&resources).unwrap();
        std::fs::write(resources.join("icon.png"), b"png").unwrap();
        // Windows resolves the resource folder with the `\\?\` prefix, which toasts cannot load.
        let verbatim = PathBuf::from(format!(r"\\?\{}", dir.path().display()));

        let icon = toast_icon(&verbatim).unwrap();

        assert_eq!(icon, resources.join("icon.png"));
        assert!(!icon.display().to_string().starts_with(r"\\?\"));
        assert_eq!(toast_icon(&dir.path().join("missing")), None);
    }
}
