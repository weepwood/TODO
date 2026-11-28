import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Plus,Trash2,Save,CalendarRange,Search} from 'lucide-react';
import {Segmented} from '../../design-system/Controls.jsx';
import {readActivityPeriod,activityPeriodExample,activityChunks} from '../../core/activitywatch-summary.js';
import {readActivityRules,saveActivityRules,setActivityMapping,batchActivityMappings,activityBudget,removeActivityCategory,exampleActivityRules,validateActivityRules,categoryTrend,activityPatterns,activityHourly,activityTaskReview,previousActivityPeriod,periodComparison} from '../../core/activitywatch-analysis.js';

const duration=ms=>ms===null?'—':ms>0&&ms<60000?'<1 分钟':Math.floor(ms/3600000)+' 小时 '+Math.floor(ms%3600000/60000)+' 分钟';
const signed=ms=>ms===null?'—':(ms>0?'+':ms<0?'−':'')+duration(Math.abs(ms));
const time=t=>new Date(t).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});
const percent=v=>Math.round(v*100)+'%';
const weeks=['日','一','二','三','四','五','六'];

function RulesEditor({rules,setRules,report,tasks,example,scope,initialError}){
 const [search,setSearch]=useState(''),[unclassified,setUnclassified]=useState(false),[selected,setSelected]=useState([]),[batchCategory,setBatchCategory]=useState('keep'),[batchTask,setBatchTask]=useState('keep');
 const [name,setName]=useState(''),[kind,setKind]=useState('apps'),[subject,setSubject]=useState(''),[category,setCategory]=useState(''),[taskId,setTaskId]=useState(''),[message,setMessage]=useState(initialError),[dirty,setDirty]=useState(false);
 const update=fn=>{try{const next=fn();if(!validateActivityRules(next))throw Error('分类名称重复、不合法或超过上限');setRules(next);setDirty(true);setMessage('');return true}catch(e){setMessage(e.message);return false}};
 const available=useMemo(()=>[...new Set([...report[kind].map(r=>r.subject),...rules.mappings.filter(m=>m.kind===kind).map(m=>m.subject)])].sort(),[report,kind,rules]);
 const activeTasks=tasks.filter(t=>!t.deletedAt);
 const mapped=useMemo(()=>new Map(rules.mappings.filter(m=>m.kind===kind).map(m=>[m.subject,m])),[rules,kind]);
 const filtered=available.filter(s=>s.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())&&(!unclassified||!mapped.get(s)?.category));
 const shown=filtered.slice(0,100),unclassifiedCount=available.filter(s=>!mapped.get(s)?.category).length;
 const applyBatch=()=>{const patch={};if(batchCategory!=='keep')patch.category=batchCategory||null;if(batchTask!=='keep')patch.taskId=batchTask||null;if(update(()=>batchActivityMappings(rules,kind,selected,patch))){setMessage('已应用 '+selected.length+' 项映射，等待保存');setSelected([])}};

 const choose=s=>{setSubject(s);const m=rules.mappings.find(m=>m.kind===kind&&m.subject===s);setCategory(m?.category||'');setTaskId(m?.taskId||'')};
 const save=()=>{try{if(example){setDirty(false);setMessage('示例规则仅在本次演示中使用');return}saveActivityRules(localStorage,scope,rules);setDirty(false);setMessage('已保存到当前账号的本机规则配置，不同步')}catch(e){setMessage('保存失败：'+e.message)}};
 return <details className="module-card aw-card aw-rule-panel"><summary>分类与任务关联规则 <span className="muted">{rules.categories.length} 个分类 · {rules.mappings.length} 条映射</span></summary>
  <p className="muted">{example?'合成演示规则，不读取或保存真实配置。':'规则仅在当前账号、本机保存；不保存活动报告，不上传规则。'} 修改即时预览，点击保存才持久化。精确匹配主体，一个主体最多关联一个分类及一项任务。</p>
  <div className="aw-category-list">{rules.categories.map(c=><div key={c.id}><input aria-label={'分类名称 '+c.id} value={c.name} onChange={e=>{const value=e.target.value;setRules({...rules,categories:rules.categories.map(x=>x.id===c.id?{...x,name:value}:x)});setDirty(true)}} onBlur={()=>{if(!validateActivityRules(rules))setMessage('分类名不能为空或重复，请修正后保存')}}/><button type="button" className="icon-button" aria-label={'删除分类 '+c.name} onClick={()=>update(()=>removeActivityCategory(rules,c.id))}><Trash2 size={14}/></button></div>)}</div>
  <form className="aw-actions" onSubmit={e=>{e.preventDefault();const trimmed=name.trim();if(!trimmed)return;update(()=>({...rules,categories:[...rules.categories,{id:crypto.randomUUID(),name:trimmed}]}));setName('')}}><input aria-label="新分类名称" value={name} maxLength={32} onChange={e=>setName(e.target.value)} placeholder="新分类名称"/><button type="submit" className="secondary compact" disabled={!name.trim()||rules.categories.length>=24}><Plus size={14}/> 添加分类</button></form>
  <div className="aw-rule-editor">
   <label>数据类型<select aria-label="规则数据类型" value={kind} onChange={e=>{setKind(e.target.value);setSubject('');setCategory('');setTaskId('');setSelected([]);setBatchCategory('keep');setBatchTask('keep')}}><option value="apps">软件</option><option value="websites">网站</option></select></label>
   <label>主体<select aria-label="规则主体" value={subject} onChange={e=>choose(e.target.value)}><option value="">选择已识别主体</option>{available.map(s=><option key={s} value={s}>{s}</option>)}</select></label>
   <label>分类<select aria-label="规则分类" value={category} onChange={e=>setCategory(e.target.value)}><option value="">未分类</option>{rules.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
   <label>关联任务<select aria-label="关联任务" value={taskId} onChange={e=>setTaskId(e.target.value)}><option value="">不关联</option>{taskId&&!activeTasks.some(t=>t.id===taskId)&&<option value={taskId}>任务已不存在（可解除）</option>}{activeTasks.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
   <button type="button" className="secondary compact" disabled={!subject} onClick={()=>update(()=>setActivityMapping(rules,{kind,subject,category:category||null,taskId:taskId||null}))}>应用映射</button>
  </div>
  <details className="aw-batch"><summary>批量配置与主体检索 <small className="muted">{unclassifiedCount} 项未分类</small></summary>
 <div className="aw-actions"><label className="aw-search"><Search size={14}/><input aria-label="检索活动主体" placeholder="检索软件或网站" value={search} onChange={e=>{setSearch(e.target.value);setSelected([])}}/></label><label className="aw-check"><input type="checkbox" checked={unclassified} onChange={e=>{setUnclassified(e.target.checked);setSelected([])}}/>仅未分类</label><button type="button" className="secondary compact" onClick={()=>setSelected(shown)}>选中当前结果</button><button type="button" className="secondary compact" onClick={()=>setSelected([])}>清除选择</button></div>
 <div className="aw-subject-list">{shown.map(s=><label key={s}><input type="checkbox" checked={selected.includes(s)} onChange={e=>setSelected(old=>e.target.checked?[...old,s]:old.filter(x=>x!==s))}/><span>{s}</span><small>{rules.categories.find(c=>c.id===mapped.get(s)?.category)?.name||'未分类'}</small></label>)}</div>
 <p className="muted">{filtered.length} 项匹配 · 显示前 {shown.length} 项 · 已选 {selected.length} 项</p>
 <div className="aw-batch-fields"><label>批量分类<select aria-label="批量分类" value={batchCategory} onChange={e=>setBatchCategory(e.target.value)}><option value="keep">保持原值</option><option value="">未分类</option>{rules.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>批量关联任务<select aria-label="批量关联任务" value={batchTask} onChange={e=>setBatchTask(e.target.value)}><option value="keep">保持原值</option><option value="">解除关联</option>{activeTasks.map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></label><button type="button" className="secondary compact" disabled={!selected.length||(batchCategory==='keep'&&batchTask==='keep')} onClick={applyBatch}>应用批量映射</button></div></details>
 {rules.mappings.length>0&&<div className="aw-rule-list">{rules.mappings.filter(m=>!search.trim()||m.subject.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).map(m=><div key={JSON.stringify([m.kind,m.subject])}><span>{m.kind==='apps'?'软件':'网站'} · {m.subject}</span><span>{rules.categories.find(c=>c.id===m.category)?.name||'未分类'}{m.taskId?' · '+(activeTasks.find(t=>t.id===m.taskId)?.title||'任务已不存在'):''}</span><button type="button" className="icon-button" aria-label={'移除映射 '+m.subject} onClick={()=>update(()=>setActivityMapping(rules,{...m,category:null,taskId:null}))}><Trash2 size={14}/></button></div>)}</div>}
  <div className="aw-actions"><button type="button" className="primary" disabled={!dirty||!validateActivityRules(rules)} onClick={save}><Save size={14}/> {example?'确认示例规则':'保存本机规则'}</button>{dirty&&<small className="muted">未保存 · 离开页面将丢弃</small>}{message&&<small role="status">{message}</small>}</div>
 </details>;
}
function CategoryChart({report,rules,mode,kind}){
 const {rows,totals}=useMemo(()=>categoryTrend(report,rules,mode,kind),[report,rules,mode,kind]);
 const visible=totals.filter(c=>c.ms>0),max=Math.max(1,...rows.map(r=>r.total));
 return <section className="module-card aw-card"><h2>分类堆叠趋势</h2><p className="muted">{kind==='apps'?'软件':'网站'} · {mode==='year'?'按月':'按日'}汇总，未分类单列；未知区间不当作零。网站时间不与软件时间相加。</p>
 <div className="aw-category-chart" data-mode={mode} role="group" aria-label="分类堆叠趋势" style={{'--aw-columns':rows.length}}>{rows.map(r=><div key={r.key} className="aw-category-column"><div className="aw-category-stack" data-available={r.available} role="img" aria-label={r.key+' '+(r.available?duration(r.total):'未知')} title={r.key+' · '+(r.available?duration(r.total):'未知')+' · 应用/AFK覆盖 '+percent(r.known/r.range)+' · '+r.missing+' 天无可确认数据'}>{r.available&&r.segments.filter(s=>s.ms>0).map(s=><span key={s.id} title={s.name+' · '+duration(s.ms)} style={{height:mode==='day'?'100%':s.ms/max*100+'%',width:mode==='day'?s.ms/Math.max(1,r.total)*100+'%':undefined,background:s.color}}/>)}</div><small>{mode==='year'?r.key.slice(5)+'月':r.key.slice(8)+'日'}</small></div>)}</div>
 <div className="aw-axis"><span>{mode==='day'?'分类占比':'0'}</span><span>{mode==='day'?'合计 '+(rows[0]?.available?duration(rows[0].total):'未知'):'最高 '+(rows.some(r=>r.available)?duration(Math.max(0,...rows.map(r=>r.total))):'未知')}</span></div>
 <div className="aw-category-legend">{visible.map(c=><span key={c.id}><i style={{background:c.color}}/>{c.name}<strong>{duration(c.ms)}</strong></span>)}</div>
 </section>;
}
function Patterns({report,kind,mode}){
 const {days,weekdays}=useMemo(()=>activityPatterns(report,kind),[report,kind]),hours=useMemo(()=>activityHourly(report,kind),[report,kind]);
 const max=Math.max(1,...days.map(d=>d.ms)),hourMax=Math.max(1,...hours.map(h=>h.ms));
 return <section className="module-card aw-card"><h2>时间分布与使用规律</h2>
 {mode==='day'?<><p className="muted">单日每个实际经过小时的已识别时长；空白可能为空闲或缺失，不能判定零使用。</p><div className="aw-heatmap" role="group" aria-label="小时活动热力图">{hours.map(h=><div key={h.start} data-observed={h.ms>0} title={time(h.start)+'–'+time(h.end)+' · '+(h.ms?duration(h.ms):'无已识别活动')} aria-label={time(h.start)+' '+(h.ms?duration(h.ms):'无已识别活动')} style={{'--aw-intensity':h.ms/hourMax}}><span>{time(h.start)}</span><small>{h.ms?Math.round(h.ms/60000)+'m':'—'}</small></div>)}</div></>:<><p className="muted">日期热力图按已识别时长着色，虚线表示未知；不将未观测日期计入星期平均。</p><div className="aw-heatmap" role="group" aria-label="日期活动热力图">{days.map(d=><div key={d.key} data-observed={d.available} title={d.key+' · '+(d.available?duration(d.ms):'未知')+' · 应用/AFK覆盖 '+percent(d.known/d.range)} aria-label={d.key+' '+(d.available?duration(d.ms):'未知')} style={{'--aw-intensity':d.ms/max}}><span>{d.key.slice(5)}</span><small>{d.available?Math.round(d.ms/60000)+'m':'—'}</small></div>)}</div>
 <h3>按星期平均已识别时间</h3><div className="aw-weekdays">{weekdays.map(w=><div key={w.weekday}><small>星期{weeks[w.weekday]}</small><strong>{w.average===null?'—':Math.round(w.average/60000)+'m'}</strong><small className="muted">{w.count} 个可用日</small></div>)}</div><p className="muted">仅为观测样本均值，部分覆盖会低估时长；不能推断习惯因果。</p></>}
 </section>;
}
function PeriodCompare({report,day,mode,kind,example,load,includeWeb}){
 const [previous,setPrevious]=useState(null),[pending,setPending]=useState(false),[error,setError]=useState(''),[progress,setProgress]=useState('');
 const generation=useRef(0),busy=useRef(false);
 useEffect(()=>()=>{generation.current++},[]);
 const period=previousActivityPeriod(day,mode);
 const read=async()=>{
  if(!period||busy.current)return;
  if(example){setPrevious(activityPeriodExample(period));return}
  busy.current=true;setPending(true);setPrevious(null);setError('');setProgress('0/'+activityChunks(period.bounds).length);
  const token=++generation.current;
  try{const r=await readActivityPeriod(period,mode,load,()=>token===generation.current,(n,total)=>setProgress(n+'/'+total),includeWeb);if(r&&token===generation.current)setPrevious(r)}
  catch(e){if(token===generation.current)setError(typeof e==='string'?e:'对照周期读取失败')}
  finally{busy.current=false;setPending(false);setProgress('')}
 };
 const v=previous?periodComparison(report,previous,kind):null;
 return <section className="module-card aw-card"><h2>周期对比</h2><p className="muted">上一自然周期：{period?.label||'不可用'}。不会自动查询；{example?'仅生成合成数据。':'须另行授权此范围，网站权限沿用本次勾选范围。'}</p><div className="aw-actions"><button type="button" className="secondary compact" disabled={!period||pending} onClick={read}>{example?'生成上一周期示例':'授权读取上一周期'}</button>{pending&&<><small role="status">读取 {progress}</small><button type="button" className="secondary compact" onClick={()=>{generation.current++;setPrevious(null);setProgress('取消中')}}>取消对照</button></>}</div>{error&&<p role="alert">{error}</p>}
 {v&&<><div className="aw-compare-grid">{[['本期',v.current],['上一周期',v.previous]].map(([label,r])=><div key={label}><small>{label}</small><strong>{r.available?duration(r.ms):'未知'}</strong><div className="aw-compare-track"><span style={{width:r.available?r.ms/Math.max(1,v.current.ms,v.previous.ms)*100+'%':'0%'}}/></div><small>应用/AFK覆盖 {percent(r.coverage)} · 查询 {duration(r.range)}</small></div>)}</div><p className="muted">{v.delta===null?'覆盖不完整、周期不等长或网站覆盖未知；已识别时长差 '+signed(v.observedDelta)+'，不代表真实变化。':'等长且完整覆盖的软件时长差：'+signed(v.delta)}</p></>}
 </section>;
}
function TaskReview({data,report,day,rules,onOpenReview,example}){
 const budget=useMemo(()=>activityBudget(data,report),[data,report]);
 const rows=useMemo(()=>activityTaskReview(data,report,day,rules),[data,report,day,rules]);
 return <section className="module-card aw-card"><div className="aw-source-head"><h2>任务、专注与规划对照</h2>{!example&&onOpenReview&&<button type="button" className="secondary compact" onClick={()=>onOpenReview(day)}><CalendarRange size={14}/> 打开当日回顾</button>}</div><p className="muted">任务预计是整体估计，规划为所选范围内占用，专注为已记录时长。关联活动仅按明确配置匹配软件/网站，重叠区间去重；不是实际工作证明，不写回任务。无匹配或数据不足不推断任务耗时，各任务匹配可能重叠，不可相加。匹配与规划的差仅为已识别活动差，覆盖不足时不代表实际偏差。</p>
 <div className="aw-budget"><h3>查询区间时间预算</h3><div className="aw-budget-track" aria-label="规划占用比例"><span style={{width:percent(budget.occupied/budget.range)}}/></div><div className="aw-budget-metrics">{[['查询时长',budget.range],['规划占用（去重）',budget.occupied],['未规划区间',budget.unplanned],['已记专注（去重）',budget.focused],['已识别应用',budget.observed],['未覆盖',budget.unknown]].map(([label,value])=><div key={label}><small>{label}</small><strong>{duration(value)}</strong></div>)}</div><p className="muted">未规划区间包含休息、睡眠等，并非可工作容量；各指标相互重叠，不可相加。</p></div>
 {!rows.length?<p className="muted">该日没有可关联的任务或专注记录。</p>:<div className="aw-comparison">{rows.slice(0,100).map(t=><div key={t.id}><h3>{t.title}</h3><dl>{[['任务预计',t.estimate],['日内规划',t.plan],['日内专注',t.focus],['规划与活动重合',t.planOverlap],['专注与活动重合',t.focusOverlap],['规则匹配活动',t.configured&&t.matched>0?t.matched:null]].map(([label,ms])=><div key={label}><dt>{label}</dt><dd>{duration(ms)}</dd></div>)}<div><dt>专注－规划</dt><dd>{signed(t.focusPlanDelta)}</dd></div><div><dt>匹配活动－规划</dt><dd>{signed(t.matchedPlanDelta)}</dd></div></dl></div>)}{rows.length>100&&<p className="muted">仅显示前 100 项。</p>}</div>}
 <p className="muted">专注起点加记账秒数为近似区间，可能包含暂停误差；规划来自当前任务字段，不是历史计划快照。偏差仅在有正时长记录和计划时展示。</p></section>;
}
export function ActivityWatchAnalysis({report,day,mode,kind,example,scope,data,load,includeWeb,onOpenReview}){
 const [initial]=useState(()=>{if(example)return {rules:exampleActivityRules(),error:''};try{return readActivityRules(localStorage,scope)}catch{return readActivityRules(null,scope)}});
 const [rules,setDraft]=useState(initial.rules),[analysisRules,setLastValid]=useState(initial.rules);
 const setRules=next=>{setDraft(next);if(validateActivityRules(next))setLastValid(next)};
 const valid=validateActivityRules(rules);
 return <>
 <RulesEditor rules={rules} setRules={setRules} report={report} tasks={data.tasks} example={example} scope={scope} initialError={initial.error}/>
 {!valid&&<p role="status" className="muted">分类草稿不合法，图表保留最近有效配置。</p>}
 <div className="aw-analysis-grid"><CategoryChart report={report} rules={analysisRules} mode={mode} kind={kind}/>
 <Patterns report={report} kind={kind} mode={mode}/></div>
 <PeriodCompare report={report} day={day} mode={mode} kind={kind} example={example} load={load} includeWeb={includeWeb}/>
 {mode==='day'&&<TaskReview data={data} report={report} day={day} rules={analysisRules} onOpenReview={onOpenReview} example={example}/>}
 </>;
}
