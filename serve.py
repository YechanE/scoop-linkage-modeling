"""Start the offline linkage editor and open it in the default browser."""

from __future__ import annotations

import functools
import http.server
import threading
import webbrowser
from pathlib import Path


HOST = "127.0.0.1"
PORT = 8765
ROOT = Path(__file__).resolve().parent


def main() -> None:
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)
    server = http.server.ThreadingHTTPServer((HOST, PORT), handler)
    url = f"http://{HOST}:{PORT}/"
    print(f"Scoop Linkage Studio: {url}")
    print("종료하려면 이 창에서 Ctrl+C를 누르세요.")
    threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
