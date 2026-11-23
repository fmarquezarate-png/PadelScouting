"""Sirve la app en local con las mismas cabeceras que pone Vercel (vercel.json).
Uso: python3 test/serve-headers.py [puerto]   (por defecto 8112)"""
import http.server, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RULES = [(re.compile('^' + r['source'] + '$'), r['headers'])
         for r in json.load(open(os.path.join(ROOT, 'vercel.json'), encoding='utf-8')).get('headers', [])]

class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)
    def end_headers(self):
        path = self.path.split('?')[0].split('#')[0]
        for rx, hs in RULES:
            if rx.match(path):
                for h in hs:
                    self.send_header(h['key'], h['value'])
        super().end_headers()
    def log_message(self, *a):
        pass

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8112
http.server.ThreadingHTTPServer(('127.0.0.1', port), H).serve_forever()
