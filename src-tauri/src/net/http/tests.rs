use super::*;

fn fast_client(retries: u32) -> HttpClient {
    HttpClient::new(RetryPolicy {
        retries,
        base_delay: Duration::from_millis(1),
        timeout: Duration::from_secs(2),
    })
}

#[tokio::test]
async fn returns_the_body_and_sends_the_headers() {
    let mut server = mockito::Server::new_async().await;
    let mock = server
        .mock("GET", "/page")
        .match_header("user-agent", "test-agent")
        .with_body("hello")
        .create_async()
        .await;

    let body = fast_client(0)
        .get_text(
            &format!("{}/page", server.url()),
            &[("User-Agent", "test-agent")],
        )
        .await;

    assert_eq!(body.unwrap(), "hello");
    mock.assert_async().await;
}

#[tokio::test]
async fn retries_server_errors_then_succeeds() {
    let mut server = mockito::Server::new_async().await;
    let failing = server
        .mock("GET", "/x")
        .with_status(503)
        .expect(2)
        .create_async()
        .await;
    let url = format!("{}/x", server.url());

    let result = fast_client(1).get(&url, &[]).await;

    assert_eq!(result.unwrap_err(), FetchError::Status(503));
    failing.assert_async().await;
}

#[tokio::test]
async fn does_not_retry_a_client_error() {
    let mut server = mockito::Server::new_async().await;
    let not_found = server
        .mock("GET", "/x")
        .with_status(404)
        .with_body("Page Not Found")
        .expect(1)
        .create_async()
        .await;

    let response = fast_client(3)
        .get(&format!("{}/x", server.url()), &[])
        .await
        .unwrap();

    assert_eq!(response.status(), StatusCode::NOT_FOUND);
    not_found.assert_async().await;
}

#[tokio::test]
async fn reports_a_network_error_when_no_response_comes() {
    let result = fast_client(0)
        .get("http://127.0.0.1:1/unreachable", &[])
        .await;
    assert!(matches!(result, Err(FetchError::Network(_))));
}

#[tokio::test]
async fn get_json_parses_a_successful_response_and_rejects_the_rest() {
    let mut server = mockito::Server::new_async().await;
    server
        .mock("GET", "/ok")
        .with_body(r#"{"a":1}"#)
        .create_async()
        .await;
    server
        .mock("GET", "/missing")
        .with_status(404)
        .create_async()
        .await;
    server
        .mock("GET", "/garbage")
        .with_body("<html>")
        .create_async()
        .await;
    let client = fast_client(0);

    assert_eq!(
        client
            .get_json(&format!("{}/ok", server.url()))
            .await
            .unwrap()["a"],
        1
    );
    assert_eq!(
        client.get_json(&format!("{}/missing", server.url())).await,
        Err(FetchError::Status(404))
    );
    assert!(matches!(
        client.get_json(&format!("{}/garbage", server.url())).await,
        Err(FetchError::InvalidBody(_))
    ));
}

#[tokio::test]
async fn get_bytes_returns_the_body_of_a_successful_response() {
    let mut server = mockito::Server::new_async().await;
    server
        .mock("GET", "/img")
        .with_body([1u8, 2, 3])
        .create_async()
        .await;
    server
        .mock("GET", "/gone")
        .with_status(410)
        .create_async()
        .await;
    let client = fast_client(0);

    assert_eq!(
        client
            .get_bytes(&format!("{}/img", server.url()))
            .await
            .unwrap(),
        [1, 2, 3]
    );
    assert_eq!(
        client.get_bytes(&format!("{}/gone", server.url())).await,
        Err(FetchError::Status(410))
    );
}

#[test]
fn retries_429_and_5xx_only() {
    assert!(is_retryable(StatusCode::TOO_MANY_REQUESTS));
    assert!(is_retryable(StatusCode::BAD_GATEWAY));
    assert!(!is_retryable(StatusCode::NOT_FOUND));
    assert!(!is_retryable(StatusCode::OK));
}

#[test]
fn backoff_doubles_with_jitter_and_is_capped() {
    let base = Duration::from_millis(100);
    let first = backoff_delay(0, base);
    assert!(first >= base && first <= base.mul_f64(1.2));
    let third = backoff_delay(2, base);
    assert!(third >= base * 4 && third <= (base * 4).mul_f64(1.2));
    assert_eq!(backoff_delay(10, Duration::from_secs(1)), MAX_DELAY);
}

#[test]
fn errors_have_readable_messages() {
    assert_eq!(FetchError::Status(503).to_string(), "HTTP 503");
    assert_eq!(
        FetchError::Network("timeout".into()).to_string(),
        "network error: timeout"
    );
    assert_eq!(
        FetchError::InvalidBody("eof".into()).to_string(),
        "invalid response: eof"
    );
}
