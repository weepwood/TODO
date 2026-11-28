import React from 'react';
// Presentational only: all values and scope come from the business view.
export function WorkspaceMetrics({items,variant='cards',className='',label,children}){
 if(variant==='summary')return <div className={'module-summary workspace-metrics '+className} aria-label={label}>{items.map(({label,value})=><span key={label}><strong>{value}</strong> {label}</span>)}{children}</div>;
 return <div className={className+' workspace-metrics metric-cards'} aria-label={label}>{items.map(({label,value,unit,icon:Icon,tone})=><div className="module-card" key={label} data-tone={tone||undefined}><small>{Icon&&<Icon size={14} aria-hidden="true"/>}{label}</small><strong className={tone==='warning'?'task-warning':undefined}>{value}{unit&&<span> {unit}</span>}</strong></div>)}</div>;
}
