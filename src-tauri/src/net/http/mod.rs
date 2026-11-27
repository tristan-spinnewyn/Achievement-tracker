//! HTTP GET with retries and exponential backoff.
//!
//! Network errors, 5xx and 429 are retried; any other status is returned to
//! the caller, which decides what a 404 means.

use std::fmt;
use std::time::Duration;

use reqwest::{Client, Response, StatusCode};

const MAX_DELAY: Duration = Duration::from_secs(10);

/// How many times and how patiently a request is retried.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct RetryPolicy {
    pub retries: u32,
    pub base_delay: Duration,
    pub timeout: Duration,
}

impl Default for RetryPolicy {
    fn default() -> Self {
        Self {
            retries: 3,
            base_delay: Duration::from_secs(1),
            timeout: Duration::from_secs(30),
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum FetchError {
    /// The server kept answering with this retryable status.
    Status(u16),
    /// Every attempt failed before getting a response (timeout, DNS, connection…).
    Network(String),
    /// The response body is not what was expected (e.g. invalid JSON).
    InvalidBody(String),
}

impl fmt::Display for FetchError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Status(status) => write!(f, "HTTP {status}"),
            Self::Network(message) => write!(f, "network error: {message}"),
            Self::InvalidBody(message) => write!(f, "invalid response: {message}"),
        }
    }
}

impl std::error::Error for FetchError {}

/// Shared HTTP client (connection pool) with its retry policy.
#[derive(Debug, Clone)]
pub struct HttpClient {
    client: Client,
    policy: RetryPolicy,
}

impl HttpClient {
    pub fn new(policy: RetryPolicy) -> Self {
        let client = Client::builder()
            .timeout(policy.timeout)
            .build()
            .expect("valid HTTP client configuration");
        Self { client, policy }
    }

    /// GET with retries; returns the response of the first non-retryable attempt.
    pub async fn get(&self, url: &str, headers: &[(&str, &str)]) -> Result<Response, FetchError> {
        let mut last_error = FetchError::Network("no attempt".into());
        for attempt in 0..=self.policy.retries {
            let request = headers
                .iter()
                .fold(self.client.get(url), |r, (name, value)| {
                    r.header(*name, *value)
                });
            match request.send().await {
                Ok(response) if !is_retryable(response.status()) => return Ok(response),
                Ok(response) => last_error = FetchError::Status(response.status().as_u16()),
                Err(err) => last_error = FetchError::Network(err.to_string()),
            }
            if attempt < self.policy.retries {
                tokio::time::sleep(backoff_delay(attempt, self.policy.base_delay)).await;
            }
        }
        Err(last_error)
    }

    /// GET returning the body as text (whatever the status, like the TS helper).
    pub async fn get_text(
        &self,
        url: &str,
        headers: &[(&str, &str)],
    ) -> Result<String, FetchError> {
        let response = self.get(url, headers).await?;
        response
            .text()
            .await
            .map_err(|err| FetchError::Network(err.to_string()))
    }

    /// GET a successful JSON response; any other status is an error.
    pub async fn get_json(&self, url: &str) -> Result<serde_json::Value, FetchError> {
        let body = self
            .get_success(url)
            .await?
            .bytes()
            .await
            .map_err(|err| FetchError::Network(err.to_string()))?;
        serde_json::from_slice(&body).map_err(|err| FetchError::InvalidBody(err.to_string()))
    }

    /// GET a successful response's raw bytes (images).
    pub async fn get_bytes(&self, url: &str) -> Result<Vec<u8>, FetchError> {
        let body = self
            .get_success(url)
            .await?
            .bytes()
            .await
            .map_err(|err| FetchError::Network(err.to_string()))?;
        Ok(body.to_vec())
    }

    /// GET whose non-2xx status is an error.
    async fn get_success(&self, url: &str) -> Result<Response, FetchError> {
        let response = self.get(url, &[]).await?;
        if !response.status().is_success() {
            return Err(FetchError::Status(response.status().as_u16()));
        }
        Ok(response)
    }
}

fn is_retryable(status: StatusCode) -> bool {
    status.is_server_error() || status == StatusCode::TOO_MANY_REQUESTS
}

/// Exponential backoff with up to 20% jitter, capped.
fn backoff_delay(attempt: u32, base: Duration) -> Duration {
    let exponential = base.saturating_mul(2u32.saturating_pow(attempt));
    // Jitter from the clock: enough to spread retries, no RNG dependency needed.
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.subsec_nanos());
    let jitter = exponential.mul_f64(0.2 * f64::from(nanos % 1000) / 1000.0);
    (exponential + jitter).min(MAX_DELAY)
}

#[cfg(test)]
mod tests;
