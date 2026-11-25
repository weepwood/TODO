import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],base:'./',build:{rollupOptions:{output:{manualChunks(id){if(id.includes('/node_modules/@supabase/'))return 'supabase';if(id.includes('/node_modules/react-day-picker/')||id.includes('/node_modules/date-fns/'))return 'date-picker';}}}}});
