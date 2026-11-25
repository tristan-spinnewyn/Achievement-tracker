//! Default context weights of the difficulty score (kind, category, patch recency).

use std::collections::BTreeMap;

use serde::Serialize;

/// Weight per kind id: the more demanding the kind, the higher.
const KIND_WEIGHTS: [(u32, f64); 10] = [
    (0, 0.0),   // Unknown
    (1, 30.0),  // Battle (PvE)
    (2, 25.0),  // PvP
    (3, 10.0),  // Character
    (4, 15.0),  // Items
    (5, 20.0),  // Crafting & gathering
    (8, 5.0),   // Quests
    (11, 20.0), // Exploration
    (12, 25.0), // Grand Companies
    (13, 40.0), // Legacy
];

/// Weight per category id.
const CATEGORY_WEIGHTS: [(u32, f64); 65] = [
    // Battle
    (54, 40.0),
    (5, 45.0),
    (6, 40.0),
    (2, 35.0),
    (10, 38.0),
    (9, 37.0),
    (3, 50.0),
    (4, 55.0),
    // Character
    (12, 10.0),
    (13, 15.0),
    (14, 15.0),
    (15, 20.0),
    (16, 20.0),
    // Items (relic weapons and tools included)
    (19, 15.0),
    (20, 18.0),
    (21, 22.0),
    (22, 20.0),
    (23, 25.0),
    (62, 60.0),
    (63, 60.0),
    (64, 65.0),
    (65, 65.0),
    (68, 65.0),
    (70, 28.0),
    (75, 70.0),
    (78, 30.0),
    (81, 70.0),
    (82, 35.0),
    // Crafting & gathering
    (69, 25.0),
    (24, 30.0),
    (25, 30.0),
    (26, 30.0),
    (27, 30.0),
    (28, 30.0),
    (29, 30.0),
    (30, 30.0),
    (31, 30.0),
    (32, 35.0),
    (33, 35.0),
    (34, 35.0),
    // Quests
    (35, 10.0),
    (36, 12.0),
    (37, 15.0),
    (38, 18.0),
    // Exploration
    (39, 25.0),
    (40, 22.0),
    (41, 22.0),
    (42, 22.0),
    (43, 22.0),
    (45, 22.0),
    (46, 22.0),
    (47, 22.0),
    (48, 22.0),
    (71, 30.0),
    (72, 25.0),
    (73, 25.0),
    (74, 15.0),
    (76, 18.0),
    (77, 18.0),
    (79, 20.0),
    (80, 20.0),
    // Grand Companies
    (50, 20.0),
    (51, 25.0),
    (52, 25.0),
    (53, 25.0),
];

/// Recency factor per known patch (~0.5 oldest .. 1.2 most recent), by expansion.
const PATCH_FACTORS: [(f64, &[&str]); 6] = [
    (
        1.2,
        &[
            "7.0", "7.01", "7.05", "7.1", "7.11", "7.15", "7.2", "7.21", "7.25", "7.3", "7.31",
            "7.35", "7.4", "7.41", "7.45", "7.5", "7.51", "7.55",
        ],
    ),
    (
        1.1,
        &[
            "6.0", "6.01", "6.05", "6.1", "6.11", "6.15", "6.2", "6.21", "6.25", "6.3", "6.31",
            "6.35", "6.4", "6.45", "6.5", "6.51", "6.55", "6.57", "6.58",
        ],
    ),
    (
        1.0,
        &[
            "5.0", "5.01", "5.05", "5.1", "5.11", "5.15", "5.2", "5.21", "5.25", "5.3", "5.31",
            "5.35", "5.4", "5.41", "5.45", "5.5", "5.51", "5.55",
        ],
    ),
    (
        0.9,
        &[
            "4.0", "4.01", "4.05", "4.1", "4.11", "4.15", "4.2", "4.21", "4.25", "4.3", "4.31",
            "4.35", "4.4", "4.41", "4.45",
        ],
    ),
    (
        0.8,
        &[
            "3.0", "3.01", "3.05", "3.1", "3.11", "3.15", "3.2", "3.21", "3.25", "3.3", "3.31",
            "3.35", "3.4", "3.41", "3.45",
        ],
    ),
    (
        0.5,
        &[
            "2.0", "2.1", "2.2", "2.21", "2.25", "2.3", "2.31", "2.35", "2.4", "2.41", "2.45",
            "2.5", "2.51", "2.55",
        ],
    ),
];

/// Weights used by the score; serialized as `{ kind, category, patch }` for the settings view.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DifficultyWeights {
    #[serde(rename = "kind")]
    pub kind_weights: BTreeMap<u32, f64>,
    #[serde(rename = "category")]
    pub category_weights: BTreeMap<u32, f64>,
    #[serde(rename = "patch")]
    pub patch_weights: BTreeMap<String, f64>,
}

impl Default for DifficultyWeights {
    fn default() -> Self {
        Self {
            kind_weights: KIND_WEIGHTS.into_iter().collect(),
            category_weights: CATEGORY_WEIGHTS.into_iter().collect(),
            patch_weights: PATCH_FACTORS
                .iter()
                .flat_map(|(factor, patches)| {
                    patches.iter().map(move |p| ((*p).to_owned(), *factor))
                })
                .collect(),
        }
    }
}

impl DifficultyWeights {
    /// Recency factor of a patch; patches missing from the table fall back to their expansion.
    pub fn patch_factor(&self, patch: Option<&str>) -> f64 {
        if let Some(factor) = patch.and_then(|p| self.patch_weights.get(p)) {
            return *factor;
        }
        let major = patch
            .and_then(|p| p.split('.').next())
            .and_then(|m| m.parse::<u32>().ok())
            .unwrap_or(0);
        match major {
            7.. => 1.2,
            6 => 1.1,
            5 => 1.0,
            4 => 0.9,
            3 => 0.8,
            _ => 0.5,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_tables_match_the_ts_ones() {
        let w = DifficultyWeights::default();
        assert_eq!(w.kind_weights.len(), 10);
        assert_eq!(w.kind_weights[&13], 40.0);
        assert_eq!(w.category_weights.len(), 65);
        assert_eq!(w.category_weights[&4], 55.0);
        assert_eq!(w.category_weights[&75], 70.0);
        assert_eq!(w.patch_weights.len(), 99);
        assert_eq!(w.patch_weights["6.58"], 1.1);
    }

    #[test]
    fn patch_factor_falls_back_to_the_expansion() {
        let w = DifficultyWeights::default();
        assert_eq!(w.patch_factor(Some("7.51")), 1.2);
        assert_eq!(w.patch_factor(Some("7.9")), 1.2);
        assert_eq!(w.patch_factor(Some("6.6")), 1.1);
        assert_eq!(w.patch_factor(Some("5.9")), 1.0);
        assert_eq!(w.patch_factor(Some("4.9")), 0.9);
        assert_eq!(w.patch_factor(Some("3.9")), 0.8);
        assert_eq!(w.patch_factor(Some("1.0")), 0.5);
        assert_eq!(w.patch_factor(Some("x")), 0.5);
        assert_eq!(w.patch_factor(None), 0.5);
    }

    #[test]
    fn serializes_with_the_settings_view_keys() {
        let json = serde_json::to_value(DifficultyWeights::default()).unwrap();
        assert_eq!(json["kind"]["1"], 30.0);
        assert_eq!(json["category"]["4"], 55.0);
        assert_eq!(json["patch"]["2.0"], 0.5);
    }
}
