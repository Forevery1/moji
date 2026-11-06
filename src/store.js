import{native,nativeRequest,exportNative}from'./native';
import {seeds} from './seed';
export const STORAGE='moji.workspace.v1';
export function loadWorkspace(){try{const data=JSON.parse(localStorage.getItem(STORAGE));if(Array.isArray(data?.docs)&&data.docs.length&&data.docs.every(d=>typeof d.id==='string'&&typeof d.name==='string'&&typeof d.text==='string'))return data;}catch{}return {docs:seeds,active:'welcome'};}
export async function download(name,text,type='text/markdown;charset=utf-8'){if(native)return exportNative(name,text);const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return name;}
export async function request(path,options={}){if(native){try{return await nativeRequest(path,options);}catch(e){throw e instanceof Error?e:new Error(String(e));}}const res=await fetch(path,{...options,headers:{'Content-Type':'application/json',...options.headers}});const data=await res.json();if(!res.ok)throw new Error(data.error||'请求失败');return data;}
