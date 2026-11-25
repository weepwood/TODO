import {test,expect,devices} from '@playwright/test';
import {chooseOption} from './select-helper.js';
test('统一下拉菜单支持键盘、选中态、空值、Escape 和焦点恢复',async({page})=>{
 await page.goto('/');
 const sort=page.getByRole('combobox',{name:'排序',exact:true});
 await sort.focus();await page.keyboard.press('Enter');
 const menu=page.getByRole('listbox');await expect(menu).toBeVisible();
 await expect(menu.locator('[data-option-value="manual"]')).toHaveAttribute('aria-selected','true');
 await expect(menu.locator('[data-option-value="manual"]')).toBeFocused();
 await page.keyboard.press('ArrowDown');await expect(menu.locator('[data-option-value="date"]')).toBeFocused();await page.keyboard.press('Enter');
 await expect(sort).toHaveAttribute('data-value','date');
 await sort.click();await page.keyboard.press('Escape');await expect(menu).toHaveCount(0);await expect(sort).toBeFocused();
 await page.getByRole('button',{name:'新建任务',exact:true}).click();
 await page.getByRole('textbox',{name:'快速任务名称'}).fill('界面验收');
 await page.getByRole('button',{name:'创建任务',exact:true}).click();
 const detail=page.locator('.details');
 await chooseOption(detail.getByRole('combobox',{name:'优先级',exact:true}),'3');
 await expect(detail.getByRole('combobox',{name:'优先级',exact:true})).toHaveAttribute('data-value','3');
 await detail.getByRole('combobox',{name:'状态',exact:true}).click();
 await expect(menu.locator('[data-option-value="done"]')).toHaveAttribute('aria-disabled','true');
 await page.keyboard.press('Escape');
 await expect(detail).toBeVisible();
 await page.screenshot({path:'test-results/ui-workbench-desktop.png',animations:'disabled'});
});
test('移动端页面、设置、下拉及触控尺寸 320/390/430',async({page})=>{
 for(const width of [320,390,430]){
  await page.setViewportSize({width,height:844});await page.goto('/');
  await expect(page.locator('.mobile-nav')).toBeVisible();
  const bounds=await page.getByRole('button',{name:'打开导航'}).boundingBox();
  expect(bounds.width).toBeGreaterThanOrEqual(44);expect(bounds.height).toBeGreaterThanOrEqual(44);
  await page.getByRole('combobox',{name:'排序',exact:true}).click();
  const menu=page.getByRole('listbox');await expect(menu).toBeVisible();
  if(width===390)await page.screenshot({path:'test-results/ui-workbench-mobile-select.png',animations:'disabled'});
  const b=await menu.boundingBox();expect(b.x).toBeGreaterThanOrEqual(0);expect(b.x+b.width).toBeLessThanOrEqual(width+1);
  await menu.getByRole('option',{name:'日期',exact:true}).click();
  await page.getByRole('button',{name:'更多',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'设置',exact:true}).click();
  const settings=page.getByRole('dialog',{name:'设置与数据管理'});await expect(settings).toBeVisible();
  await settings.getByRole('navigation',{name:'设置分类'}).getByRole('button',{name:'外观与布局'}).click();
  await chooseOption(settings.getByRole('combobox',{name:'控件密度'}),'relaxed');
  await expect(settings.getByRole('combobox',{name:'控件密度'})).toHaveAttribute('data-value','relaxed');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(width===390)await page.screenshot({path:'test-results/ui-workbench-mobile-settings.png',animations:'disabled'});
  await settings.getByRole('button',{name:'关闭',exact:true}).click();
  await page.getByRole('textbox',{name:'新任务名称'}).fill('移动界面 '+width);
  await page.getByRole('button',{name:'添加',exact:true}).click();
  await expect(page.locator('.details')).toBeVisible();
  if(width===390)await page.screenshot({path:'test-results/ui-workbench-mobile-detail.png',animations:'disabled'});
  await page.getByRole('button',{name:'关闭详情'}).click();
  if(width===390)await page.screenshot({path:'test-results/ui-workbench-mobile-tasks.png',animations:'disabled'});
 }
});
test('减少动态效果时禁用新页面与下拉动画',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
 expect(await page.locator('.task-content').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
 await page.getByRole('combobox',{name:'排序',exact:true}).click();
 expect(await page.locator('.smart-select-content').evaluate(el=>getComputedStyle(el).animationName)).toBe('none');
});
