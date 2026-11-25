import {MAX_POINTS,validPoints,summarizePoints} from './points.js';
import {dayKey,shiftDay,validDate} from './domain.js';
export const GOAL_KEYS=['daily','weekly','monthly'];
export const MAX_REWARDS=100,MAX_REDEMPTIONS=10000;
const object=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const identifier=v=>typeof v==='string'&&v.length>0&&v.length<=200;
const nameValid=v=>typeof v==='string'&&v.trim().length>0&&v.length<=100;
const positive=v=>validPoints(v)&&v>0;
const timestamp=v=>typeof v==='string'&&v.length<=40&&Number.isFinite(Date.parse(v));
export const emptyProgram=()=>({goals:{daily:0,weekly:0,monthly:0},rewards:[],redemptions:[]});
export const programOf=state=>state.pointsProgram??emptyProgram();
export function validPointsProgram(p){
 return object(p)&&object(p.goals)&&GOAL_KEYS.every(k=>validPoints(p.goals[k])&&p.goals[k]>=0)
 &&Array.isArray(p.rewards)&&p.rewards.length<=MAX_REWARDS&&new Set(p.rewards.map(r=>r?.id)).size===p.rewards.length&&p.rewards.every(r=>object(r)&&identifier(r.id)&&nameValid(r.name)&&positive(r.cost)&&typeof r.archived==='boolean')
 &&Array.isArray(p.redemptions)&&p.redemptions.length<=MAX_REDEMPTIONS&&new Set(p.redemptions.map(r=>r?.id)).size===p.redemptions.length&&p.redemptions.every(r=>object(r)&&identifier(r.id)&&identifier(r.rewardId)&&nameValid(r.name)&&positive(r.cost)&&timestamp(r.createdAt)&&(r.refundedAt===null||timestamp(r.refundedAt)&&Date.parse(r.refundedAt)>=Date.parse(r.createdAt)));
}
export function setGoals(state,goals){
 if(!GOAL_KEYS.every(k=>validPoints(goals[k])&&goals[k]>=0))return state;
 const p=programOf(state);if(GOAL_KEYS.every(k=>p.goals[k]===goals[k]))return state;
 return {...state,pointsProgram:{...p,goals:Object.fromEntries(GOAL_KEYS.map(k=>[k,goals[k]]))}};
}
export function saveReward(state,reward){
 const p=programOf(state);
 if(!identifier(reward.id)||!nameValid(reward.name)||!positive(reward.cost))return state;
 const old=p.rewards.find(r=>r.id===reward.id);if(!old&&p.rewards.length>=MAX_REWARDS)return state;
 const next={id:reward.id,name:reward.name.trim(),cost:reward.cost,archived:old?.archived??false};
 return {...state,pointsProgram:{...p,rewards:old?p.rewards.map(r=>r.id===next.id?next:r):[...p.rewards,next]}};
}
export function archiveReward(state,id,archived){
 const p=programOf(state),r=p.rewards.find(x=>x.id===id);
 if(!r||r.archived===archived||typeof archived!=='boolean')return state;
 return {...state,pointsProgram:{...p,rewards:p.rewards.map(x=>x.id===id?{...x,archived}:x)}};
}
export function pointsWallet(state,today){
 const earned=summarizePoints(state.tasks,{since:today,today}).total.net;
 const spent=programOf(state).redemptions.filter(r=>!r.refundedAt).reduce((n,r)=>n+r.cost,0);
 return {earned,spent,balance:earned-spent};
}
export function redeemReward(state,rewardId,requestId,at,today,expectedCost){
 const p=programOf(state),reward=p.rewards.find(r=>r.id===rewardId);
 if(!identifier(requestId)||!timestamp(at)||!validDate(today)||!reward||reward.archived||reward.cost!==expectedCost||p.redemptions.length>=MAX_REDEMPTIONS||p.redemptions.some(r=>r.id===requestId)||pointsWallet(state,today).balance<reward.cost)return state;
 return {...state,pointsProgram:{...p,redemptions:[...p.redemptions,{id:requestId,rewardId,name:reward.name,cost:reward.cost,createdAt:at,refundedAt:null}]}};
}
export function refundReward(state,requestId,at){
 const p=programOf(state),r=p.redemptions.find(x=>x.id===requestId);
 if(!r||r.refundedAt||!timestamp(at)||Date.parse(at)<Date.parse(r.createdAt))return state;
 return {...state,pointsProgram:{...p,redemptions:p.redemptions.map(x=>x.id===requestId?{...x,refundedAt:at}:x)}};
}
export function goalProgress(tasks,today,goals){
 const monday=shiftDay(today,-((new Date(today+'T12:00:00').getDay()+6)%7));
 const starts={daily:today,weekly:monday,monthly:today.slice(0,7)+'-01'};
 return GOAL_KEYS.map(key=>({key,target:goals[key],net:summarizePoints(tasks,{since:starts[key],today}).period.net,since:starts[key]}));
}
export function cumulativePoints(stats,days){
 let net=stats.total.net-stats.period.net;
 return [{day:null,net},...days.map(day=>({day,net:net+=(stats.daily.get(day)?.net??0)}))];
}
