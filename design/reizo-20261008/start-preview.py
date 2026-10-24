"""Serve only the bundled static website on this computer."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import webbrowser


def main():
    root = Path(__file__).resolve().parent / "site"
    if not (root / "index.html").is_file():
        raise SystemExit("Please extract the complete review package first.")
    handler = partial(SimpleHTTPRequestHandler, directory=str(root))
    with ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
        url = f"http://127.0.0.1:{server.server_port}/index.html"
        print(f"REIZO review: {url}", flush=True)
        print("Keep this window open. Press Ctrl+C to stop.", flush=True)
        try:
            webbrowser.open(url)
        except Exception:
            print("Open the address above in your browser.", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
