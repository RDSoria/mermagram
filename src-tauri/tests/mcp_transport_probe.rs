use rmcp::{
    ServerHandler,
    model::{Implementation, ServerCapabilities, ServerConfig},
    transport::streamable_http_server::{
        StreamableHttpServerConfig, StreamableHttpService, session::local::LocalSessionManager,
    },
};
use tokio_util::sync::CancellationToken;

#[derive(Clone)]
struct ProbeServer;

impl ServerHandler for ProbeServer {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::new("mermagram-probe", "0.1.0"))
            .with_instructions("Transport compatibility probe")
    }
}

#[tokio::test]
async fn streamable_http_service_binds_loopback_and_shuts_down() {
    let cancellation = CancellationToken::new();
    let config =
        StreamableHttpServerConfig::default().with_cancellation_token(cancellation.clone());
    let service: StreamableHttpService<ProbeServer, LocalSessionManager> =
        StreamableHttpService::new(|| Ok(ProbeServer), Default::default(), config);
    let router = axum::Router::new().nest_service("/mcp", service);
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("loopback bind should succeed");
    let address = listener
        .local_addr()
        .expect("listener should report address");
    assert!(address.ip().is_loopback());
    assert!(tokio::net::TcpListener::bind(address).await.is_err());

    let server_cancellation = cancellation.clone();
    let server = tokio::spawn(async move {
        axum::serve(listener, router)
            .with_graceful_shutdown(server_cancellation.cancelled_owned())
            .await
            .expect("server should shut down cleanly");
    });

    let response = reqwest::Client::new()
        .post(format!("http://{address}/mcp"))
        .header("content-type", "application/json")
        .header("accept", "application/json, text/event-stream")
        .body(r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"probe","version":"1"}}}"#)
        .send()
        .await
        .expect("MCP initialization should reach the local service");

    assert_eq!(response.status(), reqwest::StatusCode::OK);
    cancellation.cancel();
    server.await.expect("server task should join");
}
