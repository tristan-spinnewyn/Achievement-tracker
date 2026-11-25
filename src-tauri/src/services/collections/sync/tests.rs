use super::*;
use crate::models::collections::{CollectionItem, CollectionsData};
use crate::net::network::test_support::mock_network;
use crate::repo::test_support::{empty_store, item};
use crate::services::lodestone::NOT_FOUND_MESSAGE;

const BASE: &str = "/lodestone/fr/character/4242";

fn now() -> DateTime<Utc> {
    "2026-11-25T10:00:00Z".parse().unwrap()
}

fn tooltip(name: &str, kind: &str) -> String {
    format!(r#"<div class="x__header__{kind}">{name}</div>"#)
}

/// Same data set as `test/collectionsSync.test.ts`.
fn state(character_id: Option<&str>) -> (AppState, tempfile::TempDir) {
    let (mut store, dir) = empty_store().into_parts();
    let with_aliases = |mut it: CollectionItem, aliases: &[&str]| {
        it.aliases = aliases.iter().map(|a| (*a).to_owned()).collect();
        it
    };
    store.collections = CollectionsData {
        items: vec![
            with_aliases(item(CollectionType::Mount, 1, "7.0"), &["licorne"]),
            with_aliases(
                item(CollectionType::Mount, 2, "7.0"),
                &["chocobo d'or & co"],
            ),
            with_aliases(item(CollectionType::Emote, 3, "7.0"), &["danse"]),
        ],
        ..CollectionsData::default()
    };
    store.reindex();
    store.user.settings.lodestone_character_id = character_id.map(Into::into);
    store.user.settings.region = crate::models::settings::Region::Fr;
    (AppState::new(store), dir)
}

#[test]
fn only_lodestone_listed_collections_are_syncable() {
    assert_eq!(lodestone_path(CollectionType::Mount), Some("mount"));
    assert_eq!(
        lodestone_path(CollectionType::Faceaccessory),
        Some("faceaccessory")
    );
    assert_eq!(lodestone_path(CollectionType::Orchestrion), None);
}

#[test]
fn decodes_numeric_and_named_entities() {
    assert_eq!(
        decode_entities("Chocobo d&#39;or &amp; co"),
        "Chocobo d'or & co"
    );
    assert_eq!(decode_entities("D&#x61;nse"), "Danse");
    assert_eq!(
        decode_entities("&quot;x&quot; &lt;&gt; &APOS;"),
        "\"x\" <> '"
    );
    assert_eq!(decode_entities("&nbsp;&#xZZ;"), "&nbsp;&#xZZ;");
}

#[test]
fn extracts_distinct_hashes_and_tooltip_names() {
    let html = "mount/tooltip/aa mount/tooltip/bb mount/tooltip/aa minion/tooltip/cc";
    assert_eq!(tooltip_hashes(html, "mount"), ["aa", "bb"]);
    assert_eq!(
        tooltip_name(&tooltip(" Licorne ", "label")).as_deref(),
        Some("Licorne")
    );
    assert_eq!(
        tooltip_name(&tooltip("D&#x61;nse", "name")).as_deref(),
        Some("Danse")
    );
    assert_eq!(tooltip_name("<div>nothing</div>"), None);
}

#[tokio::test]
async fn rejects_a_collection_the_lodestone_does_not_list() {
    let (state, _dir) = state(Some("4242"));
    let result = sync_collection(
        &state,
        &Network::default(),
        CollectionType::Orchestrion,
        now(),
    )
    .await
    .unwrap();
    assert!(!result.ok);
    assert!(result.message.contains("n'est pas synchronisable"));
    assert!(state.store().user.sync_log[0]
        .message
        .starts_with("[orchestrion] "));
}

#[tokio::test]
async fn requires_a_character_id() {
    for id in [None, Some("abc")] {
        let (state, _dir) = state(id);
        let result = sync_collection(&state, &Network::default(), CollectionType::Mount, now())
            .await
            .unwrap();
        assert!(result.message.contains("Aucun ID"), "{id:?}");
    }
}

#[tokio::test]
async fn resolves_tooltips_caches_them_and_applies_ownership() {
    let mut server = mockito::Server::new_async().await;
    let xhr = ("x-requested-with", "XMLHttpRequest");
    let page = server
        .mock("GET", format!("{BASE}/mount/").as_str())
        .match_header(xhr.0, xhr.1)
        .with_body(
            "mount/tooltip/aa mount/tooltip/bb mount/tooltip/aa mount/tooltip/cc mount/tooltip/dd",
        )
        .expect(2)
        .create_async()
        .await;
    let known = server
        .mock("GET", format!("{BASE}/mount/tooltip/aa").as_str())
        .with_body(tooltip("Licorne", "label"))
        .expect(1)
        .create_async()
        .await;
    server
        .mock("GET", format!("{BASE}/mount/tooltip/bb").as_str())
        .with_body(tooltip("Chocobo d&#39;or &amp; co", "label"))
        .create_async()
        .await;
    server
        .mock("GET", format!("{BASE}/mount/tooltip/cc").as_str())
        .with_body(tooltip("Inconnue", "label"))
        .create_async()
        .await;
    let failing = server
        .mock("GET", format!("{BASE}/mount/tooltip/dd").as_str())
        .with_status(503)
        .expect(2)
        .create_async()
        .await;
    let (state, _dir) = state(Some(
        "https://eu.finalfantasyxiv.com/lodestone/character/4242/",
    ));
    let net = mock_network(&server.url());

    let first = sync_collection(&state, &net, CollectionType::Mount, now())
        .await
        .unwrap();

    assert!(first.ok, "{}", first.message);
    assert_eq!((first.matched, first.unmatched, first.newly), (2, 1, 2));
    assert_eq!(
        first.message,
        "2 reconnu(s) · 2 nouveau(x) · 1 non reconnu(s) (3 téléchargé(s))."
    );
    assert_eq!(first.at, "2026-11-25T10:00:00.000Z");
    {
        let store = state.store();
        assert_eq!(store.user.collection_hash_cache["mount:aa"], "Licorne");
        assert!(store.user.collections["mount:1"].owned);
        assert_eq!(
            store.user.sync_log[0].message,
            format!("[mount] {}", first.message)
        );
    }

    let again = sync_collection(&state, &net, CollectionType::Mount, now())
        .await
        .unwrap();

    assert!(again.message.contains("3 en cache"), "{}", again.message);
    assert_eq!(again.newly, 0);
    page.assert_async().await;
    known.assert_async().await;
    failing.assert_async().await;
}

#[tokio::test]
async fn decodes_names_and_reads_emote_labels() {
    let mut server = mockito::Server::new_async().await;
    server
        .mock("GET", format!("{BASE}/emote/").as_str())
        .with_body("emote/tooltip/ee emote/tooltip/ff")
        .create_async()
        .await;
    server
        .mock("GET", format!("{BASE}/emote/tooltip/ee").as_str())
        .with_body(tooltip("D&#x61;nse", "name"))
        .create_async()
        .await;
    server
        .mock("GET", format!("{BASE}/emote/tooltip/ff").as_str())
        .with_body(tooltip("&quot;x&quot; &lt;&gt; &apos;", "name"))
        .create_async()
        .await;
    let (state, _dir) = state(Some("4242"));

    let result = sync_collection(
        &state,
        &mock_network(&server.url()),
        CollectionType::Emote,
        now(),
    )
    .await
    .unwrap();

    assert_eq!(result.matched, 1);
    assert_eq!(
        state.store().user.collection_hash_cache["emote:ff"],
        "\"x\" <> '"
    );
}

#[tokio::test]
async fn reports_a_private_collection_and_lodestone_errors() {
    let mut server = mockito::Server::new_async().await;
    server
        .mock("GET", format!("{BASE}/minion/").as_str())
        .with_body("<html>rien</html>")
        .create_async()
        .await;
    server
        .mock("GET", format!("{BASE}/mount/").as_str())
        .with_body("<h1>Character Not Found</h1>")
        .create_async()
        .await;
    let (state, _dir) = state(Some("4242"));
    let net = mock_network(&server.url());

    let empty = sync_collection(&state, &net, CollectionType::Minion, now())
        .await
        .unwrap();
    assert!(!empty.ok);
    assert!(empty.message.contains("Liste vide"));

    let missing = sync_collection(&state, &net, CollectionType::Mount, now())
        .await
        .unwrap();
    assert_eq!(missing.message, NOT_FOUND_MESSAGE);
}
