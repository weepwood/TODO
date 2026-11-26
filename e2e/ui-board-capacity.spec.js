import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey,STORAGE_KEY} from '../src/domain.js';
import {chooseOption} from './select-helper.js';
test('大看板分页、末页跳转及跨列移动保留任务和统计',async({page})=>{
 const d={...initialState(),tasks:Array.from({length:125},(_,i)=>newTask('分页任务 '+i,'inbox',dayKey(),'board-'+i))};
 await page.addInitScript(({d,key})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(d))},{d,key:STORAGE_KEY});
 await page.goto('/');await page.getByRole('button',{name:'看板',exact:true}).click();
 const lane=page.locator('[data-lane-key=todo]'),nav=lane.getByRole('navigation',{name:'待处理分页'});
 await expect(nav).toContainText('1–60 / 125');await expect(lane.locator('.board-task-card')).toHaveCount(60);
 await nav.getByRole('button',{name:'待处理下一页'}).click();await expect(nav).toContainText('61–120 / 125');
 await nav.getByRole('textbox',{name:'待处理前往页码'}).fill('3');await nav.getByRole('button',{name:'待处理跳转'}).click();await expect(nav).toContainText('121–125 / 125');await expect(lane.locator('.board-task-card')).toHaveCount(5);
 await chooseOption(page.getByRole('combobox',{name:'状态 分页任务 124',exact:true}),'doing');
 await expect(nav).toContainText('121–124 / 124');await expect(page.locator('[data-lane-key=doing]')).toContainText('分页任务 124');
 await page.reload();await page.getByRole('button',{name:'看板',exact:true}).click();await expect(page.locator('[data-lane-key=doing]')).toContainText('分页任务 124');
 await expect(page.locator('[data-lane-key=todo] .board-task-card')).toHaveCount(60);
});
