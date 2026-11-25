//! Achievement rows: building, filtering, sorting, focus list.

use std::cmp::Ordering;

use crate::models::catalog::Achievement;
use crate::models::views::{
    AchievementFilter, AchievementRow, AchievementStatus, SortDir, SortField,
};
use crate::services::search::SearchQuery;
use crate::shared::names::{compare_fr, patch_sort_key};
use crate::store::Store;

/// Achievement + its progress, user meta and tags.
pub fn build_row(store: &Store, achievement: &Achievement) -> AchievementRow {
    let key = achievement.id.to_string();
    let progress = store.user.progress.get(&key);
    let meta = store.user.user_meta.get(&key);
    AchievementRow {
        achievement: achievement.clone(),
        category_name: store
            .category_by_id
            .get(&achievement.category_id)
            .map(|c| c.name.clone())
            .unwrap_or_default(),
        kind_name: store
            .kind_by_id
            .get(&achievement.kind_id)
            .map(|k| k.name.clone())
            .unwrap_or_default(),
        completed: progress.is_some_and(|p| p.completed),
        completed_date: progress.and_then(|p| p.completed_date.clone()),
        source: progress.map(|p| p.source),
        priority: meta.map_or(0, |m| m.priority),
        in_focus: meta.is_some_and(|m| m.in_focus),
        focus_order: meta.and_then(|m| m.focus_order),
        note: meta.and_then(|m| m.note.clone()),
        deadline: meta.and_then(|m| m.deadline.clone()),
        tags: store
            .user
            .tags_by_achievement
            .get(&key)
            .cloned()
            .unwrap_or_default(),
    }
}

fn matches(
    store: &Store,
    row: &AchievementRow,
    f: &AchievementFilter,
    search: Option<&SearchQuery>,
) -> bool {
    let a = &row.achievement;
    let status_ok = match f.status {
        AchievementStatus::All => true,
        AchievementStatus::Completed => row.completed,
        AchievementStatus::Todo => !row.completed,
        AchievementStatus::Focus => row.in_focus,
    };
    let difficulty_ok = f.difficulty_level.is_none_or(|level| {
        store
            .difficulties
            .get(&a.id)
            .is_some_and(|d| d.level == level)
    });
    status_ok
        && difficulty_ok
        && search.is_none_or(|q| q.matches(row))
        && f.kind_id.is_none_or(|id| a.kind_id == id)
        && f.category_id.is_none_or(|id| a.category_id == id)
        && f.priority.is_none_or(|p| row.priority == p)
        && f.min_points.is_none_or(|min| a.points >= min)
        && f.max_points.is_none_or(|max| a.points <= max)
        && (!f.obtainable_only || a.obtainable)
        && (!f.has_note || row.note.as_deref().is_some_and(|n| !n.is_empty()))
        && f.patch.as_ref().is_none_or(|p| a.patch.as_ref() == Some(p))
        && f.tags.iter().all(|t| row.tags.contains(t))
        && (!f.seasonal_only || a.is_seasonal == Some(true))
        && f.seasonal_event
            .as_ref()
            .is_none_or(|e| a.seasonal_event.as_ref() == Some(e))
}

fn difficulty_score(store: &Store, id: u32) -> f64 {
    store.difficulties.get(&id).map_or(0.0, |d| d.score)
}

fn compare(
    store: &Store,
    a: &AchievementRow,
    b: &AchievementRow,
    f: &AchievementFilter,
) -> Ordering {
    let directed = |o: Ordering| {
        if f.sort_dir == SortDir::Desc {
            o.reverse()
        } else {
            o
        }
    };
    let by_name = || compare_fr(&a.achievement.name, &b.achievement.name);
    match f.sort_by {
        SortField::Points => directed(a.achievement.points.cmp(&b.achievement.points)),
        SortField::Category => {
            directed(compare_fr(&a.category_name, &b.category_name).then_with(by_name))
        }
        SortField::CompletedDate => directed(
            a.completed_date
                .as_deref()
                .unwrap_or("")
                .cmp(b.completed_date.as_deref().unwrap_or("")),
        ),
        SortField::Priority => directed(a.priority.cmp(&b.priority)),
        SortField::FocusOrder => directed(
            a.focus_order
                .unwrap_or(i64::MAX)
                .cmp(&b.focus_order.unwrap_or(i64::MAX)),
        ),
        // The name tie-break is not reversed, like the TS version.
        SortField::Patch => directed(
            patch_sort_key(a.achievement.patch.as_deref())
                .total_cmp(&patch_sort_key(b.achievement.patch.as_deref())),
        )
        .then_with(by_name),
        SortField::Difficulty => directed(
            difficulty_score(store, a.achievement.id)
                .total_cmp(&difficulty_score(store, b.achievement.id)),
        ),
        SortField::Name => directed(by_name()),
    }
}

pub fn list_achievements(store: &Store, filter: &AchievementFilter) -> Vec<AchievementRow> {
    let search = filter
        .search
        .as_deref()
        .filter(|s| !s.is_empty())
        .map(SearchQuery::parse);
    let mut rows: Vec<AchievementRow> = store
        .catalog
        .achievements
        .iter()
        .map(|a| build_row(store, a))
        .filter(|row| matches(store, row, filter, search.as_ref()))
        .collect();
    rows.sort_by(|a, b| compare(store, a, b, filter));
    if filter.offset.is_none() && filter.limit.is_none() {
        return rows;
    }
    let start = filter.offset.unwrap_or(0).min(rows.len());
    let end = filter.limit.map_or(rows.len(), |limit| {
        start.saturating_add(limit).min(rows.len())
    });
    rows.drain(start..end).collect()
}

/// Achievements in focus, in focus order.
pub fn focus_list(store: &Store) -> Vec<AchievementRow> {
    let mut rows: Vec<AchievementRow> = store
        .catalog
        .achievements
        .iter()
        .map(|a| build_row(store, a))
        .filter(|row| row.in_focus)
        .collect();
    rows.sort_by_key(|row| row.focus_order.unwrap_or(0));
    rows
}

pub fn achievement_row(store: &Store, id: u32) -> Option<AchievementRow> {
    store
        .achievement_by_id
        .get(&id)
        .map(|a| build_row(store, a))
}

pub fn count_completed(store: &Store) -> u32 {
    let count = store.user.progress.values().filter(|p| p.completed).count();
    u32::try_from(count).unwrap_or(u32::MAX)
}

#[cfg(test)]
mod tests;
