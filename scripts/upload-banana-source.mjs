import {Client} from 'ssh2';
const c=new Client();
c.on('ready',()=>c.sftp((err,sftp)=>{if(err)throw err;sftp.fastPut('output/banana-source-base.tar','/tmp/reizo-banana-source-20260919.tar',(err)=>{c.end();if(err){console.error(err.message);process.exitCode=1;}else console.log('Uploaded isolated Banana source archive');});})).on('error',e=>{console.error(e.message);process.exitCode=1;}).connect({host:'15.204.123.217',username:'ubuntu',password:process.env.REIZO_SSH_PASSWORD,readyTimeout:20000});
