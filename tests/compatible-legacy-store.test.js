import test from 'node:test';
import assert from 'node:assert/strict';
import {createCompatibleLegacyStore} from '../src/services/compatible-legacy-store.js';
import {setSwitch,SWITCH_KEY} from '../src/services/storage-switch-protocol.js';
import {STORAGE_KEY,BACKUP_KEY} from '../src/domain.js';
test('合作旧写入器逐次检查写入租约、围栏、恢复键和删除',()=>{
 const m=new Map(),s={getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};
 let owned=true;const writer=createCompatibleLegacyStore(s,()=>owned);
 writer.setItem(STORAGE_KEY,'original');writer.setItem(BACKUP_KEY,'backup');
 assert.throws(()=>writer.setItem(SWITCH_KEY,'bypass'),/unsupported/);
 owned=false;assert.throws(()=>writer.setItem(STORAGE_KEY,'lost'),/租约/);owned=true;
 setSwitch(s,'preparing','a'.repeat(64));
 for(const key of [STORAGE_KEY,BACKUP_KEY,'todo-cloud-meta']){assert.throws(()=>writer.setItem(key,'lost'),/禁止写入/);assert.throws(()=>writer.removeItem(key),/禁止写入/)}
 assert.equal(writer.getItem(STORAGE_KEY),'original');assert.equal(writer.getItem(BACKUP_KEY),'backup');
});
