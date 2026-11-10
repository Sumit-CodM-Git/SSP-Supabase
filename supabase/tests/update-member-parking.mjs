// Run: node supabase/tests/update-member-parking.mjs
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {normalizeParkingSlot} from '../functions/_shared/contact.ts';
const memberId='41526542-03fa-42e3-b63a-62a4947496f6';
const member={user_id:memberId,contact:'contact',society:'society'};
const contact={contact_id:'contact',name:'Parking testing',phone:'9000000000',parking_slot:'OLD'};
let handler,fail=false,transform=false,writes=0;
class Query {
 constructor(table){this.table=table;this.filters=[]}
 select(){return this} eq(key,value){this.filters.push(row=>row[key]===value);return this}
 update(value){this.value=value;return this}
 execute(){
  const row=this.table==='SSP_Society_User'?member:contact;
  if(!this.filters.every(fn=>fn(row))) return {data:null,error:null};
  if(this.value){
   if(fail) return {data:null,error:{message:'Simulated database failure'}};
   writes++;Object.assign(row,this.value);
   if(transform && this.value.parking_slot) row.parking_slot='DB-'+this.value.parking_slot;
  }
  return {data:{...row},error:null};
 }
 async single(){return this.execute()} async maybeSingle(){return this.execute()}
 then(resolve,reject){return Promise.resolve(this.execute()).then(resolve,reject)}
}
const client={from:table=>new Query(table),auth:{admin:{listUsers:async()=>({data:{users:[]}})}}};
const source=stripTypeScriptTypes(readFileSync(new URL('../functions/update-member/index.ts',import.meta.url),'utf8').replace('constructor(message: string, public field?: string) {\n    super(message);', 'constructor(message: string, field?: string) {\n    super(message); this.field = field;').replace(/^import\s[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm,''));
new Function('Deno','createClient','requireAuth','corsHeaders','errorResponse','successResponse','parseRequestBody','normalizeParkingSlot',source)
 ({env:{get:()=>''},serve:fn=>handler=fn},()=>client,fn=>fn,{},
 (message,status=400)=>new Response(JSON.stringify({message}),{status}),
 data=>new Response(JSON.stringify({success:true,data})),req=>req.json(),normalizeParkingSlot);
async function run(updatedData){
 const response=await handler(new Request('https://test',{method:'POST',body:JSON.stringify({memberId,updatedData})}),{user:{id:'admin'}});
 return {status:response.status,body:await response.json()};
}
let response=await run({parkingSlot:'  DEMO-P-00009  '});
assert.equal(response.status,200);assert.equal(contact.parking_slot,'DEMO-P-00009');
assert.equal(response.body.data.updatedMember.updatedData.parkingSlot,contact.parking_slot);
response=await run({parking_slot:'P-2'});
assert.equal(contact.parking_slot,'P-2');assert.equal(response.body.data.updatedMember.updatedData.parkingSlot,'P-2');
response=await run({fullName:'Renamed'});assert.equal(response.status,200);assert.equal(contact.parking_slot,'P-2');
for(const value of [null,' ']){response=await run({parkingSlot:value});assert.equal(response.status,200);assert.equal(contact.parking_slot,null);assert.equal(response.body.data.updatedMember.updatedData.parkingSlot,null)}
const before=writes;response=await run({parkingSlot:123,status:true});assert.equal(response.status,400);assert.equal(writes,before);
member.contact=null;response=await run({parkingSlot:'X',status:true});assert.equal(response.status,400);assert.equal(writes,before);member.contact='contact';
fail=true;response=await run({parkingSlot:'FAIL'});assert.equal(response.status,500);assert.notEqual(response.body.success,true);assert.equal(contact.parking_slot,null);fail=false;
transform=true;response=await run({parkingSlot:'P-3'});assert.equal(response.status,200);assert.equal(response.body.data.updatedMember.updatedData.parkingSlot,'DB-P-3');
console.log('Update-member parking tests passed: database writes, saved-value response, aliases, preserve/clear, invalid input, missing contact and database failure.');
