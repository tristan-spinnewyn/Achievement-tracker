//! External services the app talks to, and how (shared by the network commands).

use std::time::Duration;

use super::http::{HttpClient, RetryPolicy};

/// Base URLs of the external services; tests point them at a local mock server.
#[derive(Debug, Clone, PartialEq)]
pub struct Endpoints {
    /// XIVAPI v2 sheets, e.g. `{xivapi_sheets}/Achievement`.
    pub xivapi_sheets: String,
    /// XIVAPI v2 asset endpoint (icons).
    pub xivapi_asset: String,
    /// FFXIV Collect API.
    pub ffxiv_collect: String,
    /// Lodestone character pages; `{region}` is replaced by the regional subdomain.
    pub lodestone_character: String,
}

impl Default for Endpoints {
    fn default() -> Self {
        Self {
            xivapi_sheets: "https://v2.xivapi.com/api/sheet".into(),
            xivapi_asset: "https://v2.xivapi.com/api/asset".into(),
            ffxiv_collect: "https://ffxivcollect.com/api".into(),
            lodestone_character: "https://{region}.finalfantasyxiv.com/lodestone/character".into(),
        }
    }
}

/// Managed Tauri state for the network commands.
#[derive(Debug, Clone)]
pub struct Network {
    pub http: HttpClient,
    pub endpoints: Endpoints,
    /// Pause between two Lodestone pages, to stay polite with the site.
    pub lodestone_delay: Duration,
}

impl Default for Network {
    fn default() -> Self {
        Self {
            http: HttpClient::new(RetryPolicy::default()),
            endpoints: Endpoints::default(),
            lodestone_delay: Duration::from_millis(350),
        }
    }
}

#[cfg(test)]
pub mod test_support {
    use super::*;

    /// A network pointing every service at the mock server, without retries or pauses.
    pub fn mock_network(server_url: &str) -> Network {
        Network {
            http: HttpClient::new(RetryPolicy {
                retries: 0,
                base_delay: Duration::from_millis(1),
                timeout: Duration::from_secs(5),
            }),
            endpoints: Endpoints {
                xivapi_sheets: format!("{server_url}/sheet"),
                xivapi_asset: format!("{server_url}/asset"),
                ffxiv_collect: format!("{server_url}/collect"),
                lodestone_character: format!("{server_url}/lodestone/{{region}}/character"),
            },
            lodestone_delay: Duration::ZERO,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_point_at_the_real_services() {
        let n = Network::default();
        assert_eq!(n.endpoints.xivapi_sheets, "https://v2.xivapi.com/api/sheet");
        assert!(n.endpoints.lodestone_character.contains("{region}"));
        assert_eq!(n.lodestone_delay, Duration::from_millis(350));
    }
}
