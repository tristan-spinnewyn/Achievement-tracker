//! Lodestone achievements sync (port of `src/main/services/lodestone.ts`).
//!
//! The Lodestone only lists obtained achievements, page by page. The HTML
//! selectors are centralised in `parse_page`: adjust them if the site changes.

use std::sync::LazyLock;

use chrono::{DateTime, Utc};
use regex::Regex;
use serde_json::json;

use crate::models::settings::Region;
use crate::models::user::SyncLogEntry;
use crate::models::views::SyncResult;
use crate::net::network::Network;
use crate::repo::achievements::count_completed;
use crate::repo::error::RepoResult;
use crate::repo::mutations::{apply_lodestone_completions, LodestoneCompletion};
use crate::repo::settings::{add_sync_log, update_settings};
use crate::shared::timestamps::{iso_date, iso_timestamp};
use crate::state::AppState;

const USER_AGENT: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const MAX_PAGES: u32 = 120;
pub const NOT_FOUND_MESSAGE: &str = "Personnage introuvable (404). Vérifie l’ID Lodestone.";

static CHARACTER_IN_URL: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"character/([0-9]+)").expect("valid regex"));
static ACHIEVEMENT_LINK: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"achievement/detail/([0-9]+)").expect("valid regex"));
static COMPLETION_TIME: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"ldst_strftime\(([0-9]+),").expect("valid regex"));
static PAGE_COUNT: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)Page\s+[0-9]+\s+of\s+([0-9]+)").expect("valid regex"));

/// Accepts a numeric id or a full Lodestone URL and returns the id; anything
/// else (which could alter the URL built from it) is rejected.
pub fn extract_character_id(input: &str) -> Option<String> {
    let input = input.trim();
    if let Some(captures) = CHARACTER_IN_URL.captures(input) {
        return Some(captures[1].to_owned());
    }
    (!input.is_empty() && input.bytes().all(|b| b.is_ascii_digit())).then(|| input.to_owned())
}

/// Base URL of a character's pages for a region.
pub fn character_url(net: &Network, region: Region, character_id: &str) -> String {
    let base = net
        .endpoints
        .lodestone_character
        .replace("{region}", region.lodestone_host());
    format!("{base}/{character_id}")
}

fn first_number<T: std::str::FromStr>(regex: &Regex, text: &str) -> Option<T> {
    regex.captures(text).and_then(|c| c[1].parse().ok())
}

/// Achievements of one page and the total page count ("Page X of Y", 1 when absent).
pub fn parse_page(html: &str) -> (Vec<LodestoneCompletion>, u32) {
    let items = html
        .split(r#"<li class="entry">"#)
        .skip(1)
        .filter_map(|entry| {
            let id = first_number::<u32>(&ACHIEVEMENT_LINK, entry)?;
            let date = first_number::<i64>(&COMPLETION_TIME, entry)
                .and_then(|seconds| DateTime::from_timestamp(seconds, 0))
                .map(iso_date);
            Some(LodestoneCompletion { id, date })
        })
        .collect();
    (items, first_number(&PAGE_COUNT, html).unwrap_or(1))
}

/// Fetches a Lodestone page with a browser user agent; "not found" pages and
/// network failures become messages for the user.
pub async fn fetch_lodestone_text(
    net: &Network,
    url: &str,
    headers: &[(&str, &str)],
) -> Result<String, String> {
    let mut all_headers = vec![("User-Agent", USER_AGENT)];
    all_headers.extend_from_slice(headers);
    match net.http.get_text(url, &all_headers).await {
        Ok(text) if text.contains("Character Not Found") || text.contains("Page Not Found") => {
            Err(NOT_FOUND_MESSAGE.to_owned())
        }
        Ok(text) => Ok(text),
        Err(err) => Err(format!("Lodestone a répondu avec une erreur : {err}")),
    }
}

/// Reads every page (capped) of a character's achievements, pausing between pages.
pub async fn scrape_achievements(
    net: &Network,
    character_id: &str,
    region: Region,
) -> Result<(Vec<LodestoneCompletion>, u32), String> {
    let base = character_url(net, region, character_id);
    let page_url = |page: u32| format!("{base}/achievement/?page={page}");
    let (mut items, total_pages) = parse_page(&fetch_lodestone_text(net, &page_url(1), &[]).await?);
    let pages = total_pages.min(MAX_PAGES);
    for page in 2..=pages {
        tokio::time::sleep(net.lodestone_delay).await;
        items.extend(parse_page(&fetch_lodestone_text(net, &page_url(page), &[]).await?).0);
    }
    Ok((items, pages))
}

/// On-demand sync: scrape, apply, update `lastSyncAt`, log. Failures are
/// reported in the result (and the log); only a failed save is an error.
pub async fn sync_lodestone(
    state: &AppState,
    net: &Network,
    now: DateTime<Utc>,
) -> RepoResult<SyncResult> {
    let at = iso_timestamp(now);
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
            at,
            "Aucun ID de personnage Lodestone configuré (voir Paramètres).".into(),
        );
    };
    let (items, pages) = match scrape_achievements(net, &character_id, region).await {
        Ok((items, _)) if items.is_empty() => {
            let message = "Aucun haut fait public trouvé. As-tu rendu tes hauts faits publics sur le Lodestone ?";
            return record_failure(state, at, message.into());
        }
        Ok(scraped) => scraped,
        Err(message) => return record_failure(state, at, message),
    };

    let mut store = state.store();
    let summary = apply_lodestone_completions(&mut store, &items, now)?;
    update_settings(&mut store, &json!({ "lastSyncAt": at }))?;
    let message = format!(
        "{} hauts faits lus ({pages} page(s)) · {} nouveau(x).",
        items.len(),
        summary.newly
    );
    let result = SyncResult {
        ok: true,
        newly_completed: summary.newly,
        total_completed: summary.total,
        message,
        at,
    };
    add_sync_log(&mut store, log_entry(&result))?;
    Ok(result)
}

fn record_failure(state: &AppState, at: String, message: String) -> RepoResult<SyncResult> {
    let mut store = state.store();
    let result = SyncResult {
        ok: false,
        newly_completed: 0,
        total_completed: count_completed(&store),
        message,
        at,
    };
    add_sync_log(&mut store, log_entry(&result))?;
    Ok(result)
}

fn log_entry(result: &SyncResult) -> SyncLogEntry {
    SyncLogEntry {
        at: result.at.clone(),
        ok: result.ok,
        newly_completed: result.newly_completed,
        total_completed: result.total_completed,
        message: result.message.clone(),
    }
}

#[cfg(test)]
mod tests;
