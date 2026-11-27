//! What the app window may load: only its own pages; links to the web open in
//! the browser.

use tauri::Url;

/// Host of the bundled front-end: `http(s)://tauri.localhost` on Windows, `tauri://localhost` elsewhere.
const BUNDLED_HOST: &str = "tauri.localhost";

/// A page of the app itself: the bundled front-end, or the Vite server in development.
pub fn is_app_url(url: &Url, dev_url: Option<&Url>) -> bool {
    let bundled = match url.scheme() {
        "http" | "https" => url.host_str() == Some(BUNDLED_HOST),
        "tauri" => url.host_str() == Some("localhost"),
        _ => false,
    };
    bundled || dev_url.is_some_and(|dev| dev.origin() == url.origin())
}

/// Address to open in the system browser: HTTPS only (never `file:`, `smb:`, …).
pub fn browser_link(url: &Url) -> Option<&str> {
    (url.scheme() == "https").then_some(url.as_str())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn url(s: &str) -> Url {
        Url::parse(s).unwrap()
    }

    #[test]
    fn accepts_only_the_bundled_pages_and_the_dev_server() {
        let dev = url("http://localhost:1420");
        assert!(is_app_url(&url("http://tauri.localhost/index.html"), None));
        assert!(is_app_url(&url("https://tauri.localhost/"), None));
        assert!(is_app_url(&url("tauri://localhost/"), None));
        assert!(is_app_url(
            &url("http://localhost:1420/#/recurring"),
            Some(&dev)
        ));

        assert!(!is_app_url(&url("http://localhost:1420/"), None));
        assert!(!is_app_url(&url("http://localhost:9999/"), Some(&dev)));
        assert!(!is_app_url(
            &url("https://evil.tauri.localhost.example/"),
            None
        ));
        assert!(!is_app_url(
            &url("https://eu.finalfantasyxiv.com/"),
            Some(&dev)
        ));
        assert!(!is_app_url(&url("file:///C:/Windows/"), None));
    }

    #[test]
    fn opens_only_https_links_in_the_browser() {
        assert_eq!(
            browser_link(&url("https://ffxivcollect.com/mounts/1")),
            Some("https://ffxivcollect.com/mounts/1")
        );
        for other in [
            "http://example.com/",
            "file:///C:/Windows/",
            "smb://server/share",
            "javascript:alert(1)",
        ] {
            assert_eq!(browser_link(&url(other)), None, "{other}");
        }
    }
}
