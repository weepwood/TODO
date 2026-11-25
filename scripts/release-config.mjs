import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {releaseChannel,FEED_BASE,parseVersion} from '../src/services/updates/protocol.js';
const pkg=JSON.parse(readFileSync('package.json','utf8'));
const tauri=JSON.parse(readFileSync('src-tauri/tauri.conf.json','utf8'));
const android=JSON.parse(readFileSync('src-tauri/tauri.android.conf.json','utf8'));
assert(parseVersion(pkg.version));assert.equal(tauri.version,pkg.version);assert.equal(tauri.identifier,'com.weepwood.todo');
assert(Number.isInteger(android.bundle.android.versionCode)&&android.bundle.android.versionCode>0);
const channel=releaseChannel(pkg.version);
if(process.argv.includes('--preflight')){
 // Only public values are printed. Signing credentials are checked for presence only.
 const required=['TODO_UPDATER_PUBLIC_KEY','TODO_ANDROID_CERT_SHA256','TAURI_SIGNING_PRIVATE_KEY','TAURI_SIGNING_PRIVATE_KEY_PASSWORD','TODO_SIGN_ANDROID_KEYSTORE','TODO_SIGN_ANDROID_PASSWORD'];
 for(const key of required)assert(process.env[key]?.trim(),key+' is not configured');
 assert(/^[A-Za-z0-9+/=\s]+$/.test(process.env.TODO_UPDATER_PUBLIC_KEY),'Invalid updater public key');
 assert(/^[a-f0-9]{64}$/.test(process.env.TODO_ANDROID_CERT_SHA256),'Invalid certificate pin');
}
if(process.argv.includes('--desktop')){
 const pubkey=process.env.TODO_UPDATER_PUBLIC_KEY?.trim();assert(pubkey,'Updater public key missing');
 writeFileSync('src-tauri/tauri.release.conf.json',JSON.stringify({bundle:{createUpdaterArtifacts:true},plugins:{updater:{pubkey,endpoints:[FEED_BASE+channel+'-desktop.json'],requireSignedVersion:true,windows:{installMode:'passive'}}}},null,2));
}
console.log('Release configuration validated: '+pkg.version+' / '+channel+' / Android '+android.bundle.android.versionCode);
