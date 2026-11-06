import DOMPurify from 'dompurify';
const mathCache=new Map();let mathModule,mermaidModule,diagramQueue=Promise.resolve(),sequence=0;
export const escapeHTML=text=>String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
export const sanitizeSVG=html=>DOMPurify.sanitize(html,{USE_PROFILES:{html:true,svg:true,svgFilters:true},ADD_TAGS:['mjx-container','mjx-break','mjx-linebox'],ADD_ATTR:['jax','display','overflow','size'],FORBID_TAGS:['script','iframe','foreignObject'],FORBID_ATTR:['onload','onclick']});
export function mathBatch(items){
 const key=JSON.stringify(items.map(i=>[i.tex,i.display]));
 if(mathCache.has(key))return mathCache.get(key);
 const promise=(mathModule||=import('./mathEngine.js')).then(m=>m.typesetMath(items)).then(results=>{if(typeof document!=='undefined'&&results.css&&!document.getElementById('moji-mathjax-style')){const style=document.createElement('style');style.id='moji-mathjax-style';style.textContent=results.css;document.head.append(style);}return results;}).catch(error=>items.map(()=>({html:'',error:String(error.message||error)})));
 mathCache.set(key,promise);if(mathCache.size>8)mathCache.delete(mathCache.keys().next().value);return promise;
}
// Mermaid.render is queued because initialize/theme are shared engine state.
// https://mermaid.js.org/config/usage.html#api-usage
export function drawMermaid(source,theme='light'){
 const work=async()=>{
  if(source.length>20000)throw new Error('图表超过 20,000 字符，请缩小图表。');
  const {default:mermaid}=await(mermaidModule||=import('mermaid'));
  mermaid.initialize({startOnLoad:false,htmlLabels:false,securityLevel:'strict',theme:theme==='dark'?'dark':'default',fontFamily:'-apple-system, PingFang SC, sans-serif',suppressErrorRendering:true,flowchart:{htmlLabels:false,useMaxWidth:true},maxTextSize:20000});
  const host=document.createElement('div');host.className='moji-render-host';host.style.cssText='position:fixed;left:-100000px;top:0;width:900px;visibility:hidden';document.body.append(host);
  try {const {svg}=await mermaid.render('moji-diagram-'+ ++sequence,source,host);return{html:svg,error:null};}
  catch(error){return{html:'',error:String(error.message||error),line:error.hash?.loc?.first_line??null};}
  finally{host.remove();}
 };
 const promise=diagramQueue.then(work);diagramQueue=promise.catch(()=>{});return promise;
}
