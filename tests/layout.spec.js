import {test,expect} from '@playwright/test';

for(const width of [320,390,820]){
 test(`工具栏在 ${width}px 下保留入口且不横向溢出`,async({page})=>{
  await page.setViewportSize({width,height:844});
  await page.goto('/');
  await expect(page.getByRole('button',{name:'即时预览',exact:true})).toHaveAttribute('aria-pressed','true');
  for(const name of ['AI 问答','字体设置','打开主题设置','导出']){
   const button=page.locator('.topbar').getByRole('button',{name,exact:true});
   await expect(button).toBeVisible();
   const box=await button.boundingBox();
   expect(box.x).toBeGreaterThanOrEqual(0);
   expect(box.x+box.width).toBeLessThanOrEqual(width);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
  await page.getByRole('button',{name:'字体设置',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'全局字体设置'})).toBeVisible();
 });
}

test('小窗口侧栏可以关闭，选择文件后返回正文',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');
 const toggle=page.getByRole('button',{name:'切换侧栏',exact:true});
 await toggle.click();
 await expect(toggle).toHaveAttribute('aria-expanded','true');
 await expect(page.getByRole('button',{name:'新建文档',exact:true})).toBeVisible();
 await toggle.click();
 await expect(page.locator('.sidebar')).toHaveCount(0);
 await toggle.click();
 const file=page.locator('.file-open').nth(1),name=await file.getAttribute('aria-label');
 await file.click();
 await expect(page.locator('.sidebar')).toHaveCount(0);
 await expect(page.getByRole('textbox',{name:'文档名称'})).toHaveValue(name);
});
