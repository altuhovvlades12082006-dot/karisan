import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {backupTables,sealBackup,openBackup,restoreCheckSQL,checksum} from '../lib/backup.mjs';
const fixture=()=>({snapshot:{format:1,tables:Object.fromEntries(backupTables.map(t=>[t,[]]))},images:[{path:'test.webp',data:Buffer.from('fixture').toString('base64'),sha256:checksum(Buffer.from('fixture'))}]});
test('backup encrypts/authenticates data and rejects modified ciphertext/wrong key',()=>{
  const key=randomBytes(32),value=fixture(),bytes=sealBackup(value,key);
  assert.deepEqual(openBackup(bytes,key),value);assert.ok(!bytes.includes(Buffer.from('test.webp')));
  assert.throws(()=>openBackup(bytes,randomBytes(32)));const changed=Buffer.from(bytes);changed[40]^=1;assert.throws(()=>openBackup(changed,key));
});
test('backup verifies image hashes and completeness',()=>{
  const key=randomBytes(32),value=fixture();value.images[0].sha256='bad';assert.throws(()=>openBackup(sealBackup(value,key),key),/checksum/);
  delete value.snapshot.tables.orders;assert.throws(()=>openBackup(sealBackup(value,key),key),/Incomplete/);
});
test('restore rehearsal uses isolated schema, RLS, content comparison, FKs and rollback',()=>{
  const value=fixture();value.snapshot.tables.products=[{id:"quote'example",names:{uk:'QA'}}];
  const sql=restoreCheckSQL(value,'qa_restore_fixture');
  for(const text of ['create schema qa_restore_fixture','enable row level security','is distinct from','pg_get_constraintdef','rollback;'])assert.ok(sql.includes(text));
  assert.doesNotMatch(sql,/\b(?:insert into|update|delete from|truncate|drop table) public\./i);
  assert.ok(sql.includes("quote''example"));assert.throws(()=>restoreCheckSQL(value,'public'));
});
test('snapshot RPC is stable and service-only',()=>{
  const sql=readFileSync(new URL('../supabase/migrations/013_application_backup.sql',import.meta.url),'utf8');
  assert.match(sql,/stable security definer/);assert.match(sql,/from public,anon,authenticated/);assert.match(sql,/to service_role/);
});
