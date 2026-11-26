import test from 'node:test';
import assert from 'node:assert/strict';
import {filterOptions} from '../src/core/search-options.js';
test('搜索支持中文、大小写、全角及多关键词，不修改原选项',()=>{
 const opts=[{label:'项目 ＡBC 开发'},{label:'游戏日常'},{label:'项目资料'},{label:'图标内容',searchText:'工作 设计'}];
 assert.deepEqual(filterOptions(opts,'abc 项目'),[opts[0]]);
 assert.deepEqual(filterOptions(opts,'游戏'),[opts[1]]);
 assert.deepEqual(filterOptions(opts,'设计'),[opts[3]]);
 assert.deepEqual(filterOptions(opts,'无匹配'),[]);
 assert.equal(filterOptions(opts,'  '),opts);
});

import {visibleOptions} from '../src/core/search-options.js';
test('百项上限不隐藏已选择项，查询仍保留完整集合',()=>{
 const opts=Array.from({length:125},(_,i)=>({value:String(i),label:'任务 '+i}));
 const bounded=visibleOptions(opts,'124');
 assert.equal(bounded.length,100);assert.equal(bounded.at(-1),opts[124]);
 assert.deepEqual(visibleOptions(opts,'3'),opts.slice(0,100));
 assert.deepEqual(visibleOptions(filterOptions(opts,'124'),'124'),[opts[124]]);
 assert.equal(opts.length,125);
});
