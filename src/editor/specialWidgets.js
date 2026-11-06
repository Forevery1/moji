import{WidgetType}from'@codemirror/view';
import{EditorSelection}from'@codemirror/state';
import{drawMermaid,mathBatch,sanitizeSVG}from'./specialRenderers.js';
export class SpecialWidget extends WidgetType{
 constructor(kind,item,items,theme,editing=false){super();Object.assign(this,{kind,item,items,theme,editing});this.key=JSON.stringify(items?.map(i=>[i.tex,i.display])||[]);}
 eq(other){return this.kind===other.kind&&this.item.from===other.item.from&&this.item.tex===other.item.tex&&this.item.index===other.item.index&&this.key===other.key&&this.theme===other.theme&&this.editing===other.editing;}
 toDOM(view){const root=document.createElement(this.item.display||this.kind==='mermaid'?'div':'span');root.className='cm-special-preview '+(this.kind==='mermaid'?'cm-mermaid-preview':this.item.display?'cm-math-block':'cm-math-inline')+(this.editing?' is-editing':'');root.setAttribute('aria-label',this.kind==='mermaid'?'Mermaid 图表预览':'数学公式预览');root.setAttribute('contenteditable','false');root.tabIndex=0;
  root.innerHTML='<span class="special-result">正在排版…</span><span class="special-error" role="status"></span>';
  root.addEventListener('mousedown',e=>{e.preventDefault();this.enterSource(root,view);});root.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();this.enterSource(root,view);}});this.schedule(root,view);return root;
 }
 enterSource(root,view){const widget=root.moJiWidget||this;view.dispatch({selection:EditorSelection.cursor(Math.min(widget.item.bodyFrom,view.state.doc.length)),scrollIntoView:true});view.focus();}
 updateDOM(root,view){if(!root.classList.contains(this.kind==='mermaid'?'cm-mermaid-preview':this.item.display?'cm-math-block':'cm-math-inline'))return false;root.classList.toggle('is-editing',this.editing);this.schedule(root,view);return true;}
 schedule(root,view){clearTimeout(root.moJiTimer);root.moJiWidget=this;const token=(root.moJiToken||0)+1;root.moJiToken=token;root.moJiTimer=setTimeout(async()=>{
   let result;try{result=this.kind==='mermaid'?await drawMermaid(this.item.tex,this.theme):(await mathBatch(this.items))[this.item.index];}catch(error){result={error:String(error.message||error),html:''};}
   if(!root.isConnected||root.moJiToken!==token)return;
   const target=root.querySelector('.special-result'),error=root.querySelector('.special-error');
   if(!result)result={error:'公式尚未完成',html:''};
   if(!result.error){target.innerHTML=sanitizeSVG(result.html);root.dataset.rendered='true';}
   else if(!root.dataset.rendered){target.textContent='';}
   error.textContent=result.error?((this.kind==='mermaid'?'图表语法错误':'公式错误')+(result.line?' · 第 '+result.line+' 行':'')+'：'+result.error):'';
   root.dataset.error=result.error?'true':'false';view.requestMeasure();
  },this.kind==='mermaid'?200:100);
 }
 destroy(root){clearTimeout(root.moJiTimer);root.moJiToken=(root.moJiToken||0)+1;}
 ignoreEvent(){return true;}
}
