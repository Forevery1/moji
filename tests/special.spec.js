import{test,expect}from'@playwright/test';
import{setSource,sourceEditor,richEditor,expectSource,savedSource}from'./helpers';
const tableText='前言\n\n| 项目 | 数量 | 状态 |\n| :--- | ---: | :---: |\n| 甲 | 1 | 待办 |\n| 乙 | 2 | 完成 |\n\n尾段';
const table=p=>p.locator('.cm-visual-table');
const input=p=>table(p).locator('textarea');
async function preview(p,text){await p.goto('/');await setSource(p,text);await p.getByRole('button',{name:'即时预览',exact:true}).click();}
async function editCell(p,row,col){await table(p).locator(`[data-row="${row}"][data-col="${col}"] .table-cell-content`).click();await expect(input(p)).toBeVisible();return input(p);}
async function command(p,name){await table(p).getByText('行列操作',{exact:true}).click();await table(p).getByRole('button',{name,exact:true}).click();}

test('行内和块公式本地渲染、原文与源码切换',async({page})=>{
 const text='# 公式\n\n行内 $E=mc^2$ 与正文。\n\n$$\n\\int_0^1 x^2\\,dx=\\frac{1}{3}\n$$\n\n尾段';
 await preview(page,text);await expect(page.locator('.cm-math-inline .special-result > mjx-container > svg')).toHaveCount(1);await expect(page.locator('.cm-math-block .special-result > mjx-container > svg')).toHaveCount(1);await expectSource(page,text);
 await page.locator('.cm-math-block').click();await expect(richEditor(page)).toContainText('\\int_0^1');await page.getByRole('button',{name:'源码',exact:true}).click();await expectSource(page,text);await page.getByRole('button',{name:'即时预览',exact:true}).click();await expect(page.locator('.cm-math-block .special-result > mjx-container > svg')).toHaveCount(1);
});
test('公式错误修复、前向引用和代码中的美元不误判',async({page})=>{
 await preview(page,'引用 $\\eqref{energy}$\n\n$$\nE=mc^2\\label{energy}\n$$\n\n`$不是公式$`\n\n$$\n\\frac{1}\n$$');
 await expect(page.locator('.cm-math-inline .special-result > mjx-container > svg')).toHaveCount(1);await expect(page.locator('.cm-math-block[data-error=true]')).toHaveCount(1);await expect(page.locator('.cm-math-inline [data-c="3F"]')).toHaveCount(0);
 await page.getByRole('button',{name:'源码',exact:true}).click();await sourceEditor(page).fill('$$\n\\frac{1}{2}\n$$');await page.getByRole('button',{name:'即时预览',exact:true}).click();await expect(page.locator('.cm-math-block[data-rendered=true]')).toHaveCount(1);await expect(page.locator('.cm-math-block[data-error=true]')).toHaveCount(0);
});
test('Mermaid 中文流程图、错误恢复及主题重绘',async({page})=>{
 const valid='```mermaid\nflowchart LR\n A[输入] --> B[输出]\n```\n\n尾段';await preview(page,valid);await expect(page.locator('.cm-mermaid-preview svg')).toHaveCount(1);await expect(page.locator('.cm-mermaid-preview')).toContainText('输入');await expectSource(page,valid);
 await page.getByRole('button',{name:'源码',exact:true}).click();await sourceEditor(page).fill('```mermaid\nflowchart LR\n A[未闭合\n```');await page.getByRole('button',{name:'即时预览',exact:true}).click();await expect(page.locator('.cm-mermaid-preview[data-error=true]')).toHaveCount(1);
 await page.getByRole('button',{name:'源码',exact:true}).click();await sourceEditor(page).fill(valid);await page.getByRole('button',{name:'即时预览',exact:true}).click();await expect(page.locator('.cm-mermaid-preview[data-rendered=true]')).toHaveCount(1);await page.getByRole('button',{name:'切换主题',exact:true}).click();await expect(page.locator('.cm-mermaid-preview svg')).toHaveCount(1);await expect(page.locator('.cm-mermaid-preview[data-error=true]')).toHaveCount(0);
});
test('Mermaid 其他常用图种可渲染且快速修改不会回退',async({page})=>{
 await preview(page,'```mermaid\nsequenceDiagram\n A->>B: 你好\n```\n\n```mermaid\nclassDiagram\n Animal <|-- Cat\n```\n\n```mermaid\ngantt\n dateFormat YYYY-MM-DD\n section 工作\n 写作 :a, 2026-11-01, 2d\n```');await expect(page.locator('.cm-mermaid-preview svg')).toHaveCount(3);
 await page.getByRole('button',{name:'源码',exact:true}).click();await sourceEditor(page).fill('```mermaid\nflowchart LR\n A[旧结果] --> B\n```');await sourceEditor(page).fill('```mermaid\nflowchart LR\n A[最后结果] --> B\n```');await page.getByRole('button',{name:'即时预览',exact:true}).click();await expect(page.locator('.cm-mermaid-preview')).toContainText('最后结果');await expect(page.locator('.cm-mermaid-preview')).not.toContainText('旧结果');
});
test('单元格编辑、Tab、Shift+Enter与同一撤销历史',async({page})=>{
 await preview(page,tableText);await editCell(page,1,1);await input(page).fill('10');await expectSource(page,tableText.replace('| 1 |','| 10 |'));await input(page).press('Tab');await expect(input(page)).toHaveAttribute('aria-label','表格第 2 行第 3 列');await input(page).fill('中文👩‍💻');await input(page).press('Shift+Enter');await page.keyboard.insertText('下一行');await expect.poll(()=>savedSource(page)).toContain('中文👩‍💻<br>下一行');await input(page).press('ControlOrMeta+z');await expect.poll(()=>savedSource(page)).not.toContain('下一行');
});
test('可视化行列增删、整列移动和对齐同步写回',async({page})=>{
 await preview(page,tableText);await editCell(page,1,1);await command(page,'下方插入行');await expect(table(page).locator('tr')).toHaveCount(4);await command(page,'删除当前行');await expect(table(page).locator('tr')).toHaveCount(3);
 await editCell(page,1,1);await command(page,'向右移动列');await expect(table(page).locator('tr').first()).toContainText('项目');await expect.poll(()=>savedSource(page)).toContain('| 项目 | 状态 | 数量 |');await expect.poll(()=>savedSource(page)).toContain('| 甲 | 待办 | 1 |');
 await table(page).getByText('列对齐',{exact:true}).click();await table(page).getByRole('button',{name:'居中对齐',exact:true}).click();await expect.poll(()=>savedSource(page)).toContain('| :--- | :---: | :---: |');
 await command(page,'左侧插入列');await expect(table(page).locator('tr').first().locator('th')).toHaveCount(4);await command(page,'删除当前列');await expect(table(page).locator('tr').first().locator('th')).toHaveCount(3);expect(await savedSource(page)).toMatch(/^前言\n\n[\s\S]+\n\n尾段$/);
});
test('表格尺寸、粘贴矩阵与源码模式保留结果',async({page})=>{
 await preview(page,tableText);await editCell(page,1,1);await table(page).getByText('表格大小',{exact:true}).click();await table(page).getByRole('spinbutton',{name:'表格行数'}).fill('4');await table(page).getByRole('spinbutton',{name:'表格列数'}).fill('4');await table(page).getByRole('button',{name:'应用表格尺寸'}).click();await expect(table(page).locator('tr')).toHaveCount(4);await expect(table(page).locator('tr').first().locator('th')).toHaveCount(4);
 await input(page).press('ControlOrMeta+z');await expect(table(page).locator('tr')).toHaveCount(3);await editCell(page,1,1);await input(page).evaluate(el=>{const data=new DataTransfer();data.setData('text/plain','11\t进行中\n22\t完成');el.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:data}));});await expect.poll(()=>savedSource(page)).toContain('| 甲 | 11 | 进行中 |');await expect.poll(()=>savedSource(page)).toContain('| 乙 | 22 | 完成 |');
 await page.getByRole('button',{name:'源码',exact:true}).click();await expect(sourceEditor(page)).toContainText('进行中');await page.getByRole('button',{name:'即时预览',exact:true}).click();await expect(table(page)).toContainText('进行中');
});
test('表格列拖动复用结构命令且可撤销',async({page})=>{
 await preview(page,tableText);await table(page).getByRole('button',{name:'拖动第 2 列',exact:true}).dragTo(table(page).locator('th').nth(2));await expect.poll(()=>savedSource(page)).toContain('| 项目 | 状态 | 数量 |');await page.getByRole('button',{name:'撤销',exact:true}).last().click();await expectSource(page,tableText);
});
test('HTML 导出包含公式和 Mermaid SVG，Markdown 导出仍保留原文',async({page})=>{
 const text='$E=mc^2$\n\n```mermaid\nflowchart LR\n A[输入] --> B[输出]\n```';await preview(page,text);await expect(page.locator('.cm-mermaid-preview svg')).toHaveCount(1);await page.getByRole('button',{name:'导出',exact:true}).click();const pending=page.waitForEvent('download');await page.getByRole('button',{name:'网页 (.html)',exact:true}).click();const dl=await pending,stream=await dl.createReadStream();let html='';for await(const chunk of stream)html+=chunk;expect((html.match(/<svg/g)||[]).length).toBeGreaterThanOrEqual(2);expect(html).toContain('输入');await expectSource(page,text);
});
test('表格选文 AI 写回保持原文范围和撤销',async({page})=>{
 let request;await page.route('**/api/chat',route=>{request=route.request().postDataJSON();return route.fulfill({contentType:'application/x-ndjson',body:'{"type":"delta","text":"已处理"}\n{"type":"done"}\n'});});await preview(page,tableText);await editCell(page,1,2);await input(page).press('ControlOrMeta+a');await page.getByRole('button',{name:'询问选中文字'}).click();await page.getByRole('textbox',{name:'向 AI 提问'}).fill('润色选文');await page.getByRole('button',{name:'发送问题'}).click();await expect(page.locator('.message.assistant .message-text')).toHaveText('已处理');expect(request.selection).toBe('待办');await page.getByRole('button',{name:'替换选文',exact:true}).click();await page.getByRole('button',{name:'确认替换',exact:true}).click();await expectSource(page,tableText.replace('待办','已处理'));await page.getByRole('button',{name:'收起浮窗'}).click();await page.getByRole('button',{name:'撤销',exact:true}).last().click();await expectSource(page,tableText);
});
test('表格组合输入提交、竖线转义和源码入口',async({page})=>{
 await preview(page,tableText);await editCell(page,1,0);await input(page).dispatchEvent('compositionstart',{data:''});await input(page).fill('中文👩‍💻');await expectSource(page,tableText);await input(page).dispatchEvent('compositionend',{data:'中文👩‍💻'});await expectSource(page,tableText.replace('| 甲 |','| 中文👩‍💻 |'));await input(page).fill('竖线|🙂');await expect.poll(()=>savedSource(page)).toContain('竖线\\|🙂');await table(page).getByRole('button',{name:'表格源码',exact:true}).click();await expect(page.locator('.cm-md-table-source')).toHaveCount(4);await page.getByRole('textbox',{name:'文档名称'}).focus();await expect(table(page)).toHaveCount(1);
});
