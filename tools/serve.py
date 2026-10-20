"""Local static server with caching disabled (for development)."""
import http.server
import os
import sys
import time
import urllib.request


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def already_served(port):
    try:
        urllib.request.urlopen("http://127.0.0.1:%d/index.html" % port, timeout=2).close()
        return True
    except Exception:
        return False


if __name__ == "__main__":
    os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
    try:
        server = http.server.ThreadingHTTPServer(("127.0.0.1", port), NoCache)
    except OSError:
        # the port is taken: if a server is already answering there, keep this process alive so the preview uses it
        if not already_served(port):
            raise
        print("port %d is already being served; using that server" % port, flush=True)
        while True:
            time.sleep(3600)
    server.serve_forever()
