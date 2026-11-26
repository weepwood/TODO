// Optional presentation metadata; older workspaces need no schema migration.
export const LIST_SYMBOLS=['inbox','layers','briefcase','home','book','game','star','heart','calendar','code','coffee','shopping','music','travel','fitness','leaf','target','folder'];
export const LIST_EMOJIS=['📥','💼','🏠','📚','🎮','⭐','❤️','📅','💻','☕','🛒','🎵','✈️','🏃','🌿','🎯','📁','💡','🎨','💰','🧘','📝','🍀','🐱'];
const segmenter=typeof Intl.Segmenter==='function'?new Intl.Segmenter(undefined,{granularity:'grapheme'}):null;
export function validListIcon(value){
 if(value==='')return true;
 if(typeof value!=='string'||value.length>40)return false;
 if(value.startsWith('icon:'))return LIST_SYMBOLS.includes(value.slice(5));
 if(!value.startsWith('emoji:'))return false;
 const glyph=value.slice(6);
 // One grapheme, including flags, variation selectors and joined emoji.
 if(!/^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[0-9#*](?=\uFE0F?\u20E3))[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\uFE0F\u200D\u20E3\u{E0020}-\u{E007F}0-9#*]*$/u.test(glyph))return false;
 if(segmenter)return [...segmenter.segment(glyph)].length===1;
 return /^(?:\p{Regional_Indicator}{2}|[0-9#*]\uFE0F?\u20E3|\p{Extended_Pictographic}\uFE0F?\p{Emoji_Modifier}?(?:\u200D\p{Extended_Pictographic}\uFE0F?\p{Emoji_Modifier}?)*)(?:[\u{E0020}-\u{E007F}]+)?$/u.test(glyph);
}
export function listIcon(list){return validListIcon(list?.icon)&&list?.icon?list.icon:'icon:'+(list?.id==='inbox'?'inbox':'layers')}
export function listColor(list){return typeof list?.color==='string'&&/^#[0-9a-f]{6}$/i.test(list.color)?list.color:'#778396'}
