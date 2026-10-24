import { Client } from 'ssh2';
let command='';for await(const b of process.stdin)command+=b;
const c=new Client();c.on('ready',()=>c.exec(command.replace(/\r\n/g,'\n').trim()+'\n',(e,s)=>{if(e)throw e;s.pipe(process.stdout);s.stderr.pipe(process.stderr);s.on('close',code=>{c.end();process.exitCode=code});})).on('error',e=>{console.error(e.message);process.exitCode=1}).connect({host:'15.204.82.213',username:'ubuntu',password:process.env.RELAY_PASS,readyTimeout:20000});
