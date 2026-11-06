// Direct module setup + renderPromise preserve MathJax's cross-equation ref pass.
// https://docs.mathjax.org/en/latest/server/direct.html
import {mathjax} from '@mathjax/src/js/mathjax.js';
import {TeX} from '@mathjax/src/js/input/tex.js';
import {SVG} from '@mathjax/src/js/output/svg.js';
import {liteAdaptor} from '@mathjax/src/js/adaptors/liteAdaptor.js';
import {RegisterHTMLHandler} from '@mathjax/src/js/handlers/html.js';
import {MathJaxTexFont} from '@mathjax/mathjax-tex-font/js/svg.js';
import '@mathjax/src/js/input/tex/base/BaseConfiguration.js';
import '@mathjax/src/js/input/tex/ams/AmsConfiguration.js';
import '@mathjax/src/js/input/tex/newcommand/NewcommandConfiguration.js';
import '@mathjax/src/js/input/tex/textmacros/TextMacrosConfiguration.js';
import '@mathjax/src/js/input/tex/color/ColorConfiguration.js';
import '@mathjax/src/js/input/tex/configmacros/ConfigMacrosConfiguration.js';
const adaptor=liteAdaptor({fontSize:18});RegisterHTMLHandler(adaptor);
const escape=text=>text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
export async function typesetMath(items){
 const input=new TeX({packages:['base','ams','newcommand','textmacros','color','configmacros'],tags:'all',inlineMath:[['\\(','\\)']],displayMath:[['\\[','\\]']],maxBuffer:10000});
 const output=new SVG({fontData:MathJaxTexFont,fontCache:'none',linebreaks:{inline:false}});
 const markup=items.map(i=>'<div>'+(i.display?'\\[':'\\(')+escape(i.tex)+(i.display?'\\]':'\\)')+'</div>').join('');
 const document=mathjax.document(markup,{InputJax:input,OutputJax:output});
 await document.renderPromise();
 const results=Array.from(document.math,item=>{
  const html=adaptor.outerHTML(item.typesetRoot);
  const error=html.match(/data-mjx-error="([^"]+)"/)?.[1]||null;
  return {html,error};
 });
 results.css=adaptor.textContent(output.styleSheet(document));return results;
}
