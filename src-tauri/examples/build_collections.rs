//! Generates `resources/collections-snapshot.json`, the collections catalog
//! bundled with the app (mounts, minions, orchestrion, emotes, fashion,
//! hairstyles, barding, titles), from XIVAPI and FFXIV Collect.
//!
//! Run: npm run build:collections

use std::collections::BTreeMap;
use std::path::Path;

use achievement_tracker_lib::net::network::Network;
use achievement_tracker_lib::services::collections::builder::build_collections;
use achievement_tracker_lib::store::json_file::atomic_write;
use chrono::Utc;

const SNAPSHOT: &str = concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../resources/collections-snapshot.json"
);

#[tokio::main]
async fn main() {
    println!("Building the collections catalog...");
    let built = match build_collections(&Network::default()).await {
        Ok(built) => built,
        Err(err) => {
            eprintln!("Failed: {err}");
            std::process::exit(1);
        }
    };
    let snapshot = built.into_data(None, Utc::now());

    let mut counts: BTreeMap<String, usize> = BTreeMap::new();
    for item in &snapshot.items {
        let kind = serde_json::to_value(item.kind).expect("a collection type serializes");
        *counts
            .entry(kind.as_str().unwrap_or("?").to_owned())
            .or_default() += 1;
    }
    let with_patch = snapshot.items.iter().filter(|i| i.patch.is_some()).count();

    let json = serde_json::to_string(&snapshot).expect("the snapshot serializes");
    if let Err(err) = atomic_write(Path::new(SNAPSHOT), &json) {
        eprintln!("Cannot write {SNAPSHOT}: {err}");
        std::process::exit(1);
    }
    let summary: Vec<String> = counts.iter().map(|(k, n)| format!("{k}: {n}")).collect();
    println!("{}", summary.join(" · "));
    println!(
        "{} entries · {with_patch} with a patch",
        snapshot.items.len()
    );
    println!("Snapshot written: {SNAPSHOT}");
}
