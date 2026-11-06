import {renderMarkdown} from './markdown.js';
import {drawMermaid,mathBatch,sanitizeSVG,escapeHTML} from './specialRenderers.js';
const decoded=value=>{try{return decodeURIComponent(value||'');}catch{return '';}};
export async function hydrateSpecials(root,{theme='light',context=null,isCurrent=()=>true}={}){
 const formulas=[...root.querySelectorAll('.moji-math-placeholder')];
 const items=context?[...context]:formulas.map(el=>({tex:decoded(el.dataset.tex),display:el.dataset.display==='true'}));
 if(context)for(const el of formulas)if(!items.some(i=>i.tex===decoded(el.dataset.tex)&&i.display===(el.dataset.display==='true')))items.push({tex:decoded(el.dataset.tex),display:el.dataset.display==='true'});
 if(formulas.length){const results=await mathBatch(items);if(!isCurrent())return;
  if(results.css){const style=document.createElement('style');style.textContent=results.css;root.prepend(style);}
  formulas.forEach((el,index)=>{const slot=context?items.findIndex(i=>i.tex===decoded(el.dataset.tex)&&i.display===(el.dataset.display==='true')):index;const result=results[slot];if(!result)return;el.innerHTML=sanitizeSVG(result.html);if(result.error){el.setAttribute('role','status');el.setAttribute('aria-label','公式错误');el.title=result.error;}});
 }
 const diagrams=[...root.querySelectorAll('.moji-mermaid-placeholder')];
 await Promise.all(diagrams.map(async el=>{const result=await drawMermaid(decoded(el.dataset.source),theme);if(!isCurrent())return;el.innerHTML=result.error?`<pre class="special-error">${escapeHTML(result.error)}</pre>`:sanitizeSVG(result.html);}));
}
export async function renderRichMarkdown(text,options={}){const root=document.createElement('div');root.innerHTML=renderMarkdown(text);await hydrateSpecials(root,options);return root.innerHTML;}
