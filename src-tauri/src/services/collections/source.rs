//! Where the collections builder reads its data: XIVAPI sheets and FFXIV Collect.
//! Behind a trait so the builder is tested on in-memory data.

use std::future::Future;

use reqwest::Url;
use serde::Deserialize;

use crate::net::ffxiv_collect::fetch_results;
use crate::net::network::Network;
use crate::net::xivapi::{fetch_sheet, SheetRows, XivapiError};

const COLLECT_LIMIT: u32 = 5_000;

/// An FFXIV Collect entry (only the fields the builder reads).
#[derive(Debug, Clone, PartialEq, Default, Deserialize)]
#[serde(default)]
pub struct CollectRow {
    pub id: u32,
    pub name: Option<String>,
    pub description: Option<String>,
    pub patch: Option<String>,
    pub icon: Option<String>,
    pub image: Option<String>,
    pub sources: Vec<CollectSource>,
}

#[derive(Debug, Clone, PartialEq, Default, Deserialize)]
#[serde(default)]
pub struct CollectSource {
    #[serde(rename = "type")]
    pub kind: Option<String>,
    pub text: Option<String>,
}

pub trait CollectionSource: Sync {
    /// Every row of an XIVAPI sheet; a failure aborts the build.
    fn sheet(
        &self,
        sheet: &str,
        fields: &str,
        language: &str,
    ) -> impl Future<Output = Result<SheetRows, XivapiError>> + Send;

    /// The entries of an FFXIV Collect endpoint, in order; empty when the service fails.
    fn collect(&self, endpoint: &str) -> impl Future<Output = Vec<CollectRow>> + Send;
}

impl CollectionSource for Network {
    async fn sheet(
        &self,
        sheet: &str,
        fields: &str,
        language: &str,
    ) -> Result<SheetRows, XivapiError> {
        fetch_sheet(self, sheet, fields, language).await
    }

    async fn collect(&self, endpoint: &str) -> Vec<CollectRow> {
        fetch_results(self, endpoint, COLLECT_LIMIT)
            .await
            .unwrap_or_default()
            .into_iter()
            .filter_map(|row| serde_json::from_value(row).ok())
            .collect()
    }
}

/// Upper-cases the first letter ("licorne" -> "Licorne").
pub fn capitalize(text: &str) -> String {
    let mut chars = text.chars();
    chars.next().map_or_else(String::new, |first| {
        first.to_uppercase().chain(chars).collect()
    })
}

/// The `path` query parameter of an FFXIV Collect asset URL, decoded.
pub fn icon_path_from_url(url: Option<&str>) -> Option<String> {
    let url = Url::parse(url?).ok()?;
    url.query_pairs()
        .find(|(name, _)| name == "path")
        .map(|(_, value)| value.into_owned())
}

/// Acquisition methods as "type : text", empty parts dropped.
pub fn sources_of(row: Option<&CollectRow>) -> Vec<String> {
    let Some(row) = row else { return vec![] };
    row.sources
        .iter()
        .map(|s| {
            [s.kind.as_deref(), s.text.as_deref()]
                .into_iter()
                .flatten()
                .filter(|part| !part.is_empty())
                .collect::<Vec<_>>()
                .join(" : ")
        })
        .filter(|source| !source.is_empty())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::net::network::test_support::mock_network;
    use mockito::Matcher;
    use serde_json::json;

    #[test]
    fn capitalizes_the_first_letter_only() {
        assert_eq!(capitalize("licorne"), "Licorne");
        assert_eq!(capitalize("élégant chocobo"), "Élégant chocobo");
        assert_eq!(capitalize(""), "");
    }

    #[test]
    fn reads_the_decoded_path_parameter() {
        assert_eq!(
            icon_path_from_url(Some("https://x/api/asset?path=ui%2Fw.tex&f=png")).as_deref(),
            Some("ui/w.tex")
        );
        assert_eq!(
            icon_path_from_url(Some("https://x/a?f=png&path=ui%2Ff.tex")).as_deref(),
            Some("ui/f.tex")
        );
        assert_eq!(icon_path_from_url(Some("https://x/no-path.png")), None);
        assert_eq!(icon_path_from_url(None), None);
    }

    #[test]
    fn formats_sources_and_drops_empty_ones() {
        let row = CollectRow {
            sources: vec![
                CollectSource {
                    kind: Some("Quête".into()),
                    text: Some("MSQ".into()),
                },
                CollectSource {
                    kind: None,
                    text: Some(String::new()),
                },
                CollectSource::default(),
                CollectSource {
                    kind: Some("Donjon".into()),
                    text: None,
                },
            ],
            ..CollectRow::default()
        };
        assert_eq!(sources_of(Some(&row)), ["Quête : MSQ", "Donjon"]);
        assert!(sources_of(None).is_empty());
    }

    #[tokio::test]
    async fn network_reads_sheets_and_collect_entries() {
        let mut server = mockito::Server::new_async().await;
        server
            .mock("GET", "/sheet/Mount")
            .match_query(Matcher::Regex("fields=[^&]*$".into()))
            .with_body(json!({ "rows": [{ "row_id": 1 }] }).to_string())
            .create_async()
            .await;
        server
            .mock("GET", "/sheet/Mount")
            .match_query(Matcher::UrlEncoded("after".into(), "1".into()))
            .with_body(json!({ "rows": [] }).to_string())
            .create_async()
            .await;
        server
            .mock("GET", "/collect/mounts")
            .match_query(Matcher::UrlEncoded("limit".into(), "5000".into()))
            .with_body(
                json!({ "results": [{ "id": 1, "patch": "2.0" }, { "id": "bad" }, { "id": 2 }] })
                    .to_string(),
            )
            .create_async()
            .await;
        let net = mock_network(&server.url());

        assert_eq!(
            net.sheet("Mount", "Singular", "fr")
                .await
                .unwrap()
                .rows
                .len(),
            1
        );
        let collect = net.collect("mounts").await;
        assert_eq!(collect.iter().map(|r| r.id).collect::<Vec<_>>(), [1, 2]);
        assert_eq!(collect[0].patch.as_deref(), Some("2.0"));
        assert!(net.collect("missing").await.is_empty());
    }
}
