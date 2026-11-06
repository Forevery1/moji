export const FONT_STORAGE='moji.typography.v1';
export const fontOptions=[
 {id:'theme',name:'跟随主题',family:''},
 {id:'system',name:'系统字体',family:'-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif'},
 {id:'songti',name:'宋体',family:'"Songti SC","STSong",serif'},
 {id:'pingfang',name:'苹方',family:'"PingFang SC",-apple-system,sans-serif'},
 {id:'kaiti',name:'楷体',family:'"Kaiti SC","STKaiti",serif'},
 {id:'heiti',name:'黑体',family:'"Heiti SC","STHeiti",sans-serif'},
 {id:'serif',name:'衬线字体',family:'Georgia,"Songti SC",serif'},
 {id:'mono',name:'等宽字体',family:'ui-monospace,"SFMono-Regular",Menlo,monospace'},
 {id:'custom',name:'自定义字体',family:''}
];
export const defaultTypography={font:'theme',custom:'',size:null,lineHeight:null,uiFont:'theme',uiCustom:'',uiSize:null};
const number=(value,min,max)=>typeof value==='number'&&Number.isFinite(value)?Math.max(min,Math.min(max,value)):null;
const clean=value=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,'').slice(0,100):'';
export function normalizeTypography(value){const v=value&&typeof value==='object'?value:{};return{font:fontOptions.some(f=>f.id===v.font)?v.font:'theme',custom:clean(v.custom),size:number(v.size,12,36),lineHeight:number(v.lineHeight,1.3,2.6),uiFont:fontOptions.some(f=>f.id===v.uiFont)?v.uiFont:'theme',uiCustom:clean(v.uiCustom),uiSize:number(v.uiSize,12,20)};}
export function loadTypography(storage){try{return normalizeTypography(JSON.parse(storage.getItem(FONT_STORAGE)||'null'));}catch{return{...defaultTypography};}}
export function fontFamily(id,custom=''){if(id==='custom')return custom.trim()?JSON.stringify(clean(custom).trim()).replace(/</g,'\\3c ')+',sans-serif':'';return fontOptions.find(f=>f.id===id)?.family||'';}
const codeFont='ui-monospace,"SFMono-Regular",Menlo,monospace';
export function typographyCSS(input,{exporting=false,ratios=[2.2,1.6,1.3,1.1,1,.95]}={}){const p=normalizeTypography(input),scope=exporting?'.theme-content':'[data-theme-id] .markdown-engine .cm-content.writing',family=fontFamily(p.font,p.custom);let css='';
 if(family)css+=`${scope},${scope} :is(h1,h2,h3,h4,h5,h6,p,li,th,td,blockquote,.cm-line,.cm-md-heading){font-family:${family}!important}${scope} :is(pre,code,.cm-md-code-line,.cm-md-inline-code){font-family:${codeFont}!important}`;
 if(p.size){css+=`${scope},${scope} table,${scope} .cm-md-table-preview{font-size:${p.size}px!important}`;for(let i=0;i<6;i++)css+=`${scope} :is(h${i+1},.cm-md-h${i+1}){font-size:${+(p.size*ratios[i]).toFixed(3)}px!important}`;css+=`${scope} :is(p,li,th,td,blockquote,.cm-md-paragraph){font-size:inherit!important}`;css+=`${scope} :is(pre,.cm-md-code-line,.cm-md-inline-code){font-size:.9em!important}${scope} pre code{font-size:inherit!important}`;if(!exporting)css+=`.markdown-engine .cm-content.source-editor{font-size:${p.size}px!important}${scope} .table-cell-input{font-size:inherit!important;font-family:inherit!important;line-height:inherit!important}`;}
 if(p.lineHeight)css+=`${scope},${scope} :is(.cm-line,p,li,blockquote,th,td){line-height:${p.lineHeight}!important}`;
 if(!exporting){const uiFamily=fontFamily(p.uiFont,p.uiCustom);if(uiFamily)css+=`.sidebar,.topbar,.statusbar,.ai-window,.modal-backdrop{font-family:${uiFamily}!important}.brand,.doc-title,.ai-empty h3,.modal-backdrop :is(button,input,select,textarea,h2,h3){font-family:${uiFamily}!important}`;if(p.uiSize)css+=`.topbar{height:auto!important;min-height:59px;flex-wrap:wrap}.top-actions{max-width:100%;min-width:0;flex-wrap:wrap}.sidebar :is(button,input),.topbar :is(button,input),.ai-window :is(button,input,select,textarea,.message-text){font-size:${p.uiSize}px!important}.brand{font-size:${p.uiSize*2}px!important}.brand>span,.statusbar,.save-status{font-size:${Math.max(11,p.uiSize-2)}px!important}`;}
 return css;
}
// A hidden, non-editable probe reads theme heading ratios without modifying editor state.
export function typographyMetrics(){const style=document.getElementById('moji-font-style');if(style)style.disabled=true;const probe=document.createElement('div');probe.className='markdown-engine';probe.setAttribute('aria-hidden','true');probe.style.cssText='position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none';const content=document.createElement('div');content.className='cm-content writing';const editor=document.createElement('div');editor.className='cm-editor cm-rich-mode';editor.append(content);probe.append(editor);for(let i=1;i<=6;i++){const h=document.createElement('div');h.className=`cm-line cm-md-heading cm-md-h${i}`;h.textContent='Aa 中文';content.append(h);}document.body.append(probe);const size=parseFloat(getComputedStyle(content).fontSize)||18,ratios=[...content.children].map(el=>(parseFloat(getComputedStyle(el).fontSize)||size)/size);probe.remove();if(style)style.disabled=false;return{size,ratios};}
export function applyTypography(prefs){const metrics=typographyMetrics();let style=document.getElementById('moji-font-style');if(!style){style=document.createElement('style');style.id='moji-font-style';document.head.append(style);}document.head.append(style);style.textContent=typographyCSS(prefs,metrics);document.documentElement.dataset.fontSize=prefs.size||'theme';window.dispatchEvent(new Event('moji-font-ready'));return metrics;}
