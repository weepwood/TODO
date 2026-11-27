// Manual release gate; production endpoint is fixed, never a user-supplied server.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {verifyLive} from './verify-live-core.mjs';
const source=await readFile(new URL('../src/cloud-config.js',import.meta.url),'utf8');
const url=source.match(/CLOUD_URL\s*=.*?\|\|\s*'([^']+)'/)?.[1];
const key=source.match(/CLOUD_KEY\s*=.*?\|\|\s*'(sb_publishable_[^']+)'/)?.[1];
assert(url==='https://xepkhnatnpvopnlqnrrz.supabase.co'&&key,'Unexpected public project configuration');
const live=process.argv.includes('--live'),write=process.argv.includes('--write');
if(!await verifyLive({url,key,createClient,live,write,oauth:process.argv.includes('--oauth'),env:process.env}))process.exitCode=1;
