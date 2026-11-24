//! Achievement search with AND / OR / NOT operators (port of `src/main/services/search.ts`).
//!
//! Operators are evaluated left to right and parentheses are ignored, like the
//! TS version. Terms match as substrings of the name, description, category and
//! kind; the fuzzy single-term matching of FlexSearch is refined in phase 2.

use crate::models::views::AchievementRow;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Operator {
    And,
    Or,
    Not,
}

/// A parsed search query.
#[derive(Debug, Clone, PartialEq)]
pub struct SearchQuery {
    terms: Vec<String>,
    operators: Vec<Operator>,
}

/// Operator keywords as they appear after a space, with the length to skip (" and ").
const OPERATORS: [(&str, Operator); 3] = [
    ("and ", Operator::And),
    ("or ", Operator::Or),
    ("not ", Operator::Not),
];

impl SearchQuery {
    pub fn parse(query: &str) -> Self {
        let query = query.to_lowercase();
        let query = query.trim();
        let has_operator = OPERATORS
            .iter()
            .any(|(word, _)| query.contains(&format!(" {word}")));
        if !has_operator {
            return Self {
                terms: vec![query.to_owned()],
                operators: vec![],
            };
        }

        let mut terms = Vec::new();
        let mut operators = Vec::new();
        let mut current = String::new();
        let mut i = 0;
        while let Some(c) = query[i..].chars().next() {
            let rest = &query[i..];
            if rest.starts_with("  ") {
                i += 1;
                continue;
            }
            let operator = (c == ' ')
                .then(|| {
                    OPERATORS
                        .iter()
                        .find(|(word, _)| rest[1..].starts_with(word))
                })
                .flatten();
            if let Some((word, operator)) = operator {
                if !current.is_empty() {
                    terms.push(std::mem::take(&mut current));
                }
                operators.push(*operator);
                i += 1 + word.len();
            } else {
                if c != '(' && c != ')' {
                    current.push(c);
                }
                i += c.len_utf8();
            }
        }
        if !current.is_empty() {
            terms.push(current);
        }
        Self { terms, operators }
    }

    pub fn matches(&self, row: &AchievementRow) -> bool {
        let text = format!(
            "{} {} {} {}",
            row.achievement.name, row.achievement.description, row.category_name, row.kind_name
        )
        .to_lowercase();
        let Some((first, rest)) = self.terms.split_first() else {
            return true;
        };
        rest.iter().zip(&self.operators).fold(
            text.contains(first.as_str()),
            |result, (term, operator)| {
                let found = text.contains(term.as_str());
                match operator {
                    Operator::And => result && found,
                    Operator::Or => result || found,
                    Operator::Not => result && !found,
                }
            },
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repo::test_support::row;

    fn terms(query: &str) -> Vec<String> {
        SearchQuery::parse(query).terms
    }

    #[test]
    fn a_query_without_operators_is_a_single_term() {
        assert_eq!(terms("  Mount Dragon "), ["mount dragon"]);
        assert_eq!(terms("android"), ["android"]);
    }

    #[test]
    fn operators_split_the_query_into_terms() {
        let q = SearchQuery::parse("mount AND combat or dragon NOT pvp");
        assert_eq!(q.terms, ["mount", "combat", "dragon", "pvp"]);
        assert_eq!(q.operators, [Operator::And, Operator::Or, Operator::Not]);
    }

    #[test]
    fn parentheses_and_repeated_spaces_are_ignored() {
        assert_eq!(
            terms("(mount  or dragon) and combat"),
            ["mount", "dragon", "combat"]
        );
        assert_eq!(terms("( and )"), Vec::<String>::new());
    }

    #[test]
    fn matches_terms_in_name_description_category_and_kind() {
        let r = row(1, "Chocobo Racer", "Win a race", "Gold Saucer", "Leisure");
        for q in ["chocobo", "WIN A", "saucer", "leisure", ""] {
            assert!(SearchQuery::parse(q).matches(&r), "{q} should match");
        }
        assert!(!SearchQuery::parse("dragon").matches(&r));
    }

    #[test]
    fn evaluates_operators_left_to_right() {
        let r = row(
            1,
            "Mount Collector",
            "Obtain mounts",
            "Mounts",
            "Collection",
        );
        assert!(SearchQuery::parse("mount and collector").matches(&r));
        assert!(!SearchQuery::parse("mount and dragon").matches(&r));
        assert!(SearchQuery::parse("dragon or mount").matches(&r));
        assert!(!SearchQuery::parse("mount not collector").matches(&r));
        assert!(SearchQuery::parse("mount not dragon").matches(&r));
        assert!(SearchQuery::parse("( and )").matches(&r));
    }
}
