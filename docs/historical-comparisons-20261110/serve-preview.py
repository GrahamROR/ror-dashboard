from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
class Server(ThreadingHTTPServer):
 request_queue_size=128
class Handler(SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
Server(("127.0.0.1",8780),Handler).serve_forever()
