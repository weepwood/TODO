// Axis locking protects vertical scrolling and avoids accidental destructive actions.
export function gestureAxis(dx,dy){if(Math.max(Math.abs(dx),Math.abs(dy))<10)return null;return Math.abs(dx)>Math.abs(dy)*1.6?'x':'y'}
export function gestureAction(dx,dy,axis,kind='row'){
 if(kind==='sheet')return axis==='y'&&dy>=72&&Math.abs(dx)<dy*.45?'dismiss':null;
 if(kind==='detail')return axis==='x'&&dx>=72&&Math.abs(dy)<dx*.45?'dismiss':null;
 return axis==='x'&&dx<=-64&&Math.abs(dy)<-dx*.45?'menu':null;
}
