//! Builds the collections catalog from XIVAPI v2 and FFXIV Collect.

mod collect;
mod special;

use std::collections::HashMap;

use chrono::{DateTime, Utc};
use serde_json::Value;

use crate::models::collections::{
    CollectionCategory, CollectionItem, CollectionType, CollectionsData,
};
use crate::net::xivapi::{field, integer, text, XivapiError};
use crate::services::collections::source::{capitalize, sources_of, CollectRow, CollectionSource};
use crate::shared::names::normalize_name;
use crate::shared::timestamps::iso_timestamp;

/// Languages whose names are added as Lodestone matching aliases (besides French).
const ALIAS_LANGUAGES: [&str; 3] = ["en", "de", "ja"];

/// The whole collections catalog, before it is stored.
#[derive(Debug, Clone, PartialEq)]
pub struct BuiltCollections {
    pub game_version: String,
    pub categories: Vec<CollectionCategory>,
    pub items: Vec<CollectionItem>,
}

impl BuiltCollections {
    /// The data to store, dated; without a version from XIVAPI, the achievements catalog one is used.
    pub fn into_data(self, catalog_version: Option<&str>, now: DateTime<Utc>) -> CollectionsData {
        let game_version = Some(self.game_version)
            .filter(|v| !v.is_empty())
            .or_else(|| catalog_version.map(str::to_owned));
        CollectionsData {
            generated_at: Some(iso_timestamp(now)),
            game_version,
            categories: self.categories,
            items: self.items,
        }
    }
}

/// An item with only its identity and name; the builders fill in the rest.
fn new_item(kind: CollectionType, id: u32, name: String) -> CollectionItem {
    CollectionItem {
        kind,
        id,
        name,
        description: String::new(),
        icon_path: None,
        category_id: None,
        order: i64::from(id),
        patch: None,
        sources: vec![],
        aliases: vec![],
    }
}

fn row_id(row: &Value) -> Option<u32> {
    row.get("row_id")?
        .as_u64()
        .and_then(|id| u32::try_from(id).ok())
}

fn icon_path(row: &Value) -> Option<String> {
    field(row, &["Icon"])?
        .get("path")?
        .as_str()
        .map(str::to_owned)
}

/// Display name of a row: trimmed, capitalised when read from a `Singular` field.
fn display_name(row: &Value, name_field: &str) -> String {
    let raw = text(field(row, &[name_field])).trim().to_owned();
    if name_field == "Singular" {
        capitalize(&raw)
    } else {
        raw
    }
}

fn add_alias(aliases: &mut Vec<String>, raw: &str) {
    let alias = normalize_name(raw);
    if !alias.is_empty() && !aliases.contains(&alias) {
        aliases.push(alias);
    }
}

fn collect_by_id(rows: &[CollectRow]) -> HashMap<u32, &CollectRow> {
    rows.iter().map(|r| (r.id, r)).collect()
}

/// A collection whose set is an XIVAPI sheet, with multi-language aliases.
struct SheetSpec {
    kind: CollectionType,
    sheet: &'static str,
    name_field: &'static str,
    /// Extra fields read as aliases only (e.g. the `Singular` form).
    alias_fields: &'static [&'static str],
    has_order: bool,
    /// FFXIV Collect endpoint for patch and sources.
    collect: Option<&'static str>,
}

async fn sheet_collection<S: CollectionSource>(
    source: &S,
    spec: &SheetSpec,
) -> Result<(Vec<CollectionItem>, String), XivapiError> {
    let name_fields: Vec<&str> = std::iter::once(spec.name_field)
        .chain(spec.alias_fields.iter().copied())
        .collect();
    let mut fields = name_fields.clone();
    fields.push("Icon");
    if spec.has_order {
        fields.push("Order");
    }
    let french = source.sheet(spec.sheet, &fields.join(","), "fr").await?;
    let mut items: Vec<CollectionItem> = Vec::new();
    for row in &french.rows {
        let (Some(id), name) = (row_id(row), display_name(row, spec.name_field)) else {
            continue;
        };
        if name.is_empty() {
            continue;
        }
        let mut item = new_item(spec.kind, id, name);
        item.icon_path = icon_path(row);
        if spec.has_order {
            item.order = integer(field(row, &["Order"]), i64::from(id));
        }
        name_fields
            .iter()
            .for_each(|f| add_alias(&mut item.aliases, text(field(row, &[f])).trim()));
        items.push(item);
    }
    for language in ALIAS_LANGUAGES {
        for row in source
            .sheet(spec.sheet, &name_fields.join(","), language)
            .await?
            .rows
        {
            let Some(item) = row_id(&row).and_then(|id| items.iter_mut().find(|i| i.id == id))
            else {
                continue;
            };
            name_fields
                .iter()
                .for_each(|f| add_alias(&mut item.aliases, text(field(&row, &[f])).trim()));
        }
    }
    if let Some(endpoint) = spec.collect {
        let collect = source.collect(endpoint).await;
        let by_id = collect_by_id(&collect);
        for item in &mut items {
            let row = by_id.get(&item.id).copied();
            item.patch = row.and_then(|r| r.patch.clone());
            item.sources = sources_of(row);
        }
    }
    Ok((items, french.version))
}

const MOUNTS: SheetSpec = SheetSpec {
    kind: CollectionType::Mount,
    sheet: "Mount",
    name_field: "Singular",
    alias_fields: &[],
    has_order: true,
    collect: Some("mounts"),
};
const MINIONS: SheetSpec = SheetSpec {
    kind: CollectionType::Minion,
    sheet: "Companion",
    name_field: "Singular",
    alias_fields: &[],
    has_order: true,
    collect: Some("minions"),
};
const FACE_ACCESSORIES: SheetSpec = SheetSpec {
    kind: CollectionType::Faceaccessory,
    sheet: "Glasses",
    name_field: "Name",
    alias_fields: &["Singular"],
    has_order: false,
    collect: None,
};

/// Builds every collection. Only a failed XIVAPI sheet aborts; FFXIV Collect is optional.
pub async fn build_collections<S: CollectionSource>(
    source: &S,
) -> Result<BuiltCollections, XivapiError> {
    let (mounts, mounts_version) = sheet_collection(source, &MOUNTS).await?;
    let (minions, minions_version) = sheet_collection(source, &MINIONS).await?;
    let (face_accessories, _) = sheet_collection(source, &FACE_ACCESSORIES).await?;
    let (orchestrion, orchestrion_categories) = special::orchestrion(source).await?;
    let mut extra = Vec::new();
    for spec in &collect::COLLECT_SPECS {
        extra.extend(collect::collect_collection(source, spec, None).await?);
    }
    let blue_magic_names = special::blue_magic_names(source).await?;
    let spells =
        collect::collect_collection(source, &collect::SPELLS, Some(&blue_magic_names)).await?;
    let triple_triad = special::triple_triad(source).await?;
    let beasts = special::beasts(source).await;

    let game_version = if mounts_version.is_empty() {
        minions_version
    } else {
        mounts_version
    };
    let mut categories = orchestrion_categories;
    categories.extend(special::beast_categories());
    let items = [
        mounts,
        minions,
        face_accessories,
        orchestrion,
        extra,
        spells,
        triple_triad,
        beasts,
    ]
    .concat();
    Ok(BuiltCollections {
        game_version,
        categories,
        items,
    })
}

#[cfg(test)]
mod fake_source;
#[cfg(test)]
mod tests;
