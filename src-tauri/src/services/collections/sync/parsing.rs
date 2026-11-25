//! Reading the Lodestone collection pages: tooltip hashes and tooltip names.

use std::sync::LazyLock;

use regex::{Captures, Regex};

const MAX_ITEMS: usize = 1500;

static ENTITY: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)&#([0-9]+);|&#x([0-9a-f]+);|&(quot|apos|amp|lt|gt);").expect("valid regex")
});
static TOOLTIP_NAME: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"__header__(?:label|name)">([^<]+)<"#).expect("valid regex"));

fn named_entity(name: &str) -> char {
    match name.to_ascii_lowercase().as_str() {
        "quot" => '"',
        "apos" => '\'',
        "amp" => '&',
        "lt" => '<',
        _ => '>',
    }
}

/// Decodes the HTML entities of a tooltip name (`&#39;`, `&#x27;`, `&amp;`…).
pub fn decode_entities(text: &str) -> String {
    ENTITY
        .replace_all(text, |caps: &Captures| {
            let decoded = if let Some(dec) = caps.get(1) {
                dec.as_str().parse().ok().and_then(char::from_u32)
            } else if let Some(hex) = caps.get(2) {
                u32::from_str_radix(hex.as_str(), 16)
                    .ok()
                    .and_then(char::from_u32)
            } else {
                caps.get(3).map(|named| named_entity(named.as_str()))
            };
            decoded.map_or_else(|| caps[0].to_owned(), String::from)
        })
        .into_owned()
}

/// Distinct tooltip hashes of a collection page, in order (capped).
pub fn tooltip_hashes(html: &str, path: &str) -> Vec<String> {
    let pattern =
        Regex::new(&format!("{}/tooltip/([0-9a-f]+)", regex::escape(path))).expect("valid regex");
    let mut hashes: Vec<String> = Vec::new();
    for caps in pattern.captures_iter(html) {
        if hashes.len() == MAX_ITEMS {
            break;
        }
        if !hashes.iter().any(|h| h == &caps[1]) {
            hashes.push(caps[1].to_owned());
        }
    }
    hashes
}

/// Item name of a tooltip fragment (`__header__label` or `__header__name`).
pub fn tooltip_name(fragment: &str) -> Option<String> {
    TOOLTIP_NAME
        .captures(fragment)
        .map(|caps| decode_entities(caps[1].trim()))
}
