// Lezer extension API: https://lezer.codemirror.net/docs/ref/#markdown.MarkdownConfig
// Math is parsed as source ranges, never inferred from rendered SVG.
export function inlineMathEnd(text, start) {
  let open, close;
  if (text.startsWith('\\(', start)) { open='\\('; close='\\)'; }
  else if (text[start]==='$') { open=text[start+1]==='$'?'$$':'$'; close=open; }
  else return null;
  const body=start+open.length;
  if (!text[body] || /\s/.test(text[body])) return null;
  let braces=0;
  for (let i=body;i<text.length;i++) {
    if (text[i]==='\n') return null;
    if (!braces && text.startsWith(close,i) && i>body && !/\s/.test(text[i-1]) && !(close==='$' && /[\d$]/.test(text[i+1]||'')))
      return {end:i+close.length,bodyFrom:body,bodyTo:i,open,close};
    if (text[i]==='\\') { i++; continue; }
    if (text[i]==='{') braces++;
    if (text[i]==='}') braces=Math.max(0,braces-1);
  }
  return null;
}
export const mathSyntax={
 defineNodes:[{name:'MathBlock',block:true},'InlineMath','MathMark','MathText'],
 parseInline:[{name:'InlineMath',before:'Escape',parse(cx,next,pos){
  if(next!==36 && next!==92)return -1;
  const m=inlineMathEnd(cx.text,pos-cx.offset);if(!m)return -1;
  return cx.addElement(cx.elt('InlineMath',pos,cx.offset+m.end,[cx.elt('MathMark',pos,cx.offset+m.bodyFrom),cx.elt('MathText',cx.offset+m.bodyFrom,cx.offset+m.bodyTo),cx.elt('MathMark',cx.offset+m.bodyTo,cx.offset+m.end)]));
 }}],
 parseBlock:[{name:'MathBlock',before:'FencedCode',parse(cx,line){
  // Composite quote/list markers belong to their parent and are not TeX.
  const raw=line.text.slice(line.pos).trim();
  if(!['$$','\\['].includes(raw)||line.indent-line.baseIndent>=4)return false;
  const close=raw==='$$'?'$$':'\\]',start=cx.lineStart+line.pos;
  const children=[cx.elt('MathMark',start,start+raw.length)];let end=cx.lineStart+line.text.length;
  while(cx.nextLine()){
   const begin=cx.lineStart+line.pos;end=cx.lineStart+line.text.length;
   if(line.text.slice(line.pos).trim()===close){children.push(cx.elt('MathMark',begin,begin+close.length));cx.nextLine();break;}
   children.push(cx.elt('MathText',begin,end));
  }
  cx.addElement(cx.elt('MathBlock',start,end,children));return true;
 },endLeaf(_cx,line){return ['$$','\\['].includes(line.text.slice(line.pos).trim());}}]
};
export function mathFromNode(node,doc){
 const marks=[],parts=[];for(let c=node.firstChild;c;c=c.nextSibling){if(c.name==='MathMark')marks.push(c);if(c.name==='MathText')parts.push(doc.sliceString(c.from,c.to));}
 return {from:node.from,to:node.to,bodyFrom:node.name==='MathBlock'?(node.getChild('MathText')?.from??marks[0]?.to??node.from):(marks[0]?.to??node.from),tex:parts.join(node.name==='MathBlock'?'\n':''),display:node.name==='MathBlock',closed:marks.length===2};
}
export function collectMath(tree,doc){const items=[];tree.iterate({enter(ref){if(ref.name==='MathBlock'||ref.name==='InlineMath'){items.push(mathFromNode(ref.node,doc));return false;}if(['FencedCode','CodeBlock','HTMLBlock'].includes(ref.name))return false;}});return items;}
