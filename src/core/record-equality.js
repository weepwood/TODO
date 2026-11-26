// Validated workspace JSON: compare structurally without allocating canonical strings.
// Object key order is irrelevant; array order, null and missing values are not.
export function sameRecord(a,b){
 if(a===b)return true;
 if(a===null||b===null||typeof a!=='object'||typeof b!=='object')return false;
 if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>sameRecord(v,b[i]));
 const ak=Object.keys(a).filter(k=>a[k]!==undefined),bk=Object.keys(b).filter(k=>b[k]!==undefined);
 return ak.length===bk.length&&ak.every(k=>Object.hasOwn(b,k)&&sameRecord(a[k],b[k]));
}
