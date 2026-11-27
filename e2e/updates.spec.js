import {test,expect} from '@playwright/test';
const hash='a'.repeat(64),version='1.2.0-alpha.9',tag='v'+version,base='https://github.com/weepwood/TODO/releases/download/'+tag+'/';
const feed={schema:1,channel:'preview',release:{version,tag,notes:'测试更新日志',publishedAt:'2026-11-25T00:00:00Z',platforms:{
 'windows-x86_64':{url:base+'TODO_'+version+'_x64-setup.exe',size:1234,sha256:hash,signature:'s'.repeat(100)},
 'darwin-aarch64':{url:base+'TODO_'+version+'_aarch64.app.tar.gz',size:1234,sha256:hash,signature:'s'.repeat(100)},
 'android-aarch64':{url:base+'TODO_'+version+'_arm64.apk',size:1234,sha256:hash,versionCode:102009,certificate:hash,packageName:'com.weepwood.todo'}
}}};
test('软件更新：发现新版本、开发版禁止安装、错误与空清单',async({page})=>{
 let mode='release';await page.route('https://weepwood.github.io/TODO/updates/preview.json',route=>route.fulfill({status:mode==='error'?503:200,headers:{'access-control-allow-origin':'*'},contentType:'application/json',body:JSON.stringify(mode==='empty'?{schema:1,channel:'preview',release:null}:feed)}));
 await page.goto('/');await page.locator('.rail').getByRole('button',{name:'设置',exact:true}).click();
 const panel=page.getByLabel('软件更新',{exact:true});await expect(panel).toContainText('1.2.0-alpha.2');
 await panel.getByRole('button',{name:'检查更新'}).click();await expect(panel).toContainText('V1.2.0-alpha.9');await expect(panel).toContainText('测试更新日志');await expect(panel.getByRole('button',{name:'下载并验证'})).toHaveCount(0);
 mode='error';await panel.getByRole('button',{name:'检查更新'}).click();await expect(panel.getByRole('alert')).toContainText('503');
 mode='empty';await panel.getByRole('button',{name:'检查更新'}).click();await expect(panel).toContainText('尚未发布正式签名更新');await expect(panel).not.toContainText('测试更新日志');
 await panel.getByRole('checkbox',{name:/自动检查更新/}).uncheck();await page.reload();await page.locator('.rail').getByRole('button',{name:'设置',exact:true}).click();await expect(panel.getByRole('checkbox',{name:/自动检查更新/})).not.toBeChecked();
 await page.screenshot({path:'test-results/update-panel.png',animations:'disabled'});
});
