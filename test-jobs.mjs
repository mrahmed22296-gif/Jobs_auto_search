import assert from 'node:assert/strict';
import fs from 'node:fs';
const code=fs.readFileSync(new URL('./api/jobs.js',import.meta.url),'utf8');
const {default:handler}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
globalThis.fetch=async()=>{throw new Error('Readiness route must not fetch provider data')};
const response=()=>({headers:{},setHeader(key,value){this.headers[key]=value},status(code){this.code=code;return this},json(data){this.body=data;return this}});
let passed=0;function test(name,fn){fn();passed++;console.log('PASS',name)}
let r=response();handler({method:'GET'},r);
test('readiness route returns explicit not-connected state',()=>{assert.equal(r.code,200);assert.equal(r.body.status,'not_connected')});
test('route has no fabricated jobs or connected source',()=>{assert.deepEqual(r.body.jobs,[]);assert.deepEqual(r.body.sources,[])});
test('requested market scope is six Gulf countries, not asserted coverage',()=>{assert.deepEqual(r.body.requestedMarkets,['KW','SA','AE','QA','BH','OM']);assert.ok(!('supportedCountries' in r.body))});
test('readiness response is not cached as a job result',()=>assert.equal(r.headers['Cache-Control'],'no-store'));
r=response();handler({method:'POST'},r);
test('mutating method rejected',()=>{assert.equal(r.code,405);assert.equal(r.headers.Allow,'GET')});
console.log('READINESS TESTS',passed);
