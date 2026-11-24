//! Collections (mounts, minions…), mirroring the collection types of `src/shared/types.ts`.

use serde::{Deserialize, Serialize};

use super::user::SyncSource;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CollectionType {
    Mount,
    Minion,
    Orchestrion,
    Emote,
    Fashion,
    Hairstyle,
    Barding,
    Title,
    Faceaccessory,
    Spell,
    Tripletriad,
    Beast,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionCategory {
    #[serde(rename = "type")]
    pub kind: CollectionType,
    pub id: u32,
    pub name: String,
    pub order: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionItem {
    #[serde(rename = "type")]
    pub kind: CollectionType,
    pub id: u32,
    pub name: String,
    pub description: String,
    pub icon_path: Option<String>,
    pub category_id: Option<u32>,
    pub order: i64,
    pub patch: Option<String>,
    #[serde(default)]
    pub sources: Vec<String>,
    /// Normalised names (FR/EN/DE/JA) used to match the Lodestone.
    #[serde(default)]
    pub aliases: Vec<String>,
}

/// Content of `collections.json` (and of the bundled collections snapshot).
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CollectionsData {
    pub generated_at: Option<String>,
    pub game_version: Option<String>,
    pub categories: Vec<CollectionCategory>,
    pub items: Vec<CollectionItem>,
}

/// Ownership of an item, stored on the user side under the key `{type}:{id}`.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CollectionOwnership {
    pub owned: bool,
    pub owned_date: Option<String>,
    pub source: SyncSource,
    pub updated_at: String,
}

/// Storage key of a collection item, e.g. `mount:12`.
pub fn collection_key(kind: CollectionType, id: u32) -> String {
    let kind = serde_json::to_value(kind).expect("CollectionType always serializes");
    format!("{}:{id}", kind.as_str().unwrap_or_default())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collection_key_uses_the_serialized_type_name() {
        assert_eq!(
            collection_key(CollectionType::Faceaccessory, 12),
            "faceaccessory:12"
        );
        assert_eq!(collection_key(CollectionType::Mount, 1), "mount:1");
    }

    #[test]
    fn collection_item_reads_the_type_field() {
        let item: CollectionItem = serde_json::from_str(
            r#"{"type":"minion","id":3,"name":"Wind-up Cursor","description":"","iconPath":null,
                "categoryId":null,"order":1,"patch":"2.0"}"#,
        )
        .unwrap();
        assert_eq!(item.kind, CollectionType::Minion);
        assert!(item.sources.is_empty());
    }
}
