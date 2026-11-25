import test from 'node:test';
import assert from 'node:assert/strict';
import {DETAIL_DENSITY_KEY,DETAIL_ORDER_KEY,DETAIL_SECTION_IDS,normalizeDetailDensity,readDetailDensity,setDetailDensity,nextDetailDensity,normalizeDetailOrder,readDetailOrder,moveDetailSection} from '../src/core/detail-density.js';
test('两档循环、默认展开、独立折叠与旧摘要迁移',()=>{
 assert.equal(nextDetailDensity('full'),'title');assert.equal(nextDetailDensity('title'),'full');
 let state={};for(const id of DETAIL_SECTION_IDS)state=setDetailDensity(state,id,'title');
 assert.equal(Object.keys(state).length,8);
 const next=setDetailDensity(state,'plan','full');assert.equal(state.plan,'title');assert.equal(next.plan,undefined);assert.equal(next.notes,'title');
 assert.equal(setDetailDensity(next,'unknown','title'),next);
 assert.deepEqual(normalizeDetailDensity({plan:'summary',notes:'title',activity:'full',unknown:'title'}),{plan:'title',notes:'title'});
});
test('密度持久化严格校验和存储故障回退',()=>{
 const storage={getItem:key=>{assert.equal(key,DETAIL_DENSITY_KEY);return JSON.stringify({plan:'summary',notes:'title',activity:'full',resources:'bad'})}};
 assert.deepEqual(readDetailDensity(storage),{plan:'title',notes:'title'});
 assert.deepEqual(readDetailDensity({getItem:()=>{throw Error('denied')}}),{});
 assert.deepEqual(readDetailDensity({getItem:()=>'{'}),{});
 assert.deepEqual(normalizeDetailDensity(null),{});
});
test('八区顺序独立持久化、去重补齐、无效拖动不改变数据',()=>{
 const order=normalizeDetailOrder(['activity','notes','notes','unknown']);
 assert.deepEqual(order,['activity','notes',...DETAIL_SECTION_IDS.filter(id=>!['activity','notes'].includes(id))]);
 const moved=moveDetailSection(order,'activity','notes');assert.deepEqual(moved.slice(0,2),['notes','activity']);
 assert.equal(order[0],'activity');assert.equal(moveDetailSection(order,'plan','bad'),order);assert.equal(moveDetailSection(order,'plan','plan'),order);
 assert.deepEqual(readDetailOrder({getItem:key=>{assert.equal(key,DETAIL_ORDER_KEY);return JSON.stringify(moved)}}),moved);
 assert.deepEqual(readDetailOrder({getItem:()=>'{'}),DETAIL_SECTION_IDS);
});
