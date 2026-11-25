import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey,shiftDay} from '../src/domain.js';
test('命令范围筛选、清空搜索与任务直达',async({page})=>{
 const state=initialState();state.tasks=[newTask('范围测试任务','inbox',dayKey())];
 await page.addInitScript(data=>localStorage.setItem('todo-workbench-v1',JSON.stringify(data)),state);
 await page.goto('/');
 await page.locator('.rail').getByRole('button',{name:'命令面板',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'命令面板'}),nav=dialog.getByRole('navigation',{name:'命令搜索范围'}),search=dialog.getByRole('combobox');
 await nav.getByRole('button',{name:'任务',exact:true}).click();
 await expect(dialog.getByRole('option')).toHaveCount(1);
 await search.fill('不存在');await expect(dialog.getByText('没有匹配结果')).toBeVisible();
 await dialog.getByRole('button',{name:'清空命令搜索'}).click();
 await expect(dialog.getByRole('option')).toHaveCount(1);
 await nav.getByRole('button',{name:'清单',exact:true}).click();
 await expect(dialog.getByRole('option').filter({hasText:'范围测试任务'})).toHaveCount(0);
 await nav.getByRole('button',{name:'操作',exact:true}).click();
 await expect(dialog.getByRole('option').filter({hasText:'设置'})).toBeVisible();
 await nav.getByRole('button',{name:'任务',exact:true}).click();
 await page.screenshot({path:'test-results/command-scopes.png',animations:'disabled'});
 await search.focus();await search.press('Enter');
 await expect(page.getByRole('textbox',{name:'任务标题'})).toHaveValue('范围测试任务');
});
test('积分图表日期联动明细与文本筛选',async({page})=>{
 const state=initialState(),today=dayKey(),yesterday=shiftDay(today,-1);
 state.tasks=[{...newTask('阅读任务','inbox',today),status:'completed',completedAt:new Date(today+'T12:00:00').toISOString(),points:20},{...newTask('昨日任务','inbox',yesterday),status:'completed',completedAt:new Date(yesterday+'T12:00:00').toISOString(),points:-5}];
 await page.addInitScript(data=>localStorage.setItem('todo-workbench-v1',JSON.stringify(data)),state);
 await page.goto('/');await page.getByRole('button',{name:'统计',exact:true}).click();
 const ledger=page.locator('.points-ledger');
 await expect(ledger.locator('.points-entry')).toHaveCount(2);
 await page.getByRole('button',{name:today+' 净积分 +20',exact:true}).click();
 await expect(ledger.locator('.points-entry')).toHaveCount(1);await expect(ledger).toContainText('阅读任务');
 await ledger.getByRole('button',{name:/清除日期筛选/}).click();
 await ledger.getByRole('textbox',{name:'搜索积分明细'}).fill('昨日');
 await expect(ledger.locator('.points-entry')).toHaveCount(1);await expect(ledger).toContainText('昨日任务');
 await page.screenshot({path:'test-results/points-ledger-search.png',animations:'disabled'});
});
test('奖励差额与可兑换筛选不修改余额',async({page})=>{
 const state=initialState(),today=dayKey();
 state.tasks=[{...newTask('阅读','inbox',today),status:'completed',completedAt:new Date(today+'T12:00:00').toISOString(),points:20}];
 await page.addInitScript(data=>localStorage.setItem('todo-workbench-v1',JSON.stringify(data)),state);
 await page.setViewportSize({width:390,height:844});await page.goto('/');
 await page.locator('.rail').getByRole('button',{name:'统计',exact:true}).click();
 const wallet=page.getByLabel('积分兑换',{exact:true});
 for(const [name,cost] of [['小奖励','10'],['大部头','50']]){
  await wallet.getByRole('button',{name:'添加奖励'}).click();
  await page.getByLabel('奖励名称',{exact:true}).fill(name);await page.getByLabel('所需积分',{exact:true}).fill(cost);
  await page.getByRole('button',{name:'保存奖励'}).click();
 }
 await expect(wallet.locator('.reward-catalog-row').filter({hasText:'大部头'})).toContainText('还差 30 分');
 await wallet.getByRole('checkbox',{name:'仅可兑换'}).check();
 await expect(wallet.locator('.reward-catalog-row')).toHaveCount(1);
 await expect(wallet.locator('.wallet-grid>div').first()).toContainText('+20');
 await page.screenshot({path:'test-results/points-mobile-rewards.png',animations:'disabled'});
});
