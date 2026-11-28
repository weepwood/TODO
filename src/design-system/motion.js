export const motion={fast:120,popup:180,selection:200,reorder:200,panel:240,exit:140,ease:'cubic-bezier(.2,.75,.25,1)'};

// Critically damped spring (omega in s^-1); exact integration is stable for
// variable frame intervals and preserves velocity when the target changes.
export function springStep(position,velocity,target,seconds,omega=24){
 const delta=position-target,coefficient=velocity+omega*delta,decay=Math.exp(-omega*seconds);
 return {position:target+(delta+coefficient*seconds)*decay,velocity:(velocity-omega*coefficient*seconds)*decay};
}
