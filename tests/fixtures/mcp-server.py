"""Hermetic MCP fixture. No external network or user files; optional HTTP mode."""
import json,sys,argparse
from http.server import HTTPServer, BaseHTTPRequestHandler
p=argparse.ArgumentParser();p.add_argument('--http',action='store_true');p.add_argument('--marker');args=p.parse_args()
def reply(r):
    if 'id' not in r:return None
    method=r.get('method');params=r.get('params') or {}
    if method=='initialize':result={'protocolVersion':'2025-11-25','capabilities':{'tools':{}},'serverInfo':{'name':'moji-test','version':'1'}}
    elif method=='ping':result={}
    elif method=='tools/list':
        tool={'name':'text_stats' if params.get('cursor') else 'echo','description':'Local test tool','inputSchema':{'type':'object','properties':{'text':{'type':'string'}},'required':['text']},'annotations':{'readOnlyHint':True}}
        result={'tools':[tool]}
        if not params.get('cursor'):result['nextCursor']='second'
    elif method=='tools/call':
        if args.marker:
            with open(args.marker,'a') as f:f.write(params.get('name','')+'\n')
        text=(params.get('arguments')or{}).get('text','')
        if params.get('name')=='text_stats':text=json.dumps({'characters':len(text),'lines':len(text.splitlines())},ensure_ascii=False)
        result={'content':[{'type':'text','text':text}],'isError':False}
    else:return {'jsonrpc':'2.0','id':r['id'],'error':{'code':-32601,'message':'Method not found'}}
    return {'jsonrpc':'2.0','id':r['id'],'result':result}
if args.http:
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args):pass
        def do_POST(self):
            r=json.loads(self.rfile.read(int(self.headers['Content-Length'])));out=reply(r)
            if out is None:self.send_response(202);self.send_header('Content-Length','0');self.end_headers();return
            body=json.dumps(out,ensure_ascii=False).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
        def do_GET(self):self.send_error(405)
        def do_DELETE(self):self.send_response(204);self.end_headers()
    http=HTTPServer(('127.0.0.1',0),Handler);print('http://127.0.0.1:'+str(http.server_address[1])+'/mcp',flush=True);http.serve_forever()
else:
    for line in sys.stdin:
        try:
            out=reply(json.loads(line))
            if out:print(json.dumps(out,ensure_ascii=False),flush=True)
        except Exception:pass
