//! Name and patch helpers (port of `src/shared/names.ts`).

use std::cmp::Ordering;

use unicode_normalization::UnicodeNormalization;

/// Latin combining diacritics (U+0300–U+036F), the only marks the TS version removes:
/// other scripts keep theirs (e.g. the Japanese voiced marks).
fn is_latin_diacritic(c: char) -> bool {
    ('\u{0300}'..='\u{036F}').contains(&c)
}

/// Lowercase without Latin accents (NFD, Latin diacritics removed), for comparisons and search.
pub fn fold_text(text: &str) -> String {
    text.nfd()
        .filter(|c| !is_latin_diacritic(*c))
        .collect::<String>()
        .to_lowercase()
}

/// Normalises a name for Lodestone matching: no accents, unified apostrophes, collapsed whitespace.
pub fn normalize_name(name: &str) -> String {
    fold_text(name)
        .replace('’', "'")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Patch sort key: "7.51" -> 751, "7.5" -> 750, "2.0" -> 200, "6.5a" -> 650.1.
/// A single digit after the dot is tenths. None or unparsable -> -1 (sorted last).
pub fn patch_sort_key(patch: Option<&str>) -> f64 {
    let Some(patch) = patch else { return -1.0 };
    let (major, minor) = patch.split_once('.').unwrap_or((patch, "0"));
    let Ok(major) = major.parse::<u32>() else {
        return -1.0;
    };
    let digits_end = minor
        .find(|c: char| !c.is_ascii_digit())
        .unwrap_or(minor.len());
    let (digits, suffix) = minor.split_at(digits_end);
    let letter = match suffix.as_bytes() {
        [] => Some(0.0),
        [l] if l.is_ascii_alphabetic() => Some(f64::from(l.to_ascii_lowercase() - b'a' + 1)),
        _ => None,
    };
    let (base, letter) = match (digits.parse::<u32>(), letter) {
        (Ok(n), Some(letter)) if digits.len() == 1 => (f64::from(n) * 10.0, letter),
        (Ok(n), Some(letter)) => (f64::from(n), letter),
        _ => (0.0, 0.0),
    };
    f64::from(major) * 100.0 + base + letter * 0.1
}

/// French-like string ordering (stands in for `localeCompare(…, 'fr')`):
/// accents and case are ignored first, then used as tie-breakers.
pub fn compare_fr(a: &str, b: &str) -> Ordering {
    fold_text(a).cmp(&fold_text(b)).then_with(|| a.cmp(b))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_name_strips_accents_unifies_apostrophes_and_collapses_whitespace() {
        assert_eq!(normalize_name("  Élan   d’Été "), "elan d'ete");
        assert_eq!(normalize_name("Chocobo\tNoir"), "chocobo noir");
    }

    #[test]
    fn normalize_name_only_strips_latin_accents_like_the_ts_version() {
        // NFD splits the Japanese voiced marks off but, unlike Latin accents, they are kept.
        assert_eq!(normalize_name("ド"), "ト\u{3099}");
        assert_eq!(normalize_name("パフィン"), "ハ\u{309a}フィン");
        assert_ne!(normalize_name("バ"), normalize_name("ハ"));
    }

    #[test]
    fn patch_sort_key_orders_patches_numerically_with_unknown_last() {
        assert_eq!(patch_sort_key(None), -1.0);
        assert_eq!(patch_sort_key(Some("7.5")), 750.0);
        assert_eq!(patch_sort_key(Some("7.51")), 751.0);
        assert_eq!(patch_sort_key(Some("2.0")), 200.0);
        assert_eq!(patch_sort_key(Some("3")), 300.0);
        assert!(patch_sort_key(Some("6.5a")) > patch_sort_key(Some("6.5")));
        assert!(patch_sort_key(Some("6.5a")) < patch_sort_key(Some("6.51")));
    }

    #[test]
    fn patch_sort_key_treats_a_malformed_minor_as_zero_and_a_malformed_major_as_unknown() {
        assert_eq!(patch_sort_key(Some("7.x")), 700.0);
        assert_eq!(patch_sort_key(Some("x.5")), -1.0);
        assert_eq!(patch_sort_key(Some("")), -1.0);
    }

    #[test]
    fn compare_fr_ignores_accents_and_case_first() {
        assert_eq!(compare_fr("été", "Etude"), Ordering::Less);
        assert_eq!(compare_fr("Zèbre", "abeille"), Ordering::Greater);
        assert_eq!(compare_fr("élan", "elan"), Ordering::Greater);
        assert_eq!(compare_fr("same", "same"), Ordering::Equal);
    }
}
