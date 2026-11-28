import {test} from 'node:test';
import assert from 'node:assert/strict';
import {activityPeriod,activityPeriodExample,activityExample} from '../src/core/activitywatch-summary.js';
import {activityRulesKey,defaultActivityRules,validateActivityRules,readActivityRules,saveActivityRules,setActivityMapping,removeActivityCategory,exampleActivityRules,categoryTrend,activityPatterns,activityHourly,activityTaskReview,previousActivityPeriod,periodComparison} from '../src/core/activitywatch-analysis.js';
const h=3600000,day='2026-11-27';
const fixture=()=>activityPeriodExample(activityPeriod(day,'day',+new Date('2026-11-29T12:00:00')));
const storage=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)}};
test('本机规则按账号隔离、只序列化明确配置字段、损坏配置不覆盖',()=>{
 const s=storage(),r=exampleActivityRules();r.report={secret:'never persist'};
 r.mappings[0].title='never persist';
 saveActivityRules(s,'account/a',r);
 assert(!s.getItem(activityRulesKey('account/a')).includes('never persist'));
 assert.deepEqual(readActivityRules(s,'guest').rules,defaultActivityRules());
 assert.equal(readActivityRules(s,'account/a').rules.mappings.length,4);
 s.setItem(activityRulesKey('guest'),'{broken');
 assert(readActivityRules(s,'guest').error);assert.equal(s.getItem(activityRulesKey('guest')),'{broken');
 assert.throws(()=>saveActivityRules(s,'guest',{categories:[],mappings:r.mappings}));
 assert.equal(s.getItem(activityRulesKey('guest')),'{broken');
});
test('规则精确匹配、单主体唯一、分类删除保留任务映射、拒绝 URL',()=>{
 const r=exampleActivityRules(),next=setActivityMapping(r,{kind:'apps',subject:'VS Code',category:'learning',taskId:'demo-1'});
 assert.equal(next.mappings.length,4);assert.equal(r.mappings[0].category,'development');
 const removed=removeActivityCategory(next,'learning');
 assert(removed.mappings.some(m=>m.subject==='VS Code'&&m.category===null&&m.taskId==='demo-1'));
 assert(!removed.mappings.some(m=>m.subject==='developer.mozilla.org'));
 assert(validateActivityRules(removed));
 assert.throws(()=>setActivityMapping(r,{kind:'websites',subject:'https://example.org/private',category:'learning',taskId:null}));
 assert(!validateActivityRules({...r,categories:[...r.categories,{id:'duplicate',name:'开发'}]}));
});
test('堆叠分类守恒且软件/网站独立，未知日期不伪造零',()=>{
 const p=activityPeriod('2024-02-15','month',Date.now()),r=activityPeriodExample(p),rules=exampleActivityRules();
 for(const kind of ['apps','websites']){
  const c=categoryTrend(r,rules,'month',kind);
  assert.equal(c.rows.length,29);
  assert.equal(c.totals.reduce((n,v)=>n+v.ms,0),kind==='apps'?r.active_ms:r.website_ms);
  assert(c.rows.every(row=>row.segments.reduce((n,s)=>n+s.ms,0)===row.total));
  assert.equal(c.rows.filter(row=>!row.available).length,4);
 }
 const c=categoryTrend(fixture(),rules,'day','apps');
 assert.equal(c.totals.find(x=>x.id==='other').ms,2*h);
 assert.equal(c.totals.find(x=>x.id==='development').ms,2*h);
});
test('小时分布保持时长守恒，星期均值排除缺失天',()=>{
 const r=fixture();assert.equal(activityHourly(r,'apps').reduce((n,x)=>n+x.ms,0),r.active_ms);
 assert.equal(activityHourly(r,'websites').reduce((n,x)=>n+x.ms,0),r.website_ms);
 const p=activityPeriod('2024-02-15','month',Date.now()),m=activityPeriodExample(p),pattern=activityPatterns(m,'apps');
 assert.equal(pattern.weekdays.reduce((n,w)=>n+w.count,0),25);
 assert.equal(pattern.weekdays.reduce((n,w)=>n+w.total,0),m.active_ms);
 assert.equal(activityHourly(m,'apps').length,0);
});
test('任务映射将应用与网页区间去重，任务和计划保持只读',()=>{
 const r=fixture(),data=activityExample(day).data,rules=setActivityMapping(exampleActivityRules(),{kind:'apps',subject:'Microsoft Edge',category:'development',taskId:'demo-1'}),before=JSON.stringify({r,data,rules});
 const rows=activityTaskReview(data,r,day,rules),first=rows.find(t=>t.id==='demo-1');
 assert.equal(first.matched,4*h); // two app streams + overlapping website, counted once
 assert.equal(first.focusPlanDelta,-.5*h);assert.equal(first.matchedPlanDelta,2*h);
 assert.equal(JSON.stringify({r,data,rules}),before);
 assert.equal(activityTaskReview(data,r,day,defaultActivityRules())[0].matched,0);
 const deleted={...data,tasks:data.tasks.map(t=>({...t,deletedAt:'2026-11-28'}))};
 assert.equal(activityTaskReview(deleted,r,day,rules).length,0);
});
test('周期对比明确覆盖及长度，只有完整等长应用区间才计算可比差',()=>{
 const r=fixture(),p=previousActivityPeriod(day,'day',Date.now()),prev=activityPeriodExample(p);
 assert.equal(p.label,'2026-11-26');assert.equal(periodComparison(r,prev,'apps').delta,null);
 assert.equal(periodComparison(r,prev,'apps').observedDelta,0);
 const full={...r,known_ms:r.end-r.start},fullPrev={...prev,known_ms:prev.end-prev.start};
 assert.equal(periodComparison(full,fullPrev,'apps').delta,0);
 assert.equal(periodComparison(full,fullPrev,'websites').delta,null);
 assert.equal(periodComparison(r,{...prev,website_available:false},'websites').observedDelta,null);
});
