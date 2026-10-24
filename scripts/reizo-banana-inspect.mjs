import {Client} from 'ssh2';
let cmd='';for await(const b of process.stdin)cmd+=b;
const c=new Client();c.on('ready',()=>c.exec(cmd.replace(/\r\n/g,'\n').trim()+'\n',(e,s)=>{if(e)throw e;s.pipe(process.stdout);s.stderr.pipe(process.stderr);s.on('close',code=>{c.end();process.exitCode=code})})).on('error',e=>{console.error(e.message);process.exitCode=1}).connect({host:'15.204.123.217',username:'ubuntu',password:process.env.REIZO_SSH_PASSWORD,readyTimeout:20000});
