import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
// Stable UUID for the MCP request_key; no shell expansion or model-provided command.
export function localRequestId(key){
 const b=createHash('sha256').update('todo-local-mcp-v1\0'+key).digest().subarray(0,16);
 b[6]=(b[6]&15)|80;b[8]=(b[8]&63)|128;const h=b.toString('hex');
 return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
}
export function makeLocalCliRequest({binary='todo',dataDir}={}){
 const fail=message=>({isError:true,content:[{type:'text',text:JSON.stringify({status:'error',error:message})}]});
 return async(path,body,key)=>{
  let args=dataDir?['--data-dir',dataDir]:[],input;
  if(path==='/v1/tasks'||path==='/v1/tasks/batch'){
   args.push('batch','--file','-','--request-id',localRequestId(key),'--wait','5');input=JSON.stringify(path.endsWith('/batch')?body:[body]);
  }else if(path==='/local/schema')args.push('schema');
  else if(path==='/local/operation'){args.push('run','--file','-','--request-id',localRequestId(key),'--wait','10');input=JSON.stringify(body)}
  else if(/^\/v1\/requests\/[0-9a-f-]{36}$/i.test(path))args.push('status',path.split('/').at(-1));
  else return fail('unsupported local tool');
  return await new Promise(resolve=>{
   let settled=false,stdout='',p;
   const finish=x=>{if(settled)return;settled=true;clearTimeout(timer);resolve(x)};
   const timer=setTimeout(()=>{p?.kill();finish(fail('CLI timed out; check status or retry same request_key'))},20000);
   try{p=spawn(binary,args,{stdio:['pipe','pipe','ignore'],shell:false})}catch{return finish(fail('TODO CLI unavailable'))}
   p.on('error',()=>finish(fail('TODO CLI unavailable; install and run todo doctor')));
   p.stdout.on('data',b=>{stdout+=b;if(Buffer.byteLength(stdout)>600000){p.kill();finish(fail('CLI response too large'))}});
   p.stdin.on('error',()=>{});p.stdin.end(input);
   p.on('close',code=>{
    try{
     const result=JSON.parse(stdout);const receipt={...result,...(result.request_id?{id:result.request_id}:{})};
     finish({content:[{type:'text',text:JSON.stringify(receipt)}],...(code===0?{}:{isError:true})});
    }catch{finish(fail('invalid CLI response; check todo doctor'))}
   });
  });
 };
}
