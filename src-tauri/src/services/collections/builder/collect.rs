//! Collections whose set is an FFXIV Collect endpoint (emotes, fashion,
//! hairstyles, barding, titles, Blue Magic), with French names from XIVAPI when known.

use std::collections::HashMap;

use super::{add_alias, display_name, icon_path, new_item, row_id, ALIAS_LANGUAGES};
use crate::models::collections::{CollectionItem, CollectionType};
use crate::net::xivapi::{field, text, XivapiError};
use crate::services::collections::source::{icon_path_from_url, sources_of, CollectionSource};
use crate::shared::names::normalize_name;

/// A collection whose set is an FFXIV Collect endpoint, with French names from XIVAPI when known.
pub(super) struct CollectSpec {
    kind: CollectionType,
    endpoint: &'static str,
    /// XIVAPI sheet and name field for the French names.
    french_sheet: Option<(&'static str, &'static str)>,
    /// Build multi-language aliases (Lodestone-syncable collection).
    aliases: bool,
    no_icon: bool,
}

/// French name and icon that replace the FFXIV Collect ones (Blue Magic).
pub(super) type NameOverrides = HashMap<u32, (String, Option<String>)>;

pub(super) async fn collect_collection<S: CollectionSource>(
    source: &S,
    spec: &CollectSpec,
    overrides: Option<&NameOverrides>,
) -> Result<Vec<CollectionItem>, XivapiError> {
    let collect = source.collect(spec.endpoint).await;
    let mut french: HashMap<u32, (String, Option<String>)> = HashMap::new();
    let mut aliases: HashMap<u32, Vec<String>> = HashMap::new();
    if let Some((sheet, name_field)) = spec.french_sheet {
        for row in source
            .sheet(sheet, &format!("{name_field},Icon"), "fr")
            .await?
            .rows
        {
            let (Some(id), name) = (row_id(&row), display_name(&row, name_field)) else {
                continue;
            };
            if name.is_empty() {
                continue;
            }
            if spec.aliases {
                aliases.insert(id, vec![normalize_name(&name)]);
            }
            french.insert(id, (name, icon_path(&row)));
        }
        if spec.aliases {
            for language in ALIAS_LANGUAGES {
                for row in source.sheet(sheet, name_field, language).await?.rows {
                    let Some(list) = row_id(&row).and_then(|id| aliases.get_mut(&id)) else {
                        continue;
                    };
                    add_alias(list, text(field(&row, &[name_field])).trim());
                }
            }
        }
    }
    let items = collect
        .iter()
        .filter_map(|c| {
            let replaced = overrides.and_then(|o| o.get(&c.id));
            let known = french.get(&c.id);
            let name = replaced
                .or(known)
                .map(|(name, _)| name.clone())
                .or_else(|| c.name.clone())
                .filter(|n| !n.is_empty())?;
            let icon_path = match replaced {
                Some((_, icon)) => icon.clone(),
                None if spec.no_icon => None,
                None => known
                    .and_then(|(_, icon)| icon.clone())
                    .or_else(|| icon_path_from_url(c.icon.as_deref())),
            };
            Some(CollectionItem {
                icon_path,
                patch: c.patch.clone(),
                sources: sources_of(Some(c)),
                aliases: aliases.get(&c.id).cloned().unwrap_or_default(),
                ..new_item(spec.kind, c.id, name)
            })
        })
        .collect();
    Ok(items)
}

pub(super) const COLLECT_SPECS: [CollectSpec; 5] = [
    CollectSpec {
        kind: CollectionType::Emote,
        endpoint: "emotes",
        french_sheet: Some(("Emote", "Name")),
        aliases: true,
        no_icon: false,
    },
    CollectSpec {
        kind: CollectionType::Fashion,
        endpoint: "fashions",
        french_sheet: Some(("Ornament", "Singular")),
        aliases: false,
        no_icon: false,
    },
    CollectSpec {
        kind: CollectionType::Hairstyle,
        endpoint: "hairstyles",
        french_sheet: None,
        aliases: false,
        no_icon: false,
    },
    CollectSpec {
        kind: CollectionType::Barding,
        endpoint: "bardings",
        french_sheet: None,
        aliases: false,
        no_icon: false,
    },
    CollectSpec {
        kind: CollectionType::Title,
        endpoint: "titles",
        french_sheet: Some(("Title", "Masculine")),
        aliases: false,
        no_icon: true,
    },
];
pub(super) const SPELLS: CollectSpec = CollectSpec {
    kind: CollectionType::Spell,
    endpoint: "spells",
    french_sheet: None,
    aliases: false,
    no_icon: false,
};
