"""Dev server with caching disabled: python tools/serve.py [port]"""
import http.server, sys, os, functools
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store'); super().end_headers()
    def log_message(self, *a): pass
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8793
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
class Server(http.server.ThreadingHTTPServer):
    # Models, sounds and worker modules arrive together during reload tests.
    request_queue_size = 128
Server(('127.0.0.1', port), functools.partial(H, directory=root)).serve_forever()
