//! Text signals of the difficulty score, read from the lowercased name and
//! description (French and English), ported from `src/main/services/difficulty.ts`.

use std::sync::LazyLock;

use regex::Regex;

pub const TIER_CAP: f64 = 80.0;
pub const GRIND_CAP: f64 = 25.0;
pub const CHALLENGE_CAP: f64 = 20.0;

/// `(?-u:\b)` is an ASCII word boundary, like `\b` in a JavaScript regex without the `u` flag.
fn regex(pattern: &str) -> Regex {
    Regex::new(pattern).expect("valid difficulty regex")
}

static ULTIMATE: LazyLock<Regex> = LazyLock::new(|| regex("ultime|ultimate"));
static SAVAGE: LazyLock<Regex> = LazyLock::new(|| regex("sadique|savage|élitiste"));
static CRITERION: LazyLock<Regex> = LazyLock::new(|| regex("critères?|criterion|mésaventure"));
static EXTREME: LazyLock<Regex> = LazyLock::new(|| regex(r"extrême|extreme|\(ex\)"));
static UNREAL: LazyLock<Regex> = LazyLock::new(|| regex("irréel|unreal"));
static GRIND_VERBS: LazyLock<Regex> = LazyLock::new(|| {
    regex(
        r"vaincre|battre|tuer|abattre|récolt|pêch|synthétis|fabriqu|obtenir|gagner|remport|termin|complét|atteindre|accumul|defeat|complet|gather|catch|craft|reach(?-u:\b)|earn|win(?-u:\b)|obtain|collect",
    )
});
static NO_HIT: LazyLock<Regex> = LazyLock::new(|| {
    regex(
        r"sans subir|sans être|sans qu['e]|sans aucun|sans prendre|deathless|without taking|no[- ]?hit",
    )
});
static SOLO: LazyLock<Regex> = LazyLock::new(|| regex(r"(?-u:\b)solo(?-u:\b)|en solitaire"));
static TIMED: LazyLock<Regex> = LazyLock::new(|| regex("en moins de|in under|in less than"));
static DIGITS: LazyLock<Regex> = LazyLock::new(|| regex("[0-9]+"));

/// Content tier (Ultimate / Savage / Extreme…), the strongest signal: the
/// highest matching tier, not a sum.
pub fn tier_score(text: &str) -> f64 {
    let savage = SAVAGE.is_match(text);
    let criterion = CRITERION.is_match(text);
    if ULTIMATE.is_match(text) {
        TIER_CAP
    } else if criterion && savage {
        64.0
    } else if savage {
        58.0
    } else if criterion {
        42.0
    } else if EXTREME.is_match(text) {
        40.0
    } else if UNREAL.is_match(text) {
        36.0
    } else {
        0.0
    }
}

fn is_ascii_word(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

/// True when `chars[start..]` begins with exactly three digits (a thousands group).
fn starts_thousands_group(chars: &[char], start: usize) -> bool {
    let group = chars
        .get(start..start + 3)
        .is_some_and(|g| g.iter().all(char::is_ascii_digit));
    group && chars.get(start + 3).is_none_or(|c| !is_ascii_word(*c))
}

/// Removes the separators of thousands groups: "10 000" -> "10000".
fn merge_thousands(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    chars
        .iter()
        .enumerate()
        .filter(|(i, c)| {
            let is_separator = c.is_whitespace() || **c == ',';
            let after_digit = *i > 0 && chars[i - 1].is_ascii_digit();
            !(is_separator && after_digit && starts_thousands_group(&chars, i + 1))
        })
        .map(|(_, c)| c)
        .collect()
}

/// Largest integer of the text, thousands groups merged ("10 000", "10,000").
pub fn largest_number(text: &str) -> f64 {
    DIGITS
        .find_iter(&merge_thousands(text))
        .filter_map(|m| m.as_str().parse::<f64>().ok())
        .fold(0.0, f64::max)
}

/// Grind: large repetitive volumes (defeat N enemies, reach rank N…).
pub fn grind_score(text: &str) -> f64 {
    if !GRIND_VERBS.is_match(text) {
        return 0.0;
    }
    let n = largest_number(text);
    if n < 50.0 {
        return 0.0;
    }
    (8.0 * (n.log10() - 1.3)).clamp(0.0, GRIND_CAP)
}

/// Challenge constraints stacking on top of a tier (no-hit, solo, speedrun).
pub fn challenge_score(text: &str) -> f64 {
    let mut score = 0.0;
    if NO_HIT.is_match(text) {
        score += 18.0;
    }
    if SOLO.is_match(text) {
        score += 12.0;
    }
    if TIMED.is_match(text) {
        score += 10.0;
    }
    f64::min(CHALLENGE_CAP, score)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tiers_are_ordered_unreal_extreme_savage_ultimate() {
        assert_eq!(tier_score("tombeur de titan"), 0.0);
        assert_eq!(tier_score("tombeur de titan (irréel)"), 36.0);
        assert_eq!(tier_score("tombeur de titan (extrême)"), 40.0);
        assert_eq!(tier_score("titan (ex)"), 40.0);
        assert_eq!(tier_score("mode critère"), 42.0);
        assert_eq!(tier_score("tombeur de titan (sadique)"), 58.0);
        assert_eq!(tier_score("critères sadique"), 64.0);
        assert_eq!(tier_score("la légende d’alexander (ultime)"), TIER_CAP);
    }

    #[test]
    fn tiers_are_detected_in_english_too() {
        assert_eq!(tier_score("boss (savage)"), tier_score("boss (sadique)"));
        assert_eq!(tier_score("the ultimate legend"), TIER_CAP);
        assert_eq!(tier_score("unreal trial"), 36.0);
        assert_eq!(tier_score("criterion dungeon"), 42.0);
    }

    #[test]
    fn largest_number_merges_thousands_groups() {
        assert_eq!(largest_number("vaincre 10 000 ennemis"), 10_000.0);
        assert_eq!(largest_number("defeat 10,000 enemies"), 10_000.0);
        assert_eq!(largest_number("1 000 000 gils"), 1_000_000.0);
        assert_eq!(largest_number("vaincre\u{202f}5\u{a0}000 ennemis"), 5_000.0);
        assert_eq!(largest_number("rang 25, puis 300"), 300.0);
        assert_eq!(largest_number("12 3456"), 3456.0);
        assert_eq!(largest_number("sans nombre"), 0.0);
    }

    #[test]
    fn grind_needs_a_verb_and_a_large_number() {
        assert_eq!(grind_score("vaincre 10 ennemis"), 0.0);
        assert_eq!(grind_score("objet numéro 5000 du catalogue"), 0.0);
        assert!(grind_score("vaincre 10 000 ennemis") > grind_score("vaincre 100 ennemis"));
        assert!(grind_score("defeat 100 enemies") > 0.0);
        assert_eq!(grind_score("win 1000000000 matches"), GRIND_CAP);
    }

    #[test]
    fn grind_word_boundaries_are_respected() {
        assert_eq!(grind_score("winner of 500 votes"), 0.0);
        assert!(grind_score("win 500 matches") > 0.0);
        assert!(grind_score("reach 500 points") > 0.0);
        assert_eq!(grind_score("reaches 500 points"), 0.0);
    }

    #[test]
    fn challenge_constraints_stack_up_to_the_cap() {
        assert_eq!(challenge_score("terminer le donjon"), 0.0);
        assert_eq!(challenge_score("sans subir de dégâts"), 18.0);
        assert_eq!(challenge_score("en solitaire"), 12.0);
        assert_eq!(challenge_score("in under 30 minutes"), 10.0);
        assert_eq!(
            challenge_score("solo, no-hit, in less than 5 min"),
            CHALLENGE_CAP
        );
        assert_eq!(challenge_score("consolidation"), 0.0);
    }
}
