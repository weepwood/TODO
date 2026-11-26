import fs from 'node:fs';import zlib from 'node:zlib';
const html=fs.readFileSync('dist/index.html','utf8'),files=[...new Set([...html.matchAll(/(?:src|href)="\.\/(assets\/[^"]+\.(?:js|css))"/g)].map(m=>m[1]))];
const assets=files.map(file=>{const data=fs.readFileSync('dist/'+file);return {file,bytes:data.length,gzip:zlib.gzipSync(data).length}});
console.log(JSON.stringify({assets,jsBytes:assets.filter(a=>a.file.endsWith('.js')).reduce((s,a)=>s+a.bytes,0),jsGzip:assets.filter(a=>a.file.endsWith('.js')).reduce((s,a)=>s+a.gzip,0),cssBytes:assets.filter(a=>a.file.endsWith('.css')).reduce((s,a)=>s+a.bytes,0)},null,2));
