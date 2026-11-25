import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
const src=new URL('../src/',import.meta.url),read=f=>readFileSync(new URL(f,src),'utf8');
test('legacy sheets do not own common search and stepper geometry',()=>{
 const legacy=readdirSync(src).filter(f=>f.endsWith('.css')).map(read).join('\n');
 for(const old of [/\.palette-search\s*\{/,/\.ledger-search\s*\{[^}]*\bdisplay\s*:/,/\.number-control\s*\{[^}]*\bdisplay\s*:/,/\.time-control\s*\{[^}]*\bdisplay\s*:/,/\.calendar-agenda>input\s*\{/,/\.field input\s*[,{}]/,/\.detail-content label (?:input|select)\s*[,{}]/])assert.doesNotMatch(legacy,old);
 const controls=read('design-system/controls.css');
 assert.match(controls,/\.number-control,\.time-control\{display:flex/);
 assert.match(controls,/\.shared-search\{display:flex/);
});
