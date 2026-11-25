use serde_json::json;

use super::fake_source::{base_collect, base_sheets, FakeSource};
use super::*;
use crate::models::collections::CollectionType::*;

async fn build(source: &FakeSource) -> BuiltCollections {
    build_collections(source).await.unwrap()
}

fn get(built: &BuiltCollections, kind: CollectionType, id: u32) -> &CollectionItem {
    built
        .items
        .iter()
        .find(|i| i.kind == kind && i.id == id)
        .unwrap_or_else(|| panic!("{kind:?} {id} missing"))
}

fn has(built: &BuiltCollections, kind: CollectionType, id: u32) -> bool {
    built.items.iter().any(|i| i.kind == kind && i.id == id)
}

fn base_source() -> FakeSource {
    FakeSource {
        sheets: base_sheets(),
        collect: base_collect(),
    }
}

#[tokio::test]
async fn sheet_collections_have_capitalised_names_aliases_patches_and_sources() {
    let built = build(&base_source()).await;
    assert_eq!(built.game_version, "v7.3");

    let mount = get(&built, Mount, 1);
    assert_eq!(
        (mount.name.as_str(), mount.icon_path.as_deref(), mount.order),
        ("Licorne", Some("ui/m1.tex"), 5)
    );
    assert_eq!(
        (mount.patch.as_deref(), mount.sources.clone()),
        (Some("2.0"), vec!["Quête : MSQ".to_owned()])
    );
    assert_eq!(
        mount.aliases,
        ["licorne", "unicorn", "einhorn", "ユニコーン"]
    );
    assert!(!has(&built, Mount, 2));

    let minion = get(&built, Minion, 7);
    assert_eq!(
        (minion.name.as_str(), minion.patch.as_deref()),
        ("Bébé chocobo", None)
    );
    assert!(minion.sources.is_empty());

    let glasses = get(&built, Faceaccessory, 3);
    assert_eq!((glasses.name.as_str(), glasses.order), ("Lunettes", 3));
    assert_eq!(glasses.aliases, ["lunettes"]);
}

#[tokio::test]
async fn orchestrion_rolls_have_sorted_categories_and_the_category_icon() {
    let built = build(&base_source()).await;

    let orchestrion_categories: Vec<u32> = built
        .categories
        .iter()
        .filter(|c| c.kind == Orchestrion)
        .map(|c| c.id)
        .collect();
    assert_eq!(orchestrion_categories, [3, 4]);
    let roll = get(&built, Orchestrion, 10);
    assert_eq!(
        (
            roll.description.as_str(),
            roll.icon_path.as_deref(),
            roll.category_id,
            roll.order
        ),
        ("desc", Some("ui/oc.tex"), Some(4), 2)
    );
    assert_eq!(
        (roll.patch.as_deref(), roll.sources.clone()),
        (Some("3.0"), vec!["Donjon".to_owned()])
    );
    let orphan = get(&built, Orchestrion, 13);
    assert_eq!(
        (
            orphan.icon_path.as_deref(),
            orphan.category_id,
            orphan.order
        ),
        (None, None, 13)
    );
    assert!(!has(&built, Orchestrion, 14));
}

#[tokio::test]
async fn collect_collections_use_french_names_icons_and_aliases_when_known() {
    let built = build(&base_source()).await;

    let dance = get(&built, Emote, 20);
    assert_eq!(
        (dance.name.as_str(), dance.icon_path.as_deref()),
        ("Danse", Some("ui/e.tex"))
    );
    assert_eq!(dance.aliases, ["danse", "dance"]);
    let wave = get(&built, Emote, 22);
    assert_eq!(
        (wave.name.as_str(), wave.icon_path.as_deref()),
        ("Wave", Some("ui/w.tex"))
    );
    assert!(wave.aliases.is_empty());
    assert_eq!(get(&built, Fashion, 30).name, "Parasol");
    assert_eq!(get(&built, Hairstyle, 60).icon_path, None);
    assert!(!has(&built, Hairstyle, 61));
    assert_eq!(get(&built, Barding, 70).order, 70);
    let title = get(&built, Title, 40);
    assert_eq!(
        (title.name.as_str(), title.icon_path.as_deref()),
        ("le Brave", None)
    );
}

#[tokio::test]
async fn blue_magic_takes_french_names_from_aoz_actions() {
    let built = build(&base_source()).await;
    let cannon = get(&built, Spell, 1);
    assert_eq!(
        (cannon.name.as_str(), cannon.icon_path.as_deref()),
        ("Canon à eau", Some("ui/s.tex"))
    );
    let flamethrower = get(&built, Spell, 5);
    assert_eq!(
        (
            flamethrower.name.as_str(),
            flamethrower.icon_path.as_deref()
        ),
        ("Flamethrower", Some("ui/f.tex"))
    );
}

#[tokio::test]
async fn triple_triad_cards_have_art_order_and_acquisition() {
    let built = build(&base_source()).await;
    let dodo = get(&built, Tripletriad, 1);
    assert_eq!(
        (dodo.name.as_str(), dodo.description.as_str()),
        ("Dodo", "Un oiseau")
    );
    assert_eq!(
        (dodo.icon_path.as_deref(), dodo.order),
        (Some("ui/icon/088000/088001.tex"), 9)
    );
    assert_eq!(dodo.sources, ["Tournoi"]);
    let goblin = get(&built, Tripletriad, 3);
    assert_eq!(goblin.order, 3);
    assert!(goblin.sources.is_empty());
    assert!(!has(&built, Tripletriad, 2));
}

#[tokio::test]
async fn the_bestiary_merges_xivapi_and_collect() {
    let built = build(&base_source()).await;
    let cu_sith = get(&built, Beast, 1);
    assert_eq!(
        (
            cu_sith.name.as_str(),
            cu_sith.description.as_str(),
            cu_sith.category_id
        ),
        ("Cu sith", "Chien", Some(2))
    );
    assert_eq!(
        (cu_sith.icon_path.as_deref(), cu_sith.patch.as_deref()),
        (Some("ui/icon/123000/123456_hr1.tex"), Some("7.5"))
    );
    let wolf = get(&built, Beast, 3);
    assert_eq!(
        (
            wolf.name.as_str(),
            wolf.description.as_str(),
            wolf.icon_path.as_deref()
        ),
        ("Wolf", "Loup", Some("ui/wolf.tex"))
    );
    assert_eq!(
        (wolf.category_id, wolf.patch.as_deref()),
        (None, Some("7.56"))
    );
    let bombo = get(&built, Beast, 4);
    assert_eq!(
        (
            bombo.name.as_str(),
            bombo.icon_path.as_deref(),
            bombo.category_id
        ),
        ("Bombo", None, None)
    );
    let unnamed = get(&built, Beast, 5);
    assert_eq!(
        (unnamed.name.as_str(), unnamed.icon_path.as_deref()),
        ("Bête #5", Some("ui/i5.tex"))
    );
    assert_eq!(
        built.categories.iter().filter(|c| c.kind == Beast).count(),
        8
    );
}

#[tokio::test]
async fn carries_on_without_ffxiv_collect_or_xbmpet() {
    let mut sheets = base_sheets();
    sheets.remove("XBMPet");
    let source = FakeSource {
        sheets,
        collect: [("beasts", vec![json!({ "id": 2, "name": "Rat" })])].into(),
    };

    let built = build(&source).await;

    assert_eq!(get(&built, Mount, 1).patch, None);
    let beasts: Vec<&CollectionItem> = built.items.iter().filter(|i| i.kind == Beast).collect();
    assert_eq!(beasts.len(), 1);
    assert_eq!(
        (
            beasts[0].id,
            beasts[0].name.as_str(),
            beasts[0].icon_path.as_deref()
        ),
        (2, "Rat", None)
    );
    assert_eq!(beasts[0].patch.as_deref(), Some("7.56"));
}

#[tokio::test]
async fn an_error_on_a_required_sheet_aborts_the_build() {
    let mut sheets = base_sheets();
    sheets.remove("Mount");
    let source = FakeSource {
        sheets,
        collect: Default::default(),
    };

    let err = build_collections(&source).await.unwrap_err();

    assert_eq!(err.to_string(), "XIVAPI HTTP 404 (Mount)");
}

#[test]
fn stored_data_is_dated_and_falls_back_to_the_catalog_version() {
    let now = "2026-11-25T10:00:00Z".parse().unwrap();
    let built = BuiltCollections {
        game_version: String::new(),
        categories: vec![],
        items: vec![],
    };

    let fallback = built.clone().into_data(Some("7.5"), now);
    assert_eq!(fallback.game_version.as_deref(), Some("7.5"));
    assert_eq!(
        fallback.generated_at.as_deref(),
        Some("2026-11-25T10:00:00.000Z")
    );

    let own = BuiltCollections {
        game_version: "v7.3".into(),
        ..built.clone()
    }
    .into_data(Some("7.5"), now);
    assert_eq!(own.game_version.as_deref(), Some("v7.3"));
    assert_eq!(built.into_data(None, now).game_version, None);
}
