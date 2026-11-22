import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('./api/search.js',import.meta.url),'utf8');
const {default:handler}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('Unexpected external call')};
const valid={jobTitle:'Accountant',location:'Kuwait',profileText:'',remote:false,easyApply:false,dateRange:'all'};
async function call(body=valid,method='POST'){const res={headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.code=n;return this},json(data){this.body=data;return this}};await handler({method,body},res);return res}
let passed=0;
async function test(name,fn){await fn();console.log('PASS',name);passed++}
await test('non-POST gets 405 and Allow header',async()=>{const r=await call(null,'GET');assert.equal(r.code,405);assert.equal(r.headers.Allow,'POST')});
for(const body of [null,[], 'text',{}, {...valid,jobTitle:[]},{...valid,jobTitle:'x'.repeat(201)}, {...valid,location:{}},{...valid,profileText:'short'},{...valid,profileText:'x'.repeat(12001)},{...valid,remote:'true'},{...valid,dateRange:'bad'}]) await test('invalid payload rejected',async()=>assert.equal((await call(body)).code,400));
assert.equal(calls,0);
delete process.env.GEMINI_API_KEY;
await test('missing key gives safe unavailable response',async()=>{const r=await call();assert.equal(r.code,503);assert.ok(!JSON.stringify(r.body).includes('GEMINI_API_KEY'))});
process.env.GEMINI_API_KEY='offline-dummy-key';
await test('provider error never leaks key or details',async()=>{globalThis.fetch=async(url,opts)=>{assert.ok(!String(url).includes('offline-dummy-key'));assert.equal(opts.headers['x-goog-api-key'],'offline-dummy-key');return {ok:false,status:400,json:async()=>({error:{message:'sensitive-provider-text offline-dummy-key'}})}};const r=await call();assert.equal(r.code,502);assert.ok(!JSON.stringify(r.body).includes('sensitive'));assert.ok(!JSON.stringify(r.body).includes('offline-dummy'))});
await test('valid JSON normalized',async()=>{globalThis.fetch=async()=>({ok:true,json:async()=>({candidates:[{content:{parts:[{text:JSON.stringify({suggestions:[{title:' Accountant ',reason:'Good fit',match_score:999,skills:['Excel',null,{},'Reporting']}]})}]}}]})});const r=await call();assert.equal(r.code,200);assert.equal(r.body.suggestions[0].title,'Accountant');assert.equal(r.body.suggestions[0].match_score,100);assert.deepEqual(r.body.suggestions[0].skills,['Excel','Reporting'])});
await test('malformed provider output safely rejected',async()=>{globalThis.fetch=async()=>({ok:true,json:async()=>({candidates:[{content:{parts:[{text:'not JSON'}]}}]})});assert.equal((await call()).code,502)});
await test('empty provider output safely rejected',async()=>{globalThis.fetch=async()=>({ok:true,json:async()=>({candidates:[]})});assert.equal((await call()).code,502)});
await test('abort yields 504 without real waiting',async()=>{const realSet=globalThis.setTimeout,realClear=globalThis.clearTimeout;globalThis.setTimeout=fn=>{queueMicrotask(fn);return 1};globalThis.clearTimeout=()=>{};globalThis.fetch=async(_url,opts)=>new Promise((_,reject)=>opts.signal.addEventListener('abort',()=>reject(new Error('timeout'))));try{assert.equal((await call()).code,504)}finally{globalThis.setTimeout=realSet;globalThis.clearTimeout=realClear}});
console.log('API TESTS',passed);
