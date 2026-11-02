// Read-only heuristic scan; emits locations/rule names, never matched values.
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const git=args=>{const r=spawnSync('git',args,{encoding:'utf8',maxBuffer:64*1024*1024});if(r.status!==0)throw Error('git_scan_failed');return r.stdout;};
const textPath=p=>/\.(?:js|mjs|cjs|ts|tsx|jsx|json|sql|md|ya?ml|toml|env|vars|txt|html|sh)$|(?:^|\/)\.env(?:\.|$)/i.test(p)&&!/(?:package-lock\.json|\/vendor\/)/.test(p);
const rules=[['private-key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['github-token',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ['supabase-secret',/\bsb_secret_[A-Za-z0-9_-]{20,}\b/]];
const hits=[];
function scan(content,location){
  for(const [rule,pattern] of rules)if(pattern.test(content))hits.push({location,rule});
  for(const jwt of content.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)||[]){
    try{if(JSON.parse(Buffer.from(jwt.split('.')[1],'base64url')).role==='service_role')hits.push({location,rule:'service-role-jwt'});}catch{}
  }
}
const files=git(['ls-files','-z']).split('\0').filter(p=>p&&textPath(p));
for(const file of files)scan(readFileSync(file,'utf8'),file);
const objects=new Map();
for(const line of git(['rev-list','--objects','--all']).trim().split('\n')){
  const split=line.indexOf(' ');if(split<0)continue;
  const path=line.slice(split+1);if(textPath(path))objects.set(line.slice(0,split),path);
}
const hashes=[...objects.keys()];
const result=spawnSync('git',['cat-file','--batch'],{input:hashes.join('\n')+'\n',maxBuffer:128*1024*1024});
if(result.status!==0)throw Error('history_scan_failed');
let offset=0,blobs=0;
while(offset<result.stdout.length){
  const end=result.stdout.indexOf(10,offset);if(end<0)break;
  const [hash,type,sizeString]=result.stdout.subarray(offset,end).toString().split(' '),size=Number(sizeString);
  if(!Number.isFinite(size))throw Error('invalid_git_object');
  offset=end+1;if(type==='blob'){scan(result.stdout.subarray(offset,offset+size).toString('utf8'),'history:'+hash.slice(0,12)+':'+objects.get(hash));blobs++;}offset+=size+1;
}
console.log(JSON.stringify({trackedTextFiles:files.length,historicalTextBlobs:blobs,findings:hits,scope:'heuristics: private keys, GitHub tokens, Supabase secret keys and service-role JWTs; not proof that all possible credentials are absent'},null,2));
if(hits.length)process.exitCode=1;
