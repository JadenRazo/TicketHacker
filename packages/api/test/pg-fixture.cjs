// Optional real PostgreSQL fixture. Uses an already installed image, no pulls,
// no network, no persistent database volume. All DB bytes live in capped tmpfs.
const {spawn,execFileSync} = require('node:child_process');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {createRequire}=require('node:module');
const deps=process.env.TICKETHACKER_TEST_DEPS ? createRequire(path.join(process.env.TICKETHACKER_TEST_DEPS,'package.json')) : require;
async function postgresFixture() {
 if(!/^sha256:[a-f0-9]{64}$/.test(process.env.TICKETHACKER_TEST_PG_IMAGE || "")) throw Error("An installed immutable image ID is required");
 const {Pool}=deps('pg');
 const socket=fs.mkdtempSync(path.join(os.tmpdir(),'ticket-integrity-pg-'));fs.chmodSync(socket,0o777);
 const name=`ticket-integrity-test-${process.pid}`;
 const args=['run','--rm','--pull=never','--name',name,'--label','owner=job-ticket-integrity-tests',
  '--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges',
  '--memory','256m','--pids-limit','64','--cpus','0.5','--user','999:999',
  '--tmpfs','/pgdata:rw,noexec,nosuid,size=128m,uid=999,gid=999,mode=0700',
  '--mount',`type=bind,src=${socket},target=/socket`,process.env.TICKETHACKER_TEST_PG_IMAGE,
  'sh','-c',"initdb -D /pgdata -A trust -U fixture >/dev/null && exec postgres -D /pgdata -k /socket -c listen_addresses='' -c shared_buffers=16MB -c max_connections=10"];
 let output='';const child=spawn('docker',args,{stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',b=>{output=(output+b).slice(-10000);});child.stderr.on('data',b=>{output=(output+b).slice(-10000);});
 let stopped=false;
 const pool=new Pool({host:socket,user:'fixture',database:'postgres',password:'',port:5432,ssl:false,max:5,connectionTimeoutMillis:500});
 const close=async()=>{
  if(stopped)return;stopped=true;clearTimeout(deadline);await pool.end();
  try{execFileSync('docker',['stop','-t','2',name],{stdio:'pipe',timeout:10000});}catch{}
  let remaining='';
  for(let i=0;i<30;i++){
   remaining=execFileSync('docker',['container','ls','-aq','--filter',`name=^/${name}$`],{encoding:'utf8',timeout:10000}).trim();
   if(!remaining)break;
   await new Promise(r=>setTimeout(r,100));
  }
  if(remaining)throw Error(`Fixture cleanup failed; retained socket ${socket} for container ${name}`);
  if(child.exitCode===null)child.kill('SIGTERM');
  // Only the unique socket directory created above belongs to this fixture.
  fs.rmSync(socket,{recursive:true,force:true});
  console.log(JSON.stringify({fixture:name,removed:true,socketRemoved:!fs.existsSync(socket)}));
 };
 const deadline=setTimeout(()=>{void close();},90000);deadline.unref();
 try {
  let ready=false;
  for(let i=0;i<120;i++){
   if(child.exitCode!==null)throw Error(`fixture exited: ${output}`);
   try{await pool.query('SELECT 1');ready=true;break;}catch{await new Promise(r=>setTimeout(r,100));}
  }
  if(!ready)throw Error(`fixture startup deadline: ${output}`);
  const inspected=JSON.parse(execFileSync('docker',['inspect',name,'--format','{{json .HostConfig}}'],{encoding:'utf8',timeout:10000}));
  if(inspected.NetworkMode!=='none'||!inspected.ReadonlyRootfs||inspected.Memory!==268435456||!inspected.Tmpfs?.['/pgdata']?.includes('size=128m'))throw Error('Fixture resource isolation mismatch');
  console.log(JSON.stringify({fixture:name,image:process.env.TICKETHACKER_TEST_PG_IMAGE,inspected:{network:inspected.NetworkMode,readOnlyRoot:inspected.ReadonlyRootfs,memoryBytes:inspected.Memory,tmpfs:inspected.Tmpfs,pidsLimit:inspected.PidsLimit},socket}));
  return {pool,close,name,image:process.env.TICKETHACKER_TEST_PG_IMAGE};
 }catch(e){await close();throw e;}
}
module.exports={postgresFixture,deps};
