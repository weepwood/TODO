import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
// Git checkout on Windows may use CRLF; preserve all structural assertions.
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8').replace(/\r\n/g,'\n');
test('未配置正式签名时发布门禁拒绝运行，测试构建不自动启用 updater',()=>{
 const env={...process.env};
 for(const k of ['TODO_UPDATER_PUBLIC_KEY','TODO_ANDROID_CERT_SHA256','TAURI_SIGNING_PRIVATE_KEY','TAURI_SIGNING_PRIVATE_KEY_PASSWORD','TODO_SIGN_ANDROID_KEYSTORE','TODO_SIGN_ANDROID_PASSWORD'])delete env[k];
 assert.throws(()=>execFileSync(process.execPath,['scripts/release-config.mjs','--preflight'],{env,stdio:'pipe'}),/TODO_UPDATER_PUBLIC_KEY is not configured/);
 const c=JSON.parse(read('src-tauri/tauri.conf.json'));
 assert.equal(c.bundle.createUpdaterArtifacts,undefined);
 assert.equal(c.plugins?.updater,undefined);
 assert.match(read('src-tauri/src/lib.rs'),/option_env!\("TODO_SIGNED_RELEASE"\)==Some\("1"\)/);
});
test('正式版本号一致、空更新清单不宣告不存在的发行版、移动权限不侵入桌面录入',()=>{
 const version=JSON.parse(read('package.json')).version;
 assert.equal(JSON.parse(read('src-tauri/tauri.conf.json')).version,version);
 assert.ok(read('src-tauri/Cargo.toml').includes('version = "'+version+'"'));
 for(const channel of ['stable','preview']){
  const f=JSON.parse(read('public/updates/'+channel+'.json'));assert.equal(f.channel,channel);assert.equal(f.schema,1);
 }
 const desktop=JSON.parse(read('src-tauri/capabilities/desktop-main.json'));
 const android=JSON.parse(read('src-tauri/capabilities/android-native.json'));
 const capture=JSON.parse(read('src-tauri/capabilities/capture.json'));
 assert(desktop.permissions.includes('updater:allow-install'));
 assert(android.permissions.includes('todo-mobile:allow-update-install'));
 assert(!capture.permissions.some(p=>/updater|todo-mobile/.test(p)));
 assert(!desktop.permissions.some(p=>p.startsWith('todo-mobile:')));
 assert(!android.permissions.some(p=>p.startsWith('updater:')));
 assert.match(read('.github/workflows/android.yml'),/grep -F 'mipmap\/ic_launcher_background' android-qa\/APK_RESOURCES.txt\n/);
});

test('桌面更新插件的 npm 与 Rust 锁定版本保持相同 major/minor',()=>{
 const pkg=JSON.parse(read('package.json'));
 const lock=JSON.parse(read('package-lock.json'));
 const cargo=read('src-tauri/Cargo.lock');
 for(const plugin of ['process','updater']){
  const npmName='@tauri-apps/plugin-'+plugin;
  const js=lock.packages['node_modules/'+npmName].version;
  const rust=cargo.match(new RegExp('name = "tauri-plugin-'+plugin+'"\\nversion = "([^"]+)"'))?.[1];
  assert.ok(rust,'缺少 Rust 锁定版本: '+plugin);
  assert.equal(pkg.dependencies[npmName],js);
  assert.equal(js.split('.').slice(0,2).join('.'),rust.split('.').slice(0,2).join('.'),plugin);
 }
});

test('敏捷开发不自动构建安装包，正式发布保留手动门禁',()=>{
 for(const file of ['android.yml','android-runtime.yml','desktop.yml','signed-release.yml','promote-release.yml']){
  const trigger=read('.github/workflows/'+file).split('\non:\n')[1].split('\npermissions:')[0];
  assert.match(trigger,/^  workflow_dispatch:/m);
  assert.doesNotMatch(trigger,/^  (push|pull_request|schedule|workflow_run):/m,file);
 }
 assert.match(read('.github/workflows/pages.yml'),/^  push:/m);
 assert.match(read('.github/workflows/ui-review.yml'),/^  pull_request:/m);
 assert.match(read('.github/workflows/promote-release.yml'),/if: inputs.verified/);
});

test('macOS signed release includes both updater-enabled app and DMG',()=>{
 const workflow=read('.github/workflows/signed-release.yml');
 assert.match(workflow,/target: aarch64-apple-darwin\n\s+bundle: app,dmg\n\s+kind: mac/);
 assert.match(workflow,/--bundles \x24\{\{ matrix\.bundle \}\}/);
 assert.match(read('scripts/collect-release.mjs'),/endsWith\('\.app\.tar\.gz'\)/);
});
