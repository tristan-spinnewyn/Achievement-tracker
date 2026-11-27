//! Lodestone sync of the collections.
//!
//! A collection page only lists tooltip hashes; each hash is resolved once to
//! an item name and cached (the hash is global and stable), so re-syncs only
//! download the tooltips not seen before.

mod parsing;

use std::sync::Arc;

use chrono::{DateTime, Utc};
use serde::Serialize;
use tokio::sync::Semaphore;
use tokio::task::JoinSet;

use crate::models::collections::CollectionType;
use crate::models::settings::Region;
use crate::models::user::SyncLogEntry;
use crate::net::network::Network;
use crate::repo::collections::apply_lodestone_collection;
use crate::repo::error::RepoResult;
use crate::repo::settings::add_sync_log;
use crate::services::lodestone::{character_url, extract_character_id, fetch_lodestone_text};
use crate::shared::timestamps::iso_timestamp;
use crate::state::AppState;
pub use parsing::{decode_entities, tooltip_hashes, tooltip_name};

const TOOLTIP_CONCURRENCY: usize = 8;
const XHR_HEADER: (&str, &str) = ("X-Requested-With", "XMLHttpRequest");

/// Outcome of a collection sync, as shown by the UI.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CollectionSyncResult {
    pub ok: bool,
    #[serde(rename = "type")]
    pub kind: CollectionType,
    pub matched: u32,
    pub unmatched: u32,
    pub newly: u32,
    pub message: String,
    pub at: String,
}

/// Lodestone page of a collection; only these collections are listed there.
pub fn lodestone_path(kind: CollectionType) -> Option<&'static str> {
    matches!(
        kind,
        CollectionType::Mount
            | CollectionType::Minion
            | CollectionType::Emote
            | CollectionType::Faceaccessory
    )
    .then(|| kind.name())
}

/// Owned names read on the Lodestone, and how many tooltips were downloaded or cached.
struct ScrapeOutcome {
    names: Vec<String>,
    fetched: usize,
    cached: usize,
}

/// Downloads the unknown tooltips a few at a time; results are aligned with `hashes`.
async fn resolve_tooltips(net: &Network, page_url: &str, hashes: &[String]) -> Vec<Option<String>> {
    let permits = Arc::new(Semaphore::new(TOOLTIP_CONCURRENCY));
    let mut tasks = JoinSet::new();
    for (index, hash) in hashes.iter().enumerate() {
        let (net, permits, url) = (
            net.clone(),
            Arc::clone(&permits),
            format!("{page_url}tooltip/{hash}"),
        );
        tasks.spawn(async move {
            let _permit = permits.acquire_owned().await;
            let fragment = fetch_lodestone_text(&net, &url, &[XHR_HEADER]).await.ok();
            (index, fragment.as_deref().and_then(tooltip_name))
        });
    }
    let mut names = vec![None; hashes.len()];
    while let Some(Ok((index, name))) = tasks.join_next().await {
        names[index] = name;
    }
    names
}

async fn scrape_names(
    state: &AppState,
    net: &Network,
    kind: CollectionType,
    character_id: &str,
    region: Region,
) -> Result<ScrapeOutcome, String> {
    let page_url = format!(
        "{}/{}/",
        character_url(net, region, character_id),
        kind.name()
    );
    let page = fetch_lodestone_text(net, &page_url, &[XHR_HEADER]).await?;
    let hashes = tooltip_hashes(&page, kind.name());
    let cache_key = |hash: &str| format!("{}:{hash}", kind.name());
    let (mut names, unknown): (Vec<String>, Vec<String>) = {
        let store = state.store();
        let cache = &store.user.collection_hash_cache;
        let names = hashes
            .iter()
            .filter_map(|h| cache.get(&cache_key(h)).cloned())
            .collect();
        let unknown = hashes
            .iter()
            .filter(|h| !cache.contains_key(&cache_key(h)))
            .cloned()
            .collect();
        (names, unknown)
    };
    let cached = names.len();
    if unknown.is_empty() {
        return Ok(ScrapeOutcome {
            names,
            fetched: 0,
            cached,
        });
    }
    let resolved = resolve_tooltips(net, &page_url, &unknown).await;
    let mut store = state.store();
    let mut fetched = 0;
    for (hash, name) in unknown.iter().zip(resolved) {
        if let Some(name) = name {
            store
                .user
                .collection_hash_cache
                .insert(cache_key(hash), name.clone());
            names.push(name);
            fetched += 1;
        }
    }
    store.save_user().map_err(|err| err.to_string())?;
    Ok(ScrapeOutcome {
        names,
        fetched,
        cached,
    })
}

/// Reads the owned items of a collection on the Lodestone and marks them owned.
/// Failures are reported in the result and the sync log.
pub async fn sync_collection(
    state: &AppState,
    net: &Network,
    kind: CollectionType,
    now: DateTime<Utc>,
) -> RepoResult<CollectionSyncResult> {
    let at = iso_timestamp(now);
    if lodestone_path(kind).is_none() {
        return record_failure(
            state,
            kind,
            at,
            "Cette collection n'est pas synchronisable depuis le Lodestone.",
        );
    }
    let (character_id, region) = {
        let store = state.store();
        let settings = &store.user.settings;
        (
            settings
                .lodestone_character_id
                .as_deref()
                .and_then(extract_character_id),
            settings.region,
        )
    };
    let Some(character_id) = character_id else {
        return record_failure(
            state,
            kind,
            at,
            "Aucun ID de personnage Lodestone configuré (voir Paramètres).",
        );
    };
    let outcome = match scrape_names(state, net, kind, &character_id, region).await {
        Ok(outcome) if outcome.names.is_empty() => {
            let message = "Liste vide. Rends tes montures/mascottes publiques sur le Lodestone (réglage distinct des hauts faits).";
            return record_failure(state, kind, at, message);
        }
        Ok(outcome) => outcome,
        Err(message) => return record_failure(state, kind, at, &message),
    };

    let mut store = state.store();
    let summary = apply_lodestone_collection(&mut store, kind, &outcome.names, now)?;
    let unmatched = if summary.unmatched > 0 {
        format!(" · {} non reconnu(s)", summary.unmatched)
    } else {
        String::new()
    };
    let cached = if outcome.cached > 0 {
        format!(" · {} en cache", outcome.cached)
    } else {
        String::new()
    };
    let message = format!(
        "{} reconnu(s) · {} nouveau(x){unmatched} ({} téléchargé(s){cached}).",
        summary.matched, summary.newly, outcome.fetched
    );
    add_sync_log(
        &mut store,
        log_entry(kind, &at, true, summary.newly, summary.matched, &message),
    )?;
    Ok(CollectionSyncResult {
        ok: true,
        kind,
        matched: summary.matched,
        unmatched: summary.unmatched,
        newly: summary.newly,
        message,
        at,
    })
}

fn log_entry(
    kind: CollectionType,
    at: &str,
    ok: bool,
    newly: u32,
    total: u32,
    message: &str,
) -> SyncLogEntry {
    SyncLogEntry {
        at: at.to_owned(),
        ok,
        newly_completed: newly,
        total_completed: total,
        message: format!("[{}] {message}", kind.name()),
    }
}

fn record_failure(
    state: &AppState,
    kind: CollectionType,
    at: String,
    message: &str,
) -> RepoResult<CollectionSyncResult> {
    add_sync_log(
        &mut state.store(),
        log_entry(kind, &at, false, 0, 0, message),
    )?;
    Ok(CollectionSyncResult {
        ok: false,
        kind,
        matched: 0,
        unmatched: 0,
        newly: 0,
        message: message.to_owned(),
        at,
    })
}

#[cfg(test)]
mod tests;
