from http.server import SimpleHTTPRequestHandler,ThreadingHTTPServer
import os,re
class Handler(SimpleHTTPRequestHandler):
 def send_head(self):
  p=self.translate_path(self.path)
  if os.path.isfile(p) and self.headers.get('Range'):
   f=open(p,'rb');size=os.fstat(f.fileno()).st_size;m=re.match(r'bytes=(\d+)-(\d*)',self.headers['Range']);start=int(m[1]);end=min(int(m[2]) if m[2] else size-1,size-1)
   self.send_response(206);self.send_header('Content-type',self.guess_type(p));self.send_header('Accept-Ranges','bytes');self.send_header('Content-Range',f'bytes {start}-{end}/{size}');self.send_header('Content-Length',str(end-start+1));self.end_headers();f.seek(start);self.remaining=end-start+1;return f
  self.remaining=None;return super().send_head()
 def copyfile(self,source,outputfile):
  try:
   if self.remaining is None:return super().copyfile(source,outputfile)
   while self.remaining:
    b=source.read(min(65536,self.remaining))
    if not b:break
    outputfile.write(b);self.remaining-=len(b)
  except (BrokenPipeError,ConnectionResetError):pass
os.chdir(os.path.join(os.path.dirname(__file__),'../dist'))
print('Local: http://127.0.0.1:4173/',flush=True)
ThreadingHTTPServer(('127.0.0.1',4173),Handler).serve_forever()
