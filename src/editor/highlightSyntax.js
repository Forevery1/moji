// One matcher keeps live preview and HTML export on the same single-line syntax.
export function highlightMatch(text){
 const match=/^==(?=\S)((?:\\[^\n]|`+[^`\n]*`+|[^=\n]|=(?!=))+?)==/.exec(text);
 return match&&!/\s$/.test(match[1])?match:null;
}
export const highlightSyntax={
 defineNodes:['Highlight','HighlightMark'],
 parseInline:[{name:'Highlight',parse(cx,next,pos){
  if(next!==61)return -1;
  const match=highlightMatch(cx.slice(pos,cx.end));if(!match)return -1;
  const end=pos+match[0].length;
  return cx.addElement(cx.elt('Highlight',pos,end,[cx.elt('HighlightMark',pos,pos+2),...cx.parser.parseInline(match[1],pos+2),cx.elt('HighlightMark',end-2,end)]));
 }}]
};
