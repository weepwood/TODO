// Shared search semantics: normalize full-width text, case and whitespace.
const normalize=value=>String(value??'').normalize('NFKC').toLocaleLowerCase();
export function filterOptions(options,query){
 const words=normalize(query).trim().split(/\s+/).filter(Boolean);
 return words.length?options.filter(option=>words.every(word=>normalize(option.searchText??option.label).includes(word))):options;
}

// Keep the selected option reachable when the initial list is capped.
export function visibleOptions(matches,value,limit=100){
 const visible=matches.slice(0,limit);
 const selected=matches.find(o=>o.value===value);
 return selected&&limit>0&&!visible.includes(selected)?[...visible.slice(0,-1),selected]:visible;
}
