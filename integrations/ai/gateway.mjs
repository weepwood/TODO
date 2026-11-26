import {normalizeExternalTasks,buildExternalCapture,IntakeError} from '../../src/core/external-capture.js';
const utf8=new TextEncoder();
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const tokenPattern=/^todo_[0-9a-f]{64}$/;
const hex=b=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
const hash=async s=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',utf8.encode(s))));
const error=(s,status=400)=>{throw new IntakeError(s,status)};
const receipt=r=>({id:r.id,status:r.status,task_ids:r.task_ids,revision:r.revision,saved_at:r.saved_at});
const headers={'Content-Type':'application/json','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,idempotency-key,x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS'};
const json=(x,status=200)=>new Response(JSON.stringify(x),{status,headers});
async function body(req){
 const reader=req.body?.getReader();if(!reader)error('missing body');
 let total=0;const chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>262144){await reader.cancel();error('body too large',413)}chunks.push(value)}}finally{reader.releaseLock()}
 const b=new Uint8Array(total);let offset=0;for(const c of chunks){b.set(c,offset);offset+=c.length}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b))}catch{error('invalid JSON')}
}
export function gateway({rpc,authenticateOwner}){
 return async req=>{
  try{
   if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
   const path=new URL(req.url).pathname.replace(/^\/functions\/v1\/todo-external/,'').replace(/^\/todo-external/,'');
   const bearer=req.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
   if(!bearer)error('unauthorized',401);
   const ownerRoute=path.startsWith('/v1/owner/');
   const owner=ownerRoute?await authenticateOwner(bearer):null;
   if(ownerRoute?!uuid.test(owner||''):!tokenPattern.test(bearer))error('unauthorized',401);
   const tokenHash=ownerRoute?null:await hash(bearer);
   const call=async(action,payload={})=>{const result=await rpc(action,owner,tokenHash,payload);if(result?.error)throw Object.assign(new IntakeError(result.error,result.status),{retry:result.retry});return result};
   const commit=async id=>{
    for(let i=0;i<3;i++){
     const snapshot=await call('workspace',{id});if(!snapshot.state)return receipt(snapshot.request);
     const tasks=buildExternalCapture(snapshot.state,snapshot.request);
     try{return receipt((await call('commit',{id,revision:snapshot.revision,tasks})).request)}catch(e){if(!e.retry)throw e}
    }
    error('workspace changed; retry same request',409);
   };
   if(ownerRoute){
    if(path==='/v1/owner/tokens'&&req.method==='GET')return json(await call('tokens'));
    if(path==='/v1/owner/tokens'&&req.method==='POST'){
     const b=await body(req);if(!b||Object.keys(b).some(k=>!['label','automatic'].includes(k))||typeof b.label!=='string'||!b.label.trim()||b.label.length>80||typeof b.automatic!=='boolean')error('invalid token settings');
     const secret='todo_'+hex(crypto.getRandomValues(new Uint8Array(32)));
     return json({...await call('issue',{label:b.label.trim(),automatic:b.automatic,hash:await hash(secret)}),token:secret},201);
    }
    if(path==='/v1/owner/requests'&&req.method==='GET')return json(await call('pending'));
    const m=path.match(/^\/v1\/owner\/(tokens|requests)\/([^/]+)\/(revoke|approve|reject)$/);
    if(m&&req.method==='POST'&&uuid.test(m[2])){
     if(m[1]==='tokens'&&m[3]==='revoke')return json(await call('revoke',{id:m[2]}));
     if(m[1]==='requests'&&m[3]==='approve')return json(await commit(m[2]));
     if(m[1]==='requests'&&m[3]==='reject')return json(receipt(await call('reject',{id:m[2]})));
    }
   }else{
    if(req.method==='POST'&&['/v1/tasks','/v1/tasks/batch'].includes(path)){
     const key=req.headers.get('idempotency-key');if(!key||! /^[A-Za-z0-9._:-]{1,128}$/.test(key))error('Idempotency-Key required');
     const b=await body(req),tasks=normalizeExternalTasks(path.endsWith('/batch')?b:[b]);
     const r=await call('submit',{key,tasks});
     if(r.automatic&&r.status==='received'){
      try{const saved=await commit(r.id);return json(saved,saved.status==='saved'?200:202)}
      catch(e){if(e instanceof IntakeError&&e.status===409)return json({...receipt(r),message:e.message},202);throw e}
     }
     return json(receipt(r),r.status==='received'?202:200);
    }
    const m=path.match(/^\/v1\/requests\/([^/]+)$/);
    if(m&&req.method==='GET'&&uuid.test(m[1]))return json(receipt(await call('read',{id:m[1]})));
   }
   return json({error:'not found'},404);
  }catch(e){return json({error:e instanceof IntakeError?e.message:'internal error'},e instanceof IntakeError?e.status:500)}
 };
}
