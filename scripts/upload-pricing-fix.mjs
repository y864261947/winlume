import {Client} from 'ssh2';
const files=['src/lib/newapi/pricing.ts','src/lib/newapi/pricing.test.ts'];
const c=new Client();c.on('ready',()=>c.sftp(async(err,s)=>{if(err)throw err;try{for(const f of files){await new Promise((resolve,reject)=>s.fastPut(f,'/opt/reizo-build-banana-20260919/'+f,e=>e?reject(e):resolve()));console.log('uploaded',f)}}catch(e){console.error(e.message);process.exitCode=1}finally{c.end()}})).on('error',e=>{console.error(e.message);process.exitCode=1}).connect({host:'15.204.123.217',username:'ubuntu',password:process.env.REIZO_SSH_PASSWORD,readyTimeout:20000});
