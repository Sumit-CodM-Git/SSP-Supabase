import {visitorDateOtp} from "../functions/_shared/visitor-otp-date.ts";
// Run: node supabase/tests/visitor-creation-flow.mjs
import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {stripTypeScriptTypes} from 'node:module';
import {findVisitorDraft,isVisitorOtpDraft,canCompleteVisitorDetails,VisitorDraftError,canVerifyVisitorOtp,findPendingVisitorForOtp} from '../functions/_shared/visitor-drafts.ts';
const rows=[];
class Query {
 constructor(table){this.table=table;this.filters=[];this.op='read';this.columns=''}
 select(columns=''){this.columns=columns;return this}
 neq(field,value){this.filters.push(row=>row[field]!==value);return this}
 eq(field,value){this.filters.push(row=>row[field]===value);return this}
 ilike(field,value){this.filters.push(row=>String(row[field]).toLowerCase()===value.toLowerCase());return this}
 gte(field,value){this.filters.push(row=>Date.parse(row[field])>=Date.parse(value));return this}
 is(field,value){this.filters.push(row=>row[field]==value);return this}
 or(){this.filters.push(row=>['otp_pending','pending'].includes(String(row.visitor_status).toLowerCase()));return this}
 order(){return this}limit(n){this.max=n;return this}in(){return this}
 insert(value){this.op='insert';this.value=value;return this}update(value){this.op='update';this.value=value;return this}
 execute(){
  if(this.table==='SSP_Society')return[{society_id:'society'}];
  if(this.table==='SSP_Society_User')return[{user_id:'host',society:'society',unit_flat_number:'101'}];
  if(this.table==='SSP_Document')return[];
  if(this.op==='insert'){const row={check_in:new Date().toISOString(),...this.value,non_society_user_id:this.value.non_society_user_id??crypto.randomUUID(),created_at:new Date().toISOString()};rows.push(row);return[row]}
  let result=rows.filter(row=>this.filters.every(fn=>fn(row))).slice(0,this.max??1000);
  if(this.op==='update')result.forEach(row=>Object.assign(row,this.value));
  return result.map(row=>this.columns.includes('hosted_by:SSP_Society_User')?{...row,hosted_by:{user_id:row.hosted_by,unit_flat_number:'101',contact:{name:'Resident'}}}:{...row});
 }
 async single(){const result=this.execute();return{data:result[0]??null,error:null}}
 async maybeSingle(){return this.single()}
 then(resolve,reject){return Promise.resolve({data:this.execute(),error:null}).then(resolve,reject)}
}
const client={from:table=>new Query(table),rpc:async()=>({data:{VISITOR_OTP:true},error:null})};
const success=data=>new Response(JSON.stringify({success:true,data}));
const failure=(message,status=400)=>new Response(JSON.stringify({message}),{status});
const logger={info(){},warn(){},error(){}};
class Validator{validateRequired(){return this}isValid(){return true}}
function load(name){let handler;const src=stripTypeScriptTypes(readFileSync(new URL(`../functions/${name}/index.ts`,import.meta.url),'utf8').replace(/^import\s[\s\S]*?from\s+["'][^"']+["'];?\s*$/gm,''));
 new Function('Deno','createClient','requireAuth','corsHeaders','successResponse','errorResponse','createLogger','injectedLogger','sanitizeString','generateId','getCurrentTimestamp','Validator','findVisitorDraft','isVisitorOtpDraft','canCompleteVisitorDetails','VisitorDraftError','canVerifyVisitorOtp','findPendingVisitorForOtp','visitorDateOtp','contactParkingSlot',(name==='visitor-otp'?'const logger=injectedLogger;\n':'')+src)
 ({env:{get:()=>''},serve:fn=>handler=fn},()=>client,fn=>fn,{},success,failure,()=>logger,logger,s=>String(s).trim(),()=>crypto.randomUUID(),()=>new Date().toISOString(),Validator,findVisitorDraft,isVisitorOtpDraft,canCompleteVisitorDetails,VisitorDraftError,canVerifyVisitorOtp,findPendingVisitorForOtp,visitorDateOtp,()=>null);
 return async body=>{const response=await handler(new Request('https://test',{method:'POST',body:JSON.stringify(body)}),{user:{id:'guard'}});return{status:response.status,body:await response.json()}};
}
const otp=load('visitor-otp'),security=load('visitor-pass-operations');
const base={phoneNumber:'6454548484',societyUserId:'host'};
assert.equal((await otp({...base,otp:'123456'})).status,404);assert.equal(rows.length,0);
const generated=await otp(base);assert.equal(generated.status,200);const id=generated.body.data.visitorId;assert.equal(rows.length,1);assert.equal(rows[0].visitor_status,'otp_pending');assert.equal(rows[0].check_in,null);assert.equal(rows[0].check_out,null);assert.equal(rows[0].is_otp_verified,false);assert.equal(rows[0].one_time_password,visitorDateOtp());
assert.equal((await otp(base)).body.data.visitorId,id);assert.equal(rows.length,1);
assert.equal((await otp({...base,otp:'000000'})).status,400);assert.equal(rows.length,1);
const todayOtp=rows[0].one_time_password;rows[0].one_time_password=visitorDateOtp(new Date(Date.now()-86400000));
assert.equal((await otp({...base,otp:rows[0].one_time_password})).status,400);assert.equal(rows[0].is_otp_verified,false);rows[0].one_time_password=todayOtp;
const verified=await otp({...base,visitorId:id,otp:rows[0].one_time_password});assert.equal(verified.body.data.otpVerified,true);assert.equal(verified.body.data.visitorId,id);assert.equal(rows.length,1);assert.equal(rows[0].is_otp_verified,true);assert.equal(rows[0].visitor_status,'Pending');assert.equal(rows[0].visitor_approval_status,'pending');
const request={actionType:'REQUEST_APPROVAL',societyRegistrationNumber:'GZB-1234-ab',societyUserId:'host',visitorName:'Sumit Guest',phoneNumber:'6454548484',visitorId:id};
const submitted=await security(request);assert.equal(submitted.status,200,JSON.stringify(submitted.body));assert.equal(submitted.body.data.visitorId,id);assert.equal(rows.length,1);assert.equal(rows[0].name,'Sumit Guest');assert.equal(rows[0].phone_number,'6454548484');assert.equal(rows[0].visitor_approval_status,'pending');assert.equal(rows[0].is_otp_verified,true);
rows[0].visitor_approval_status='approved';rows[0].visitor_status='Approved';
assert.equal((await security(request)).status,200);assert.equal(rows.length,1);assert.equal(rows[0].visitor_approval_status,'approved');
assert.equal((await security({...request,phoneNumber:'9999999999'})).status,400);assert.equal(rows.length,1);
const next=await otp(base);assert.equal(rows.length,2);assert.notEqual(next.body.data.visitorId,id);
const noId={...request,visitorName:'Next Visit'};delete noId.visitorId;
assert.equal((await security(noId)).status,200);assert.equal(rows.length,2);assert.equal(rows[1].name,'Next Visit');
const missing={...noId};delete missing.phoneNumber;assert.equal((await security(missing)).status,400);assert.equal(rows.length,2);
assert.equal((await findVisitorDraft(client,'other-host','society',base.phoneNumber)),null);
console.log('OTP generation/resend/verification/final submission uses one record; phone aliases, retries, separate visits, validation and host scoping checks passed.');

const countBefore=rows.length;
const reversed={actionType:'REQUEST_APPROVAL',societyRegistrationNumber:'GZB-1234-ab',societyUserId:'host',visitorName:'Named First',phoneNumber:'7743255412'};
const first=await security(reversed);assert.equal(first.status,200);assert.equal(rows.length,countBefore+1);
const laterOtp=await otp({societyUserId:'host',phoneNumber:'7743255412'});assert.equal(laterOtp.status,200);assert.equal(laterOtp.body.data.visitorId,first.body.data.visitorId);assert.equal(rows.length,countBefore+1);
const stored=rows.find(row=>row.non_society_user_id===first.body.data.visitorId);
assert.equal((await otp({societyUserId:'host',phoneNumber:'7743255412',otp:stored.one_time_password})).body.data.otpVerified,true);
assert.equal(rows.length,countBefore+1);
console.log('Visitor-first then OTP flow also reuses one named record.');

const invited={non_society_user_id:crypto.randomUUID(),hosted_by:'host',society:'society',name:'Preapproved Guest',phone_number:'9650245511',role:'visitor',visitor_status:'expected',visitor_approval_status:'approved',pre_approved:true,is_otp_verified:false,created_at:new Date().toISOString()};
rows.push(invited);const invitationCount=rows.length;
assert.equal((await otp({societyUserId:'host',phoneNumber:invited.phone_number,visitorId:invited.non_society_user_id})).status,200);
assert.equal((await otp({societyUserId:'host',phoneNumber:invited.phone_number,visitorId:invited.non_society_user_id,otp:invited.one_time_password})).body.data.otpVerified,true);
assert.equal(invited.is_otp_verified,true);assert.equal(rows.length,invitationCount);
console.log('Existing pre-approved visitors can verify OTP using their existing visitorId.');

const fastPhone='7777777777';
const fastOtp=await otp({societyUserId:'host',phoneNumber:fastPhone});
const fast=rows.find(row=>row.non_society_user_id===fastOtp.body.data.visitorId);
await otp({societyUserId:'host',phoneNumber:fastPhone,visitorId:fast.non_society_user_id,otp:fast.one_time_password});
fast.visitor_status='Approved';fast.visitor_approval_status='approved';fast.pre_approved=true;
const completed=await security({actionType:'REQUEST_APPROVAL',societyRegistrationNumber:'GZB-1234-ab',societyUserId:'host',visitorId:fast.non_society_user_id,visitorName:'Quick Approval',phoneNumber:fastPhone});
assert.equal(completed.status,200);assert.equal(fast.name,'Quick Approval');assert.equal(fast.visitor_approval_status,'approved');assert.equal(fast.visitor_status,'Approved');
console.log('Completing details after a resident decision preserves that decision.');
