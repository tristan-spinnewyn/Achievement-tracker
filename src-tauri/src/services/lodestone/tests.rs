use mockito::Matcher;

use super::*;
use crate::net::network::test_support::mock_network;
use crate::repo::test_support::sample_store;

fn now() -> DateTime<Utc> {
    "2026-11-25T10:00:00Z".parse().unwrap()
}

/// A Lodestone achievements page with `(id, unix timestamp)` entries.
fn page_html(entries: &[(u32, Option<u64>)], page: u32, total: u32) -> String {
    let items: String = entries
        .iter()
        .map(|(id, ts)| {
            let date = ts.map(|t| format!("<script>ldst_strftime({t}, 'YMD')</script>")).unwrap_or_default();
            format!(r#"<li class="entry"><a href="/lodestone/character/1/achievement/detail/{id}/">x</a>{date}</li>"#)
        })
        .collect();
    format!("<ul>{items}</ul><div>Page {page} of {total}</div>")
}

async fn mock_page(server: &mut mockito::ServerGuard, page: u32, body: String) -> mockito::Mock {
    server
        .mock("GET", "/lodestone/eu/character/123/achievement/")
        .match_query(Matcher::UrlEncoded("page".into(), page.to_string()))
        .match_header("user-agent", USER_AGENT)
        .with_body(body)
        .create_async()
        .await
}

fn state_with(character_id: Option<&str>) -> (AppState, tempfile::TempDir) {
    let (mut store, dir) = sample_store().into_parts();
    store.user.settings.lodestone_character_id = character_id.map(Into::into);
    (AppState::new(store), dir)
}

#[test]
fn extracts_the_character_id_from_an_id_or_a_url() {
    assert_eq!(extract_character_id(" 12345 ").as_deref(), Some("12345"));
    assert_eq!(
        extract_character_id("https://eu.finalfantasyxiv.com/lodestone/character/987654/")
            .as_deref(),
        Some("987654")
    );
    for bad in ["123/../../admin", "abc", ""] {
        assert_eq!(extract_character_id(bad), None, "{bad} accepted");
    }
}

#[test]
fn builds_the_regional_character_url() {
    let net = Network::default();
    assert_eq!(
        character_url(&net, Region::Ja, "42"),
        "https://jp.finalfantasyxiv.com/lodestone/character/42"
    );
}

#[test]
fn parses_ids_dates_and_page_count() {
    let (items, pages) = parse_page(&page_html(&[(42, Some(1_700_000_000)), (43, None)], 1, 3));
    assert_eq!(
        items,
        [
            LodestoneCompletion {
                id: 42,
                date: Some("2023-11-14".into())
            },
            LodestoneCompletion { id: 43, date: None },
        ]
    );
    assert_eq!(pages, 3);
    assert_eq!(parse_page("<html>nothing</html>"), (vec![], 1));
    assert_eq!(parse_page(r#"<li class="entry">no link</li>"#).0, vec![]);
}

#[tokio::test]
async fn reads_every_page() {
    let mut server = mockito::Server::new_async().await;
    let first = mock_page(&mut server, 1, page_html(&[(1, Some(1_700_000_000))], 1, 2)).await;
    let second = mock_page(&mut server, 2, page_html(&[(2, None)], 2, 2)).await;

    let (items, pages) = scrape_achievements(&mock_network(&server.url()), "123", Region::Eu)
        .await
        .unwrap();

    first.assert_async().await;
    second.assert_async().await;
    assert_eq!(pages, 2);
    assert_eq!(items.iter().map(|i| i.id).collect::<Vec<_>>(), [1, 2]);
}

#[tokio::test]
async fn reports_a_missing_character_and_network_failures() {
    let mut server = mockito::Server::new_async().await;
    server
        .mock("GET", "/lodestone/eu/character/123/achievement/")
        .match_query(Matcher::Any)
        .with_status(404)
        .with_body("<h1>Character Not Found</h1>")
        .create_async()
        .await;
    let net = mock_network(&server.url());

    assert_eq!(
        scrape_achievements(&net, "123", Region::Eu)
            .await
            .unwrap_err(),
        NOT_FOUND_MESSAGE
    );
    let failure = fetch_lodestone_text(&net, "http://127.0.0.1:1/x", &[])
        .await
        .unwrap_err();
    assert!(
        failure.starts_with("Lodestone a répondu avec une erreur : "),
        "{failure}"
    );
}

#[tokio::test]
async fn sync_requires_a_valid_character_id() {
    let (state, _dir) = state_with(Some("abc"));

    let result = sync_lodestone(&state, &Network::default(), now())
        .await
        .unwrap();

    assert!(!result.ok);
    assert!(result.message.contains("Aucun ID de personnage"));
    assert_eq!(state.store().user.sync_log[0].message, result.message);
}

#[tokio::test]
async fn sync_applies_the_achievements_and_updates_last_sync_at() {
    let mut server = mockito::Server::new_async().await;
    mock_page(
        &mut server,
        1,
        page_html(&[(1, Some(1_700_000_000)), (2, None)], 1, 1),
    )
    .await;
    let (state, _dir) = state_with(Some(
        "https://eu.finalfantasyxiv.com/lodestone/character/123/",
    ));

    let result = sync_lodestone(&state, &mock_network(&server.url()), now())
        .await
        .unwrap();

    assert!(result.ok, "{}", result.message);
    assert_eq!((result.newly_completed, result.total_completed), (2, 2));
    assert_eq!(
        result.message,
        "2 hauts faits lus (1 page(s)) · 2 nouveau(x)."
    );
    assert_eq!(result.at, "2026-11-25T10:00:00.000Z");
    let store = state.store();
    assert_eq!(
        store.user.settings.last_sync_at.as_deref(),
        Some("2026-11-25T10:00:00.000Z")
    );
    assert_eq!(
        store.user.progress["1"].completed_date.as_deref(),
        Some("2023-11-14")
    );
    assert!(store.user.sync_log[0].ok);
}

#[tokio::test]
async fn sync_reports_an_empty_list_and_scraping_errors() {
    let mut server = mockito::Server::new_async().await;
    mock_page(&mut server, 1, page_html(&[], 1, 1)).await;
    let (state, _dir) = state_with(Some("123"));
    let net = mock_network(&server.url());

    let empty = sync_lodestone(&state, &net, now()).await.unwrap();
    assert!(!empty.ok);
    assert!(empty.message.contains("Aucun haut fait public"));

    let unreachable = Network {
        endpoints: crate::net::network::Endpoints {
            lodestone_character: "http://127.0.0.1:1/{region}".into(),
            ..net.endpoints.clone()
        },
        ..net
    };
    let failed = sync_lodestone(&state, &unreachable, now()).await.unwrap();
    assert!(!failed.ok);
    assert!(failed
        .message
        .starts_with("Lodestone a répondu avec une erreur"));
    assert_eq!(state.store().user.sync_log.len(), 2);
    assert_eq!(state.store().user.settings.last_sync_at, None);
}
