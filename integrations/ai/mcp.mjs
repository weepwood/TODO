import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {z} from 'zod';
const base=process.env.TODO_API_URL,token=process.env.TODO_API_TOKEN;
if(!base||!token||!/^todo_[0-9a-f]{64}$/.test(token))throw Error('Set TODO_API_URL and TODO_API_TOKEN');
const url=new URL(base);if(url.username||url.password||url.search||url.hash||!(url.protocol==='https:'||url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)))throw Error('HTTPS or local loopback API only');
const task=z.strictObject({title:z.string().min(1).max(500),notes:z.string().max(10000).optional(),listId:z.string().max(200).optional(),date:z.string().optional(),time:z.string().optional(),deadline:z.string().optional(),duration:z.number().int().min(1).max(1440).optional(),priority:z.number().int().min(0).max(3).optional(),reminderAt:z.string().optional()});
const key=z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/).describe('Stable unique request key. Reuse exactly on retry, not for a different task.');
const server=new McpServer({name:'todo-intake',version:'0.1.0'});
async function request(path,body,key){
 try{
  const res=await fetch(base.replace(/\/$/,'')+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...(process.env.TODO_API_PUBLISHABLE_KEY?{apikey:process.env.TODO_API_PUBLISHABLE_KEY}:{}),...(key?{'Idempotency-Key':key}:{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000),redirect:'error'});
  const r=await res.json();return {content:[{type:'text',text:JSON.stringify(r)}],...(res.ok?{}:{isError:true})};
 }catch{return {content:[{type:'text',text:'API request failed; retry with the same key'}],isError:true}}
}
server.registerTool('create_task',{description:'Submit one TODO task. received means pending, not saved. Use absolute YYYY-MM-DD and HH:mm; never invent dates.',inputSchema:{request_key:key,task}},({request_key,task})=>request('/v1/tasks',task,request_key));
server.registerTool('create_tasks',{description:'Submit 1–50 TODO tasks atomically. received means pending, not saved.',inputSchema:{request_key:key,tasks:z.array(task).min(1).max(50)}},({request_key,tasks})=>request('/v1/tasks/batch',tasks,request_key));
server.registerTool('get_request_status',{description:'Check receipt; only saved confirms cloud commit, not device sync.',inputSchema:{id:z.string().uuid()},annotations:{readOnlyHint:true}},({id})=>request('/v1/requests/'+id));
await server.connect(new StdioServerTransport());
