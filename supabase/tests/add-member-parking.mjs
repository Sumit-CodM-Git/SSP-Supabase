import {resolveResidentFlatType,residentFlatTypeFields,ResidentFlatTypeError} from '../functions/_shared/resident-flat-type.ts';
// Run: node supabase/tests/add-member-parking.mjs
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {normalizeParkingSlot} from '../functions/_shared/contact.ts';
const contacts=[];
const savedMembers=[];
const flatId="00000000-0000-4000-8000-000000000001";
class Query {
  constructor(table){this.table=table;this.filters=[];this.op='read'}
  select(){return this}
  eq(key,value){this.filters.push(row=>row[key]===value);return this}
  ilike(key,value){this.filters.push(row=>String(row[key]).toLowerCase()===value.toLowerCase());return this}
  in(key,values){this.filters.push(row=>values.includes(row[key]));return this}
  is(){return this} limit(){return this}
  insert(value){this.op='insert';this.value=value;return this}
  update(value){this.op='update';this.value=value;return this}
  execute(){
    if(this.table==='SSP_Society') return [{society_id:'society',society_name:'Test Society',registration_number:'TEST'}];
    if(this.table==='SSP_Picklist_Config') return [];
    if(this.table==='SSP_Flat_Type') return [{flat_type_id:flatId,flat_type:'2 BHK',society:'society',active:true}].filter(row=>this.filters.every(fn=>fn(row)));
    if(this.table==='SSP_Society_User') {if(this.op==='insert'){const row={user_id:crypto.randomUUID(),...this.value};savedMembers.push(row);return [row]}return []}
    assert.equal(this.table,'SSP_Contact');
    if(this.op==='insert') {const row={contact_id:crypto.randomUUID(),...this.value};contacts.push(row);return [row]}
    const rows=contacts.filter(row=>this.filters.every(fn=>fn(row)));
    if(this.op==='update') rows.forEach(row=>Object.assign(row,this.value));
    return rows.map(row=>({...row}));
  }
  async single(){return {data:this.execute()[0]??null,error:null}}
  async maybeSingle(){return this.single()}
  then(resolve,reject){return Promise.resolve({data:this.execute(),error:null}).then(resolve,reject)}
}
let handler;
const source=stripTypeScriptTypes(readFileSync(new URL('../functions/add-members/index.ts',import.meta.url),'utf8').replace(/^import\s[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm,''));
new Function('Deno','createClient','requireAuth','corsHeaders','errorResponse','successResponse','parseRequestBody','normalizeParkingSlot','resolveResidentFlatType','residentFlatTypeFields','ResidentFlatTypeError',source)
  ({env:{get:()=>''},serve:fn=>handler=fn},()=>({from:table=>new Query(table)}),fn=>fn,{},
    (message,status=400)=>new Response(JSON.stringify({message}),{status}),
    data=>new Response(JSON.stringify({success:true,data})),req=>req.json(),normalizeParkingSlot,resolveResidentFlatType,residentFlatTypeFields,ResidentFlatTypeError);
const member={fullName:'Parking Test',phone:'9000000000',idProofType:'PAN Card',idProofNumber:'ABCDE1234F'};
async function run(changes={}) {
  const response=await handler(new Request('https://test',{method:'POST',body:JSON.stringify({registrationNumber:'TEST',memberType:'resident',memberData:[{...member,...changes}]})}),{user:{id:'admin'}});
  return {status:response.status,body:await response.json()};
}
let response=await run({parkingSlot:'  P-101  '});
assert.equal(response.status,200);
assert.equal(response.body.data.memberCreated[0].parkingSlot,'P-101');
assert.equal(contacts[0].parking_slot,'P-101');
assert.equal(contacts.length,1);
response=await run();
assert.equal(response.body.data.memberCreated[0].parkingSlot,'P-101');
assert.equal(contacts[0].parking_slot,'P-101');
response=await run({parking_slot:'P-102'});
assert.equal(response.body.data.memberCreated[0].parkingSlot,'P-102');
assert.equal(contacts[0].parking_slot,'P-102');
response=await run({parkingSlot:'P-103',parking_slot:'IGNORED'});
assert.equal(response.body.data.memberCreated[0].parkingSlot,'P-103');
for (const value of [null,'  ']) {
 response=await run({parkingSlot:value});
 assert.equal(response.body.data.memberCreated[0].parkingSlot,null);
 assert.equal(contacts[0].parking_slot,null);
}
const count=contacts.length;
response=await run({parkingSlot:101});
assert.equal(response.status,400);
assert.equal(contacts.length,count);
assert.equal(contacts[0].parking_slot,null);
response=await run({fullName:'Second Test',phone:'9000000001',parking_slot:'P-104'});
assert.equal(response.body.data.memberCreated[0].parkingSlot,'P-104');
assert.equal(contacts[1].parking_slot,'P-104');
console.log('Create-member parking tests passed: create, response, aliases, preserve, clear and invalid-input validation.');

response=await run({flatTypeId:flatId});assert.equal(response.status,200);assert.equal(savedMembers.at(-1).flat_type_id,flatId);assert.equal(response.body.data.memberCreated[0].flatType,'2 BHK');
response=await run({flatTypeId:null});assert.equal(response.status,200);assert.equal(savedMembers.at(-1).flat_type_id,null);assert.equal(response.body.data.memberCreated[0].flatType,null);
const beforeInvalid=savedMembers.length;response=await run({flatType:'Missing'});assert.equal(response.status,400);assert.equal(savedMembers.length,beforeInvalid);
