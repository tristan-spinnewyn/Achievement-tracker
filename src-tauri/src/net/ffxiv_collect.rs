//! FFXIV Collect API: optional data (patches, acquisition sources), read best-effort.

use serde_json::Value;

use super::network::Network;

/// The `results` of an endpoint, or None when the service fails in any way.
pub async fn fetch_results(net: &Network, endpoint: &str, limit: u32) -> Option<Vec<Value>> {
    let url = format!("{}/{endpoint}?limit={limit}", net.endpoints.ffxiv_collect);
    let data = net.http.get_json(&url).await.ok()?;
    data.get("results")?.as_array().cloned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::net::network::test_support::mock_network;
    use mockito::Matcher;
    use serde_json::json;

    #[tokio::test]
    async fn returns_the_results_or_nothing() {
        let mut server = mockito::Server::new_async().await;
        server
            .mock("GET", "/collect/mounts")
            .match_query(Matcher::UrlEncoded("limit".into(), "5000".into()))
            .with_body(json!({ "results": [{ "id": 1 }] }).to_string())
            .create_async()
            .await;
        server
            .mock("GET", "/collect/minions")
            .match_query(Matcher::Any)
            .with_status(500)
            .create_async()
            .await;
        server
            .mock("GET", "/collect/emotes")
            .match_query(Matcher::Any)
            .with_body("{}")
            .create_async()
            .await;
        let net = mock_network(&server.url());

        assert_eq!(
            fetch_results(&net, "mounts", 5000).await,
            Some(vec![json!({ "id": 1 })])
        );
        assert_eq!(fetch_results(&net, "minions", 5000).await, None);
        assert_eq!(fetch_results(&net, "emotes", 5000).await, None);
    }
}
