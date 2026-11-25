import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {generateWorker} from './scripts/pwa.mjs';
export default defineConfig({plugins:[react(),{name:'todo-pwa',apply:'build',closeBundle:()=>generateWorker()}],base:'./',build:{rollupOptions:{output:{manualChunks(id){if(id.includes('/node_modules/@supabase/'))return 'supabase';if(id.includes('/node_modules/react-day-picker/')||id.includes('/node_modules/date-fns/'))return 'date-picker';}}}}});
