//! Rebuilds the achievement catalog from XIVAPI v2, with the patch of each
//! achievement from FFXIV Collect (port of `refreshCatalogFromXivapi`).

use std::collections::HashMap;

use chrono::{DateTime, Utc};
use serde_json::Value;

use crate::models::catalog::{Achievement, AchievementCategory, AchievementKind, CatalogData};
use crate::models::settings::Language;
use crate::net::ffxiv_collect::fetch_results;
use crate::net::network::Network;
use crate::net::xivapi::{fetch_sheet, field, integer, relation_id, text, XivapiError};
use crate::shared::timestamps::iso_timestamp;

const FIELDS: &str = "Name,Description,Points,Icon,AchievementCategory";
const COLLECT_LIMIT: u32 = 10_000;

/// Downloads the whole catalog. Patches are best-effort: without FFXIV Collect they stay unknown.
pub async fn fetch_catalog(
    net: &Network,
    language: Language,
    now: DateTime<Utc>,
) -> Result<CatalogData, XivapiError> {
    let sheet = fetch_sheet(net, "Achievement", FIELDS, language.code()).await?;
    let mut parsed = ParsedCatalog::default();
    sheet.rows.iter().for_each(|row| parsed.add_row(row));
    merge_patches(net, &mut parsed.achievements).await;

    parsed.kinds.sort_by_key(|k| k.order);
    parsed.categories.sort_by_key(|c| c.order);
    Ok(CatalogData {
        generated_at: Some(iso_timestamp(now)),
        game_version: (!sheet.version.is_empty()).then_some(sheet.version),
        kinds: parsed.kinds,
        categories: parsed.categories,
        achievements: parsed.achievements,
    })
}

/// Kinds, categories and achievements collected from the XIVAPI rows (first occurrence wins).
#[derive(Default)]
struct ParsedCatalog {
    kinds: Vec<AchievementKind>,
    categories: Vec<AchievementCategory>,
    achievements: Vec<Achievement>,
}

impl ParsedCatalog {
    fn add_row(&mut self, row: &Value) {
        let Some(id) = row
            .get("row_id")
            .and_then(Value::as_u64)
            .and_then(|id| u32::try_from(id).ok())
        else {
            return;
        };
        let name = text(field(row, &["Name"])).trim().to_owned();
        if name.is_empty() {
            return;
        }
        let category = field(row, &["AchievementCategory"]);
        let kind = field(row, &["AchievementCategory", "AchievementKind"]);
        let category_id = relation_id(category);
        let kind_id = relation_id(kind);
        if let Some(category) =
            category.filter(|_| !self.categories.iter().any(|c| c.id == category_id))
        {
            self.categories.push(AchievementCategory {
                id: category_id,
                kind_id,
                name: text(field(category, &["Name"])),
                order: integer(field(category, &["Order"]), 0),
            });
        }
        if let Some(kind) = kind.filter(|_| !self.kinds.iter().any(|k| k.id == kind_id)) {
            self.kinds.push(AchievementKind {
                id: kind_id,
                name: text(field(kind, &["Name"])),
                order: integer(field(kind, &["Order"]), 0),
            });
        }
        self.achievements.push(Achievement {
            id,
            name,
            description: text(field(row, &["Description"])),
            points: u32::try_from(integer(field(row, &["Points"]), 0)).unwrap_or(0),
            category_id,
            kind_id,
            icon_path: field(row, &["Icon"])
                .and_then(|i| i.get("path"))
                .and_then(Value::as_str)
                .map(str::to_owned),
            obtainable: true,
            patch: None,
            is_seasonal: None,
            seasonal_event: None,
            seasonal_end_date: None,
        });
    }
}

/// Fills in the patch of each achievement from FFXIV Collect; failures are ignored.
async fn merge_patches(net: &Network, achievements: &mut [Achievement]) {
    let Some(results) = fetch_results(net, "achievements", COLLECT_LIMIT).await else {
        return;
    };
    let patches: HashMap<u64, &str> = results
        .iter()
        .filter_map(|r| Some((r.get("id")?.as_u64()?, r.get("patch")?.as_str()?)))
        .collect();
    for achievement in achievements {
        achievement.patch = patches
            .get(&u64::from(achievement.id))
            .map(|p| (*p).to_owned());
    }
}

#[cfg(test)]
mod tests;
