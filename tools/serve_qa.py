"""Loopback-only QA server. Evidence POSTs are accepted solely from its own origin."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import json, base64, re, sys
root=Path(__file__).resolve().parents[1]
port=int(sys.argv[1]) if len(sys.argv)>1 else 8798
out=Path(r'C:\Users\afahm\Documents\ChatGPT\Claustrophobia\artifacts\demo-visual-verification-20260912');out.mkdir(parents=True,exist_ok=True)
class H(SimpleHTTPRequestHandler):
    def __init__(self,*a,**kw):super().__init__(*a,directory=str(root),**kw)
    def log_message(self,*a):pass
    def end_headers(self):self.send_header('Cache-Control','no-store');super().end_headers()
    def do_POST(self):
        if self.path!='/evidence' or self.headers.get('Origin')!=f'http://127.0.0.1:{port}':self.send_error(403);return
        size=int(self.headers.get('Content-Length','0'))
        if size>12_000_000:self.send_error(413);return
        data=json.loads(self.rfile.read(size));name=data.get('name','')
        if not re.fullmatch('[a-z0-9-]{1,60}',name):self.send_error(400);return
        if 'image' in data:
            image=base64.b64decode(data['image'].split(',',1)[1]);assert image.startswith(b'\x89PNG');(out/(name+'.png')).write_bytes(image)
        (out/(name+'.json')).write_text(json.dumps(data.get('report',{}),indent=2),encoding='utf-8')
        self.send_response(200);self.end_headers();self.wfile.write(b'OK')
ThreadingHTTPServer(('127.0.0.1',port),H).serve_forever()
