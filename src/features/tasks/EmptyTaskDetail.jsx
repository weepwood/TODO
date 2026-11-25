import React from 'react';
export function EmptyTaskDetail(){
 return <div className="detail-empty">
  <svg className="detail-empty-art" viewBox="0 0 240 200" aria-hidden="true" focusable="false">
   <ellipse cx="120" cy="171" rx="78" ry="9" fill="currentColor" opacity=".045"/>
   <circle cx="120" cy="97" r="77" fill="var(--accent)" opacity=".055"/>
   <rect x="62" y="35" width="120" height="142" rx="14" fill="var(--panel)" stroke="var(--line)" transform="rotate(8 122 106)"/>
   <rect x="49" y="27" width="124" height="143" rx="14" fill="var(--bg)" stroke="var(--line)" strokeWidth="1.5"/>
   <rect x="64" y="45" width="48" height="7" rx="3.5" fill="currentColor" opacity=".23"/>
   <rect x="64" y="61" width="77" height="4" rx="2" fill="currentColor" opacity=".1"/>
   {[82,108,134].map((y,i)=><g key={y}><rect x="65" y={y} width="14" height="14" rx="4" fill={i===0?'var(--active)':'none'} stroke={i===0?'var(--accent)':'var(--line)'} strokeWidth="1.4"/>{i===0&&<path d="m68 89 3 3 5-6" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none"/>}<rect x="87" y={y+3} width={i===1?61:48} height="4" rx="2" fill="currentColor" opacity=".14"/><rect x="87" y={y+10} width="29" height="3" rx="1.5" fill="currentColor" opacity=".065"/></g>)}
   <circle cx="174" cy="132" r="27" fill="var(--bg)" stroke="var(--line)" strokeWidth="1.4"/>
   <circle cx="174" cy="132" r="21" fill="var(--active)"/>
   <path d="m165 132 6 6 12-13" fill="none" stroke="var(--accent)" strokeWidth="2.7" strokeLinecap="round" strokeLinejoin="round"/>
   <path d="M194 48v12m-6-6h12M36 122v8m-4-4h8" stroke="var(--accent)" opacity=".45" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
  <h3>未选择任务</h3>
  <p>选择一个任务，即可查看详情、编辑计划和管理提醒。</p>
 </div>
}
