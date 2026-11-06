import{test,expect}from'@playwright/test';
import{setSource,richEditor,expectSource,selectLastLine}from'./helpers';
test('高亮工具栏、取消、撤销、保存和 HTML 导出',async({page})=>{
 await page.goto('/');await setSource(page,'重点内容');await page.getByRole('button',{name:'即时预览',exact:true}).click();await selectLastLine(richEditor(page));await page.getByRole('button',{name:'高亮',exact:true}).click();await expectSource(page,'==重点内容==');await expect(page.locator('.cm-md-highlight')).toHaveText('重点内容');
 await page.getByRole('button',{name:'高亮',exact:true}).click();await expectSource(page,'重点内容');await page.getByRole('button',{name:'撤销',exact:true}).click();await expectSource(page,'==重点内容==');await page.reload();await expect(page.locator('.cm-md-highlight')).toHaveText('重点内容');
 await page.getByRole('button',{name:'切换主题',exact:true}).click();await expect(page.locator('.cm-md-highlight')).toHaveCSS('color','rgb(51, 38, 0)');
 await page.getByRole('button',{name:'导出',exact:true}).click();const pending=page.waitForEvent('download');await page.getByRole('button',{name:/HTML/}).click();const download=await pending;const stream=await download.createReadStream();let html='';for await(const chunk of stream)html+=chunk;expect(html).toContain('<mark>重点内容</mark>');expect(html).toContain('.theme-content mark');
});
test('高亮渲染保持嵌套格式并排除代码，表格支持高亮',async({page})=>{
 await page.goto('/');await setSource(page,'==中文 **加粗**==\n\n`==代码==`\n\n| 标题 |\n| --- |\n| ==表格重点== |');await page.getByRole('button',{name:'即时预览',exact:true}).click();await expect(page.locator('.cm-md-highlight')).toHaveText('中文 加粗');await expect(page.locator('.cm-md-strong')).toHaveText('加粗');await expect(page.locator('.cm-md-inline-code')).toHaveText('==代码==');await expect(page.locator('table mark')).toHaveText('表格重点');
 const rendered=await page.evaluate(async()=>{const{renderMarkdown}=await import('/src/editor/markdown.js');return renderMarkdown('==中文 **加粗**==\n\n`==代码==`\n\n\\==转义==\n\n==未闭合');});expect(rendered).toContain('<mark>中文 <strong>加粗</strong></mark>');expect(rendered.match(/<mark>/g)).toHaveLength(1);
});
