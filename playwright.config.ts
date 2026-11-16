import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./e2e',use:{baseURL:'http://localhost:3000',launchOptions:{executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'}},webServer:{command:'npm run dev',url:'http://localhost:3000',reuseExistingServer:true,timeout:30000}});
