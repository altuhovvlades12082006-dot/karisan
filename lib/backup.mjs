import {createCipheriv,createDecipheriv,randomBytes,createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
export const backupTables=['admin_profiles','categories','products','product_variants','promotions','store_settings','store_customers','orders','order_items','crm_actions','order_transactions','stock_movements','sandbox_payment_events'];
export const checksum=bytes=>createHash('sha256').update(bytes).digest('hex');
export function sealBackup(bundle,key){
  if(key.length!==32)throw Error('Invalid recovery key');
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  const ciphertext=Buffer.concat([cipher.update(gzipSync(Buffer.from(JSON.stringify(bundle)))),cipher.final()]);
  return Buffer.concat([Buffer.from('KSBAK001'),iv,cipher.getAuthTag(),ciphertext]);
}
export function openBackup(bytes,key){
  if(bytes.subarray(0,8).toString()!=='KSBAK001'||key.length!==32)throw Error('Invalid backup');
  const decipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(8,20));decipher.setAuthTag(bytes.subarray(20,36));
  const bundle=JSON.parse(gunzipSync(Buffer.concat([decipher.update(bytes.subarray(36)),decipher.final()])));
  if(bundle.snapshot?.format!==1||backupTables.some(t=>!Array.isArray(bundle.snapshot.tables[t])))throw Error('Incomplete snapshot');
  for(const image of bundle.images||[])if(checksum(Buffer.from(image.data,'base64'))!==image.sha256)throw Error('Image checksum mismatch');
  const paths=new Set((bundle.images||[]).map(image=>image.path));
  for(const product of bundle.snapshot.tables.products){const path=product.image_url?.replace(/^\/media\//,'product-images/');if(path&&(path.startsWith('assets/')||path.startsWith('product-images/'))&&!paths.has(path))throw Error('Referenced product image missing');}
  for(const migration of bundle.schemaMigrations||[])if(checksum(Buffer.from(migration.sql))!==migration.sha256)throw Error('Migration checksum mismatch');
  return bundle;
}
const literal=value=>"'"+JSON.stringify(value).replaceAll("'","''")+"'::jsonb";
export function restoreCheckSQL(bundle,schema='qa_restore_'+randomBytes(6).toString('hex')){
  if(!/^qa_restore_[a-z0-9]{1,30}$/.test(schema))throw Error('QA schema required');
  const statements=['-- Restore rehearsal only: creates an isolated schema, compares every row and FK, then ROLLBACK.', 'begin;','set local search_path=pg_catalog,pg_temp;',`create schema ${schema};`,`revoke all on schema ${schema} from public,anon,authenticated;`];
  for(const table of backupTables){
    const rows=bundle.snapshot.tables[table];if(!Array.isArray(rows))throw Error('Incomplete snapshot');
    statements.push(`create table ${schema}.${table} (like public.${table} including all);`,`alter table ${schema}.${table} enable row level security;`,
      `insert into ${schema}.${table} select * from jsonb_populate_recordset(null::${schema}.${table},${literal(rows)});`,
      `do $check$ begin if (select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) from ${schema}.${table} t) is distinct from (select coalesce(jsonb_agg(x order by x::text),'[]'::jsonb) from jsonb_array_elements(${literal(rows)}) x) then raise exception 'Restore mismatch: ${table}'; end if; end $check$;`);
  }
  statements.push(`do $fk$ declare c record; begin
    for c in select r.relname,k.conname,pg_get_constraintdef(k.oid) as definition
      from pg_constraint k join pg_class r on r.oid=k.conrelid join pg_namespace n on n.oid=r.relnamespace
      where n.nspname='public' and k.contype='f' and r.relname=any(array[${backupTables.map(t=>"'"+t+"'").join(',')}]) loop
      execute format('alter table ${schema}.%I add constraint %I %s',c.relname,c.conname,replace(c.definition,'REFERENCES public.','REFERENCES ${schema}.'));
    end loop;
  end $fk$;`, 'rollback;',"select 'PASS: application snapshot restored, row content and foreign keys checked; rehearsal rolled back' as result;");
  return statements.join('\n');
}
