import{expect}from'@playwright/test';
export const sourceEditor=page=>page.getByRole('textbox',{name:'Markdown 源码',exact:true});
export const richEditor=page=>page.getByRole('textbox',{name:'文档编辑区',exact:true});
export async function setSource(page,text){await page.getByRole('button',{name:'源码',exact:true}).click();await sourceEditor(page).fill(text);await expectSource(page,text);}
export async function savedSource(page){return page.evaluate(()=>{const workspace=JSON.parse(localStorage.getItem('moji.workspace.v1'));return workspace.docs.find(d=>d.id===workspace.active).text;});}
export async function expectSource(page,text){await expect.poll(()=>savedSource(page)).toBe(text);}
export async function selectLastLine(area){await area.press('ControlOrMeta+End');await area.press('Shift+Home');}
