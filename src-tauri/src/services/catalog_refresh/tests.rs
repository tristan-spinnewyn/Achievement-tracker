use super::*;
use crate::net::network::test_support::mock_network;
use mockito::Matcher;
use serde_json::json;

fn now() -> DateTime<Utc> {
    "2026-11-25T10:00:00Z".parse().unwrap()
}

fn row(id: u32, name: &str, category: u32, kind: u32) -> Value {
    json!({ "row_id": id, "fields": {
        "Name": name, "Description": format!("desc {id}"), "Points": 10,
        "Icon": { "path": format!("ui/icon/{id}.tex") },
        "AchievementCategory": { "row_id": category, "fields": {
            "Name": format!("Cat {category}"), "Order": 10 - category,
            "AchievementKind": { "value": kind, "fields": { "Name": format!("Kind {kind}"), "Order": kind } }
        } }
    } })
}

/// First page: the query ends with `fields` (no `after`); next pages carry `after`.
fn page(after: Option<&str>, language: &str) -> Matcher {
    let mut m = vec![
        Matcher::UrlEncoded("language".into(), language.into()),
        Matcher::UrlEncoded("limit".into(), "500".into()),
        Matcher::UrlEncoded("fields".into(), FIELDS.into()),
    ];
    match after {
        Some(after) => m.push(Matcher::UrlEncoded("after".into(), after.into())),
        None => m.push(Matcher::Regex("fields=[^&]*$".into())),
    }
    Matcher::AllOf(m)
}

async fn mock_pages(server: &mut mockito::ServerGuard, language: &str, rows: Value, last_id: &str) {
    server
        .mock("GET", "/sheet/Achievement")
        .match_query(page(None, language))
        .with_body(json!({ "version": "7.5", "rows": rows }).to_string())
        .create_async()
        .await;
    server
        .mock("GET", "/sheet/Achievement")
        .match_query(page(Some(last_id), language))
        .with_body(json!({ "rows": [] }).to_string())
        .create_async()
        .await;
}

#[tokio::test]
async fn follows_the_pagination_and_builds_kinds_categories_and_patches() {
    let mut server = mockito::Server::new_async().await;
    let rows = json!([
        row(1, "Alpha", 2, 1),
        row(2, "  ", 2, 1),
        row(3, "Gamma", 1, 1)
    ]);
    mock_pages(&mut server, "fr", rows, "3").await;
    server
        .mock("GET", "/collect/achievements")
        .match_query(Matcher::UrlEncoded("limit".into(), "10000".into()))
        .with_body(json!({ "results": [{ "id": 1, "patch": "7.1" }, { "id": 3 }] }).to_string())
        .create_async()
        .await;

    let catalog = fetch_catalog(&mock_network(&server.url()), Language::Fr, now())
        .await
        .unwrap();

    assert_eq!(catalog.game_version.as_deref(), Some("7.5"));
    assert_eq!(
        catalog.generated_at.as_deref(),
        Some("2026-11-25T10:00:00.000Z")
    );
    assert_eq!(
        catalog
            .achievements
            .iter()
            .map(|a| a.id)
            .collect::<Vec<_>>(),
        [1, 3]
    );
    let alpha = &catalog.achievements[0];
    assert_eq!((alpha.category_id, alpha.kind_id, alpha.points), (2, 1, 10));
    assert_eq!(alpha.icon_path.as_deref(), Some("ui/icon/1.tex"));
    assert_eq!(alpha.description, "desc 1");
    assert_eq!(alpha.patch.as_deref(), Some("7.1"));
    assert_eq!(catalog.achievements[1].patch, None);
    // Categories sorted by their order (8 for category 2, 9 for category 1).
    assert_eq!(
        catalog.categories.iter().map(|c| c.id).collect::<Vec<_>>(),
        [2, 1]
    );
    assert_eq!(catalog.categories[0].kind_id, 1);
    assert_eq!(catalog.kinds.len(), 1);
    assert_eq!(catalog.kinds[0].name, "Kind 1");
}

#[tokio::test]
async fn patches_are_optional() {
    let mut server = mockito::Server::new_async().await;
    mock_pages(&mut server, "en", json!([row(1, "Alpha", 1, 1)]), "1").await;
    server
        .mock("GET", "/collect/achievements")
        .match_query(Matcher::Any)
        .with_status(500)
        .create_async()
        .await;

    let catalog = fetch_catalog(&mock_network(&server.url()), Language::En, now())
        .await
        .unwrap();

    assert_eq!(catalog.achievements.len(), 1);
    assert_eq!(catalog.achievements[0].patch, None);
}

#[tokio::test]
async fn an_xivapi_error_aborts_the_refresh() {
    let mut server = mockito::Server::new_async().await;
    server
        .mock("GET", "/sheet/Achievement")
        .match_query(Matcher::Any)
        .with_status(404)
        .create_async()
        .await;

    let result = fetch_catalog(&mock_network(&server.url()), Language::Fr, now()).await;

    assert_eq!(
        result.unwrap_err().to_string(),
        "XIVAPI HTTP 404 (Achievement)"
    );
}
