import assert from 'node:assert/strict';
import {handleProfileImages,profileImageUrls,profileImageUrl,authorizedProfileImageUrls,PROFILE_BUCKET,PROFILE_IMAGE_MAX_BYTES} from '../functions/_shared/profile-images.ts';
const id=()=>crypto.randomUUID();
const society=id(),otherSociety=id(),self=id(),admin=id(),guard=id(),other=id(),outside=id(),vendor=id(),visitor=id(),servant=id(),staff=id();
const tables={
 SSP_Society_User:[
  {user_id:self,society,role:['resident'],status:true},
  {user_id:admin,society,role:['admin','resident'],status:true},
  {user_id:guard,society,role:['security'],status:true},
  {user_id:other,society,role:['resident'],status:true},
  {user_id:outside,society:otherSociety,role:['resident'],status:true},
 ],
 SSP_Non_Society_User:[{non_society_user_id:vendor,society,role:'vendor'},{non_society_user_id:visitor,society,role:'visitor'}],
 SSP_Servant:[{servant_id:servant,society}],SSP_Society_Staff:[{staff_id:staff,society_id:society,staff_role:'security'}],
 SSP_Profile_Image:[],
};
let dbFailure=false,storageFailure=false,signedReads=0,writes=0;
const files=new Map();
class Query {
 constructor(table){assert.ok(table in tables,'No legacy document table may be touched');this.table=table;this.filters=[];}
 select(){return this;}eq(k,v){this.filters.push(r=>r[k]===v);return this;}in(k,values){this.filters.push(r=>values.includes(r[k]));return this;}
 upsert(value,options){assert.equal(this.table,'SSP_Profile_Image');assert.equal(options.onConflict,'owner_type,owner_id');this.value=value;return this;}
 result(){
  if(dbFailure&&this.table==='SSP_Profile_Image')return {data:null,error:{message:'unavailable'}};
  if(this.value){writes++;const list=tables.SSP_Profile_Image;const existing=list.find(r=>r.owner_type===this.value.owner_type&&r.owner_id===this.value.owner_id);if(existing)Object.assign(existing,this.value);else list.push({...this.value});return {data:{updated_at:'2026-11-16T10:00:00Z'},error:null};}
  return {data:tables[this.table].filter(r=>this.filters.every(f=>f(r))),error:null};
 }
 async maybeSingle(){const r=this.result();return {...r,data:r.data?.[0]??null};}
 async single(){return this.result();}
 then(resolve,reject){return Promise.resolve(this.result()).then(resolve,reject);}
}
const client={from:table=>new Query(table),storage:{from(bucket){
 assert.equal(bucket,PROFILE_BUCKET,'Profile storage must be isolated from existing uploads');
 return {
  async createSignedUploadUrl(key){return {data:{signedUrl:'https://storage.test/upload/'+key},error:null};},
  async list(folder,{search}){return {data:[...files].filter(([key])=>key===folder+'/'+search).map(([key,f])=>({id:'object',name:key.split('/').at(-1),metadata:{size:f.bytes.length,mimetype:f.mime}})),error:storageFailure?{message:'unavailable'}:null};},
  async download(key){return {data:new Blob([files.get(key).bytes]),error:null};},
  async createSignedUrl(key,ttl){assert.equal(ttl,900);return {data:{signedUrl:'https://storage.test/display/'+key},error:null};},
  async createSignedUrls(keys,ttl){signedReads++;assert.equal(ttl,900);return {data:keys.map(path=>({path,...(files.has(path)?{signedUrl:'https://storage.test/display/'+path}:{error:'Object not found'})})),error:storageFailure?{message:'unavailable'}:null};},
 };
}}};
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1XcAAAAASUVORK5CYII=','base64');
async function call(actor,body){const res=await handleProfileImages(new Request('https://test',{method:'POST',body:JSON.stringify(body)}),actor,client);return {status:res.status,body:await res.json()};}
const prepare=(ownerType,ownerId,extra={})=>({action:'PREPARE_UPLOAD',ownerType,ownerId,fileName:'avatar.png',fileType:'image/png',fileSize:png.length,...extra});
let result=await call(self,prepare('society_user',self));assert.equal(result.status,200);assert.equal(result.body.data.uploadStatus,'pending_upload');
const key=result.body.data.upload.objectKey;assert.ok(key.startsWith(`${society}/society_user/${self}/`));assert.equal(result.body.data.upload.method,'PUT');assert.equal(writes,0);
const confirm={action:'CONFIRM_UPLOAD',ownerType:'society_user',ownerId:self,objectKey:key,fileName:'avatar.png'};
assert.equal((await call(self,confirm)).status,409);assert.equal(writes,0,'Preparing or missing uploads must not save a reference');
files.set(key,{bytes:png,mime:'image/png'});
result=await call(self,confirm);assert.equal(result.status,200);assert.equal(result.body.data.uploadStatus,'uploaded');assert.ok(result.body.data.profileImageUrl.includes('/display/'));assert.equal(result.body.data.image.fileSize,png.length);
assert.equal(tables.SSP_Profile_Image.length,1);
assert.equal((await call(self,confirm)).status,200);assert.equal(tables.SSP_Profile_Image.length,1,'Confirmation retries must not duplicate profiles');
const foreignKey=`${otherSociety}/society_user/${outside}/${id()}.png`;
files.set(foreignKey,{bytes:png,mime:'image/png'});
tables.SSP_Profile_Image.push({owner_type:'society_user',owner_id:outside,society:otherSociety,object_key:foreignKey});
result=await call(self,{action:'FETCH',owners:[{ownerType:'society_user',ownerId:self},{ownerType:'society_user',ownerId:outside}]});
assert.equal(result.status,200);assert.ok(result.body.data.images[0].profileImageUrl);assert.equal(result.body.data.images[1].profileImageUrl,null);
assert.equal((await authorizedProfileImageUrls(client,self,otherSociety,[{ownerType:'society_user',ownerId:outside}])).size,0,'Legacy readers must not sign cross-society images');
const selfRecord=tables.SSP_Society_User.find(r=>r.user_id===self);
selfRecord.deleted_at='2026-11-16T10:00:00Z';
assert.equal((await call(admin,{action:'FETCH',ownerType:'society_user',ownerId:self})).body.data.images[0].profileImageUrl,null);
delete selfRecord.deleted_at;
selfRecord.society=otherSociety;
assert.equal(await profileImageUrl(client,society,'society_user',self),null,'Moved users must not expose their image to their former society');
selfRecord.society=society;

assert.equal((await call(self,prepare('society_user',other))).status,403);
assert.equal((await call(admin,prepare('society_user',outside))).status,403);
for(const [type,owner] of [['society_user',other],['non_society_user',vendor],['non_society_user',visitor],['servant',servant],['society_staff',staff]])assert.equal((await call(admin,prepare(type,owner))).status,200);
assert.equal((await call(guard,prepare('non_society_user',visitor))).status,200);
assert.equal((await call(guard,prepare('servant',servant))).status,200);
assert.equal((await call(guard,prepare('non_society_user',vendor))).status,403);
assert.equal((await call(vendor,prepare('non_society_user',vendor))).status,200);
assert.equal((await call(servant,prepare('servant',servant))).status,200);
assert.equal((await call(staff,prepare('society_staff',staff))).status,200);
assert.equal((await call(id(),prepare('society_user',self))).status,403);
for(const extra of [{fileType:'image/svg+xml'},{fileSize:0},{fileSize:PROFILE_IMAGE_MAX_BYTES+1},{fileSize:'123'},{fileName:'../avatar.png'}])assert.equal((await call(self,prepare('society_user',self,extra))).status,400);
assert.equal((await call(self,{...confirm,ownerId:other})).status,403);
assert.equal((await call(self,{...confirm,objectKey:key.replace(self,other)})).status,400);
assert.equal((await call(self,{...confirm,objectKey:key+'/../photo.png'})).status,400);
const previous={...tables.SSP_Profile_Image[0]},beforeWrites=writes;
files.set(key,{bytes:Buffer.from('not an image'),mime:'image/png'});assert.equal((await call(self,confirm)).status,400);assert.equal(writes,beforeWrites);assert.deepEqual(tables.SSP_Profile_Image[0],previous);
files.set(key,{bytes:png,mime:'image/jpeg'});assert.equal((await call(self,confirm)).status,400);
files.set(key,{bytes:png,mime:'image/png'});storageFailure=true;assert.equal((await call(self,confirm)).status,503);storageFailure=false;

// New profile photo lookup must never use legacy visitor/servant attachments.
assert.ok(await profileImageUrl(client,society,'society_user',self));
files.delete(key);assert.equal(await profileImageUrl(client,society,'society_user',self),null);
dbFailure=true;assert.equal((await profileImageUrls(client,society,[{ownerType:'society_user',ownerId:self}])).size,0);
assert.equal((await call(self,{action:'FETCH',ownerType:'society_user',ownerId:self})).status,503);dbFailure=false;
const count=signedReads;assert.equal((await profileImageUrls(client,society,[])).size,0);assert.equal(signedReads,count);
assert.equal((await call(self,{action:'FETCH',owners:[]})).status,400);
assert.equal((await call(self,{action:'FETCH',owners:Array(51).fill({ownerType:'society_user',ownerId:self})})).status,400);
console.log('Profile images passed: upload/confirm/fetch, all identities, tenant and write permissions, retries, missing/corrupt files, MIME/size/path checks, no premature database references, isolated storage, and fail-soft optional reads.');
