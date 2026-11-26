import React from 'react';
import {X} from 'lucide-react';
import {useTouchGesture} from './useTouchGesture.js';
// The gesture state stays inside the inspector, not the application root.
export function DetailSurface({compact,closing,onClose,resizeHandle,children}){
 const gesture=useTouchGesture({enabled:compact&&!closing,kind:'detail',onAction:onClose});
 return <aside aria-label="任务详情" className={'details '+(closing?'detail-exit':'detail-enter')} inert={closing||undefined} data-detail-dragging={gesture.phase==='dragging'||undefined} style={compact?{'--detail-drag':gesture.offset+'px','--gesture-release':gesture.release+'px'}:undefined}>
 {resizeHandle}<div className="detail-header" {...gesture.handlers}><span>任务详情</span><button className="icon-button" aria-label="关闭详情" onClick={onClose}><X size={17}/></button></div>{children}
 </aside>
}
