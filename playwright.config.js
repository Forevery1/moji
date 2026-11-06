import{defineConfig}from'@playwright/test';
export default defineConfig({testDir:'./tests',testMatch:'**/*.spec.js',timeout:30000,use:{baseURL:'http://127.0.0.1:5188',headless:true,viewport:{width:1488,height:1058}},projects:[{name:'chrome',use:{browserName:'chromium',channel:'chrome'}},{name:'webkit',use:{browserName:'webkit'}}],workers:1,reporter:'list'});
