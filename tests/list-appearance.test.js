import test from 'node:test';
import assert from 'node:assert/strict';
import {initialState,migrateState} from '../src/core/domain.js';
import {listIcon,listColor,validListIcon} from '../src/core/list-appearance.js';
test('清单图标支持可选字段和旧数据回退',()=>{
 const data=initialState();assert.equal(listIcon(data.lists[0]),'icon:inbox');
 data.lists[1].icon='emoji:👩‍💻';data.lists[1].color='#4d9a79';
 assert.equal(listIcon(migrateState(JSON.parse(JSON.stringify(data))).lists[1]),'emoji:👩‍💻');
 assert.equal(listColor(data.lists[1]),'#4d9a79');assert.equal(listColor({color:'url(test)'}),'#778396');
 for(const icon of ['emoji:🇯🇵','emoji:❤️','emoji:👍🏽','icon:game',''])assert.ok(validListIcon(icon),icon);
 for(const icon of ['emoji:','emoji:abc','emoji:😀😀','icon:unknown','<svg>'])assert.equal(validListIcon(icon),false,icon);
 assert.equal(listIcon({icon:'unknown'}),'icon:layers');
});
