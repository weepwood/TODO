import {safeLink} from './productivity.js';
export function visualSourceAllowed(text){
 // Avoid parsing arbitrary HTML into the rich editor. Complex/unsupported Markdown
 // stays in the original source editor; conversion must also round-trip losslessly.
 if(typeof text!=='string'||text.length>100000)return false;
 let fence=null;const outside=[];
 for(const line of text.split(/\r?\n/)){const m=line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);if(fence){if(m&&m[1][0]===fence[0]&&m[1].length>=fence.length&&!m[2].trim())fence=null;continue}if(m&&/^[a-zA-Z0-9_+.-]{0,40}$/.test(m[2].trim())){fence=m[1];continue}outside.push(line)}
 if(fence)return false;
 const raw=outside.join('\n');return !/[<>]/.test(raw)&&!/(?:!\[|^\s*\[[^\]]+\]:)/m.test(raw)&&[...raw.matchAll(/\]\(([^)]+)\)/g)].every(m=>!!safeLink(m[1]))
}
