//! Rebuilds the achievement catalog from XIVAPI v2, with the patch of each
//! achievement from FFXIV Collect (port of `refreshCatalogFromXivapi`).

use std::collections::HashMap;

use chrono::{DateTime, Utc};
use reqwest::Url;
use serde_json::Value;

use crate::models::catalog::{Achievement, AchievementCategory, AchievementKind, CatalogData};
use crate::models::settings::Language;
use crate::net::http::FetchError;
use crate::net::network::Network;
use crate::shared::timestamps::iso_timestamp;

const FIELDS: &str = "Name,Description,Points,Icon,AchievementCategory";
const PAGE_SIZE: &str = "500";
/// Safety stop: the catalog fits in about ten pages.
const MAX_PAGES: usize = 51;

/// Downloads the whole catalog. Patches are best-effort: without FFXIV Collect they stay unknown.
pub async fn fetch_catalog(
    net: &Network,
    language: Language,
    now: DateTime<Utc>,
) -> Result<CatalogData, FetchError> {
    let mut parsed = ParsedCatalog::default();
    let mut version = String::new();
    let mut after: Option<u64> = None;
    for _ in 0..MAX_PAGES {
        let data = net.http.get_json(&page_url(net, language, after)?).await?;
        if let Some(v) = data.get("version").and_then(Value::as_str) {
            version = v.to_owned();
        }
        let rows = data
            .get("rows")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let Some(last_id) = rows
            .last()
            .and_then(|r| r.get("row_id"))
            .and_then(Value::as_u64)
        else {
            break;
        };
        rows.iter().for_each(|row| parsed.add_row(row));
        after = Some(last_id);
    }
    merge_patches(net, &mut parsed.achievements).await;

    parsed.kinds.sort_by_key(|k| k.order);
    parsed.categories.sort_by_key(|c| c.order);
    Ok(CatalogData {
        generated_at: Some(iso_timestamp(now)),
        game_version: (!version.is_empty()).then_some(version),
        kinds: parsed.kinds,
        categories: parsed.categories,
        achievements: parsed.achievements,
    })
}

fn page_url(net: &Network, language: Language, after: Option<u64>) -> Result<String, FetchError> {
    let after = after.map(|a| a.to_string());
    let mut params = vec![
        ("language", language.code()),
        ("limit", PAGE_SIZE),
        ("fields", FIELDS),
    ];
    if let Some(after) = &after {
        params.push(("after", after));
    }
    let base = format!("{}/Achievement", net.endpoints.xivapi_sheets);
    Url::parse_with_params(&base, &params)
        .map(String::from)
        .map_err(|err| FetchError::InvalidBody(format!("bad URL {base}: {err}")))
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
        let fields = row.get("fields");
        let field = |name: &str| fields.and_then(|f| f.get(name));
        let name = text(field("Name")).trim().to_owned();
        if name.is_empty() {
            return;
        }
        let category = field("AchievementCategory");
        let kind = category
            .and_then(|c| c.get("fields"))
            .and_then(|f| f.get("AchievementKind"));
        let category_id = relation_id(category);
        let kind_id = relation_id(kind);
        if let Some(category) =
            category.filter(|_| !self.categories.iter().any(|c| c.id == category_id))
        {
            self.categories.push(AchievementCategory {
                id: category_id,
                kind_id,
                name: text(category.get("fields").and_then(|f| f.get("Name"))),
                order: number(category.get("fields").and_then(|f| f.get("Order"))),
            });
        }
        if let Some(kind) = kind.filter(|_| !self.kinds.iter().any(|k| k.id == kind_id)) {
            self.kinds.push(AchievementKind {
                id: kind_id,
                name: text(kind.get("fields").and_then(|f| f.get("Name"))),
                order: number(kind.get("fields").and_then(|f| f.get("Order"))),
            });
        }
        self.achievements.push(Achievement {
            id,
            name,
            description: text(field("Description")),
            points: field("Points")
                .and_then(Value::as_u64)
                .and_then(|p| u32::try_from(p).ok())
                .unwrap_or(0),
            category_id,
            kind_id,
            icon_path: field("Icon")
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

/// Id of an XIVAPI relation (`row_id`, or `value` for some nested ones).
fn relation_id(relation: Option<&Value>) -> u32 {
    relation
        .and_then(|r| r.get("row_id").or_else(|| r.get("value")))
        .and_then(Value::as_u64)
        .and_then(|id| u32::try_from(id).ok())
        .unwrap_or(0)
}

/// Like `String(value ?? '')` for the strings and numbers XIVAPI returns.
fn text(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Number(n)) => n.to_string(),
        _ => String::new(),
    }
}

fn number(value: Option<&Value>) -> i64 {
    value.and_then(Value::as_f64).map_or(0, |n| n as i64)
}

/// Fills in the patch of each achievement from FFXIV Collect; failures are ignored.
async fn merge_patches(net: &Network, achievements: &mut [Achievement]) {
    let url = format!("{}/achievements?limit=10000", net.endpoints.ffxiv_collect);
    let Ok(data) = net.http.get_json(&url).await else {
        return;
    };
    let patches: HashMap<u64, &str> = data
        .get("results")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
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
