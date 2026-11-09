import {highlightSyntax,highlightMatch} from './highlightSyntax.js';
import {parser,GFM} from '@lezer/markdown';
import {Marked} from 'marked';
import DOMPurify from 'dompurify';
import {mathSyntax,inlineMathEnd} from './mathSyntax.js';
// CommonMark/GFM syntax and source positions, not HTML DOM offsets.
// https://github.com/lezer-parser/markdown#readme
export const markdownParser=parser.configure([GFM,mathSyntax,highlightSyntax]);
const escape=text=>String(text).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const mathToken=(raw,tex,display)=>({type:display?'mojiBlockMath':'mojiInlineMath',raw,tex,display});
const mathHTML=token=>`<${token.display?'div':'span'} class="moji-math-placeholder" data-tex="${encodeURIComponent(token.tex)}" data-display="${token.display}">${escape(token.tex)}</${token.display?'div':'span'}>`;
const marked=new Marked({gfm:true,breaks:false}, {extensions:[
 {name:'mojiHighlight',level:'inline',start:src=>src.indexOf('=='),tokenizer(src){const m=highlightMatch(src);if(m)return {type:'mojiHighlight',raw:m[0],tokens:this.lexer.inlineTokens(m[1])};},renderer(token){return `<mark>${this.parser.parseInline(token.tokens)}</mark>`;}},
 {name:'mojiInlineMath',level:'inline',start:src=>{const dollar=src.indexOf('$'),slash=src.indexOf('\\(');return dollar<0?slash:slash<0?dollar:Math.min(dollar,slash);},tokenizer(src){const m=inlineMathEnd(src,0);if(m)return mathToken(src.slice(0,m.end),src.slice(m.bodyFrom,m.bodyTo),false);},renderer:mathHTML},
 {name:'mojiBlockMath',level:'block',start:src=>src.search(/^(?: {0,3})(?:\$\$|\\\[)\s*$/m),tokenizer(src){const lines=src.split('\n'),open=lines[0].trim();if(!['$$','\\['].includes(open))return;const close=open==='$$'?'$$':'\\]';let end=1;while(end<lines.length&&lines[end].trim()!==close)end++;if(end===lines.length)return;const raw=lines.slice(0,end+1).join('\n')+(lines.length>end+1?'\n':'');return mathToken(raw,lines.slice(1,end).join('\n'),true);},renderer:mathHTML}
 ],renderer:{code(token){if(token.lang?.trim().split(/\s+/)[0].toLowerCase()==='mermaid')return `<div class="moji-mermaid-placeholder" data-source="${encodeURIComponent(token.text)}">${escape(token.text)}</div>`;return false;}}});
export function renderMarkdown(text){return DOMPurify.sanitize(marked.parse(text),{USE_PROFILES:{html:true}});}
export function safeImageURL(value){try{const u=new URL(value);return ['https:','http:'].includes(u.protocol)||u.protocol==='data:'&&/^data:image\/(png|jpeg|gif|webp|avif);/i.test(value)?value:null;}catch{return null;}}
export function smallestChange(previous,next){let from=0;while(from<previous.length&&from<next.length&&previous.charCodeAt(from)===next.charCodeAt(from))from++;if(from>0&&from<previous.length&&/[\uD800-\uDBFF]/.test(previous[from-1]))from--;let endA=previous.length,endB=next.length;while(endA>from&&endB>from&&previous.charCodeAt(endA-1)===next.charCodeAt(endB-1)){endA--;endB--;}return{from,to:endA,insert:next.slice(from,endB)};}
export function outlineFromTree(tree,doc){const items=[];tree.iterate({enter(node){if(['FencedCode','CodeBlock','HTMLBlock'].includes(node.name))return false;const match=/^(ATX|Setext)Heading([1-6])$/.exec(node.name);if(match){const line=doc.lineAt(node.from);const text=doc.sliceString(node.from,node.to).split('\n')[0].replace(/^\s*#{1,6}\s+/,'').replace(/\s+#+\s*$/,'');items.push({from:node.from,to:node.to,i:line.number-1,line:line.text,match:['','#'.repeat(Number(match[2])),text]});}}});return items;}
