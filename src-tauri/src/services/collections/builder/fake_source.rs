//! In-memory collections source mirroring the fake APIs of `test/collectionsBuilder.test.ts`.

use std::collections::HashMap;

use serde_json::{json, Value};

use crate::net::http::FetchError;
use crate::net::xivapi::{SheetRows, XivapiError};
use crate::services::collections::source::{CollectRow, CollectionSource};

/// `sheets[sheet][language]` = rows; a missing sheet answers 404, a missing
/// language answers no rows. FFXIV Collect endpoints missing from `collect` are down.
#[derive(Default)]
pub struct FakeSource {
    pub sheets: HashMap<&'static str, HashMap<&'static str, Vec<Value>>>,
    pub collect: HashMap<&'static str, Vec<Value>>,
}

impl CollectionSource for FakeSource {
    async fn sheet(
        &self,
        sheet: &str,
        _fields: &str,
        language: &str,
    ) -> Result<SheetRows, XivapiError> {
        let by_language = self.sheets.get(sheet).ok_or_else(|| XivapiError {
            sheet: sheet.to_owned(),
            cause: FetchError::Status(404),
        })?;
        Ok(SheetRows {
            rows: by_language.get(language).cloned().unwrap_or_default(),
            version: if sheet == "Mount" {
                "v7.3".into()
            } else {
                String::new()
            },
        })
    }

    async fn collect(&self, endpoint: &str) -> Vec<CollectRow> {
        self.collect
            .get(endpoint)
            .into_iter()
            .flatten()
            .filter_map(|row| serde_json::from_value(row.clone()).ok())
            .collect()
    }
}

fn icon(path: &str) -> Value {
    json!({ "path": path })
}

fn rows(list: Vec<Value>) -> Vec<Value> {
    list
}

/// The XIVAPI sheets of the TS test.
pub fn base_sheets() -> HashMap<&'static str, HashMap<&'static str, Vec<Value>>> {
    let sheet =
        |langs: Vec<(&'static str, Vec<Value>)>| langs.into_iter().collect::<HashMap<_, _>>();
    HashMap::from([
        (
            "Mount",
            sheet(vec![
                (
                    "fr",
                    rows(vec![
                        json!({ "row_id": 1, "fields": { "Singular": "licorne", "Icon": icon("ui/m1.tex"), "Order": 5 } }),
                        json!({ "row_id": 2, "fields": { "Singular": "" } }),
                    ]),
                ),
                (
                    "en",
                    rows(vec![
                        json!({ "row_id": 1, "fields": { "Singular": "Unicorn" } }),
                        json!({ "row_id": 99, "fields": { "Singular": "Ghost" } }),
                    ]),
                ),
                (
                    "de",
                    rows(vec![
                        json!({ "row_id": 1, "fields": { "Singular": "Einhorn" } }),
                    ]),
                ),
                (
                    "ja",
                    rows(vec![
                        json!({ "row_id": 1, "fields": { "Singular": "ユニコーン" } }),
                        json!({ "row_id": 1, "fields": { "Singular": "" } }),
                    ]),
                ),
            ]),
        ),
        (
            "Companion",
            sheet(vec![(
                "fr",
                rows(vec![
                    json!({ "row_id": 7, "fields": { "Singular": "bébé chocobo" } }),
                ]),
            )]),
        ),
        (
            "Glasses",
            sheet(vec![(
                "fr",
                rows(vec![
                    json!({ "row_id": 3, "fields": { "Name": "Lunettes", "Singular": "lunettes", "Icon": icon("ui/g.tex") } }),
                ]),
            )]),
        ),
        (
            "OrchestrionUiparam",
            sheet(vec![(
                "fr",
                rows(vec![
                    json!({ "row_id": 10, "fields": { "Order": 2, "OrchestrionCategory": { "row_id": 4, "fields": { "Name": "Donjons", "Order": 2, "Icon": icon("ui/oc.tex") } } } }),
                    json!({ "row_id": 11, "fields": { "OrchestrionCategory": { "value": 3, "fields": { "Name": "Raids", "Order": 1 } } } }),
                    json!({ "row_id": 12, "fields": { "OrchestrionCategory": { "fields": { "Name": "" } } } }),
                ]),
            )]),
        ),
        (
            "Orchestrion",
            sheet(vec![(
                "fr",
                rows(vec![
                    json!({ "row_id": 10, "fields": { "Name": "Air 1", "Description": " desc " } }),
                    json!({ "row_id": 13, "fields": { "Name": "Air orphelin" } }),
                    json!({ "row_id": 14, "fields": { "Name": "" } }),
                ]),
            )]),
        ),
        (
            "Emote",
            sheet(vec![
                (
                    "fr",
                    rows(vec![
                        json!({ "row_id": 20, "fields": { "Name": "Danse", "Icon": icon("ui/e.tex") } }),
                        json!({ "row_id": 21, "fields": { "Name": "" } }),
                    ]),
                ),
                (
                    "en",
                    rows(vec![
                        json!({ "row_id": 20, "fields": { "Name": "Dance" } }),
                        json!({ "row_id": 20, "fields": { "Name": "danse" } }),
                        json!({ "row_id": 50, "fields": { "Name": "x" } }),
                    ]),
                ),
            ]),
        ),
        (
            "Ornament",
            sheet(vec![(
                "fr",
                rows(vec![
                    json!({ "row_id": 30, "fields": { "Singular": "parasol" } }),
                ]),
            )]),
        ),
        (
            "Title",
            sheet(vec![(
                "fr",
                rows(vec![
                    json!({ "row_id": 40, "fields": { "Masculine": "le Brave", "Icon": icon("ui/t.tex") } }),
                ]),
            )]),
        ),
        (
            "AozAction",
            sheet(vec![(
                "fr",
                rows(vec![
                    json!({ "row_id": 1, "fields": { "Action": { "fields": { "Name": "Canon à eau", "Icon": icon("ui/s.tex") } } } }),
                    json!({ "row_id": 2, "fields": { "Action": { "fields": { "Name": "" } } } }),
                ]),
            )]),
        ),
        (
            "TripleTriadCard",
            sheet(vec![(
                "fr",
                rows(vec![
                    json!({ "row_id": 1, "fields": { "Name": "dodo", "Description": " Un oiseau " } }),
                    json!({ "row_id": 2, "fields": { "Name": "0" } }),
                    json!({ "row_id": 3, "fields": { "Name": "gobelin" } }),
                ]),
            )]),
        ),
        (
            "TripleTriadCardResident",
            sheet(vec![(
                "fr",
                rows(vec![
                    json!({ "row_id": 1, "fields": { "SortKey": 9, "AcquisitionType": { "fields": { "Text": { "fields": { "Text": "Tournoi\n  :" } } } } } }),
                    json!({ "row_id": 3 }),
                ]),
            )]),
        ),
        (
            "XBMPet",
            sheet(vec![(
                "fr",
                rows(vec![
                    json!({ "row_id": 0, "fields": {} }),
                    json!({ "row_id": 1, "fields": { "Pet": { "fields": { "Name": "cu sith" } }, "Unknown0": "Chien", "Unknown3": 123456, "Unknown7": 2 } }),
                    json!({ "row_id": 2, "fields": { "Pet": { "fields": { "Name": "" } } } }),
                    json!({ "row_id": 4, "fields": { "Pet": { "fields": { "Name": "bombo" } }, "Unknown7": 0 } }),
                ]),
            )]),
        ),
    ])
}

/// The FFXIV Collect answers of the first TS test.
pub fn base_collect() -> HashMap<&'static str, Vec<Value>> {
    HashMap::from([
        (
            "mounts",
            vec![
                json!({ "id": 1, "patch": "2.0", "sources": [{ "type": "Quête", "text": "MSQ" }, { "text": "" }, {}] }),
            ],
        ),
        ("minions", vec![]),
        (
            "orchestrions",
            vec![json!({ "id": 10, "patch": "3.0", "sources": [{ "type": "Donjon" }] })],
        ),
        (
            "emotes",
            vec![
                json!({ "id": 20, "name": "Dance", "patch": "2.0" }),
                json!({ "id": 22, "name": "Wave", "icon": "https://x/api/asset?path=ui%2Fw.tex&f=png" }),
            ],
        ),
        ("fashions", vec![json!({ "id": 30, "name": "Parasol" })]),
        (
            "hairstyles",
            vec![
                json!({ "id": 60, "name": "Coupe", "icon": "https://x/no-path.png" }),
                json!({ "id": 61, "name": "" }),
            ],
        ),
        ("bardings", vec![json!({ "id": 70, "name": "Barde" })]),
        ("titles", vec![json!({ "id": 40, "name": "the Brave" })]),
        (
            "spells",
            vec![
                json!({ "id": 1, "name": "Water Cannon" }),
                json!({ "id": 5, "name": "Flamethrower", "icon": "https://x/a?path=ui%2Ff.tex" }),
            ],
        ),
        (
            "beasts",
            vec![
                json!({ "id": 1, "patch": "7.5" }),
                json!({ "id": 3, "name": "Wolf", "description": "Loup", "image": "https://x/a?path=ui%2Fwolf.tex" }),
                json!({ "id": 5, "icon": "https://x/a?path=ui%2Fi5.tex" }),
            ],
        ),
    ])
}
