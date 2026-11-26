// Candidate deployment only. JWT gateway verification must be disabled for the
// dedicated opaque token path; every route verifies its own credential.
import {createClient} from 'npm:@supabase/supabase-js@2.119.2';
import {gateway} from '../../../integrations/ai/gateway.mjs';
const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
if(!url||!key)throw new Error('server credentials unavailable');
const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
Deno.serve(gateway({
 authenticateOwner:async(token:string)=>{const {data,error}=await db.auth.getUser(token);return error?null:data.user?.id??null},
 rpc:async(action:string,owner:string|null,hash:string|null,payload:unknown)=>{
  const {data,error}=await db.rpc('todo_external_gateway',{p_action:action,p_owner:owner,p_hash:hash,p_payload:payload});
  if(error)throw new Error('gateway database request failed');return data;
 }
}));
