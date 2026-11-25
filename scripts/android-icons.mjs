// Generate only Android launcher resources. Keep desktop/web assets unchanged.
import {execFileSync} from 'node:child_process';
import {cpSync,existsSync,mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';
const root=mkdtempSync(join(tmpdir(),'todo-android-icons-'));
try{
 const npm=process.env.npm_execpath;
 assert.ok(npm,'Run with npm run android:icons');
 const output=join(root,'icons');
 execFileSync(process.execPath,[npm,'run','tauri','--','icon','src-tauri/brand/android.json','--output',output],{stdio:'inherit'});
 const source=join(output,'android');
 const xml=readFileSync(join(source,'mipmap-anydpi-v26','ic_launcher.xml'),'utf8');
 assert.match(xml,/<foreground android:drawable="@mipmap\/ic_launcher_foreground"/);
 assert.match(xml,/<background android:drawable="@mipmap\/ic_launcher_background"/);
 assert.match(xml,/<monochrome android:drawable="@mipmap\/ic_launcher_monochrome"/);
 for(const density of ['mdpi','hdpi','xhdpi','xxhdpi','xxxhdpi']){
  for(const name of ['ic_launcher','ic_launcher_round','ic_launcher_foreground','ic_launcher_background','ic_launcher_monochrome']){
   const png=readFileSync(join(source,'mipmap-'+density,name+'.png'));
   assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
   assert.equal(png.readUInt32BE(16),png.readUInt32BE(20));
  }
 }
 cpSync(source,'src-tauri/icons/android',{recursive:true});
 const generated='src-tauri/gen/android/app/src/main/res';
 if(existsSync(generated))cpSync(source,generated,{recursive:true});
 console.log('Android launcher icons verified: adaptive, themed, five densities; desktop unchanged.');
}finally{rmSync(root,{recursive:true,force:true})}
