import React from 'react';
import {MoreHorizontal} from 'lucide-react';
import {Menu} from '../ui.jsx';
import {ListIcon} from './ListIcon.jsx';
import {listColor} from '../core/list-appearance.js';

// Count and menu share one stable trailing slot on pointer-driven layouts.
// Keep separate buttons for navigation and the menu (no nested buttons).
export function SidebarRow({viewKey,label,icon:Icon,iconList,color,count,active,onClick,items,actionLabel='更多操作',expanded,controls,leading}){
 const editable=!!items?.length;
 return <div className="sidebar-row nav-wrap" data-editable={editable||undefined}>
  <button type="button" data-view-key={viewKey} className={'nav-row '+(active?'active':'')} aria-current={active?'page':undefined} aria-expanded={expanded} aria-controls={controls} onClick={onClick}>
   {leading}{iconList?<ListIcon list={iconList} neutral/>:Icon&&<Icon size={16} style={color?{color}:undefined}/>}
   <span className="sidebar-row-label">{label}</span>
   <span className="sidebar-row-meta">{iconList&&<i className="sidebar-color-dot" style={{backgroundColor:listColor(iconList)}} title="清单颜色" aria-hidden="true"/>}<small className="sidebar-row-count">{count||''}</small></span>
  </button>
  {editable&&<Menu trigger={<button type="button" className="icon-button sidebar-row-actions" aria-label={actionLabel}><MoreHorizontal size={16}/></button>} items={items}/>}
 </div>
}
