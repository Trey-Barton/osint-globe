#!/usr/bin/env python3
"""
OSINT Globe dev server.

Serves static files from this directory AND reverse-proxies CORS-restricted
upstream APIs so the browser can fetch them same-origin.

Usage:
    python3 server.py [port]

Add an upstream: append to UPSTREAMS and reference it from your data source via
the same key (e.g. /proxy/opensky/...).
"""
from __future__ import annotations

import sys
import urllib.request
import urllib.error
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent

# Whitelisted upstreams. Keep this tight — anything added here is publicly
# reachable through this dev server while it's running.
UPSTREAMS: dict[str, str] = {
    "opensky":      "https://opensky-network.org",
    "adsbmil":      "https://api.adsb.lol",
    "gibs":         "https://gibs.earthdata.nasa.gov",
    "awsterrain":   "https://s3.amazonaws.com/elevation-tiles-prod",
}

# Per-upstream behavior. For tile imagery we want to forward upstream's Cache-Control
# so the browser cache is effective; for live API data we always set no-store.
TILE_UPSTREAMS = {"gibs", "awsterrain"}

PROXY_PREFIX = "/proxy/"
FETCH_TIMEOUT_S = 15


class Handler(SimpleHTTPRequestHandler):
    # Serve relative to the script dir, not the CWD, so `python3 server.py`
    # works no matter where you run it from.
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self) -> None:  # noqa: N802
        if self.path.startswith(PROXY_PREFIX):
            self._proxy()
            return
        super().do_GET()

    def do_HEAD(self) -> None:  # noqa: N802
        if self.path.startswith(PROXY_PREFIX):
            # Cheap: reuse the proxy (upstream HEAD would be nicer but most tile
            # servers handle GET fine and we need the Content-Length anyway).
            self._proxy()
            return
        super().do_HEAD()

    def end_headers(self) -> None:
        # Dev mode: never cache local source. ES module caching is aggressive
        # and survives location.reload() in some browsers — this kills it.
        path = (self.path or "").split("?", 1)[0]
        if path.endswith((".js", ".css", ".html", ".json")) or path == "/" or path.endswith("/"):
            self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    # Pretty up the log line.
    def log_message(self, fmt: str, *args) -> None:  # noqa: A003
        sys.stderr.write(f"[osint-globe] {self.address_string()} {fmt % args}\n")

    def _proxy(self) -> None:
        rest = self.path[len(PROXY_PREFIX):]
        key, _, tail = rest.partition("/")
        base = UPSTREAMS.get(key)
        if not base:
            self.send_error(404, f"Unknown upstream: {key}")
            return

        upstream_url = f"{base}/{tail}"
        req = urllib.request.Request(
            upstream_url,
            headers={
                "Accept": "application/json",
                "User-Agent": "osint-globe/0.1 (+local dev proxy)",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=FETCH_TIMEOUT_S) as resp:
                body = resp.read()
                self.send_response(resp.status)
                content_type = resp.headers.get("Content-Type", "application/json")
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Access-Control-Allow-Origin", "*")
                # Forward upstream cache headers for tile servers; force no-store for APIs.
                if key in TILE_UPSTREAMS:
                    cache_ctl = resp.headers.get("Cache-Control", "public, max-age=86400")
                    self.send_header("Cache-Control", cache_ctl)
                else:
                    self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(body)
        except urllib.error.HTTPError as e:
            body = e.read() if e.fp else b""
            self.send_response(e.code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body or f'{{"error":"upstream {e.code}"}}'.encode())
        except Exception as e:
            self.send_error(502, f"Proxy error: {e}")


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print(f"[osint-globe] serving {ROOT} on http://localhost:{port}")
    print(f"[osint-globe] proxy prefix: {PROXY_PREFIX}  upstreams: {list(UPSTREAMS)}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n[osint-globe] bye")


if __name__ == "__main__":
    main()
