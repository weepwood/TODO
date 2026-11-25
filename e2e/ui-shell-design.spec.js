import {test,expect} from '@playwright/test';

test('桌面清单栏收起释放工作空间，搜索快捷键打开统一搜索',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await page.goto('/');
 const sidebar=page.locator('aside.sidebar'),workspace=page.locator('main.workspace');
 const width=(await workspace.boundingBox()).width,sideWidth=(await sidebar.boundingBox()).width;
 await page.getByRole('button',{name:'隐藏清单栏',exact:true}).click();
 await expect(sidebar).toBeHidden();
 await expect.poll(async()=>(await workspace.boundingBox()).width).toBeGreaterThan(width+sideWidth-5);
 await page.screenshot({path:'test-results/shell-desktop-focus.png',animations:'disabled'});
 await page.keyboard.press('Control+f');
 await expect(sidebar).toBeHidden();await expect(page.getByRole('combobox',{name:'搜索命令与任务'})).toBeFocused();
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'显示清单栏',exact:true}).click();await expect(sidebar).toBeVisible();
 expect(Math.abs((await sidebar.boundingBox()).width-sideWidth)).toBeLessThan(2);
 await page.getByRole('textbox',{name:'新任务名称'}).fill('桌面布局验收');
 await page.getByRole('button',{name:'添加',exact:true}).click();
 await expect(page.locator('aside.details')).toBeVisible();
 await page.getByRole('button',{name:'隐藏清单栏',exact:true}).click();
 await expect(page.getByRole('textbox',{name:'任务标题'})).toHaveValue('桌面布局验收');
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('沉浸式备注编辑切换保留草稿及阅读模式',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await page.goto('/');
 await page.getByRole('textbox',{name:'新任务名称'}).fill('沉浸编辑验收');
 await page.getByRole('button',{name:'添加',exact:true}).click();
 await page.getByRole('button',{name:'展开编辑'}).click();
 const dialog=page.getByRole('dialog',{name:'备注编辑工作台'}),source=dialog.getByRole('textbox',{name:'工作台备注源码'});
 await source.fill('# 阅读笔记\n\n**未应用草稿**');
 const width=(await dialog.boundingBox()).width;
 await dialog.getByRole('button',{name:'沉浸模式',exact:true}).click();
 await expect.poll(async()=>(await dialog.boundingBox()).width).toBeGreaterThan(width);
 await expect(source).toHaveValue('# 阅读笔记\n\n**未应用草稿**');
 await dialog.getByRole('button',{name:'阅读模式',exact:true}).click();
 await expect(dialog.locator('.note-reading')).toContainText('未应用草稿');
 await page.screenshot({path:'test-results/shell-note-immersive.png',animations:'disabled'});
 await dialog.getByRole('button',{name:'返回编辑',exact:true}).click();
 await dialog.getByRole('button',{name:'退出沉浸',exact:true}).click();
 await expect(source).toHaveValue('# 阅读笔记\n\n**未应用草稿**');
 await dialog.getByRole('button',{name:'应用备注'}).click();
 await expect(page.getByRole('textbox',{name:'任务备注'})).toHaveValue(/未应用草稿/);
});
test('手机导航指示器与五个目的地对齐，更多保持当前模块状态',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');
 const nav=page.getByRole('navigation',{name:'移动端主导航'});
 await expect(nav.getByRole('button',{name:'任务',exact:true})).toHaveAttribute('aria-pressed','true');
 for(const name of ['日历','每日规划','统计']){
  await nav.getByRole('button',{name,exact:true}).click();
  await expect(nav.getByRole('button',{name,exact:true})).toHaveAttribute('aria-pressed','true');
  await expect.poll(async()=>{
   const a=await nav.locator('.mobile-nav-indicator').boundingBox(),b=await nav.getByRole('button',{name,exact:true}).boundingBox();return Math.abs(a.x+a.width/2-b.x-b.width/2);
  }).toBeLessThan(3);
 }
 await nav.getByRole('button',{name:'更多',exact:true}).click();
 await page.getByRole('dialog',{name:'工作空间'}).getByRole('button',{name:'习惯',exact:true}).click();
 await expect(nav.getByRole('button',{name:'更多',exact:true})).toHaveAttribute('aria-pressed','true');
 await nav.getByRole('button',{name:'更多',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'工作空间'}).getByRole('button',{name:'习惯',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.screenshot({path:'test-results/shell-mobile-navigation.png',animations:'disabled'});
});
