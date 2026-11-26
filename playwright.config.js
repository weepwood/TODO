import {defineConfig} from '@playwright/test';
const browserName=process.env.TODO_BROWSER_ENGINE||'chromium';
if(!['chromium','firefox','webkit'].includes(browserName))throw Error('Unsupported TODO_BROWSER_ENGINE');
export default defineConfig({testDir:'./e2e',use:{baseURL:'http://127.0.0.1:4178',browserName,...(browserName==='chromium'?{channel:process.env.TODO_BROWSER_CHANNEL||'msedge'}:{}),viewport:{width:1440,height:900},storageState:{cookies:[],origins:[{origin:'http://127.0.0.1:4178',localStorage:[{name:'todo-detail-mode-v1',value:'edit'}]}]}},webServer:{command:'npm run preview -- --host 127.0.0.1 --port 4178 --strictPort',url:'http://127.0.0.1:4178',reuseExistingServer:false},reporter:'list'});
