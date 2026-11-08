// Generated backup artifacts only. No restores into live tables, no secret output.
import {readFile,writeFile,mkdir,open,stat,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {homedir} from 'node:os';
import {randomBytes} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {supabaseClient} from '../lib/supabase-catalog.mjs';
import {sealBackup,openBackup,restoreCheckSQL,checksum} from '../lib/backup.mjs';
const folder=join(homedir(),'.config','karisan','backups'),keyPath=join(homedir(),'.config','karisan','backup-recovery.key');
const [command,file]=process.argv.slice(2);
await mkdir(folder,{recursive:true,mode:0o700});
async function key(create=false){
  if(create){try{const f=await open(keyPath,'wx',0o600);await f.writeFile(randomBytes(32));await f.close();}catch(e){if(e.code!=='EEXIST')throw e;}}
  if((await stat(keyPath)).mode&0o077)throw Error('Recovery key must have mode 0600');return readFile(keyPath);
}
if(command==='capture'){
  const env=Object.fromEntries((await readFile('.dev.vars','utf8')).split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1).trim().replace(/^"|"$/g,'')];})),call=supabaseClient(env);
  const snapshot=await(await call('/rest/v1/rpc/server_backup_snapshot',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json(),images=[];
  for(const path of new Set(snapshot.tables.products.map(p=>p.image_url).filter(p=>p?.startsWith('assets/')))){
    if(!/^assets\/[a-zA-Z0-9_.-]+$/.test(path))throw Error('Invalid local asset');
    const bytes=await readFile(resolve('public',path));images.push({path,sha256:checksum(bytes),data:bytes.toString('base64')});
  }
  for(let offset=0;;offset+=100){
    const objects=await(await call('/storage/v1/object/list/product-images',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefix:'',limit:100,offset,sortBy:{column:'name',order:'asc'}})})).json();
    for(const object of objects){if(!object.id)throw Error('Nested bucket directory requires explicit backup support');
      const response=await call('/storage/v1/object/product-images/'+encodeURIComponent(object.name));const bytes=Buffer.from(await response.arrayBuffer());
      images.push({path:'product-images/'+object.name,sha256:checksum(bytes),data:bytes.toString('base64')});}
    if(objects.length<100)break;
  }
  const schemaMigrations=[];for(const name of (await readdir('supabase/migrations')).filter(n=>/^\d+.*\.sql$/.test(n)).sort()){
    const sql=await readFile(join('supabase/migrations',name),'utf8');schemaMigrations.push({name,sql,sha256:checksum(Buffer.from(sql))});}
  const bundle={snapshot,images,schemaMigrations,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceDirty:Boolean(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim()),project:new URL(env.SUPABASE_URL).hostname};
  const secret=await key(true),encrypted=sealBackup(bundle,secret);openBackup(encrypted,secret);
  const path=join(folder,new Date().toISOString().replaceAll(':','-')+'-'+randomBytes(3).toString('hex')+'.ksbak');
  await writeFile(path,encrypted,{flag:'wx',mode:0o600});
  console.log(JSON.stringify({backup:path,encrypted:true,images:images.length,tables:Object.fromEntries(Object.entries(snapshot.tables).map(([t,rows])=>[t,rows.length])),sha256:checksum(encrypted),recoveryKeyFile:keyPath}));
}else if(['verify','restore-check-sql'].includes(command)&&file){
  const bundle=openBackup(await readFile(resolve(file)),await key());
  if(command==='verify')console.log(JSON.stringify({verified:true,images:bundle.images.length,snapshotAt:bundle.snapshot.createdAt}));
  else{
    const path=join(folder,'restore-check-'+randomBytes(6).toString('hex')+'.sql');
    await writeFile(path,restoreCheckSQL(bundle),{flag:'wx',mode:0o600});console.log(path);
  }
}else throw Error('Use capture | verify <backup> | restore-check-sql <backup>');
