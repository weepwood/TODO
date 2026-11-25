import {chooseOption} from './select-helper.js';
import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey} from '../src/domain.js';
test('快速录入保留草稿与连续创建，任务方向键导航',async({page})=>{
 await page.goto('/');
 await page.getByRole('button',{name:'新建任务',exact:true}).click();
 const quick=page.getByRole('textbox',{name:'快速任务名称'});
 await quick.fill('保留草稿');await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'新建任务',exact:true}).click();await expect(quick).toHaveValue('保留草稿');
 await page.getByRole('button',{name:'创建并继续'}).click();await expect(quick).toHaveValue('');
 await quick.fill('连续创建');await page.getByRole('button',{name:'创建任务',exact:true}).click();
 const a=page.locator('.task-body').filter({hasText:'保留草稿'}),b=page.locator('.task-body').filter({hasText:'连续创建'});
 await expect(a).toBeVisible();await a.focus();await page.keyboard.press('ArrowDown');await expect(b).toBeFocused();await expect(page.getByRole('textbox',{name:'任务标题'})).toHaveValue('连续创建');await page.keyboard.press('Home');await expect(a).toBeFocused();
});
test('工作时段与时间轴密度切换模块后保持',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'每日规划',exact:true}).click();
 await page.getByLabel('工作开始时间').fill('08:30');await page.getByLabel('工作结束时间').fill('17:30');await chooseOption(page.getByLabel('时间轴密度'),'112');
 await page.getByRole('button',{name:'日历',exact:true}).click();await page.getByRole('button',{name:'每日规划',exact:true}).click();
 await expect(page.getByLabel('工作开始时间')).toHaveValue('08:30');await expect(page.getByLabel('工作结束时间')).toHaveValue('17:30');
 await page.reload();await page.getByRole('button',{name:'每日规划',exact:true}).click();await expect(page.getByLabel('时间轴密度')).toHaveAttribute('data-value','112');
});
test('日历待安排任务拖放到指定日期，不重复创建事件',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'新建任务',exact:true}).click();
 await page.getByRole('textbox',{name:'快速任务名称'}).fill('拖放预约');await page.getByRole('button',{name:'创建任务',exact:true}).click();
 await page.getByRole('button',{name:'日历',exact:true}).click();
 await page.getByLabel('联动日期').fill('2026-12-10');
 await page.getByRole('button',{name:'待安排',exact:true}).click();
 const drag=page.getByRole('button',{name:'拖入日历 拖放预约'});
 await expect(drag).toBeVisible();
 const target=page.locator('.calendar-main [data-date="2026-12-10"]').first();
 await target.scrollIntoViewIfNeeded();const a=await drag.boundingBox(),b=await target.boundingBox();
 if(!a||!b)throw Error('drag target is not visible');
 await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(a.x+a.width/2-15,a.y+a.height/2,{steps:5});await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:18});await page.mouse.up();
 await expect(drag).toHaveCount(0);
 await page.getByRole('button',{name:'选定日期',exact:true}).click();
 await expect(page.locator('.agenda-title').filter({hasText:'拖放预约'})).toHaveCount(1);
 await expect(page.getByLabel('联动日期')).toHaveValue('2026-12-10');
});

test('虚拟列表使用 End/Home 跨越未挂载任务',async({page})=>{
 const state=initialState();state.tasks=Array.from({length:400},(_,i)=>newTask('虚拟任务 '+String(i).padStart(3,'0'),'inbox',dayKey()));
 await page.addInitScript(data=>localStorage.setItem('todo-workbench-v1',JSON.stringify(data)),state);
 await page.goto('/');
 const first=page.locator('.task-body').filter({hasText:'虚拟任务 000'}),last=page.locator('.task-body').filter({hasText:'虚拟任务 399'});
 await first.focus();await page.keyboard.press('End');await expect(last).toBeFocused();await expect(page.getByRole('textbox',{name:'任务标题'})).toHaveValue('虚拟任务 399');
 await page.keyboard.press('Home');await expect(first).toBeFocused();
});
