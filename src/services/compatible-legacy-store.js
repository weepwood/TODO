import {assertLegacyWriter} from './storage-switch-protocol.js';
import {STORE_KEYS} from './native-store.js';
// Only for cooperating clients, while the caller owns the same guest lock
// as the migration UI. Never removes or changes the switch marker itself.
export function createCompatibleLegacyStore(storage,isOwner){
 const ensure=()=>{if(!isOwner())throw Error('旧存储写入租约已释放');assertLegacyWriter(storage)};
 return {
  getItem:key=>storage.getItem(key),
  setItem(key,value){if(!STORE_KEYS.includes(key))throw Error('unsupported workspace storage key');ensure();storage.setItem(key,String(value))},
  removeItem(key){if(!STORE_KEYS.includes(key))throw Error('unsupported workspace storage key');ensure();storage.removeItem(key)}
 };
}
