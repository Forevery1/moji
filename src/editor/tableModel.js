import {EditorSelection,StateEffect,Transaction} from '@codemirror/state';
import {syntaxTree} from '@codemirror/language';
import {isolateHistory} from '@codemirror/commands';
export const showTableSource=StateEffect.define();

// Split only real separators, keeping exact source spans and surrounding spaces.
export function splitRow(text,offset=0){
 const pipes=[];let code=0,math=false;
 for(let i=0;i<text.length;i++){
  if(text[i]==='\\'){i++;continue;}
  if(text[i]==='`'){let end=i+1;while(text[end]==='`')end++;const count=end-i;code=code===count?0:code||count;i=end-1;continue;}
  if(!code&&text[i]==='$')math=!math;
  if(text[i]==='|'&&!code&&!math)pipes.push(i);
 }
 let begin=0;const spans=[];
 for(const pos of pipes){spans.push([begin,pos]);begin=pos+1;}spans.push([begin,text.length]);
 let prefix='',suffix='';
 if(pipes.length&&!text.slice(...spans[0]).trim()){prefix=text.slice(0,pipes[0]+1);spans.shift();}
 if(pipes.length&&spans.length&&!text.slice(...spans.at(-1)).trim()){suffix=text.slice(pipes.at(-1));spans.pop();}
 const cells=spans.map(([start,end])=>{const raw=text.slice(start,end),left=raw.match(/^\s*/)[0],right=raw.match(/\s*$/)[0];const from=start+left.length,to=Math.max(from,end-right.length);return{raw,text:text.slice(from,to),left,right:to===from?'':right,from:offset+from,to:offset+to};});
 return {prefix,suffix,cells,from:offset,to:offset+text.length};
}
export function readTable(text,from=0){
 const lines=text.split('\n');if(lines.length<2)return null;
 let offset=from;const parsed=lines.map((line,index)=>{const container=index?(line.match(/^(?:[ \t]*>[ \t]?)*[ \t]*/)?.[0]||''):'';const row={...splitRow(line.slice(container.length),offset+container.length),container};offset+=line.length+1;return row;});
 if(!parsed[1].cells.length||parsed[1].cells.some(c=>!/^:?-+:?$/.test(c.text)))return null;
 const cols=parsed[0].cells.length;if(cols!==parsed[1].cells.length)return null;
 const rows=[parsed[0],...parsed.slice(2)].map(row=>({...row,cells:Array.from({length:cols},(_,col)=>row.cells[col]||{raw:'  ',text:'',left:' ',right:' ',from:row.to,to:row.to,missing:true})}));
 return {from,to:from+text.length,source:text,rows,container:parsed[1].container,separator:parsed[1],cols,align:parsed[1].cells.map(c=>c.text.startsWith(':')?c.text.endsWith(':')?'center':'left':c.text.endsWith(':')?'right':null)};
}
export function escapeCell(text){return text.replace(/\r\n?/g,'\n').replace(/\n/g,'<br>').replace(/(^|[^\\])((?:\\\\)*)\|/g,'$1$2\\|');}
const emptyCell=()=>({raw:'  ',text:'',left:' ',right:' '});
const emptyRow=cols=>({prefix:'|',suffix:'|',cells:Array.from({length:cols},emptyCell)});
const clone=model=>({...model,rows:model.rows.map(r=>({...r,cells:r.cells.map(c=>({...c}))})),align:[...model.align],separator:{...model.separator,cells:model.separator.cells.map(c=>({...c}))}});
const alignMarker=align=>align==='center'?':---:':align==='right'?'---:':align==='left'?':---':'---';
export function serializeTable(model,format=false){
 const rowText=(row,first=false)=>(first?'':row.container||model.container||'')+(format?'| '+row.cells.map(c=>c.text).join(' | ')+' |':row.prefix+row.cells.map(c=>c.left+c.text+c.right).join('|')+row.suffix);
 const sep={...model.separator,cells:model.align.map((align,col)=>{const old=model.separator.cells[col];return old&&/^:?-+:?$/.test(old.text)&&((old.text.startsWith(':')?old.text.endsWith(':')?'center':'left':old.text.endsWith(':')?'right':null)===align)?old:{...(old||emptyCell()),text:alignMarker(align)};})};
 return [rowText(model.rows[0],true),rowText(sep),...model.rows.slice(1).map(row=>rowText(row))].join('\n');
}
export function transformTable(model,action,{row=0,col=0,value,axis,index,to,rows,cols,cells,range}={}){
 const m=clone(model);row=Math.max(0,Math.min(m.rows.length-1,row));col=Math.max(0,Math.min(m.cols-1,col));let focus={row,col};
 switch(action){
  case 'insert-row-before':case 'insert-row-after':{if(m.rows.length>=99)return null;const at=row+(action.endsWith('after')?1:0);m.rows.splice(at,0,emptyRow(m.cols));focus={row:at,col};break;}
  case 'delete-row':if(m.rows.length===1)return null;m.rows.splice(row,1);focus.row=Math.min(row,m.rows.length-1);break;
  case 'insert-col-before':case 'insert-col-after':{if(m.cols>=40)return null;const at=col+(action.endsWith('after')?1:0);for(const r of m.rows)r.cells.splice(at,0,emptyCell());m.separator.cells.splice(at,0,{...emptyCell(),text:'---'});m.align.splice(at,0,null);m.cols++;focus.col=at;break;}
  case 'delete-col':if(m.cols===1)return null;for(const r of m.rows)r.cells.splice(col,1);m.separator.cells.splice(col,1);m.align.splice(col,1);m.cols--;focus.col=Math.min(col,m.cols-1);break;
  case 'align':{const first=range?Math.min(range.col,col):col,last=range?Math.max(range.col,col):col;for(let c=first;c<=last;c++)m.align[c]=value;break;}
  case 'move':{const length=axis==='row'?m.rows.length:m.cols;if(index<0||index>=length||to<0||to>=length||index===to)return null;const move=list=>list.splice(to,0,list.splice(index,1)[0]);if(axis==='row'){move(m.rows);focus.row=to;}else{for(const r of m.rows)move(r.cells);move(m.separator.cells);move(m.align);focus.col=to;}break;}
  case 'resize':{rows=Math.max(1,Math.min(99,Number(rows)||1));cols=Math.max(1,Math.min(40,Number(cols)||1));m.rows=m.rows.slice(0,rows);while(m.rows.length<rows)m.rows.push(emptyRow(m.cols));for(const r of m.rows){r.cells=r.cells.slice(0,cols);while(r.cells.length<cols)r.cells.push(emptyCell());}m.align=m.align.slice(0,cols);m.separator.cells=m.separator.cells.slice(0,cols);while(m.align.length<cols)m.align.push(null);while(m.separator.cells.length<cols)m.separator.cells.push({...emptyCell(),text:'---'});m.cols=cols;focus={row:Math.min(row,rows-1),col:Math.min(col,cols-1)};break;}
  case 'paste':{const matrix=cells||[];const height=Math.min(99,row+matrix.length),width=Math.min(40,Math.max(m.cols,...matrix.map(r=>col+r.length)));while(m.rows.length<height)m.rows.push(emptyRow(m.cols));for(const r of m.rows)while(r.cells.length<width)r.cells.push(emptyCell());while(m.align.length<width)m.align.push(null);while(m.separator.cells.length<width)m.separator.cells.push({...emptyCell(),text:'---'});m.cols=width;for(let r=0;r<matrix.length&&row+r<height;r++)for(let c=0;c<matrix[r].length&&col+c<width;c++)m.rows[row+r].cells[col+c].text=escapeCell(matrix[r][c]);break;}
  case 'clear':{const firstRow=Math.min(row,range?.row??row),lastRow=Math.max(row,range?.row??row),firstCol=Math.min(col,range?.col??col),lastCol=Math.max(col,range?.col??col);for(let r=firstRow;r<=lastRow;r++)for(let c=firstCol;c<=lastCol;c++)m.rows[r].cells[c].text='';break;}
  case 'cell':m.rows[row].cells[col].text=escapeCell(value);break;
  case 'format':break;
  default:return null;
 }
 return {model:m,text:serializeTable(m,action==='format'),focus};
}
export function tableAt(state,from){let node=syntaxTree(state).resolveInner(Math.min(from+1,state.doc.length),1);while(node&&node.name!=='Table')node=node.parent;return node?readTable(state.doc.sliceString(node.from,node.to),node.from):null;}
export function applyTableAction(view,model,action,options={}){
 const current=tableAt(view.state,model.from);if(!current||current.source!==model.source)return false;
 if(action==='delete-table'){view.dispatch({changes:{from:model.from,to:model.to,insert:''},selection:EditorSelection.cursor(model.from),annotations:[Transaction.userEvent.of('input.table'),isolateHistory.of('full')]});view.focus();return true;}
 const result=transformTable(current,action,options);if(!result)return false;
 const next=readTable(result.text,model.from),cell=next.rows[result.focus.row].cells[result.focus.col];
 view.dispatch({changes:{from:model.from,to:model.to,insert:result.text},selection:EditorSelection.cursor(cell.from),effects:showTableSource.of(null),annotations:[Transaction.userEvent.of('input.table'),isolateHistory.of('full')]});
 return result.focus;
}
