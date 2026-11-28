import React from 'react';
import {Inbox,Layers,Briefcase,House,BookOpen,Gamepad2,Star,Heart,CalendarDays,Code,Coffee,ShoppingCart,Music,Plane,Dumbbell,Leaf,Target,Folder} from 'lucide-react';
import {listIcon,listColor} from '../core/list-appearance.js';
const symbols={inbox:Inbox,layers:Layers,briefcase:Briefcase,home:House,book:BookOpen,game:Gamepad2,star:Star,heart:Heart,calendar:CalendarDays,code:Code,coffee:Coffee,shopping:ShoppingCart,music:Music,travel:Plane,fitness:Dumbbell,leaf:Leaf,target:Target,folder:Folder};
export function ListIcon({list,size=16,neutral=false}){
 const value=listIcon(list),color=listColor(list);
 return value.startsWith('emoji:')?<span aria-hidden="true" className="list-icon-emoji" style={{fontSize:size,width:size,height:size,lineHeight:1}}>{value.slice(6)}</span>:React.createElement(symbols[value.slice(5)],{size,style:{color:neutral?undefined:color},'aria-hidden':true,className:'list-icon-symbol'});
}
export function ListIdentity({list}){
 const name=list?.name||'未归属清单';
 return <span className="task-list-identity" title={'清单：'+name} aria-label={'清单：'+name} style={{'--list-color':listColor(list)}}><ListIcon list={list} size={15} neutral/><span className="task-list-name">{name}</span></span>
}
