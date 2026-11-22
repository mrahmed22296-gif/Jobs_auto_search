const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {JSDOM} = require('jsdom');
const html = fs.readFileSync(require('node:path').join(__dirname, 'index.html'), 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
const dom = new JSDOM(html, {url:'http://localhost:8888', runScripts:'outside-only'});
const w = dom.window;
w.firebase = {initializeApp(){},auth(){return {getRedirectResult:()=>Promise.resolve(null),onAuthStateChanged(cb){cb(null)}}}};
w.pdfjsLib = {GlobalWorkerOptions:{}};
w.eval(script);
w.eval('currentUser = {uid:"offline-test"};');
let passed=0;
function test(name, fn){fn(); passed++; console.log('PASS', name)}
function run(s){return w.eval(s)}
test('valid LinkedIn job URLs accepted',()=>assert.ok(run('linkedInJobUrl("https://www.linkedin.com/jobs/view/12345/?trk=x")')));
for (const url of ['https://linkedin.com.evil.example/jobs/view/1','https://evil-linkedin.com/jobs/view/1','http://linkedin.com/jobs/view/1','javascript:alert(1)','https://user:password@linkedin.com/jobs/view/1','https://linkedin.com:8443/jobs/view/1','https://linkedin.com/in/person']) {
 test('reject unsafe URL '+url,()=>assert.equal(w.linkedInJobUrl(url),null));
}
test('formula neutralized in CSV',()=>assert.equal(w.csvCell('=1+1'),'"\'=1+1"'));
test('whitespace formulas neutralized',()=>assert.equal(w.csvCell('  @SUM(A1)'),'"\'  @SUM(A1)"'));
test('ordinary CSV escaping preserved',()=>assert.equal(w.csvCell('hello "world"'),'"hello ""world"""'));
const key=run('storageKey("applications")');
test('malformed data does not crash renderer',()=>{w.localStorage.setItem(key,'{"oops":true}');w.renderApplications();assert.equal(w.document.querySelector('#navCount').textContent,'0')});
test('malformed existing data is not overwritten',()=>{assert.equal(w.applicationsForWrite(),null);assert.equal(w.localStorage.getItem(key),'{"oops":true}')});
const valid={id:'safe',title:'<img src=x onerror=alert(1)>',company:'Example',url:'https://www.linkedin.com/jobs/view/123',status:'محفوظة',createdAt:'2026-11-22T12:00:00Z'};
test('invalid stored rows skipped without deletion',()=>{w.localStorage.setItem(key,JSON.stringify([null,{},valid,{...valid,id:'evil',url:'javascript:alert(1)'}]));w.renderApplications();assert.equal(w.document.querySelectorAll('#applicationsList article').length,1);assert.equal(JSON.parse(w.localStorage.getItem(key)).length,4)});
test('stored user text is not interpreted as HTML',()=>assert.equal(w.document.querySelectorAll('#applicationsList img').length,0));
test('valid status update retained',()=>{w.updateApplicationStatus('safe','تم التقديم');assert.equal(JSON.parse(w.localStorage.getItem(key))[2].status,'تم التقديم')});
test('invalid status rejected',()=>{w.updateApplicationStatus('safe','bad');assert.equal(JSON.parse(w.localStorage.getItem(key))[2].status,'تم التقديم')});
test('bad dates export safely',()=>assert.equal(w.formatStoredDate('not-a-date'),''));
const storage=w.localStorage;
test('storage failure returns false and keeps form',()=>{Object.defineProperty(w,'localStorage',{configurable:true,value:{getItem:()=>null,setItem(){throw new Error('quota')}}}); assert.equal(w.writeStorage('applications',[]),false);Object.defineProperty(w,'localStorage',{configurable:true,value:storage})});
(async()=>{
 w.document.querySelector('#jobTitle').value='Accountant';
 let calls=0, resolve;
 w.fetch=()=>{calls++;return new Promise(r=>resolve=r)};
 const p=w.searchJobs({preventDefault(){}}); const second=w.searchJobs({preventDefault(){}});
 assert.equal(calls,1); passed++; console.log('PASS overlapping search blocked');
 resolve({ok:true,json:async()=>({suggestions:[]})}); await Promise.all([p,second]);
 assert.equal(w.document.querySelector('#searchBtn').disabled,false);passed++; console.log('PASS request cleanup enables button');
 assert.equal(run('getSearchCount()'),0);passed++; console.log('PASS empty result does not consume free search');
 w.close(); console.log('CLIENT TESTS',passed);
})().catch(e=>{console.error(e);w.close();process.exitCode=1});
