import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('Android ARM64 APK 构建命令不重复传递单值参数',()=>{
 const script=JSON.parse(read('package.json')).scripts['android:build'];
 const workflow=read('.github/workflows/android.yml');
 const call=workflow.match(/^\s*run: npm run android:build -- (.+)$/m);
 assert.ok(call,'missing Android build invocation');
 const args=(script+' '+call[1].split('--config')[0]).split(/\s+/);
 for(const flag of ['--apk','--target','--ci','--debug'])assert.equal(args.filter(a=>a===flag).length,1,flag);
 assert.equal(args[args.indexOf('--target')+1],'aarch64');
 assert.match(read('ANDROID.md'),/npm run android:build -- --debug`/);
});
