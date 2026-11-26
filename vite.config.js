import {readFileSync} from 'node:fs';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {generateWorker} from './scripts/pwa.mjs';
export default defineConfig({plugins:[react(),{name:'todo-isolated-audit-fixtures',apply:'serve',configureServer(server){
 if(process.env.VITE_TODO_IDB_PILOT!=='1')return;
 server.middlewares.use('/audit-legacy-sw.js',(_req,res)=>{res.setHeader('Content-Type','application/javascript');res.setHeader('Cache-Control','no-store');res.end(readFileSync(new URL('./e2e/fixtures/audit-legacy-sw.js',import.meta.url)))});
 server.middlewares.use('/final-audit-probe',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Audit</title>')});
}},{name:'todo-pwa',apply:'build',closeBundle:()=>generateWorker()}],base:'./',build:{rollupOptions:{input:{main:'index.html',capture:'capture.html'},output:{manualChunks(id){if(/\/node_modules\/(react|react-dom|scheduler)\//.test(id))return 'react-core';if(id.includes('/node_modules/@tiptap/')||/\/node_modules\/prosemirror-[^/]+\//.test(id)||id.includes('/node_modules/orderedmap/')){if(/prosemirror-|orderedmap|@tiptap\/pm\//.test(id))return 'editor-model';return 'editor-extensions'}if(id.includes('/node_modules/@supabase/'))return 'supabase';if(id.includes('/node_modules/react-day-picker/')||id.includes('/node_modules/date-fns/'))return 'date-picker';}}}}});
