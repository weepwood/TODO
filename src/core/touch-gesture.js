// Axis locking protects vertical scrolling and avoids accidental destructive actions.
export function gestureAxis(dx,dy){if(Math.max(Math.abs(dx),Math.abs(dy))<10)return null;return Math.abs(dx)>Math.abs(dy)*1.6?'x':'y'}
export function gestureAction(dx,dy,axis,kind='row'){
 if(kind==='sheet')return axis==='y'&&dy>=72&&Math.abs(dx)<dy*.45?'dismiss':null;
 if(kind==='detail')return axis==='x'&&dx>=72&&Math.abs(dy)<dx*.45?'dismiss':null;
 return axis==='x'&&dx<=-64&&Math.abs(dy)<-dx*.45?'menu':null;
}

// Monotone, bounded resistance after the initial one-to-one movement.
export function gestureOffset(dx,dy,axis,kind='row'){
 const distance=kind==='sheet'?(axis==='y'?Math.max(0,dy):0):axis==='x'?Math.max(0,kind==='detail'?dx:-dx):0;
 const knee=kind==='row'?48:kind==='sheet'?100:120;
 const extra=Math.max(0,distance-knee);
 const value=Math.min(distance,knee)+extra/(1+extra/knee)*.65;
 return value?Math.round((kind==='row'?-1:1)*value*10)/10:0;
}

// Resume the *visible* offset of a spring without using it as an action threshold.
export function resumeGestureOffset(base,dx,dy,axis,kind='row'){
 const expected=kind==='sheet'?'y':'x',sign=kind==='row'?-1:1;
 if(axis&&axis!==expected)return 0;
 const knee=kind==='row'?48:kind==='sheet'?100:120;
 const visible=Math.max(0,Math.min(knee*1.64,(Number.isFinite(base)?base:0)*sign));
 const extra=Math.max(0,visible-knee);
 const raw=Math.min(knee,visible)+extra/(.65-extra/knee);
 const distance=Math.max(0,raw+(kind==='sheet'?dy:dx*sign));
 return gestureOffset(expected==='x'?distance*sign:0,expected==='y'?distance:0,expected,kind);
}
