//! XIVAPI v2 sheets: paginated reads and the loose JSON fields they return.

use std::fmt;

use reqwest::Url;
use serde_json::Value;

use super::http::FetchError;
use super::network::Network;

const PAGE_SIZE: &str = "500";
/// Safety stop: the largest sheets read by the app stay well below.
const MAX_ROWS: usize = 30_000;

/// Rows of a whole sheet and the game version reported by the API.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct SheetRows {
    pub rows: Vec<Value>,
    pub version: String,
}

/// A failed sheet read, naming the sheet.
#[derive(Debug, Clone, PartialEq)]
pub struct XivapiError {
    pub sheet: String,
    pub cause: FetchError,
}

impl fmt::Display for XivapiError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match &self.cause {
            FetchError::Status(status) => write!(f, "XIVAPI HTTP {status} ({})", self.sheet),
            cause => write!(f, "XIVAPI {cause} ({})", self.sheet),
        }
    }
}

impl std::error::Error for XivapiError {}

/// Reads every page of a sheet (`after` = last row id), keeping the last reported version.
pub async fn fetch_sheet(
    net: &Network,
    sheet: &str,
    fields: &str,
    language: &str,
) -> Result<SheetRows, XivapiError> {
    let error = |cause| XivapiError {
        sheet: sheet.to_owned(),
        cause,
    };
    let base = format!("{}/{sheet}", net.endpoints.xivapi_sheets);
    let mut result = SheetRows::default();
    let mut after: Option<String> = None;
    while result.rows.len() <= MAX_ROWS {
        let mut params = vec![
            ("language", language),
            ("limit", PAGE_SIZE),
            ("fields", fields),
        ];
        if let Some(after) = &after {
            params.push(("after", after));
        }
        let url = Url::parse_with_params(&base, &params)
            .map_err(|e| error(FetchError::InvalidBody(e.to_string())))?;
        let data = net.http.get_json(url.as_str()).await.map_err(error)?;
        if let Some(version) = data.get("version").and_then(Value::as_str) {
            result.version = version.to_owned();
        }
        let rows = data
            .get("rows")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let Some(last_id) = rows
            .last()
            .and_then(|r| r.get("row_id"))
            .and_then(Value::as_u64)
        else {
            break;
        };
        after = Some(last_id.to_string());
        result.rows.extend(rows);
    }
    Ok(result)
}

/// Id of a relation (`row_id`, or `value` for some nested ones), 0 when absent.
pub fn relation_id(relation: Option<&Value>) -> u32 {
    relation
        .and_then(|r| r.get("row_id").or_else(|| r.get("value")))
        .and_then(Value::as_u64)
        .and_then(|id| u32::try_from(id).ok())
        .unwrap_or(0)
}

/// Like `String(value ?? '')` for the strings and numbers XIVAPI returns.
pub fn text(value: Option<&Value>) -> String {
    match value {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Number(n)) => n.to_string(),
        _ => String::new(),
    }
}

/// Like `Number(value ?? fallback)` for integers.
pub fn integer(value: Option<&Value>, fallback: i64) -> i64 {
    value.and_then(Value::as_f64).map_or(fallback, |n| n as i64)
}

/// The value at a path of nested `fields` objects: `field(row, &["Action", "Name"])`
/// reads `row.fields.Action.fields.Name`.
pub fn field<'a>(row: &'a Value, path: &[&str]) -> Option<&'a Value> {
    path.iter()
        .try_fold(row, |value, name| value.get("fields")?.get(*name))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::net::network::test_support::mock_network;
    use mockito::Matcher;
    use serde_json::json;

    #[test]
    fn reads_loose_fields() {
        let row = json!({ "row_id": 7, "fields": {
            "Name": "Air", "Order": 3, "Count": "x",
            "Action": { "fields": { "Name": "Canon", "Icon": { "path": "ui/a.tex" } } },
            "Cat": { "value": 4 }, "Ref": { "row_id": 9, "value": 1 }
        } });
        assert_eq!(text(field(&row, &["Name"])), "Air");
        assert_eq!(text(field(&row, &["Order"])), "3");
        assert_eq!(text(field(&row, &["Missing"])), "");
        assert_eq!(text(field(&row, &["Action", "Name"])), "Canon");
        assert_eq!(
            field(&row, &["Action", "Icon"]).and_then(|i| i.get("path")),
            Some(&json!("ui/a.tex"))
        );
        assert_eq!(integer(field(&row, &["Order"]), 0), 3);
        assert_eq!(integer(field(&row, &["Count"]), 5), 5);
        assert_eq!(integer(None, 7), 7);
        assert_eq!(relation_id(field(&row, &["Cat"])), 4);
        assert_eq!(relation_id(field(&row, &["Ref"])), 9);
        assert_eq!(relation_id(None), 0);
    }

    #[tokio::test]
    async fn reads_every_page_and_keeps_the_last_version() {
        let mut server = mockito::Server::new_async().await;
        let query = |extra: Matcher| {
            Matcher::AllOf(vec![
                Matcher::UrlEncoded("language".into(), "en".into()),
                Matcher::UrlEncoded("limit".into(), "500".into()),
                Matcher::UrlEncoded("fields".into(), "Name,Icon".into()),
                extra,
            ])
        };
        server
            .mock("GET", "/sheet/Mount")
            .match_query(query(Matcher::Regex("fields=[^&]*$".into())))
            .with_body(
                json!({ "version": "v7.3", "rows": [{ "row_id": 1 }, { "row_id": 2 }] })
                    .to_string(),
            )
            .create_async()
            .await;
        server
            .mock("GET", "/sheet/Mount")
            .match_query(query(Matcher::UrlEncoded("after".into(), "2".into())))
            .with_body(json!({ "rows": [{ "row_id": 3 }] }).to_string())
            .create_async()
            .await;
        server
            .mock("GET", "/sheet/Mount")
            .match_query(query(Matcher::UrlEncoded("after".into(), "3".into())))
            .with_body(json!({ "rows": [] }).to_string())
            .create_async()
            .await;

        let sheet = fetch_sheet(&mock_network(&server.url()), "Mount", "Name,Icon", "en")
            .await
            .unwrap();

        assert_eq!(sheet.rows.len(), 3);
        assert_eq!(sheet.version, "v7.3");
    }

    #[tokio::test]
    async fn names_the_sheet_in_errors() {
        let mut server = mockito::Server::new_async().await;
        server
            .mock("GET", "/sheet/Mount")
            .match_query(Matcher::Any)
            .with_status(404)
            .create_async()
            .await;

        let err = fetch_sheet(&mock_network(&server.url()), "Mount", "Name", "fr")
            .await
            .unwrap_err();

        assert_eq!(err.to_string(), "XIVAPI HTTP 404 (Mount)");
        let network = XivapiError {
            sheet: "Mount".into(),
            cause: FetchError::Network("timeout".into()),
        };
        assert_eq!(network.to_string(), "XIVAPI network error: timeout (Mount)");
    }
}
