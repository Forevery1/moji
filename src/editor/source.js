import{Facet,StateField,StateEffect}from'@codemirror/state';
import{invertedEffects}from'@codemirror/commands';
export const initialSource=Facet.define({combine:values=>values.at(-1)??''});
export const overrideSource=StateEffect.define();
export function normalizeSource(text){return text.replace(/\r\n?/g,'\n');}
export function preferredLineBreak(text){return text.includes('\r\n')?'\r\n':text.includes('\r')&&!text.includes('\n')?'\r':'\n';}
export function sourceToDocument(text,position){position=Math.max(0,Math.min(text.length,position));let extra=0;for(let i=text.indexOf('\r\n');i>=0&&i<position;i=text.indexOf('\r\n',i+2))extra++;return position-extra;}
export function documentToSource(doc,position,text){position=Math.max(0,Math.min(doc.length,position));const line=doc.lineAt(position);let start=0,number=1;while(number<line.number&&start<text.length){const next=/\r\n|\r|\n/g;next.lastIndex=start;const match=next.exec(text);if(!match)break;start=match.index+match[0].length;number++;}return Math.min(text.length,start+position-line.from);}
export function applySourceChanges(source,doc,changes){const edits=[],separator=preferredLineBreak(source);changes.iterChanges((from,to,_fromB,_toB,insert)=>{edits.push({from:documentToSource(doc,from,source),to:documentToSource(doc,to,source),insert:insert.toString().replace(/\n/g,separator)});});for(let i=edits.length-1;i>=0;i--){const e=edits[i];source=source.slice(0,e.from)+e.insert+source.slice(e.to);}return source;}
// The document is LF-indexed internally; its original line endings are retained
// separately. Transactions map source ranges instead of round-tripping HTML.
// https://codemirror.net/docs/ref/#state.StateField
export const sourceState=StateField.define({create(state){return state.facet(initialSource);},update(value,tr){for(const effect of tr.effects){if(effect.is(overrideSource)&&normalizeSource(effect.value)===tr.newDoc.toString())return effect.value;}return tr.docChanged?applySourceChanges(value,tr.startState.doc,tr.changes):value;}});
export const sourceHistory=invertedEffects.of(tr=>{if(!tr.docChanged)return[];const text=tr.startState.field(sourceState);const mixed=(text.match(/\r\n|\r|\n/g)||[]);const types=new Set(mixed);let structural=false;tr.changes.iterChanges((from,to,_a,_b,insert)=>{if(tr.startState.doc.lineAt(from).number!==tr.startState.doc.lineAt(to).number||insert.lines>1)structural=true;});return tr.effects.some(e=>e.is(overrideSource))||types.size>1&&structural?[overrideSource.of(text)]:[];});
