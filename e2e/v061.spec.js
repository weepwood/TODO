import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
test('展开备注、草稿应用、完整归档验证与恢复',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
 await page.getByRole('textbox',{name:'新任务名称'}).fill('归档编辑测试');await page.getByRole('button',{name:'添加',exact:true}).click();
 await page.getByRole('button',{name:'展开编辑'}).click();
 const dialog=page.getByRole('dialog',{name:'备注编辑工作台'});
 await dialog.getByRole('textbox',{name:'工作台备注源码'}).fill('# 标题\n\n**备注正文**\n\n![禁止外部图片](https://example.invalid/img.png)');
 await expect(dialog.locator('.note-live-preview strong')).toHaveText('备注正文');
 await expect(dialog.locator('.note-live-preview img')).toHaveCount(0);
 await dialog.getByRole('button',{name:'应用备注'}).click();
 await expect(page.getByRole('textbox',{name:'任务备注'})).toHaveValue(/# 标题[\s\S]*备注正文/);
 await page.locator('.detail-extra input[type=file]').setInputFiles({name:'backup.txt',mimeType:'text/plain',buffer:Buffer.from('备份测试')});
 await expect(page.getByText('backup.txt',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('navigation',{name:'设置分类'}).getByRole('button',{name:'本地数据',exact:true}).click();await page.getByRole('button',{name:'完整工作空间备份',exact:true}).click();
 const archive=page.getByRole('dialog',{name:'完整工作空间备份'});
 const downloaded=page.waitForEvent('download');await archive.getByRole('button',{name:'导出完整归档'}).click();const bytes=await readFile(await(await downloaded).path());const parsed=JSON.parse(bytes.toString());expect(parsed.workspace.tasks.some(t=>t.title==='归档编辑测试')).toBe(true);expect(parsed.attachments.entries.length).toBe(1);
 parsed.workspaceSha256='0'.repeat(64);
 await archive.getByLabel('完整归档文件').setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(parsed))});await expect(archive.getByRole('alert')).toContainText('工作空间校验失败');
 await archive.getByLabel('完整归档文件').setInputFiles({name:'valid.json',mimeType:'application/json',buffer:bytes});await expect(archive.getByText('完整性校验通过')).toBeVisible();
 await archive.getByRole('button',{name:'恢复工作空间',exact:true}).click();await page.getByRole('button',{name:'确认恢复',exact:true}).click();
 await expect(page.locator('.task-body').filter({hasText:'归档编辑测试'})).toBeVisible();
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('navigation',{name:'设置分类'}).getByRole('button',{name:'本地数据',exact:true}).click();await page.getByRole('button',{name:'完整工作空间备份',exact:true}).click();
 await archive.getByLabel('完整归档文件').setInputFiles({name:'valid.json',mimeType:'application/json',buffer:bytes});await expect(archive.getByText('完整性校验通过')).toBeVisible();
 page.once('dialog',d=>d.accept());await archive.getByRole('button',{name:'追加归档附件'}).click();await expect(archive.getByRole('button',{name:'附件已追加'})).toBeDisabled();await expect(archive.getByRole('status')).toContainText('新增 0 个附件，跳过 1 个重复附件');await archive.getByText('本机备份与恢复记录',{exact:true}).click();await expect(archive.getByText('附件恢复完成',{exact:false})).toBeVisible();await expect(archive.getByText('载入工作空间',{exact:false})).toBeVisible();
 expect(errors).toEqual([]);
});
test('时间块按时长渲染、重叠分列及列表切换',async({page})=>{
 await page.goto('/');
 for(const name of ['时间块 A 今天 09:00','时间块 B 今天 09:15']){
  await page.getByRole('textbox',{name:'新任务名称'}).fill(name);await page.getByRole('button',{name:'添加',exact:true}).click();
 }
 await page.getByRole('button',{name:'每日规划',exact:true}).click();
 const a=page.locator('button.time-block').filter({hasText:'时间块 A'}),b=page.locator('button.time-block').filter({hasText:'时间块 B'});
 await expect(a).toBeVisible();await expect(b).toBeVisible();
 const x=await a.boundingBox(),y=await b.boundingBox();expect(y.y).toBeGreaterThan(x.y);expect(y.x).toBeGreaterThan(x.x);expect(x.height).toBeCloseTo(26,0);
 await page.getByRole('button',{name:'列表模式'}).click();await expect(page.locator('.timeline .hour')).not.toHaveCount(0);
 await page.getByRole('button',{name:'时间块模式'}).click();await expect(a).toBeVisible();
 await a.dragTo(page.locator('.time-block-body'),{targetPosition:{x:80,y:56*3+14}});
 await expect(a).toHaveAttribute('aria-label',/11:15–11:45/);
 await page.screenshot({path:'test-results/v061-timeblocks.png'});
});
