import{test,expect}from'@playwright/test';
import{setSource,sourceEditor,richEditor,expectSource,savedSource}from'./helpers';

test('标记动态展开、模式切换与跨文档光标历史',async({page})=>{
 await page.goto('/');await setSource(page,'# 标题\n\n**中文👩‍💻内容**');
 await sourceEditor(page).press('ControlOrMeta+End');await sourceEditor(page).press('ArrowLeft');await sourceEditor(page).press('ArrowLeft');
 await page.getByRole('button',{name:'即时预览',exact:true}).click();await richEditor(page).focus();await page.keyboard.insertText('新增');await expectSource(page,'# 标题\n\n**中文👩‍💻内容新增**');
 await expect(page.locator('.cm-md-syntax').filter({hasText:'**'})).toHaveCount(2);
 await page.getByRole('button',{name:'源码',exact:true}).click();await sourceEditor(page).focus();await page.keyboard.insertText('继续');await expectSource(page,'# 标题\n\n**中文👩‍💻内容新增继续**');
 await page.getByRole('button',{name:'Markdown 语法.md',exact:true}).click();await page.getByRole('button',{name:'开始写作.md',exact:true}).click();await sourceEditor(page).focus();await page.keyboard.insertText('返回');await expectSource(page,'# 标题\n\n**中文👩‍💻内容新增继续返回**');
 const original='# 标题\n\n**中文👩‍💻内容**';for(let i=0;i<3&&await savedSource(page)!==original;i++){const before=await savedSource(page);await sourceEditor(page).press('ControlOrMeta+z');await expect.poll(()=>savedSource(page)).not.toBe(before);}await expectSource(page,original);
});

test('任务复选框写回源码且可撤销',async({page})=>{
 await page.goto('/');await setSource(page,'- [ ] 待办事项\n\n正文');await page.getByRole('button',{name:'即时预览',exact:true}).click();await page.getByRole('checkbox',{name:'未完成任务'}).click();await expectSource(page,'- [x] 待办事项\n\n正文');await expect(page.getByRole('checkbox',{name:'已完成任务'})).toBeChecked();await page.getByRole('button',{name:'撤销',exact:true}).last().click();await expectSource(page,'- [ ] 待办事项\n\n正文');
});

test('表格空单元格及转义竖线映射到正确源码位置',async({page})=>{
 await page.goto('/');const original='| A | B | C |\n| --- | --- | --- |\n| 左\\|侧 | | 右 |\n\n尾行';await setSource(page,original);await page.getByRole('button',{name:'即时预览',exact:true}).click();await expect(page.locator('.cm-md-table-preview td')).toHaveCount(3);await page.locator('.cm-md-table-preview td').nth(1).click();await page.keyboard.insertText('中');await expectSource(page,original.replace('| | 右','| 中| 右'));
});

test('引用链接、围栏代码与表格引用按语法解析',async({page})=>{
 await page.goto('/');await setSource(page,'# 正文\n\n[有效][id] 与 [不存在]\n\n| 链接 |\n| --- |\n| [表内][id] |\n\n```md\n# 假标题\n**非粗体**\n```\n\n[id]: https://example.org\n');await page.getByRole('button',{name:'即时预览',exact:true}).click();await expect(page.locator('.cm-md-link')).toHaveText('有效');await expect(page.locator('.cm-md-table-preview a')).toHaveAttribute('href','https://example.org');await expect(page.locator('.cm-md-heading')).toHaveCount(1);await expect(page.locator('.cm-md-strong')).toHaveCount(0);await expect(richEditor(page)).toContainText('[不存在]');
});

test('导入的 CRLF 原样保存，预览光标编辑不规范化文件',async({page})=>{
 await page.goto('/');const original='#  标题\r\n\r\n__粗体__\r\n\r\n末行';await page.locator('input[type=file]').setInputFiles({name:'CRLF.md',mimeType:'text/markdown',buffer:Buffer.from(original)});await richEditor(page).focus();await richEditor(page).press('ControlOrMeta+End');await page.keyboard.insertText('中文');await expectSource(page,original+'中文');await page.getByRole('button',{name:'源码',exact:true}).click();await page.getByRole('button',{name:'即时预览',exact:true}).click();await expectSource(page,original+'中文');
});

test('组合输入期间不重建显示，提交后保持中文与 emoji',async({page})=>{
 await page.goto('/');await setSource(page,'**中文**');await page.getByRole('button',{name:'即时预览',exact:true}).click();await richEditor(page).focus();await richEditor(page).press('ControlOrMeta+End');await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowLeft');await richEditor(page).dispatchEvent('compositionstart',{data:''});await page.keyboard.insertText('输入👩‍💻');await richEditor(page).dispatchEvent('compositionend',{data:'输入👩‍💻'});await expectSource(page,'**中文输入👩‍💻**');await page.getByRole('textbox',{name:'文档名称'}).focus();await expect(page.locator('.cm-md-strong')).toHaveText('中文输入👩‍💻');
});
