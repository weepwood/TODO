// Invoked only by the isolated Rust test with synthetic state and journal.
import fs from 'node:fs';
import {prepareHistory} from '../../src/core/operation-history.js';
import {applyWorkspaceEdit} from '../../src/components/useWorkspaceMutations.js';
import {plan} from './changes.mjs';
const input=JSON.parse(fs.readFileSync(0,'utf8'));
const {state,journal,request,id,reference}=input,now=new Date();
const p=await prepareHistory(state,request,id,now,{journal,reference});
const next=p.next===state?state:applyWorkspaceEdit(state,()=>p.next,{id,at:now.toISOString(),source:'device',session:'shadow-qa',trigger:'event'},{allowAutomation:false,rules:[]});
const result={...p.result,...(p.next!==state?{userConfirmation:{method:'desktop-modal',at:now.toISOString()}}:{})};
const delta=plan(state,next);if(delta.kind!=='delta')throw Error('unexpected fallback');
process.stdout.write(JSON.stringify({next,result,patch:delta.patch}));
