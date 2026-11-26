import {test,expect} from '@playwright/test';
import {initialState,newTask,dayKey,STORAGE_KEY} from '../src/domain.js';
test('临时组合筛选、任务跳转及显式保存智能清单',async({page})=>{
 const seed={...initialState(),tasks:[
  {...newTask('研究报告','inbox',dayKey(),'qa-search-high'),priority:3},
  {...newTask('研究草稿','inbox',dayKey(),'qa-search-low'),priority:1},
  {...newTask('其他高优先级','inbox',dayKey(),'qa-search-other'),priority:3}
 ]};
 await page.addInitScript(({key,seed})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(seed))},{key:STORAGE_KEY,seed});
 await page.goto('/');
 const saved=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)).smartLists??[],STORAGE_KEY);
 const open=async()=>{await page.getByRole('button',{name:'高级任务筛选',exact:true}).click();return page.getByRole('dialog',{name:'高级任务筛选'})};
 let dialog=await open();
 await dialog.getByRole('textbox',{name:'筛选关键词'}).fill('研究');
 await dialog.getByRole('combobox',{name:'筛选优先级'}).click();
 await page.getByRole('option',{name:'高',exact:true}).click();
 const results=dialog.getByRole('region',{name:'筛选结果'});
 await expect(results.getByRole('button')).toHaveCount(1);
 await expect(results.getByRole('button')).toContainText('研究报告');
 expect(await saved()).toHaveLength(0);
 await results.getByRole('button',{name:/研究报告/}).click();
 await expect(dialog).toBeHidden();await expect(page.getByRole('textbox',{name:'任务标题'})).toHaveValue('研究报告');
 expect(await saved()).toHaveLength(0);
 dialog=await open();await dialog.getByRole('textbox',{name:'筛选关键词'}).fill('研究');
 await dialog.getByRole('textbox',{name:'智能清单名称'}).fill('研究查询');
 await dialog.getByRole('button',{name:'保存智能清单'}).click();
 await expect.poll(async()=>(await saved()).map(f=>f.name)).toEqual(['研究查询']);
 await expect(page.getByRole('heading',{name:'研究查询',exact:true})).toBeVisible();
});
test('移动端临时查询分页、空态与关闭不写入智能清单',async({page})=>{
 const seed={...initialState(),tasks:Array.from({length:21},(_,i)=>newTask('分页任务 '+i,'inbox',dayKey(),'qa-page-'+i))};
 await page.addInitScript(({key,seed})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(seed))},{key:STORAGE_KEY,seed});
 await page.setViewportSize({width:390,height:844});await page.goto('/');
 await page.getByRole('button',{name:'打开导航'}).click();
 await page.getByRole('button',{name:'高级任务筛选',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'高级任务筛选'}),results=dialog.getByRole('region',{name:'筛选结果'});
 await expect(results.locator('.advanced-search-result')).toHaveCount(20);
 await results.getByRole('button',{name:'下一页'}).click();
 await expect(results.locator('.advanced-search-result')).toHaveCount(1);
 await expect(results.getByText('2 / 2')).toBeVisible();
 await dialog.getByRole('textbox',{name:'筛选关键词'}).fill('无匹配');
 await expect(results.getByText('没有匹配任务')).toBeVisible();
 await expect(dialog.getByRole('button',{name:'保存智能清单'})).toBeDisabled();
 expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true);
 await dialog.getByRole('button',{name:'取消'}).click();
 await expect(dialog).toBeHidden();
 expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).smartLists??[],STORAGE_KEY)).toHaveLength(0);
});
