// Scripted interaction with the actual React UI; no fake IPC, no human consent claim.
import {invoke} from '@tauri-apps/api/core';
import {prepareCliOperation} from '../../src/core/cli-operations.js';
import {migrateState,dayKey} from '../../src/core/domain.js';
import {digest} from '../../src/services/cloud-core.js';
const K='todo-workbench-v1';
const wait=async(fn,label,timeout=20000)=>{const start=performance.now();while(performance.now()-start<timeout){const v=await fn();if(v)return v;await new Promise(r=>setTimeout(r,100))}throw Error('timeout: '+label)};
const button=(label,root=document)=>[...root.querySelectorAll('button')].find(b=>(b.textContent.trim()===label||b.getAttribute('aria-label')===label)&&!b.disabled&&b.getClientRects().length);
const click=async(label,root=document)=>(await wait(()=>button(label,root),label)).click();
const fill=(e,v)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,v);e.dispatchEvent(new Event('input',{bubbles:true}));};
const state=async()=>JSON.parse(JSON.parse(await invoke('native_load_store',{scope:'guest'}))[K]);
const findTask=(s,title)=>s.tasks.find(t=>t.title===title);
const report=report=>invoke('r5_report',{report});
export async function runProductDriver(){
 const checks=[];
 const mark=async stage=>invoke('r5_report',{report:{phase:'progress',stage,checks}});
 try{
  await wait(()=>document.querySelector('.app.v2'),'React app');
  const h=await invoke('r5_handshake'),initial=await state();
  if(h.phase==='automation'){
   await mark('automation-dialog');
   await click('打开自动化工作台');
   const dialog=await wait(()=>document.querySelector('.workflow-dialog'),'workflow dialog');
   // R5 bundle may share WebView preferences between modes. Explicitly remove
   // only the prior synthetic rule in the actual rule editor.
   for(const r of [...dialog.querySelectorAll('.workflow-rule')]){
    if(!r.textContent.includes('R5 合成规则'))throw Error('unexpected rule in isolated profile');
    await click('删除',r);
   }
   await click('添加规则',dialog);
   fill(await wait(()=>dialog.querySelector('input[aria-label="规则名称 1"]'),'rule name'),'R5 合成规则');
   const choose=async(label,name)=>{
    const trigger=await wait(()=>dialog.querySelector('[aria-label="'+label+'"]'),label);
    trigger.focus();trigger.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
    const option=await wait(()=>[...document.querySelectorAll('[role="option"]')].find(x=>x.textContent.trim()===name),name);
    option.focus();option.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
   };
   await choose('触发时机 1','创建任务');await choose('触发条件 1','不限日期');await choose('规则操作 1','设置高优先级');
   const auto=await wait(()=>dialog.querySelector('input[type="checkbox"]'),'auto checkbox');
   if(!auto.checked)auto.click();
   await click('保存规则',dialog);await wait(()=>dialog.textContent.includes('规则已保存'),'rule saved');
   await click('返回',dialog);
   (await wait(()=>document.querySelector('[data-view-key=today]'),'today')).click();
   await mark('automatic-create');
   fill(await wait(()=>document.querySelector('input[aria-label="新任务名称"]'),'quick add'),'R5 自动化任务');await click('添加');
   const a=await wait(async()=>{const s=await state(),t=findTask(s,'R5 自动化任务');return t?.priority===3&&s.workflowRuns?.some(r=>r.changes.some(c=>c.id===t.id))?t:null},'automation persisted');
   checks.push({kind:'actual-automation-rule-and-task'});
   await mark('focus-settings');await click('设置');
   const settings=await wait(()=>document.querySelector('.settings-dialog'),'settings');
   const nav=await wait(()=>settings.querySelector('nav[aria-label="设置分类"]'),'settings nav');await click('专注',nav);
   const pref=await wait(()=>settings.querySelector('[role="switch"][aria-label="忽略不足 1 分钟的专注"]'),'focus preference');
   if(pref.getAttribute('aria-checked')==='true')pref.click();
   await wait(async()=>!(await state()).focusConfig.ignoreShortSessions,'focus config persisted');
   await click('关闭',settings);
   const cli=async req=>{
    const rid=crypto.randomUUID();await invoke('r5_enqueue',{id:rid,request:req});
    const r=await wait(async()=>{const r=await invoke('r5_receipt',{id:rid});return ['saved','cancelled'].includes(r.status)?r:null},req.op);
    if(r.status!=='saved')throw Error(JSON.stringify(r));return r;
   };
   let s=await state();await cli({op:'focus-start',version:await digest(s.timer),mode:'stopwatch',taskId:a.id});
   await new Promise(r=>setTimeout(r,2200));
   s=await state();await cli({op:'focus-change',version:await digest(s.timer),action:'save'});
   s=await state();const session=s.sessions.find(x=>x.taskId===a.id&&x.seconds>0);
   if(!session||s.timer!==null)throw Error('record not saved');
   checks.push({kind:'actual-focus-record',seconds:session.seconds});
   const j=await invoke('native_operation_history',{scope:'guest',detail:false});
   await report({phase:'automation-passed',mode:h.mode,checks,taskCount:s.tasks.length,history:j.head,intact:j.intact,sessions:s.sessions.length,metrics:window.__r5Metrics});return;
  }
  if(h.phase==='business'){
   const cli=async request=>{
    const rid=crypto.randomUUID(),begin=performance.now();
    await mark(request.op);
    await invoke('r5_enqueue',{id:rid,request});
    let approved=false;
    const r=await wait(async()=>{
     const r=await invoke('r5_receipt',{id:rid});
     if(['saved','cancelled'].includes(r.status))return r;
     const b=button('确认 AI 操作');if(b&&!approved){approved=true;b.click()}
     return null
    },request.op+' receipt');
    if(r.status!=='saved')throw Error(request.op+' '+JSON.stringify(r));
    checks.push({kind:request.op,receipt:rid,confirmed:approved,ms:performance.now()-begin});return r;
   };
   const show=async id=>(await prepareCliOperation(migrateState(await state()),{op:'show',id},crypto.randomUUID())).result.task;
   const tag=await cli({op:'entity-create',kind:'tag',name:'R5 合成标签'});
   let now=await state();const tagId=now.tags.find(t=>t.name==='R5 合成标签')?.id;
   if(!tagId)throw Error('tag missing');
   await cli({op:'create',tasks:[{title:'R5 重复系列',date:dayKey(),repeat:'daily',repeatCount:3,tags:[tagId]},{title:'R5 父任务',children:[{title:'R5 子任务'}]}]});
   now=await state();const repeat=findTask(now,'R5 重复系列'),parent=findTask(now,'R5 父任务'),child=findTask(now,'R5 子任务');
   if(!repeat||!parent||child?.parentId!==parent.id||!repeat.tags.includes(tagId))throw Error('batch entity linkage');
   await cli({op:'complete',id:repeat.id,version:(await show(repeat.id)).version});
   now=await state();
   if(now.tasks.find(t=>t.id===repeat.id).status!=='completed'||now.tasks.filter(t=>t.previousId===repeat.id).length!==1)throw Error('repeat generation');
   // Real timer operations, short run deliberately does not fabricate a session.
   await cli({op:'focus-start',version:await digest(now.timer),mode:'stopwatch',taskId:parent.id});
   now=await state();if(now.timer?.taskId!==parent.id)throw Error('timer start missing');
   await cli({op:'focus-change',version:await digest(now.timer),action:'pause'});
   now=await state();if(now.timer?.startedAt!==null)throw Error('timer pause missing');
   await cli({op:'focus-change',version:await digest(now.timer),action:'save'});
   now=await state();if(now.timer!==null)throw Error('timer close missing');
   const j=await invoke('native_operation_history',{scope:'guest',detail:false});
   await report({phase:'business-passed',mode:h.mode,checks,taskCount:now.tasks.length,history:j.head,intact:j.intact,sessions:now.sessions.length,metrics:window.__r5Metrics,confirmation:'scripted real React modal, not human'});return
  }
  // Restart only verifies already persisted outcome, never repeats prior edits.
  if(h.phase==='restart'){
   if(!findTask(initial,'R5 人工任务'))throw Error('restart missing restored task');
   const j=await invoke('native_operation_history',{scope:'guest',detail:false});
   await report({phase:'restart',mode:h.mode,taskCount:initial.tasks.length,history:j.head,intact:j.intact,restored:!!findTask(initial,'R5 人工任务')});return;
  }
  if(findTask(initial,'R5 人工任务'))throw Error('fixture already edited');
  await mark('create');
  const input=await wait(()=>document.querySelector('input[aria-label="新任务名称"]'),'quick add');
  const t=performance.now();fill(input,'R5 人工任务');await click('添加');
  let created=await wait(async()=>findTask(await state(),'R5 人工任务'),'manual create');
  checks.push({kind:'manual-create',ms:performance.now()-t});
  const rid=crypto.randomUUID();
  const show=await prepareCliOperation(migrateState(await state()),{op:'show',id:created.id},crypto.randomUUID());
  await mark('enqueue');await invoke('r5_enqueue',{id:rid,request:{op:'update',id:created.id,version:show.result.task.version,fields:{title:'R5 AI 修改',priority:3}}});
  await wait(async()=>{const r=await invoke('r5_receipt',{id:rid});if(r.status==='cancelled')throw Error('CLI rejected: '+JSON.stringify(r));return button('确认 AI 操作')},'actual approval modal');
  await mark('approval');await click('确认 AI 操作');
  const receipt=await wait(async()=>{const r=await invoke('r5_receipt',{id:rid});return ['saved','cancelled'].includes(r.status)?r:null},'CLI receipt');
  if(receipt.status!=='saved')throw Error('CLI rejected: '+JSON.stringify(receipt));
  await wait(async()=>findTask(await state(),'R5 AI 修改'),'AI updated');
  checks.push({kind:'CLI-update-confirmation',receipt:rid});
  // Existing operation history workbench, actual detail + recovery buttons.
  await mark('history-open');await click('命令面板');
  const search=await wait(()=>document.querySelector('input[aria-label="搜索命令与任务"]'),'command search');
  fill(search,'历史归档检索');
  const option=await wait(()=>[...document.querySelectorAll('[role="option"]')].find(e=>e.textContent.includes('历史归档检索')),'history command');
  await mark('history-command');option.click();
  const summary=await wait(()=>document.querySelector('.operation-history summary'),'history panel');summary.click();await mark('history-summary');
  await wait(()=>document.querySelector('.history-version'),'history list');
  const cliRow=await wait(()=>[...document.querySelectorAll('.history-version')].find(e=>e.querySelector('strong')?.textContent.includes('CLI')),'CLI history row');
  await click('版本详情',cliRow);
  await wait(()=>document.querySelector('.history-version-detail'),'version detail');await click('关闭详情');
  await mark('history-preview');await click('恢复预览',cliRow);
  await wait(()=>button('确认恢复所示变更'),'recovery preview');
  await mark('history-restore');await click('确认恢复所示变更');
  await wait(async()=>findTask(await state(),'R5 人工任务'),'history recovery persisted');
  const final=await state(),j=await invoke('native_operation_history',{scope:'guest',detail:true});
  if(!j.intact||final.tasks.find(t=>t.id===created.id)?.priority!==created.priority)throw Error('history restore mismatch');
  checks.push({kind:'actual-history-detail-preview-restore'});
  await report({phase:'passed',mode:h.mode,checks,taskCount:final.tasks.length,history:j.head,intact:j.intact,metrics:window.__r5Metrics,confirmation:'scripted real React modal, not human'});
 }catch(e){await report({phase:'error',checks,error:String(e),stack:e.stack,visible:document.body.innerText.slice(0,2500)})}
}
