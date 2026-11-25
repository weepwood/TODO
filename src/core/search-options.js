// Shared search semantics: normalize full-width text, case and whitespace.
const normalize=value=>String(value??'').normalize('NFKC').toLocaleLowerCase();
export function filterOptions(options,query){
 const words=normalize(query).trim().split(/\s+/).filter(Boolean);
 return words.length?options.filter(option=>words.every(word=>normalize(option.searchText??option.label).includes(word))):options;
}
