import {useFieldControl} from './FieldFeedback.jsx';
import React from 'react';
import {Search,X,Minus,Plus,Flag,Inbox,Layers,FolderOpen,Circle,Clock,CheckCircle2,SkipForward,Trash2} from 'lucide-react';

// Preserve native input semantics; these are controlled visual primitives.
export function SearchField({value,onValueChange,className='',inputRef,clearLabel='清除搜索内容',...props}){
 return <div className={'shared-search '+className}><Search size={16} aria-hidden="true"/><input {...props} ref={inputRef} value={value} onChange={e=>onValueChange(e.target.value)}/>{value&&<button type="button" className="icon-button search-clear" aria-label={clearLabel} onClick={()=>onValueChange('')}><X size={15}/></button>}</div>
}
export function CheckInput({className='',...props}){return <input {...props} type="checkbox" className={'shared-check '+className}/>}
export function RadioInput({className='',...props}){return <input {...props} type="radio" className={'shared-radio '+className}/>}
export function Switch({checked,onCheckedChange,className='',...props}){
 return <button {...props} type="button" role="switch" aria-checked={checked} className={'shared-switch '+className} onClick={()=>onCheckedChange(!checked)}><span aria-hidden="true"/></button>
}
export function Segmented({options,value,onValueChange,multiple=false,className='',label,as:Container='div',...props}){
 return <Container {...props} className={'shared-segment '+className} aria-label={label} role={Container==='nav'?undefined:'group'}>{options.map(o=>{const active=multiple?value.includes(o.value):value===o.value;return <button type="button" key={o.value} aria-pressed={active} disabled={o.disabled} className={active?'chosen':''} onClick={()=>onValueChange(multiple?(active?value.filter(x=>x!==o.value):[...value,o.value]):o.value)}>{o.label}</button>})}</Container>
}
// Draft mode intentionally retains invalid/empty input until the enclosing form validates.
export function NumberControl({label,min,max,unit,disabled=false,minusDisabled,plusDisabled,onStep,inputProps={},onStepPointerDown}){
 const feedback=useFieldControl();
 return <div className="number-control" data-invalid={feedback['aria-invalid']||undefined} data-unit={unit||undefined}><button type="button" className="number-step" aria-label={label+'减少'} disabled={disabled||minusDisabled} onPointerDown={onStepPointerDown} onClick={()=>onStep(-1)}><Minus size={14}/></button><div className="number-value"><input {...feedback} {...inputProps} className="number-field" type="number" inputMode="numeric" step="1" min={min} max={max} aria-label={label} disabled={disabled}/>{unit&&<span className="number-unit" aria-hidden="true">{unit}</span>}</div><button type="button" className="number-step" aria-label={label+'增加'} disabled={disabled||plusDisabled} onPointerDown={onStepPointerDown} onClick={()=>onStep(1)}><Plus size={14}/></button></div>
}
export function DraftNumberField({label,value,onValueChange,min,max,unit,disabled=false}){
 const numeric=String(value).trim()!==''&&Number.isFinite(Number(value)),number=numeric?Number(value):min;
 const step=d=>onValueChange(String(Math.max(min,Math.min(max,Math.round(number)+d))));
 return <NumberControl label={label} min={min} max={max} unit={unit} disabled={disabled} minusDisabled={numeric&&number<=min} plusDisabled={numeric&&number>=max} onStep={step} inputProps={{value,onChange:e=>onValueChange(e.target.value)}}/>;
}
export const priorityNames=['无优先级','低优先级','中优先级','高优先级'];
export function DetailValue({icon:Icon,children,priority,status,color}){
 return <span className="detail-fact-value" data-priority={priority} data-status={status} data-list-color={color||undefined} style={color?{'--list-icon-color':color}:undefined}><Icon size={15} aria-hidden="true"/><span>{children}</span></span>
}
export const PriorityValue=({value})=><DetailValue icon={Flag} priority={value}>{priorityNames[value]}</DetailValue>;
export const ListValue=({list})=><DetailValue icon={list?.id==='inbox'?Inbox:Layers} color={list?.color}>{list?.name||'未归属'}</DetailValue>;
export const GroupValue=({group})=><DetailValue icon={FolderOpen}>{group?.name||'未分组'}</DetailValue>;
const statusInfo={trash:[Trash2,'回收站'],completed:[CheckCircle2,'已完成'],skipped:[SkipForward,'已跳过'],doing:[Clock,'进行中'],todo:[Circle,'待处理']};
export function StatusValue({status}){const [Icon,label]=statusInfo[status]||statusInfo.todo;return <DetailValue icon={Icon} status={status}>{label}</DetailValue>}
