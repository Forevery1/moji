import {WidgetType} from '@codemirror/view';
import {EditorSelection,Transaction} from '@codemirror/state';
import {undo,redo,isolateHistory} from '@codemirror/commands';
import {readTable,tableAt,escapeCell,applyTableAction,showTableSource} from './tableModel.js';
import {renderMarkdown} from './markdown.js';
import {hydrateSpecials} from './richRenderer.js';

const activeCell=ctx=>ctx.active?ctx.model.rows[ctx.active.row]?.cells[ctx.active.col]:undefined;
function publishSelection(ctx){
 const cell=activeCell(ctx);if(!cell)return;
 const start=ctx.input?.selectionStart||0,end=ctx.input?.selectionEnd||start;
 const anchor=Math.min(cell.to,cell.from+start),head=Math.min(cell.to,cell.from+end);
 ctx.view.dispatch({selection:EditorSelection.range(anchor,head),effects:showTableSource.of(null),annotations:Transaction.addToHistory.of(false)});
}
function focusCell(ctx,row,col,select=true){
 row=Math.max(0,Math.min(ctx.model.rows.length-1,row));col=Math.max(0,Math.min(ctx.model.cols-1,col));
 ctx.range=null;ctx.active={row,col};paint(ctx);ctx.input?.focus();if(select)ctx.input?.select();publishSelection(ctx);
}
function run(ctx,action,options={}){
 const {row,col}=ctx.active||{row:0,col:0};
 const result=applyTableAction(ctx.view,ctx.model,action,{row,col,range:ctx.range,...options});
 if(!result)return;
 if(action==='delete-table')return;
 ctx.active=result;ctx.range=null;paint(ctx);for(const details of ctx.root.querySelectorAll('details'))details.open=false;ctx.input?.focus();ctx.input?.select();publishSelection(ctx);
}
function commit(ctx){
 if(ctx.composing||ctx.suspendCommit||!ctx.input)return;
 const cell=activeCell(ctx);if(!cell)return;
 const value=escapeCell(ctx.input.value);
 if(value===cell.text){publishSelection(ctx);return;}
 if(cell.missing){run(ctx,'cell',{value});return;}
 const start=escapeCell(ctx.input.value.slice(0,ctx.input.selectionStart)).length,end=escapeCell(ctx.input.value.slice(0,ctx.input.selectionEnd)).length;
 ctx.view.dispatch({changes:{from:cell.from,to:cell.to,insert:value},selection:EditorSelection.range(cell.from+Math.min(start,value.length),cell.from+Math.min(end,value.length)),annotations:Transaction.userEvent.of('input.table-cell')});
}
function navigate(ctx,row,col){
 if(col<0){row--;col=ctx.model.cols-1;}
 if(col>=ctx.model.cols){row++;col=0;}
 if(row>=ctx.model.rows.length){run(ctx,'insert-row-after',{row:ctx.model.rows.length-1});focusCell(ctx,ctx.model.rows.length-1,col);return;}
 focusCell(ctx,row,col);
}
function keydown(ctx,event){
 const input=event.target===ctx.input,mod=event.metaKey||event.ctrlKey;
 // Widgets own their inputs; route history to the document's single undo stack.
 if(mod&&['z','y'].includes(event.key.toLowerCase())){event.preventDefault();event.stopPropagation();(event.key.toLowerCase()==='y'||event.shiftKey?redo:undo)(ctx.view);return;}
 if(ctx.composing||event.isComposing)return;
 if(event.key==='Escape'){event.preventDefault();const cell=activeCell(ctx);ctx.active=null;ctx.range=null;paint(ctx);ctx.view.dispatch({selection:EditorSelection.cursor(cell?.from||ctx.model.from)});ctx.view.focus();return;}
 const {row,col}=ctx.active||{row:0,col:0};
 if(event.key==='Tab'){event.preventDefault();event.stopPropagation();commit(ctx);navigate(ctx,row,col+(event.shiftKey?-1:1));return;}
 if(event.key==='Enter'&&input){event.preventDefault();event.stopPropagation();
  if(event.shiftKey){ctx.input.setRangeText('<br>',ctx.input.selectionStart,ctx.input.selectionEnd,'end');commit(ctx);}
  else if(mod)run(ctx,'insert-row-after');else navigate(ctx,row+1,col);return;
 }
 if(input&&['ArrowUp','ArrowDown'].includes(event.key)&&!ctx.input.value.includes('\n')){event.preventDefault();navigate(ctx,row+(event.key==='ArrowUp'?-1:1),col);return;}
 if(ctx.range&&!input&&['Backspace','Delete'].includes(event.key)){event.preventDefault();run(ctx,'clear');}
}
function button(text,action){const b=document.createElement('button');b.type='button';b.textContent=text;b.setAttribute('aria-label',text);b.addEventListener('mousedown',e=>e.preventDefault());b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();action();});return b;}
function menu(toolbar,title){const details=document.createElement('details'),summary=document.createElement('summary'),body=document.createElement('div');summary.textContent=title;body.className='table-menu';details.append(summary,body);toolbar.append(details);return body;}
function controls(ctx){
 const bar=document.createElement('div');bar.className='table-controls';bar.setAttribute('aria-label','表格工具栏');
 const operations=menu(bar,'行列操作');
 for(const [text,action]of [['上方插入行','insert-row-before'],['下方插入行','insert-row-after'],['左侧插入列','insert-col-before'],['右侧插入列','insert-col-after'],['删除当前行','delete-row'],['删除当前列','delete-col']])operations.append(button(text,()=>run(ctx,action)));
 for(const [label,axis,delta]of [['向上移动行','row',-1],['向下移动行','row',1],['向左移动列','col',-1],['向右移动列','col',1]])operations.append(button(label,()=>{const index=axis==='row'?(ctx.active?.row||0):(ctx.active?.col||0);run(ctx,'move',{axis,index,to:index+delta});}));
 const alignment=menu(bar,'列对齐');for(const [text,value]of [['默认对齐',null],['左对齐','left'],['居中对齐','center'],['右对齐','right']])alignment.append(button(text,()=>run(ctx,'align',{value})));
 const sizing=menu(bar,'表格大小');for(const [name,label,max]of [['rows','表格行数',99],['cols','表格列数',40]]){const wrap=document.createElement('label'),field=document.createElement('input');wrap.textContent=label;field.type='number';field.min=1;field.max=max;field.value=name==='rows'?ctx.model.rows.length:ctx.model.cols;field.name=name;field.setAttribute('aria-label',label);wrap.append(field);sizing.append(wrap);}
 sizing.append(button('应用表格尺寸',()=>run(ctx,'resize',{rows:sizing.querySelector('[name=rows]').value,cols:sizing.querySelector('[name=cols]').value})));
 bar.append(button('表格源码',()=>{commit(ctx);const position=activeCell(ctx)?.from??ctx.model.from;ctx.suspendCommit=true;ctx.view.focus();ctx.view.dispatch({selection:EditorSelection.cursor(position),effects:showTableSource.of(ctx.model.from)});ctx.suspendCommit=false;}));
 bar.append(button('复制表格',async()=>{try{await navigator.clipboard.writeText(ctx.model.source);ctx.status.textContent='已复制 Markdown 表格';}catch{ctx.status.textContent='复制失败，请在源码中复制';}}));
 bar.append(button('格式化表格',()=>run(ctx,'format')),button('删除表格',()=>run(ctx,'delete-table')));
 return bar;
}
function inRange(ctx,row,col){if(!ctx.range||!ctx.active)return false;return row>=Math.min(ctx.range.row,ctx.active.row)&&row<=Math.max(ctx.range.row,ctx.active.row)&&col>=Math.min(ctx.range.col,ctx.active.col)&&col<=Math.max(ctx.range.col,ctx.active.col);}
function cellHTML(ctx,content,cell){
 const signature=cell.text+'\n'+ctx.definitions+'\n'+ctx.contextKey;
 if(content.moJiSignature===signature)return;content.moJiSignature=signature;
 content.innerHTML=renderMarkdown(cell.text+'\n\n'+ctx.definitions);
 hydrateSpecials(content,{theme:ctx.theme,context:ctx.math,isCurrent:()=>!ctx.destroyed&&content.isConnected&&content.moJiSignature===signature}).then(()=>{if(!ctx.destroyed)ctx.view.requestMeasure();});
}
function paint(ctx){
 const model=ctx.model;ctx.root.classList.toggle('has-active-cell',!!ctx.active);
 let table=ctx.table;
 const desired=model.rows.length;
 // Reconcile rows/cells in place. Never replace the textarea during an edit.
 while(table.rows.length>desired)table.deleteRow(table.rows.length-1);
 for(let r=0;r<desired;r++){
  const row=table.rows[r]||table.insertRow();
  while(row.cells.length>model.cols)row.deleteCell(row.cells.length-1);
  for(let c=0;c<model.cols;c++){
   let cell=row.cells[c];if(!cell){cell=document.createElement(r===0?'th':'td');row.append(cell);}
   cell.dataset.row=r;cell.dataset.col=c;cell.style.textAlign=model.align[c]||'';cell.classList.toggle('table-cell-selected',inRange(ctx,r,c));
   let content=cell.querySelector('.table-cell-content');if(!content){content=document.createElement('div');content.className='table-cell-content';cell.append(content);}
   let handle=cell.querySelector('.table-row-handle');if(c===0&&!handle){handle=document.createElement('button');handle.type='button';handle.draggable=true;handle.textContent='⋮';handle.className='table-row-handle';cell.prepend(handle);}if(handle){handle.dataset.axis='row';handle.dataset.index=r;handle.setAttribute('aria-label','拖动第 '+(r+1)+' 行');}
   let colHandle=cell.querySelector('.table-col-handle');if(r===0&&!colHandle){colHandle=document.createElement('button');colHandle.type='button';colHandle.draggable=true;colHandle.textContent='⋯';colHandle.className='table-col-handle';cell.prepend(colHandle);}if(colHandle){colHandle.dataset.axis='col';colHandle.dataset.index=c;colHandle.setAttribute('aria-label','拖动第 '+(c+1)+' 列');}
   const editing=ctx.active?.row===r&&ctx.active.col===c&&!ctx.range;
   if(editing){
    let input=content.querySelector('textarea');if(!input){input=document.createElement('textarea');input.rows=1;input.className='table-cell-input';input.spellcheck=false;input.value=model.rows[r].cells[c].text;content.replaceChildren(input);}
    ctx.input=input;input.setAttribute('aria-label','表格第 '+(r+1)+' 行第 '+(c+1)+' 列');
    const value=model.rows[r].cells[c].text;
    if(!ctx.composing&&input.value!==value){const selection=ctx.view.state.selection.main,source=model.rows[r].cells[c];input.value=value;input.setSelectionRange(Math.max(0,Math.min(value.length,selection.from-source.from)),Math.max(0,Math.min(value.length,selection.to-source.from)));}
   }else{if(content.querySelector('textarea')){content.moJiSignature=null;content.replaceChildren();}cellHTML(ctx,content,model.rows[r].cells[c]);}
  }
 }
 if(!ctx.active||ctx.range)ctx.input=null;
 ctx.root.querySelector('[name=rows]').value=model.rows.length;ctx.root.querySelector('[name=cols]').value=model.cols;
}
function events(ctx){
 const root=ctx.root;
 root.addEventListener('click',e=>{if(e.target.closest('button,summary,input,textarea,details'))return;const cell=e.target.closest('td,th');if(!cell)return;const row=Number(cell.dataset.row),col=Number(cell.dataset.col);
  if(e.shiftKey&&ctx.active){ctx.range=ctx.range||{...ctx.active};ctx.active={row,col};paint(ctx);root.focus();const first=ctx.model.rows[ctx.range.row].cells[ctx.range.col],last=ctx.model.rows[row].cells[col];ctx.view.dispatch({selection:EditorSelection.range(first.from,last.to)});}
  else focusCell(ctx,row,col);
 });
 root.addEventListener('input',e=>{if(e.target===ctx.input)commit(ctx);});
 root.addEventListener('select',e=>{if(e.target===ctx.input&&!ctx.composing)publishSelection(ctx);});
 root.addEventListener('keyup',e=>{if(e.target===ctx.input&&!ctx.composing)publishSelection(ctx);});
 root.addEventListener('compositionstart',e=>{if(e.target===ctx.input){ctx.composing=true;e.stopPropagation();}});
 root.addEventListener('compositionend',e=>{if(e.target===ctx.input){ctx.composing=false;commit(ctx);e.stopPropagation();}});
 root.addEventListener('focusout',e=>{if(e.target===ctx.input)commit(ctx);});
 root.addEventListener('keydown',e=>{if(!ctx.active)return;if(e.target===ctx.input||e.target===root)keydown(ctx,e);});
 root.addEventListener('paste',e=>{if(e.target!==ctx.input)return;const text=e.clipboardData.getData('text/plain');if(!/[\t\n\r]/.test(text))return;e.preventDefault();e.stopPropagation();run(ctx,'paste',{cells:text.replace(/\r\n?/g,'\n').replace(/\n$/,'').split('\n').map(row=>row.split('\t'))});});
 root.addEventListener('copy',e=>{if(!ctx.range||e.target===ctx.input)return;const a=ctx.active,b=ctx.range;const matrix=[];for(let r=Math.min(a.row,b.row);r<=Math.max(a.row,b.row);r++)matrix.push(ctx.model.rows[r].cells.slice(Math.min(a.col,b.col),Math.max(a.col,b.col)+1).map(c=>c.text).join('\t'));e.clipboardData.setData('text/plain',matrix.join('\n'));e.preventDefault();e.stopPropagation();});
 root.addEventListener('dragstart',e=>{const handle=e.target.closest('[draggable=true]');if(!handle)return;ctx.drag={axis:handle.dataset.axis,index:Number(handle.dataset.index)};e.dataTransfer.setData('text/x-moji-table',JSON.stringify(ctx.drag));e.dataTransfer.effectAllowed='move';});
 root.addEventListener('dragover',e=>{if(!ctx.drag)return;const cell=e.target.closest('td,th');if(cell){e.preventDefault();for(const old of root.querySelectorAll('.table-drop-target'))old.classList.remove('table-drop-target');cell.classList.add('table-drop-target');e.dataTransfer.dropEffect='move';}});
 root.addEventListener('drop',e=>{const cell=e.target.closest('td,th');if(!ctx.drag||!cell)return;e.preventDefault();e.stopPropagation();const {axis,index}=ctx.drag,to=Number(axis==='row'?cell.dataset.row:cell.dataset.col);ctx.drag=null;run(ctx,'move',{axis,index,to});});
 root.addEventListener('dragend',()=>{ctx.drag=null;for(const cell of root.querySelectorAll('.table-drop-target'))cell.classList.remove('table-drop-target');});
}
export class VisualTableWidget extends WidgetType{
 constructor(text,from,definitions,math,theme){super();Object.assign(this,{text,from,definitions,math,theme});this.contextKey=JSON.stringify(math.map(m=>[m.tex,m.display]))+'|'+theme;}
 eq(other){return this.text===other.text&&this.from===other.from&&this.definitions===other.definitions&&this.contextKey===other.contextKey;}
 get estimatedHeight(){return 48*Math.max(2,this.text.split('\n').length);}
 toDOM(view){
  const root=document.createElement('div');root.className='cm-md-table-preview cm-visual-table';root.setAttribute('aria-label','可视化 Markdown 表格');root.contentEditable='false';root.tabIndex=-1;
  const status=document.createElement('span');status.className='table-status';status.setAttribute('role','status');
  const scroller=document.createElement('div');scroller.className='table-scroller';const table=document.createElement('table');scroller.append(table);
  const ctx={root,view,table,status,model:readTable(this.text,this.from),definitions:this.definitions,theme:this.theme,math:this.math,contextKey:this.contextKey,active:null,input:null,range:null};root.moJiTable=ctx;
  root.append(controls(ctx),scroller,status);paint(ctx);events(ctx);return root;
 }
 updateDOM(root,view){const ctx=root.moJiTable;if(!ctx)return false;const next=readTable(this.text,this.from);if(!next)return false;Object.assign(ctx,{view,model:next,definitions:this.definitions,theme:this.theme,math:this.math,contextKey:this.contextKey});if(ctx.active){ctx.active.row=Math.min(ctx.active.row,next.rows.length-1);ctx.active.col=Math.min(ctx.active.col,next.cols-1);}paint(ctx);return true;}
 destroy(root){root.moJiTable.destroyed=true;}
 ignoreEvent(){return true;}
}
