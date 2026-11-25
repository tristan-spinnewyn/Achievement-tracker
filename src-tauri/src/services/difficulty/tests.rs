use super::*;
use crate::repo::test_support::{achievement, empty_store};

fn ach(name: &str, points: u32, kind_id: u32, category_id: u32, patch: &str) -> Achievement {
    Achievement {
        points,
        kind_id,
        category_id,
        patch: Some(patch.into()),
        ..achievement(1, name)
    }
}

fn score(a: &Achievement) -> f64 {
    calculate_difficulty(a, &DifficultyWeights::default()).score
}

fn plain(name: &str) -> f64 {
    score(&ach(name, 10, 0, 0, "2.0"))
}

#[test]
fn points_increase_the_score_with_saturation() {
    let s = |p| score(&ach("x", p, 0, 0, "2.0"));
    assert!(s(5) < s(20) && s(20) < s(100));
    assert!(s(200) - s(100) < POINTS_CAP);
    assert!(s(0) < s(100));
}

#[test]
fn content_tiers_are_ordered() {
    let base = plain("Tombeur de Titan");
    let unreal = plain("Tombeur de Titan (irréel)");
    let extreme = plain("Tombeur de Titan (extrême)");
    let savage = plain("Tombeur de Titan (sadique)");
    let ultimate = plain("La Légende d’Alexander (ultime)");
    assert!(base < unreal && unreal < extreme && extreme < savage && savage < ultimate);
    assert_eq!(plain("Boss (savage)"), plain("Boss (sadique)"));
}

#[test]
fn an_ultimate_is_extreme() {
    let d = calculate_difficulty(
        &ach("La Légende d’Alexander (ultime)", 50, 1, 4, "2.0"),
        &DifficultyWeights::default(),
    );
    assert_eq!(d.level, DifficultyLevel::Extreme);
}

#[test]
fn grind_and_description_are_read() {
    let with = |description: &str| Achievement {
        description: description.into(),
        ..ach("x", 10, 0, 0, "2.0")
    };
    assert!(score(&with("Vaincre 10 000 ennemis.")) > score(&with("Vaincre 100 ennemis.")));
    assert!(
        score(&with("Vaincre 5000 ennemis.")) > score(&with("Objet numéro 5000 du catalogue."))
    );
}

#[test]
fn contextual_bonuses_apply() {
    let normal = ach("x", 10, 0, 0, "2.0");
    let seasonal = Achievement {
        is_seasonal: Some(true),
        ..normal.clone()
    };
    assert!(score(&seasonal) > score(&normal));
    assert!(score(&ach("x", 10, 0, 0, "7.0")) > score(&normal));
    // max(kind 30, category 55), not the sum.
    assert_eq!(
        score(&ach("x", 10, 1, 4, "2.0")),
        score(&ach("x", 10, 0, 4, "2.0"))
    );
}

#[test]
fn classification_bounds_are_continuous() {
    assert_eq!(classify(0.0).level, DifficultyLevel::VeryEasy);
    assert_eq!(classify(20.0).level, DifficultyLevel::VeryEasy);
    assert_eq!(classify(20.2).level, DifficultyLevel::Easy);
    assert_eq!(classify(40.5).level, DifficultyLevel::Medium);
    assert_eq!(classify(80.0).level, DifficultyLevel::Hard);
    assert_eq!(classify(100.4).level, DifficultyLevel::Extreme);
    let d = classify(33.333);
    assert_eq!(
        (
            d.score,
            d.level_name.as_str(),
            d.color.as_str(),
            d.stars.as_str()
        ),
        (33.3, "Facile", "#84cc16", "⭐⭐")
    );
}

#[test]
fn a_trivial_achievement_is_easy() {
    let d = calculate_difficulty(
        &ach("Niveau 10", 5, 8, 35, "2.0"),
        &DifficultyWeights::default(),
    );
    assert!(matches!(
        d.level,
        DifficultyLevel::VeryEasy | DifficultyLevel::Easy
    ));
}

fn store_with(list: Vec<Achievement>) -> crate::repo::test_support::TestStore {
    let mut t = empty_store();
    t.store.catalog.achievements = list;
    t.store.reindex();
    t
}

fn sample_list() -> Vec<Achievement> {
    vec![
        Achievement {
            id: 1,
            ..ach("Facile", 5, 0, 0, "2.0")
        },
        Achievement {
            id: 2,
            ..ach("Dur (ultime)", 50, 1, 4, "7.0")
        },
        Achievement {
            id: 3,
            ..ach("Moyen (extrême)", 10, 1, 3, "5.0")
        },
    ]
}

#[test]
fn refresh_scores_every_catalog_achievement() {
    let mut t = store_with(sample_list());
    assert_eq!(refresh_difficulties(&mut t.store), 3);
    assert_eq!(t.store.difficulties.len(), 3);
    assert_eq!(t.store.difficulties[&2].level, DifficultyLevel::Extreme);
}

#[test]
fn sorts_and_filters_ids() {
    let mut t = store_with(sample_list());
    refresh_difficulties(&mut t.store);
    assert_eq!(ids_by_score(&t.store, SortDir::Asc), [1, 3, 2]);
    assert_eq!(ids_by_score(&t.store, SortDir::Desc), [2, 3, 1]);
    assert_eq!(ids_by_level(&t.store, Some(DifficultyLevel::Extreme)), [2]);
    assert_eq!(ids_by_level(&t.store, None), [1, 2, 3]);
}

#[test]
fn stats_aggregate_total_average_and_extremes() {
    let mut t = store_with(sample_list());
    refresh_difficulties(&mut t.store);
    let stats = difficulty_stats(&t.store);
    assert_eq!(stats.total, 3);
    assert_eq!(stats.by_level.len(), 6);
    assert_eq!(stats.by_level[&DifficultyLevel::Extreme], 1);
    assert!(stats.average_score > 0.0);
    assert_eq!(stats.hardest.unwrap().id, 2);
    assert_eq!(stats.easiest.unwrap().name, "Facile");
}

#[test]
fn stats_of_an_empty_catalog() {
    let t = empty_store();
    let stats = difficulty_stats(&t.store);
    assert_eq!((stats.total, stats.average_score), (0, 0.0));
    assert!(stats.hardest.is_none() && stats.easiest.is_none());
}
