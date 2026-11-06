import presets from './manifest.json' with {type:'json'};
const builtin=[
 {id:'moji-light',name:'墨记浅色',group:'墨记',dark:false,palette:{bg:'#ffffff',side:'#f7f7f8',text:'#292930',accent:'#7161a8'}},
 {id:'moji-dark',name:'墨记深色',group:'墨记',dark:true,palette:{bg:'#202024',side:'#25252b',text:'#dedee4',accent:'#b6a0ef'}}
];
export const themes=[...builtin,...presets];
export const THEME_STORAGE='moji.theme.id';
export const getTheme=id=>themes.find(theme=>theme.id===id)||builtin[0];
export function savedTheme(storage){const id=storage.getItem(THEME_STORAGE);if(themes.some(theme=>theme.id===id))return id;return storage.getItem('moji.theme')==='dark'?'moji-dark':'moji-light';}

export function accentForeground(color){const hex=color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];let channels=hex?(hex.length===3?[...hex].map(c=>parseInt(c+c,16)):hex.match(/../g).map(c=>parseInt(c,16))):(color.match(/[\d.]+/g)||[]).slice(0,3).map(Number);if(channels.length!==3)channels=[113,97,168];const luminance=channels.map(c=>c/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);return (1.05/(luminance+.05))>=((luminance+.05)/.05)?'#ffffff':'#000000';}

export const THEME_MODE_STORAGE="moji.theme.mode";
export function savedThemeMode(storage,id){const mode=storage.getItem(THEME_MODE_STORAGE);return ["light","dark"].includes(mode)?mode:getTheme(id).dark?"dark":"light";}
export function themeAppearance(id,mode){const original=getTheme(id),dark=mode?mode==="dark":original.dark;return {...original,dark,palette:dark===original.dark?original.palette:{...original.palette,...getTheme(dark?"moji-dark":"moji-light").palette,muted:dark?"#a6a6b0":"#767680",border:dark?"#50535b":"#dedee3",code:dark?"#292b32":"#f5f5f7",hover:dark?"#3c3b45":"#f0eef5",selected:dark?"#33313c":"#eae6f3",shadow:dark?"0 16px 65px #0005":"0 16px 65px #2420301a"}};}
