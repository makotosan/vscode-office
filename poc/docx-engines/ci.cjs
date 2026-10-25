const fs=require('node:fs');
const path=require('node:path');
const {evaluate}=require('./evaluate.cjs');
const candidates=[process.env.POC_CHROME,'/usr/bin/google-chrome','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
 'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean);
const chromium=candidates.find(p=>fs.existsSync(p));
if(!chromium)throw new Error('A preinstalled Chromium is required for real dynamic fixtures');
evaluate({chromium,validator:path.join(__dirname,'validator/bin/Release/net8.0/Validator.dll')}).then(s=>{
 if(s.inputFailures.some(f=>!f.expected)||s.records.some(r=>Object.values(r.sdk||{}).some(stage=>Object.values(stage).some(s=>s.status==='error'))))process.exitCode=1;
 // Expected candidate defects are measurements, not a green product acceptance.
}).catch(e=>{console.error(e);process.exitCode=1;});
