import assert from 'node:assert/strict';import http from 'node:http';import{spawn}from'node:child_process';import{mkdtemp,rm,stat}from'node:fs/promises';import os from'node:os';import path from'node:path';
const temp=await mkdtemp(path.join(os.tmpdir(),'moji-test-'));const port=5196;let captured;
const mock=http.createServer(async(req,res)=>{let text='';for await(const chunk of req)text+=chunk;captured={url:req.url,auth:req.headers.authorization,body:JSON.parse(text)};res.setHeader('Content-Type','text/event-stream');res.write('data: '+JSON.stringify({choices:[{delta:{content:'协议验证'}}]})+'\n\n');res.end('data: '+JSON.stringify({choices:[{delta:{content:'成功。'}}]})+'\n\ndata: [DONE]\n\n');});await new Promise(r=>mock.listen(0,'127.0.0.1',r));
const child=spawn(process.execPath,['legacy/server.mjs'],{env:{...process.env,PORT:String(port),MOJI_DATA_DIR:temp},stdio:'ignore'});
const base=`http://127.0.0.1:${port}`;
try{for(let i=0;i<60;i++){try{if((await fetch(base+'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
assert.equal((await fetch(base+'/api/settings',{headers:{Origin:'http://untrusted.example'}})).status,403);
const config={provider:'openai',baseURL:`http://127.0.0.1:${mock.address().port}/v1`,apiKey:'test-only-secret',model:'test-model'};
let r=await fetch(base+'/api/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(config)});assert.equal(r.status,200);assert.equal((await r.json()).hasApiKey,true);
const visible=await(await fetch(base+'/api/settings')).text();assert.ok(!visible.includes('test-only-secret'));assert.equal((await stat(path.join(temp,'ai-settings.json'))).mode&0o777,0o600);
r=await fetch(base+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({documentName:'测试.md',context:'# 原文',selection:'选中段落',messages:[{role:'user',content:'总结'}]})});const result=await r.text();assert.ok(result.includes('协议验证'));assert.ok(result.includes('成功。'));assert.ok(result.includes('"type":"done"'));assert.equal(captured.url,'/v1/chat/completions');assert.equal(captured.auth,'Bearer test-only-secret');assert.equal(captured.body.model,'test-model');assert.ok(captured.body.messages[1].content.includes('选中段落'));assert.equal(captured.body.messages.at(-1).content,'总结');
r=await fetch(base+'/api/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...config,apiKey:'',clearKey:true})});assert.equal((await r.json()).hasApiKey,false);
console.log('PASS: third-party SSE, context, auth forwarding, secret redaction, private config, origin restriction, key removal');
}finally{child.kill();await new Promise(r=>child.once('exit',r));await new Promise(r=>mock.close(r));await rm(temp,{recursive:true,force:true});}
