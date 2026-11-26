// OAuth protected resource, not an authorization server. Explicit per-subject/client
// binding to a dedicated TODO credential; never forward the OAuth access token.
import {createServer} from 'node:http';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {createTodoMcp,makeApiRequest} from './mcp-tools.mjs';
const allowedScopes=['tasks:create','receipts:read'];
const validToken=/^todo_[a-f0-9]{64}$/;
function checkedUrl(value,{loopback=false}={}){
 const u=new URL(value);if(u.username||u.password||u.hash||u.search||!(u.protocol==='https:'||loopback&&u.protocol==='http:'&&u.hostname==='127.0.0.1'))throw Error('HTTPS configuration required');
 return u;
}
export function createRemoteMcp({resource,issuer,introspection,clientId,clientSecret,bindings,apiBase,publishableKey,allowLoopback=false,fetcher=fetch}){
 const r=checkedUrl(resource,{loopback:allowLoopback}),as=checkedUrl(issuer,{loopback:allowLoopback}),endpoint=checkedUrl(introspection,{loopback:allowLoopback});
 if(r.pathname!=='/mcp'||!clientId||!clientSecret||endpoint.origin!==as.origin||!Array.isArray(bindings)||!bindings.length)throw Error('invalid resource configuration');
 const map=new Map();
 for(const b of bindings){
  if(!b.sub||!b.client_id||!validToken.test(b.todo_token||''))throw Error('invalid binding');
  const k=JSON.stringify([b.sub,b.client_id]);if(map.has(k)||[...map.values()].includes(b.todo_token))throw Error('duplicate binding/credential');
  map.set(k,b.todo_token);
 }
 const metadataPath='/.well-known/oauth-protected-resource/mcp',metadataUrl=r.origin+metadataPath;
 const headers={'Cache-Control':'no-store','Content-Type':'application/json'};
 const send=(res,status,data,extra={})=>{res.writeHead(status,{...headers,...extra});res.end(JSON.stringify(data))};
 const challenge=(res,error='invalid_token')=>send(res,401,{error},{'WWW-Authenticate':'Bearer resource_metadata="'+metadataUrl+'", error="'+error+'"'});
 async function verify(token){
  // RFC 7662: trusted AS, no redirects, never log credentials or responses.
  const form=new URLSearchParams({token,token_type_hint:'access_token'});
  const basic=Buffer.from(encodeURIComponent(clientId)+':'+encodeURIComponent(clientSecret)).toString('base64');
  const response=await fetcher(endpoint,{method:'POST',headers:{Authorization:'Basic '+basic,'Content-Type':'application/x-www-form-urlencoded'},body:form,redirect:'error',signal:AbortSignal.timeout(5000)});
  if(!response.ok)return null;
  const claims=await response.json();
  const aud=Array.isArray(claims.aud)?claims.aud:[claims.aud];
  if(claims.active!==true||claims.iss!==issuer||!aud.includes(resource)||!Number.isFinite(claims.exp)||claims.exp<=Date.now()/1000||claims.nbf!==undefined&&(!Number.isFinite(claims.nbf)||claims.nbf>Date.now()/1000)||typeof claims.sub!=='string'||typeof claims.client_id!=='string'||typeof claims.scope!=='string')return null;
  const credential=map.get(JSON.stringify([claims.sub,claims.client_id]));
  if(!credential)return null;
  const scopes=new Set(claims.scope.split(/\s+/).filter(x=>allowedScopes.includes(x)));
  if(!scopes.size)return null;
  return {credential,scopes};
 }
 return createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.headers.host!==r.host||req.headers.origin&&req.headers.origin!==r.origin)return send(res,403,{error:'origin not allowed'});
  const path=req.url;
  if(req.method==='GET'&&[metadataPath,'/.well-known/oauth-protected-resource'].includes(path))return send(res,200,{resource,authorization_servers:[issuer],scopes_supported:allowedScopes,bearer_methods_supported:['header']});
  if(path!=='/mcp')return send(res,404,{error:'not found'});
  const token=req.headers.authorization?.match(/^Bearer ([^\s]{1,8192})$/i)?.[1];if(!token)return challenge(res);
  let auth;try{auth=await verify(token)}catch{return send(res,503,{error:'authorization service unavailable'})}
  if(!auth)return challenge(res);
  // Stateless transports: no cross-user session state. Bound request body size.
  if(req.method!=='POST')return send(res,405,{error:'method not allowed'},{Allow:'POST'});
  if(!req.headers['content-type']?.startsWith('application/json'))return send(res,415,{error:'JSON required'});
  let body,total=0;const chunks=[];
  try{for await(const c of req){total+=c.length;if(total>300000){send(res,413,{error:'body too large'});return}chunks.push(c)}body=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{return send(res,400,{error:'invalid JSON'})}
  const server=createTodoMcp(makeApiRequest({base:apiBase,token:auth.credential,publishableKey}),{scopes:auth.scopes,metadataUrl});
  const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
  res.on('close',()=>{void server.close()});
  try{await server.connect(transport);await transport.handleRequest(req,res,body)}catch{if(!res.headersSent)send(res,500,{error:'MCP error'});else res.end()}
 });
}
