import{isTauri,invoke,Channel}from'@tauri-apps/api/core';
export const native=isTauri();
let writeQueue=Promise.resolve();
function enqueue(task){const job=writeQueue.catch(()=>{}).then(task);writeQueue=job;return job;}
export async function initialData(fallback){if(!native)return{workspace:fallback(),chats:{}};const [workspace,chats]=await Promise.all([invoke('load_workspace'),invoke('load_chats')]);return{workspace:workspace||fallback(),chats};}
export function persistWorkspace(workspace){return enqueue(()=>invoke('save_workspace',{workspace}));}
export function persistChat(documentId,messages){return enqueue(()=>invoke('save_chat',{documentId,messages}));}
export async function nativeRequest(path,options){if(path==='/api/settings')return options.method==='PUT'?invoke('save_settings',{input:JSON.parse(options.body)}):invoke('get_settings');if(path==='/api/status')return invoke('codex_status');throw Error('不支持的应用请求');}
export async function exportNative(name,text){return invoke('export_file',{name,text});}
export async function importNative(){return invoke('import_files');}
export async function streamChat(body,onEvent,signal){
 if(native){const requestId=crypto.randomUUID();const channel=new Channel();let error=null;channel.onmessage=event=>{if(event.type==='error')error=new Error(event.error);else onEvent(event);};const cancel=()=>invoke('cancel_chat',{requestId}).catch(()=>{});if(signal.aborted)throw new DOMException('已停止','AbortError');signal.addEventListener('abort',cancel,{once:true});try{await invoke('chat',{requestId,request:body,onEvent:channel});if(signal.aborted)throw new DOMException('已停止','AbortError');if(error)throw error;}catch(e){throw e instanceof Error?e:new Error(String(e));}finally{signal.removeEventListener('abort',cancel);}return;}
 const response=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal});if(!response.ok){const data=await response.json();throw Error(data.error||'请求失败');}const reader=response.body.getReader();const decoder=new TextDecoder();let buffer='',done=false;function handle(line){if(!line.trim())return;const event=JSON.parse(line);if(event.type==='error')throw Error(event.error);if(event.type==='done')done=true;onEvent(event);}while(true){const{value,done:ended}=await reader.read();buffer+=decoder.decode(value||new Uint8Array(),{stream:!ended});let index;while((index=buffer.indexOf('\n'))>=0){handle(buffer.slice(0,index));buffer=buffer.slice(index+1);}if(ended)break;}if(buffer.trim())handle(buffer);if(!done)throw Error('连接中断，回答可能不完整');
}

export async function printDocument(){if(native)return invoke('print_document');window.print();}
