import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./e2e',use:{baseURL:'http://127.0.0.1:4178',channel:process.env.TODO_BROWSER_CHANNEL||'msedge',viewport:{width:1440,height:900}},webServer:{command:'npm run preview -- --host 127.0.0.1 --port 4178 --strictPort',url:'http://127.0.0.1:4178',reuseExistingServer:false},reporter:'list'});
