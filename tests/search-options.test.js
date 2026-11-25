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
