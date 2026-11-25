import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
test('附件归档导出、损坏拒绝、恢复后内容一致',async({page})=>{
 await page.goto('/');await page.getByRole('textbox',{name:'新任务名称'}).fill('归档任务');await page.getByRole('button',{name:'添加',exact:true}).click();
 await page.locator('.detail-extra input[type=file]').setInputFiles({name:'proof.txt',mimeType:'text/plain',buffer:Buffer.from('校验附件')});
 await expect(page.getByText('proof.txt',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'本机附件管理',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'本机附件管理'});await expect(dialog.getByText('proof.txt',{exact:true})).toBeVisible();
 const download=page.waitForEvent('download');await dialog.getByRole('button',{name:'导出附件归档'}).click();const file=await download;const bytes=await readFile(await file.path());const archive=JSON.parse(bytes.toString());expect(archive.entries.length).toBe(1);expect(archive.entries[0].sha256.length).toBe(64);
 page.once('dialog',d=>d.accept());await dialog.getByRole('button',{name:'删除附件 proof.txt'}).click();await expect(dialog.getByText('proof.txt',{exact:true})).toHaveCount(0);
 archive.entries[0].sha256='0'.repeat(64);
 await dialog.getByLabel('附件归档文件').setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(archive))});await expect(dialog.getByRole('alert')).toContainText('文件校验失败');await expect(dialog.getByText('proof.txt',{exact:true})).toHaveCount(0);
 page.once('dialog',d=>d.accept());await dialog.getByLabel('附件归档文件').setInputFiles({name:'archive.json',mimeType:'application/json',buffer:bytes});await expect(dialog.getByText('proof.txt',{exact:true})).toBeVisible();
 const restored=page.waitForEvent('download');await dialog.getByRole('button',{name:'下载附件 proof.txt'}).click();expect((await readFile(await (await restored).path())).toString()).toBe('校验附件');
});
