//! Local cache of the FFXIV icons downloaded from XIVAPI.
//!
//! Only paths accepted by `is_safe_icon_path` are used: they become cache file
//! names and query parameters, so they must never escape the cache folder.

use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use reqwest::Url;
use tokio::sync::Semaphore;
use tokio::task::JoinSet;

use crate::net::network::Network;
use crate::sanitize::primitives::is_safe_icon_path;

pub const PREFETCH_CONCURRENCY: usize = 5;

/// Cache file name of an icon path: "/i/000000/000123.png" -> "000000_000123.png".
pub fn icon_filename(icon_path: &str) -> Option<String> {
    if !is_safe_icon_path(icon_path) {
        return None;
    }
    Some(
        icon_path
            .strip_prefix("/i/")
            .unwrap_or(icon_path)
            .replace('/', "_"),
    )
}

/// PNG asset URL on XIVAPI v2; the API expects a path without leading "/".
pub fn remote_asset_url(net: &Network, icon_path: &str) -> String {
    let path = icon_path.strip_prefix('/').unwrap_or(icon_path);
    let base = &net.endpoints.xivapi_asset;
    Url::parse_with_params(base, [("path", path), ("format", "png")])
        .map_or_else(|_| base.clone(), String::from)
}

#[derive(Debug, Clone, PartialEq)]
pub struct IconCache {
    dir: PathBuf,
}

impl IconCache {
    /// The cache lives in the app data folder (the install folder is read-only).
    pub fn in_data_dir(data_dir: &Path) -> Self {
        Self {
            dir: data_dir.join("icon-cache"),
        }
    }

    /// The cache folder (the webview may only load assets from it).
    pub fn dir(&self) -> &Path {
        &self.dir
    }

    /// The cached file of an icon, if it was downloaded.
    pub fn local_path(&self, icon_path: &str) -> Option<PathBuf> {
        let file = self.dir.join(icon_filename(icon_path)?);
        file.is_file().then_some(file)
    }

    /// Local file path when cached, otherwise the remote URL; None for an unsafe path.
    /// The renderer turns a local path into an `asset:` URL.
    pub fn icon_url(&self, net: &Network, icon_path: &str) -> Option<String> {
        icon_filename(icon_path)?;
        Some(match self.local_path(icon_path) {
            Some(file) => file.to_string_lossy().into_owned(),
            None => remote_asset_url(net, icon_path),
        })
    }

    /// Downloads an icon into the cache (no-op when already cached).
    pub async fn download(&self, net: &Network, icon_path: &str) -> Option<PathBuf> {
        let file = self.dir.join(icon_filename(icon_path)?);
        if file.is_file() {
            return Some(file);
        }
        let bytes = net
            .http
            .get_bytes(&remote_asset_url(net, icon_path))
            .await
            .ok()?;
        match write_atomically(&file, &bytes) {
            Ok(()) => Some(file),
            Err(err) => {
                eprintln!("[icons] cannot cache {icon_path}: {err}");
                None
            }
        }
    }

    /// Downloads the distinct safe icons, a few at a time; failures are ignored.
    pub async fn prefetch(&self, net: &Network, icon_paths: Vec<String>, concurrency: usize) {
        let distinct: BTreeSet<String> = icon_paths
            .into_iter()
            .filter(|p| is_safe_icon_path(p))
            .collect();
        let permits = Arc::new(Semaphore::new(concurrency.max(1)));
        let mut downloads = JoinSet::new();
        for icon_path in distinct {
            let (cache, net, permits) = (self.clone(), net.clone(), Arc::clone(&permits));
            downloads.spawn(async move {
                let _permit = permits.acquire_owned().await;
                cache.download(&net, &icon_path).await;
            });
        }
        while downloads.join_next().await.is_some() {}
    }
}

/// Writes through a temporary file so a crash never leaves a truncated icon.
fn write_atomically(file: &Path, bytes: &[u8]) -> std::io::Result<()> {
    if let Some(dir) = file.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let mut tmp = file.as_os_str().to_owned();
    tmp.push(".tmp");
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, file)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::net::network::test_support::mock_network;
    use mockito::Matcher;

    fn cache() -> (IconCache, tempfile::TempDir) {
        let dir = tempfile::tempdir().unwrap();
        (IconCache::in_data_dir(dir.path()), dir)
    }

    #[test]
    fn the_cache_folder_is_inside_the_data_folder() {
        let (cache, dir) = cache();
        assert_eq!(cache.dir(), dir.path().join("icon-cache"));
    }

    #[test]
    fn file_names_flatten_safe_paths_only() {
        assert_eq!(
            icon_filename("/i/000000/000123.png").as_deref(),
            Some("000000_000123.png")
        );
        assert_eq!(
            icon_filename("ui/icon/062000/062904.tex").as_deref(),
            Some("ui_icon_062000_062904.tex")
        );
        assert_eq!(icon_filename("../../etc/passwd"), None);
    }

    #[test]
    fn remote_url_drops_the_leading_slash_and_asks_for_png() {
        let net = Network::default();
        assert_eq!(
            remote_asset_url(&net, "/ui/icon/062000/062904.tex"),
            "https://v2.xivapi.com/api/asset?path=ui%2Ficon%2F062000%2F062904.tex&format=png"
        );
    }

    #[test]
    fn icon_url_prefers_the_cached_file() {
        let (cache, _dir) = cache();
        let net = Network::default();
        let remote = cache.icon_url(&net, "ui/icon/1.tex").unwrap();
        assert!(remote.starts_with("https://v2.xivapi.com/api/asset?path="));

        std::fs::create_dir_all(&cache.dir).unwrap();
        std::fs::write(cache.dir.join("ui_icon_1.tex"), b"png").unwrap();
        let local = cache.icon_url(&net, "ui/icon/1.tex").unwrap();
        assert_eq!(PathBuf::from(local), cache.dir.join("ui_icon_1.tex"));
        assert_eq!(cache.icon_url(&net, "../x.png"), None);
    }

    #[tokio::test]
    async fn downloads_once_then_serves_from_the_cache() {
        let mut server = mockito::Server::new_async().await;
        let asset = server
            .mock("GET", "/asset")
            .match_query(Matcher::UrlEncoded("path".into(), "ui/icon/1.tex".into()))
            .with_body([137u8, 80, 78, 71])
            .expect(1)
            .create_async()
            .await;
        let (cache, _dir) = cache();
        let net = mock_network(&server.url());

        let first = cache.download(&net, "ui/icon/1.tex").await.unwrap();
        let second = cache.download(&net, "ui/icon/1.tex").await.unwrap();

        asset.assert_async().await;
        assert_eq!(first, second);
        assert_eq!(std::fs::read(&first).unwrap(), [137, 80, 78, 71]);
        assert_eq!(std::fs::read_dir(&cache.dir).unwrap().count(), 1);
    }

    #[tokio::test]
    async fn a_failed_or_unsafe_download_yields_nothing() {
        let mut server = mockito::Server::new_async().await;
        server
            .mock("GET", "/asset")
            .match_query(Matcher::Any)
            .with_status(404)
            .create_async()
            .await;
        let (cache, _dir) = cache();
        let net = mock_network(&server.url());

        assert_eq!(cache.download(&net, "ui/icon/404.tex").await, None);
        assert_eq!(cache.download(&net, "../escape.png").await, None);
        assert!(cache.local_path("ui/icon/404.tex").is_none());
    }

    #[tokio::test]
    async fn prefetch_downloads_each_distinct_safe_icon() {
        let mut server = mockito::Server::new_async().await;
        let asset = server
            .mock("GET", "/asset")
            .match_query(Matcher::Any)
            .with_body("png")
            .expect(3)
            .create_async()
            .await;
        let (cache, _dir) = cache();
        let paths = [
            "ui/icon/1.tex",
            "ui/icon/2.tex",
            "ui/icon/1.tex",
            "../bad.png",
            "ui/icon/3.tex",
        ];

        cache
            .prefetch(
                &mock_network(&server.url()),
                paths.map(String::from).to_vec(),
                2,
            )
            .await;

        asset.assert_async().await;
        assert!(cache.local_path("ui/icon/3.tex").is_some());
    }
}
