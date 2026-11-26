import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
const task=z.strictObject({title:z.string().min(1).max(500),notes:z.string().max(10000).optional(),listId:z.string().max(200).optional(),date:z.string().optional(),time:z.string().optional(),deadline:z.string().optional(),duration:z.number().int().min(1).max(1440).optional(),priority:z.number().int().min(0).max(3).optional(),reminderAt:z.string().optional()});
const key=z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/).describe('Stable unique request key. Reuse exactly on retry, not for a different task.');
export function makeApiRequest({base,token,publishableKey}){
 if(!base||!/^todo_[0-9a-f]{64}$/.test(token||""))throw Error("invalid API configuration");
 const url=new URL(base);if(url.username||url.password||url.search||url.hash||!(url.protocol==="https:"||url.protocol==="http:"&&["127.0.0.1","localhost"].includes(url.hostname)))throw Error("HTTPS or loopback required");
 return async function request(path,body,key){
 try{
  const res=await fetch(base.replace(/\/$/,'')+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...(publishableKey?{apikey:publishableKey}:{}),...(key?{'Idempotency-Key':key}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000),redirect:'error'});
  const r=await res.json();return {content:[{type:'text',text:JSON.stringify(r)}],...(res.ok?{}:{isError:true})};
 }catch{return {content:[{type:'text',text:'API request failed; retry with the same key'}],isError:true}}
}
}
// The resource server supplies a request bound to the verified connection; stdio uses its dedicated token.
export function createTodoMcp(request,{scopes=null,metadataUrl}={}){
 const server=new McpServer({name:'todo-intake',version:'0.2.0'});
 const scheme=scope=>{if(!metadataUrl)return {};const securitySchemes=[{type:'oauth2',scopes:[scope]}];return {_meta:{securitySchemes}}};
 const scoped=(scope,...args)=>scopes&&!scopes.has(scope)?{isError:true,content:[{type:'text',text:'Insufficient scope'}],_meta:{'mcp/www_authenticate':['Bearer resource_metadata="'+metadataUrl+'", error="insufficient_scope", scope="'+scope+'"']}}:request(...args);
server.registerTool('create_task',{...scheme('tasks:create'),annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:true},description:'Submit one TODO task. received means pending, not saved. Use absolute YYYY-MM-DD and HH:mm; never invent dates.',inputSchema:{request_key:key,task}},({request_key,task})=>scoped('tasks:create','/v1/tasks',task,request_key));
server.registerTool('create_tasks',{...scheme('tasks:create'),annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true,openWorldHint:true},description:'Submit 1–50 TODO tasks atomically. received means pending, not saved.',inputSchema:{request_key:key,tasks:z.array(task).min(1).max(50)}},({request_key,tasks})=>scoped('tasks:create','/v1/tasks/batch',tasks,request_key));
server.registerTool('get_request_status',{...scheme('receipts:read'),description:'Check receipt; only saved confirms cloud commit, not device sync.',inputSchema:{id:z.string().uuid()},annotations:{readOnlyHint:true}},({id})=>scoped('receipts:read','/v1/requests/'+id));
 return server;
}
