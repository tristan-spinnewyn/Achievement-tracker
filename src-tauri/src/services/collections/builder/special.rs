//! Special collections: orchestrion, Blue Magic names, Triple Triad, bestiary.

use std::collections::{BTreeMap, HashMap};

use super::collect::NameOverrides;
use super::{collect_by_id, icon_path, new_item, row_id};
use crate::models::collections::{CollectionCategory, CollectionItem, CollectionType};
use crate::net::xivapi::{field, integer, relation_id, text, XivapiError};
use crate::services::collections::source::{
    capitalize, icon_path_from_url, sources_of, CollectionSource,
};

/// Patch given to beasts FFXIV Collect does not know (the bestiary came with 7.56).
const BESTIARY_PATCH: &str = "7.56";

/// Where an orchestrion roll sits, from `OrchestrionUiparam`.
struct RollPlacement {
    category_id: u32,
    category_icon: Option<String>,
    order: i64,
}

/// Orchestrion rolls with their categories (sorted by order); a roll shows its category icon.
pub(super) async fn orchestrion<S: CollectionSource>(
    source: &S,
) -> Result<(Vec<CollectionItem>, Vec<CollectionCategory>), XivapiError> {
    let mut placements: HashMap<u32, RollPlacement> = HashMap::new();
    let mut categories: Vec<CollectionCategory> = Vec::new();
    for row in source
        .sheet("OrchestrionUiparam", "Order,OrchestrionCategory", "fr")
        .await?
        .rows
    {
        let Some(id) = row_id(&row) else { continue };
        let category = field(&row, &["OrchestrionCategory"]);
        let category_id = relation_id(category);
        let category_name = category
            .map(|c| text(field(c, &["Name"])).trim().to_owned())
            .unwrap_or_default();
        if !category_name.is_empty() && !categories.iter().any(|c| c.id == category_id) {
            categories.push(CollectionCategory {
                kind: CollectionType::Orchestrion,
                id: category_id,
                name: category_name,
                order: integer(category.and_then(|c| field(c, &["Order"])), 0),
            });
        }
        placements.insert(
            id,
            RollPlacement {
                category_id,
                category_icon: category.and_then(icon_path),
                order: integer(field(&row, &["Order"]), 0),
            },
        );
    }
    categories.sort_by_key(|c| c.order);

    let collect = source.collect("orchestrions").await;
    let by_id = collect_by_id(&collect);
    let rolls = source
        .sheet("Orchestrion", "Name,Description", "fr")
        .await?
        .rows;
    let items = rolls
        .iter()
        .filter_map(|row| {
            let id = row_id(row)?;
            let name = text(field(row, &["Name"])).trim().to_owned();
            if name.is_empty() {
                return None;
            }
            let placement = placements.get(&id);
            let c = by_id.get(&id).copied();
            Some(CollectionItem {
                description: text(field(row, &["Description"])).trim().to_owned(),
                icon_path: placement.and_then(|p| p.category_icon.clone()),
                category_id: placement.map(|p| p.category_id),
                order: placement.map_or(i64::from(id), |p| p.order),
                patch: c.and_then(|c| c.patch.clone()),
                sources: sources_of(c),
                ..new_item(CollectionType::Orchestrion, id, name)
            })
        })
        .collect();
    Ok((items, categories))
}

/// French names and icons of the Blue Magic spells (XIVAPI `AozAction` → `Action`).
pub(super) async fn blue_magic_names<S: CollectionSource>(
    source: &S,
) -> Result<NameOverrides, XivapiError> {
    let rows = source
        .sheet("AozAction", "Action.Name,Action.Icon", "fr")
        .await?
        .rows;
    Ok(rows
        .iter()
        .filter_map(|row| {
            let name = text(field(row, &["Action", "Name"])).trim().to_owned();
            let icon = field(row, &["Action"]).and_then(icon_path);
            (!name.is_empty())
                .then(|| Some((row_id(row)?, (name, icon))))
                .flatten()
        })
        .collect())
}

/// Card art of a Triple Triad card: icon 88000 + card id.
fn card_icon_path(id: u32) -> String {
    let icon = 88_000 + id;
    format!("ui/icon/{:06}/{icon:06}.tex", icon / 1000 * 1000)
}

/// Acquisition text without its trailing colon and extra whitespace.
fn acquisition_text(raw: &str) -> String {
    let collapsed = raw.split_whitespace().collect::<Vec<_>>().join(" ");
    collapsed
        .strip_suffix(':')
        .unwrap_or(&collapsed)
        .trim()
        .to_owned()
}

/// Triple Triad cards (XIVAPI only: they are not in FFXIV Collect).
pub(super) async fn triple_triad<S: CollectionSource>(
    source: &S,
) -> Result<Vec<CollectionItem>, XivapiError> {
    let cards = source
        .sheet("TripleTriadCard", "Name,Description", "fr")
        .await?
        .rows;
    let residents = source
        .sheet(
            "TripleTriadCardResident",
            "SortKey,AcquisitionType.Text.Text",
            "fr",
        )
        .await?
        .rows;
    let meta: HashMap<u32, (i64, String)> = residents
        .iter()
        .filter_map(|row| {
            let id = row_id(row)?;
            let acquisition =
                acquisition_text(&text(field(row, &["AcquisitionType", "Text", "Text"])));
            Some((
                id,
                (
                    integer(field(row, &["SortKey"]), i64::from(id)),
                    acquisition,
                ),
            ))
        })
        .collect();
    Ok(cards
        .iter()
        .filter_map(|row| {
            let id = row_id(row)?;
            let name = text(field(row, &["Name"])).trim().to_owned();
            if name.is_empty() || name == "0" {
                return None;
            }
            let (order, acquisition) = meta
                .get(&id)
                .cloned()
                .unwrap_or((i64::from(id), String::new()));
            Some(CollectionItem {
                description: text(field(row, &["Description"])).trim().to_owned(),
                icon_path: Some(card_icon_path(id)),
                order,
                sources: if acquisition.is_empty() {
                    vec![]
                } else {
                    vec![acquisition]
                },
                ..new_item(CollectionType::Tripletriad, id, capitalize(&name))
            })
        })
        .collect())
}

/// A beast as described by XIVAPI `XBMPet`.
struct BeastInfo {
    name: String,
    description: String,
    category_id: i64,
    icon_path: Option<String>,
}

async fn beast_infos<S: CollectionSource>(source: &S) -> HashMap<u32, BeastInfo> {
    // Optional: the bestiary falls back to FFXIV Collect when the sheet is unavailable.
    let Ok(sheet) = source
        .sheet("XBMPet", "Pet.Name,Unknown0,Unknown3,Unknown7", "fr")
        .await
    else {
        return HashMap::new();
    };
    sheet
        .rows
        .iter()
        .filter_map(|row| {
            let id = row_id(row).filter(|id| *id != 0)?;
            let name = text(field(row, &["Pet", "Name"])).trim().to_owned();
            if name.is_empty() {
                return None;
            }
            let icon_id = integer(field(row, &["Unknown3"]), 0);
            let icon_path = (icon_id != 0)
                .then(|| format!("ui/icon/{:06}/{icon_id:06}_hr1.tex", icon_id / 1000 * 1000));
            let info = BeastInfo {
                name: capitalize(&name),
                description: text(field(row, &["Unknown0"])).trim().to_owned(),
                category_id: integer(field(row, &["Unknown7"]), 0),
                icon_path,
            };
            Some((id, info))
        })
        .collect()
}

/// Trainer's bestiary: XIVAPI `XBMPet` merged with FFXIV Collect, sorted by id.
pub(super) async fn beasts<S: CollectionSource>(source: &S) -> Vec<CollectionItem> {
    let collect = source.collect("beasts").await;
    let by_id = collect_by_id(&collect);
    let infos = beast_infos(source).await;
    let ids: BTreeMap<u32, ()> = infos
        .keys()
        .chain(by_id.keys())
        .map(|id| (*id, ()))
        .collect();
    ids.keys()
        .map(|&id| {
            let (info, c) = (infos.get(&id), by_id.get(&id).copied());
            let name = info
                .map(|i| i.name.clone())
                .or_else(|| c.and_then(|c| c.name.clone()))
                .unwrap_or_else(|| format!("Bête #{id}"));
            let description = match info {
                Some(info) => info.description.clone(),
                None => c.and_then(|c| c.description.clone()).unwrap_or_default(),
            };
            let icon_path = info
                .and_then(|i| i.icon_path.clone())
                .or_else(|| icon_path_from_url(c.and_then(|c| c.image.as_deref())))
                .or_else(|| icon_path_from_url(c.and_then(|c| c.icon.as_deref())));
            CollectionItem {
                description,
                icon_path,
                category_id: info
                    .and_then(|i| u32::try_from(i.category_id).ok())
                    .filter(|id| *id > 0),
                patch: Some(
                    c.and_then(|c| c.patch.clone())
                        .unwrap_or_else(|| BESTIARY_PATCH.to_owned()),
                ),
                sources: sources_of(c),
                ..new_item(CollectionType::Beast, id, name)
            }
        })
        .collect()
}

pub(super) fn beast_categories() -> Vec<CollectionCategory> {
    [
        "Thériens",
        "Insectoïdes",
        "Ptériens",
        "Floréens",
        "Hydrides",
        "Cuirassiens",
        "Animides",
        "Nécroïdes",
    ]
    .iter()
    .zip(1..)
    .map(|(name, id)| CollectionCategory {
        kind: CollectionType::Beast,
        id,
        name: (*name).to_owned(),
        order: i64::from(id),
    })
    .collect()
}
