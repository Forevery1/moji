import fs from 'node:fs/promises';
import path from 'node:path';
import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
// Parse selectors rather than splitting commas (which may occur inside :is()).
// https://github.com/postcss/postcss-selector-parser#usage
const root=path.resolve('themes/presets'),out=path.resolve('src/themes/generated');
const names=['github','gothic','newsprint','night','pixyll','vue','vue-dark','whitey'];
const color=(value,fallback)=>{const match=value?.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|\b(?:white|black)\b/i);return match?.[0]||fallback;};
function resolve(value,vars){for(let n=0;n<8&&/var\(/.test(value||'');n++)value=value.replace(/var\((--[\w-]+)(?:,\s*([^)]*))?\)/g,(_,key,fallback)=>vars[key]||fallback||'');return value;}
async function readCSS(file,seen=new Set()){
 if(!file.startsWith(root+path.sep)||seen.has(file))return postcss.root();seen.add(file);
 const ast=postcss.parse(await fs.readFile(file,'utf8'),{from:file});
 const imports=[];ast.walkAtRules('import',rule=>imports.push(rule));
 for(const rule of imports){const target=rule.params.match(/(?:url\(\s*)?['"]?([^'"\s)]+)['"]?/i)?.[1];if(!target||/^(?:[a-z]+:|\/\/|\/)/i.test(target)){rule.remove();continue;}const resolved=path.resolve(path.dirname(file),target);try{const imported=await readCSS(resolved,seen);rule.replaceWith(...imported.nodes);}catch{rule.remove();}}
 return ast;
}
function paletteOf(ast,id){
 const vars={},body={},link={};let fontSize='16px';
 ast.walkRules(rule=>{if(rule.parent.type!=='root')return;const selectors=rule.selectors.map(s=>s.trim());
  if(selectors.includes(':root'))rule.walkDecls(d=>{if(d.prop.startsWith('--'))vars[d.prop]=d.value;});
  if(selectors.some(s=>['body','html','#write'].includes(s)))rule.walkDecls(d=>{body[d.prop]=d.value;if(d.prop==='font-size'&&selectors.includes('html'))fontSize=d.value;});
  if(selectors.includes('a'))rule.walkDecls(d=>link[d.prop]=d.value);
 });
 const dark=id.includes('night')||id.includes('dark'),bg=color(resolve(vars['--bg-color']||body['background-color']||body.background,vars),dark?'#282c34':'#ffffff');
 const text=color(resolve(vars['--text-color']||body.color,vars),dark?'#dedee4':'#333333');
 const accent=color(resolve(vars['--primary-color']||link.color,vars),dark?'#b6a0ef':'#7161a8');
 return{dark,rem:fontSize.match(/^\d+(?:\.\d+)?px$/)?fontSize:'16px',palette:{bg,text,accent,side:color(resolve(vars['--side-bar-bg-color'],vars),dark?'#25282e':'#f7f7f8'),muted:dark?'#a6a6b0':'#767680',border:dark?'#50535b':'#dedee3',code:dark?'#292b32':'#f5f5f7',hover:dark?'#3c3b45':'#f0eef5',selected:dark?'#33313c':'#eae6f3',shadow:dark?'0 16px 65px #0005':'0 16px 65px #2420301a'}};
}
const tagMap={h1:'.cm-md-h1',h2:'.cm-md-h2',h3:'.cm-md-h3',h4:'.cm-md-h4',h5:'.cm-md-h5',h6:'.cm-md-h6',p:'.cm-md-paragraph',blockquote:'.cm-md-quote-line',pre:'.cm-md-code-line',code:'.cm-md-inline-code',strong:'.cm-md-strong',b:'.cm-md-strong',em:'.cm-md-em',i:'.cm-md-em',del:'.cm-md-strike',s:'.cm-md-strike',a:'.cm-md-link',hr:'.cm-md-rule'};
function scopedSelector(input,scope,preview){
 if(/#typora-(?!source)|#md-|\.typora-|\.html-for-|\.native-window|\.CodeMirror|\.cm-s-|\.mac-|\.megamenu|#file-|\.file-|\.sidebar|\.outline|\.md-toc|\.md-focus|\.md-task-list|\.task-list|\.md-image|\.md-meta/.test(input))return null;
 if(input.includes('#typora-source'))return preview?`[data-theme-id] .markdown-engine .cm-content.source-editor`:null;
 let result;
 try{result=selectorParser(ast=>{
  ast.walk(node=>{
   if(node.type==='id'&&node.value==='write'||node.type==='tag'&&['html','body'].includes(node.value)||node.type==='pseudo'&&node.value===':root')node.replaceWith(selectorParser.tag({value:'mojithemeroot'}));
   else if(preview&&node.type==='tag'&&tagMap[node.value])node.replaceWith(selectorParser.pseudo({value:':is',nodes:selectorParser().astSync(node.value+','+tagMap[node.value]).nodes}));
   else if(preview&&node.type==='class'&&node.value==='md-fences')node.value='cm-md-code-line';
   else if(preview&&node.type==='class'&&node.value==='ty-table-edit')node.value='table-controls';
   else if(node.type==='class'&&node.value==='md-table')node.replaceWith(selectorParser.tag({value:'table'}));
  });
 }).processSync(input,{lossless:false});}catch{return null;}
 result=result.replace(/mojithemeroot(?:\s*>?\s*mojithemeroot)+/g,'mojithemeroot');
 if(result.includes('mojithemeroot'))result=result.replaceAll('mojithemeroot',scope);else result=scope+' '+result;
 return result;
}
async function resources(ast,id,stats){
 const fonts=new Map();ast.walkAtRules('font-face',rule=>{const family=rule.nodes.find(n=>n.prop==='font-family')?.value.replace(/^['"]|['"]$/g,'');if(family)fonts.set(family,'Moji-'+id+'-'+family.replace(/\W/g,''));});
 const declarations=[];ast.walkDecls(d=>declarations.push(d));
 for(const declaration of declarations){
  let value=declaration.value;
  if(declaration.prop==='font-family'||declaration.prop.startsWith('--font-'))for(const [family,renamed]of fonts)value=value.replaceAll(family,renamed);
  const urls=[...value.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/g)];let invalid=false;
  for(const match of urls){const url=match[2];if(url.startsWith('data:'))continue;if(/^(?:[a-z]+:|\/\/|\/)/i.test(url)){invalid=true;break;}
   const source=declaration.source?.input.file;const resolved=path.resolve(path.dirname(source),url.split(/[?#]/)[0]);
   if(!resolved.startsWith(root+path.sep)){invalid=true;break;}
   try{const bytes=await fs.readFile(resolved),ext=path.extname(resolved).toLowerCase(),mime={'.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.otf':'font/otf','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'}[ext];if(!mime){invalid=true;break;}value=value.replace(match[0],`url("data:${mime};base64,${bytes.toString('base64')}")`);stats.assets.add(resolved);}catch{stats.missing.push(url);invalid=true;break;}
  }
  if(invalid||/expression\s*\(|javascript:|-moz-binding|behavior:/i.test(value)){declaration.remove();continue;}
  declaration.value=value;
 }
}
function compile(ast,id,profile,preview){
 const copy=ast.clone(),scope=preview?`[data-theme-id="${id}"] .markdown-engine .cm-content.writing`:'.theme-content';
 copy.walkComments(c=>c.remove());
 copy.walkAtRules(rule=>{if(!['font-face','media','supports','keyframes','-webkit-keyframes'].includes(rule.name))rule.remove();});
 copy.walkRules(rule=>{
  if(rule.parent.type==='atrule'&&/keyframes$/.test(rule.parent.name))return;
  const selectors=rule.selectors.map(s=>scopedSelector(s,scope,preview)).filter(Boolean);if(!selectors.length){rule.remove();return;}rule.selector=[...new Set(selectors)].join(',');
  if(preview)rule.walkDecls(d=>{
   if(/margin(?:-top|-bottom)?$/.test(d.prop)&&/cm-md-h[1-6]/.test(rule.selector)){d.prop=d.prop.replace('margin','padding');d.important=true;}
   else if(/^margin(?:-top|-bottom)?$/.test(d.prop)&&/cm-md-(?:paragraph|code|quote)/.test(rule.selector))d.remove();
   if(d.prop==='padding'&&/cm-md-h[1-6]/.test(rule.selector))d.important=true;
  });
 });
 copy.walkDecls(d=>{d.value=d.value.replace(/(-?\d*\.?\d+)rem\b/g,(_,n)=>`calc(${n} * var(--theme-rem))`);});
 const base=preview?`${scope}{--theme-rem:${profile.rem};font-size:${profile.rem};line-height:1.6;letter-spacing:normal;text-align:left;caret-color:var(--accent)}[data-theme-id="${id}"] .markdown-engine .cm-rich-mode{max-width:none}${scope} .cm-line{line-height:inherit;min-height:1.6em}${scope} .cm-md-heading{min-height:0}`:`.theme-content{--theme-rem:${profile.rem};font-size:${profile.rem};line-height:1.6;background:${profile.palette.bg};color:${profile.palette.text};box-sizing:border-box}.theme-content *{box-sizing:border-box}.theme-content svg{max-width:100%}.theme-content pre{overflow:auto}.theme-content img{max-width:100%}`;
 return (base+copy.toString()).replace(/<\/style/gi,'<\\/style');
}
await fs.mkdir(out,{recursive:true});const manifest=[],audit=[];
for(const classic of [false,true])for(const name of names){
 const file=path.join(root,classic?'old-themes':'',name+'.css');try{await fs.access(file);}catch{continue;}
 const id=(classic?'classic-':'')+name,label=name==='github'?'GitHub':name==='vue-dark'?'Vue Dark':name[0].toUpperCase()+name.slice(1),ast=await readCSS(file),profile=paletteOf(ast,id),stats={assets:new Set(),missing:[]};
 await resources(ast,id,stats);const value={editorCSS:compile(ast,id,profile,true),exportCSS:compile(ast,id,profile,false)};
 await fs.writeFile(path.join(out,id+'.js'),'// Generated from the supplied theme archive. See script/build_themes.mjs.\nexport default '+JSON.stringify(value)+';\n');
 manifest.push({id,name:label+(classic?' · 经典版':''),group:classic?'经典主题':'内置主题',...profile});audit.push({id,assets:stats.assets.size,missing:stats.missing});
}
await fs.writeFile('src/themes/manifest.json',JSON.stringify(manifest,null,2)+'\n');await fs.writeFile('themes/import-audit.json',JSON.stringify(audit,null,2)+'\n');
console.log(`Compiled ${manifest.length} themes; ${audit.reduce((n,t)=>n+t.missing.length,0)} missing local resources.`);
