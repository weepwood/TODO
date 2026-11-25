import {test} from 'node:test';
import assert from 'node:assert/strict';
import {authErrorMessage} from '../src/cloud-core.js';
test('认证错误提供明确的中文恢复提示',()=>{
 assert.match(authErrorMessage({code:'over_email_send_rate_limit'}),/发送额度/);
 assert.match(authErrorMessage({message:'email rate limit exceeded'}),/发送额度/);
 assert.match(authErrorMessage({code:'email_address_not_authorized'}),/不允许/);
 assert.match(authErrorMessage({code:'email_not_confirmed'}),/尚未确认/);
 assert.match(authErrorMessage({code:'invalid_credentials'}),/不正确/);
 assert.match(authErrorMessage({status:429}),/频繁/);
});
