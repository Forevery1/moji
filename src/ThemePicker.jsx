import React,{useEffect,useRef,useState}from'react';
import{Check,X,Search,Sun,Moon}from'lucide-react';
import{themes,getTheme}from'./themes/catalog';
export function ThemePicker({selected,onSelect,onClose,returnFocus,mode}){
 const[query,setQuery]=useState(''),[filter,setFilter]=useState('all'),search=useRef(null),panel=useRef(null);const current=getTheme(selected);
 useEffect(()=>{const previous=returnFocus||document.activeElement;search.current?.focus();return()=>{(previous?.isConnected?previous:document.querySelector('.theme-top-button'))?.focus({preventScroll:true});};},[]);
 useEffect(()=>{const escape=event=>{if(event.key==='Escape'){event.preventDefault();onClose();}};document.addEventListener('keydown',escape);return()=>document.removeEventListener('keydown',escape);},[onClose]);
 function keydown(event){if(event.key==='Tab'){const items=[...panel.current.querySelectorAll('button,input')].filter(el=>!el.disabled),first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}}
 const visible=themes.filter(theme=>(filter==='all'||theme.dark===(filter==='dark'))&&(theme.name+' '+theme.id).toLowerCase().includes(query.toLowerCase()));
 return <div className="modal-backdrop theme-backdrop" onMouseDown={event=>event.target===event.currentTarget&&onClose()}><section ref={panel} className="theme-picker" role="dialog" aria-modal="true" aria-label="主题设置" onKeyDown={keydown}>
  <header><div><h2>选择主题</h2><p>内置 14 套主题 · 点击即应用，自动记住选择</p></div><button className="icon" aria-label="关闭主题设置" onClick={onClose}><X size={19}/></button></header>
  <div className="theme-filters"><label className="theme-search"><Search size={16}/><input ref={search} aria-label="搜索主题" placeholder="搜索主题名称" value={query} onChange={event=>setQuery(event.target.value)}/></label><div className="theme-filter-tabs">{[['all','全部'],['light','浅色'],['dark','深色']].map(([id,label])=><button key={id} aria-pressed={filter===id} onClick={()=>setFilter(id)}>{label}</button>)}</div></div>
  <div className="theme-grid" role="radiogroup" aria-label="内置主题">{visible.map(theme=><button key={theme.id} className={'theme-card '+(selected===theme.id?'selected':'')} role="radio" aria-checked={selected===theme.id} aria-label={theme.name} onClick={()=>onSelect(theme.id)}>
   <span className={'theme-swatch '+(/whitey|newsprint/.test(theme.id)?'theme-serif':'')} style={{background:theme.palette.bg,color:theme.palette.text,borderColor:theme.dark?'#555':'#ddd'}}><span className="theme-swatch-sidebar" style={{background:theme.palette.side}}/><span className="theme-swatch-copy"><strong>Aa · 墨记</strong><span style={{color:theme.palette.accent}}>让想法清晰成文</span><i style={{background:theme.palette.text}}/><i style={{background:theme.palette.text,width:'65%'}}/></span></span>
   <span className="theme-card-name">{theme.name}{selected===theme.id&&<Check size={15}/>}</span><span className="theme-card-meta">{theme.group} · {theme.dark?'深色':'浅色'}</span>
  </button>)}</div>{!visible.length&&<p className="theme-empty">没有匹配的主题</p>}
  <footer><span>{mode==='dark'?<Moon size={14}/>:<Sun size={14}/>}当前：{current.name}{mode&&((mode==='dark')!==current.dark)?`（${mode==='dark'?'深色':'浅色'}显示）`:''}</span><button className="primary" onClick={onClose}>完成</button></footer>
 </section></div>;
}
