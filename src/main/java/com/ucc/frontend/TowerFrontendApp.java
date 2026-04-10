package com.ucc.frontend;

import com.sun.net.httpserver.Headers;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

public final class TowerFrontendApp {
    private static final String DEFAULT_BACKEND_URL = System.getenv().getOrDefault("BACKEND_BASE_URL", "http://localhost:8081");
    private static final String API_KEY = System.getenv().getOrDefault("BACKEND_API_KEY", "decorator-secret-2026");
    private static final int PORT = Integer.parseInt(System.getenv().getOrDefault("PORT", "3000"));

    private TowerFrontendApp() {
    }

    public static void main(String[] args) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress(PORT), 0);
        HttpClient client = HttpClient.newHttpClient();

        server.createContext("/", new StaticAssetHandler("/static/index.html", "text/html; charset=utf-8"));
        server.createContext("/app.js", new StaticAssetHandler("/static/app.js", "application/javascript; charset=utf-8"));
        server.createContext("/styles.css", new StaticAssetHandler("/static/styles.css", "text/css; charset=utf-8"));

        server.createContext("/api/decorators", exchange -> proxy(exchange, client, resolveBackendBase(exchange), "/api/v1/decorators"));
        server.createContext("/api/components", new ComponentsProxyHandler(client));

        server.setExecutor(null);
        server.start();

        System.out.println("Frontend running on http://localhost:" + PORT);
        System.out.println("Backend default base URL: " + DEFAULT_BACKEND_URL);
    }

    private static final class ComponentsProxyHandler implements HttpHandler {
        private final HttpClient client;

        private ComponentsProxyHandler(HttpClient client) {
            this.client = client;
        }

        @Override
        public void handle(HttpExchange exchange) throws IOException {
            String backendBase = resolveBackendBase(exchange);
            String path = exchange.getRequestURI().getPath();

            if ("/api/components".equals(path)) {
                proxy(exchange, client, backendBase, "/api/v1/components");
                return;
            }

            if ("/api/components/simulate".equals(path)) {
                proxy(exchange, client, backendBase, "/api/v1/components/simulate");
                return;
            }

            if (path.startsWith("/api/components/")) {
                String suffix = path.substring("/api/components/".length());
                String[] parts = suffix.split("/");

                if (parts.length == 1 && !parts[0].isBlank()) {
                    proxy(exchange, client, backendBase, "/api/v1/components/" + encodePathSegment(parts[0]));
                    return;
                }

                if (parts.length == 2 && "decorators".equals(parts[1])) {
                    proxy(exchange, client, backendBase, "/api/v1/components/" + encodePathSegment(parts[0]) + "/decorators");
                    return;
                }

                if (parts.length == 3 && "decorators".equals(parts[1])) {
                    proxy(exchange, client, backendBase, "/api/v1/components/" + encodePathSegment(parts[0]) + "/decorators/" + encodePathSegment(parts[2]));
                    return;
                }
            }

            sendText(exchange, 404, "Not found");
        }
    }

    private static final class StaticAssetHandler implements HttpHandler {
        private final String contentType;

        private StaticAssetHandler(String resourcePath, String contentType) {
            this.contentType = contentType;
        }

        @Override
        public void handle(HttpExchange exchange) throws IOException {
            String path = exchange.getRequestURI().getPath();
            if ("/".equals(path)) {
                path = "/index.html";
            }

            String targetResource = switch (path) {
                case "/", "/index.html" -> "/static/index.html";
                case "/app.js" -> "/static/app.js";
                case "/styles.css" -> "/static/styles.css";
                default -> null;
            };

            if (targetResource == null) {
                sendText(exchange, 404, "Not found");
                return;
            }

            try (InputStream inputStream = TowerFrontendApp.class.getResourceAsStream(targetResource)) {
                if (inputStream == null) {
                    sendText(exchange, 500, "Missing resource: " + targetResource);
                    return;
                }

                byte[] body = inputStream.readAllBytes();
                Headers headers = exchange.getResponseHeaders();
                headers.set("Content-Type", contentType);
                headers.set("Cache-Control", "no-store");
                exchange.sendResponseHeaders(200, body.length);
                exchange.getResponseBody().write(body);
            } finally {
                exchange.close();
            }
        }
    }

    private static void proxy(HttpExchange exchange, HttpClient client, String backendBase, String targetPath) throws IOException {
        try {
            URI targetUri = buildTargetUri(backendBase, targetPath, exchange.getRequestURI().getRawQuery());
            HttpRequest.Builder requestBuilder = HttpRequest.newBuilder(targetUri);
            requestBuilder.method(exchange.getRequestMethod(), requestBodyPublisher(exchange));
            requestBuilder.header("X-API-KEY", API_KEY);

            String contentType = exchange.getRequestHeaders().getFirst("Content-Type");
            if (contentType != null && !contentType.isBlank()) {
                requestBuilder.header("Content-Type", contentType);
            }

            HttpResponse<byte[]> response = client.send(requestBuilder.build(), HttpResponse.BodyHandlers.ofByteArray());

            Headers responseHeaders = exchange.getResponseHeaders();
            String responseContentType = response.headers().firstValue("content-type").orElse("application/json; charset=utf-8");
            responseHeaders.set("Content-Type", responseContentType);
            responseHeaders.set("Cache-Control", "no-store");

            byte[] body = Objects.requireNonNullElseGet(response.body(), () -> new byte[0]);
            exchange.sendResponseHeaders(response.statusCode(), body.length);
            exchange.getResponseBody().write(body);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            sendText(exchange, 500, "Request interrupted");
        } catch (Exception ex) {
            sendText(exchange, 502, "Proxy error: " + ex.getMessage());
        } finally {
            exchange.close();
        }
    }

    private static HttpRequest.BodyPublisher requestBodyPublisher(HttpExchange exchange) throws IOException {
        if ("GET".equalsIgnoreCase(exchange.getRequestMethod()) || "DELETE".equalsIgnoreCase(exchange.getRequestMethod()) || "HEAD".equalsIgnoreCase(exchange.getRequestMethod())) {
            return HttpRequest.BodyPublishers.noBody();
        }

        byte[] body = exchange.getRequestBody().readAllBytes();
        return body.length == 0 ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofByteArray(body);
    }

    private static URI buildTargetUri(String backendBase, String targetPath, String rawQuery) {
        URI backendUri = URI.create(backendBase);
        String basePath = backendUri.getPath() == null ? "" : backendUri.getPath().replaceAll("/+$", "");
        String path = normalizePath(basePath + targetPath);
        String query = sanitizeQuery(rawQuery);

        try {
            return new URI(backendUri.getScheme(), backendUri.getAuthority(), path, query, null);
        } catch (Exception ex) {
            throw new IllegalArgumentException("Invalid backend URL", ex);
        }
    }

    private static String sanitizeQuery(String rawQuery) {
        if (rawQuery == null || rawQuery.isBlank()) {
            return null;
        }

        List<String> pairs = new ArrayList<>();
        for (String part : rawQuery.split("&")) {
            if (part.isBlank() || part.startsWith("backend=")) {
                continue;
            }
            pairs.add(part);
        }

        return pairs.isEmpty() ? null : String.join("&", pairs);
    }

    private static String normalizePath(String path) {
        if (path == null || path.isBlank()) {
            return "/";
        }

        String normalized = path.replaceAll("//+", "/");
        return normalized.startsWith("/") ? normalized : "/" + normalized;
    }

    private static String resolveBackendBase(HttpExchange exchange) {
        String rawQuery = exchange.getRequestURI().getRawQuery();
        if (rawQuery == null || rawQuery.isBlank()) {
            return DEFAULT_BACKEND_URL;
        }

        Map<String, String> params = parseQuery(rawQuery);
        return params.getOrDefault("backend", DEFAULT_BACKEND_URL);
    }

    private static Map<String, String> parseQuery(String rawQuery) {
        Map<String, String> params = new HashMap<>();
        for (String part : rawQuery.split("&")) {
            if (part.isBlank()) {
                continue;
            }

            String[] keyValue = part.split("=", 2);
            String key = decodeUrl(keyValue[0]);
            String value = keyValue.length > 1 ? decodeUrl(keyValue[1]) : "";
            params.put(key, value);
        }
        return params;
    }

    private static String decodeUrl(String value) {
        return java.net.URLDecoder.decode(value, StandardCharsets.UTF_8);
    }

    private static String encodePathSegment(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    private static void sendText(HttpExchange exchange, int statusCode, String message) throws IOException {
        byte[] body = message.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "text/plain; charset=utf-8");
        exchange.sendResponseHeaders(statusCode, body.length);
        exchange.getResponseBody().write(body);
        exchange.close();
    }
}
