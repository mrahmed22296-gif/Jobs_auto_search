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
 // --- source-ready jobs list rendering (fixtures only; no provider contacted) ---
 const jobsFixture={status:'connected',stale:false,sources:[{id:'jooble-kw',name:'Jooble Kuwait',markets:['KW']},{id:'jooble-eg',name:'Jooble Egypt',markets:['EG']}],jobs:[
  {title:'<b>مهندس مدني</b>',company:'شركة الاختبار',location:'مدينة الكويت',market:'KW',postedAt:new Date().toISOString(),url:'https://employer.example/jobs/1',snippet:'وصف الإعلان',salary:'800 KWD',source:'jooble'},
  {title:'محاسب',company:'شركة مصر',market:'EG',postedAt:'2020-01-01T00:00:00Z',url:'https://employer.example/jobs/2',source:'jooble'},
  {title:'رابط مكسور',market:'KW',url:'http://insecure.example/jobs/3',source:'jooble'}]};
 const badgeText=()=>w.document.getElementById('jobsSourceBadge').childNodes[1].textContent;
 w.fetch=async()=>({ok:true,json:async()=>jobsFixture});
 await run('loadApiJobs()');
 test('connected payload renders cards and hides not-linked panel',()=>{assert.equal(w.document.getElementById('jobsConnectionState').hidden,true);assert.equal(w.document.getElementById('jobsList').hidden,false)});
 test('row with unsafe link is never rendered',()=>assert.equal(w.document.querySelectorAll('#jobsList .job-card').length,2));
 test('source text is never interpreted as HTML',()=>{assert.equal(w.document.querySelectorAll('#jobsList b').length,0);assert.ok(w.document.querySelector('#jobsList .job-title').textContent.includes('مهندس مدني'))});
 test('listing link opens the original posting safely',()=>{const a=w.document.querySelector('#jobsList a');assert.equal(a.href,'https://employer.example/jobs/1');assert.equal(a.rel,'noopener noreferrer');assert.equal(a.target,'_blank')});
 test('connected state rewrites the badge and hero honestly',()=>{assert.equal(badgeText(),'مصدر وظائف متصل');assert.equal(w.document.getElementById('jobsSourceBadge').className,'source-status connected');assert.ok(w.document.getElementById('jobsHeroNote').textContent.includes('مصدر مربوط'));assert.ok(w.document.getElementById('jobsToolsNote').textContent.includes('آخر إعلانات وصلت من المصدر'))});
 test('workplace filter is disabled and the reason is visible',()=>{assert.equal(w.document.getElementById('jobsWorkplace').disabled,true);assert.equal(w.document.getElementById('jobsWorkplaceNote').hidden,false)});
 test('every card attributes its source and links the original posting',()=>{const card=w.document.querySelector('#jobsList .job-card');assert.ok(card.querySelector('.job-source').textContent.includes('Jooble Kuwait'));const o=card.querySelector('.job-source-link');assert.equal(o.href,'https://employer.example/jobs/1');assert.equal(o.rel,'noopener noreferrer');assert.equal(o.target,'_blank')});
 test('period filter drops rows without a source date honestly',()=>{w.document.getElementById('jobsPeriod').value='week';w.applyJobFilters();assert.equal(w.document.querySelectorAll('#jobsList .job-card').length,1)});
 test('country filter narrows by market',()=>{w.document.getElementById('jobsPeriod').value='all';w.document.getElementById('jobsCountry').value='EG';w.applyJobFilters();const cards=w.document.querySelectorAll('#jobsList .job-card');assert.equal(cards.length,1);assert.ok(cards[0].textContent.includes('محاسب'))});
 w.fetch=async()=>({ok:true,json:async()=>({...jobsFixture,stale:true,status:'not_connected'})});
 await run('loadApiJobs()');
 test('stale snapshot is labeled, not hidden',()=>assert.equal(w.document.getElementById('jobsStaleNote').hidden,false));
 test('stale state rewrites the badge as an old snapshot',()=>{assert.equal(badgeText(),'نسخة موثقة قديمة من المصدر');assert.ok(w.document.getElementById('jobsHeroNote').textContent.includes('آخر نسخة موثقة'))});
 w.fetch=async()=>({ok:true,json:async()=>({status:'not_connected',stale:false,jobs:[],sources:[],requestedMarkets:['KW','EG'],connectedMarkets:[],message:'x'})});
 await run('loadApiJobs()');
 test('fresh not_connected keeps the honest empty state',()=>{assert.equal(w.document.getElementById('jobsConnectionState').hidden,false);assert.equal(w.document.getElementById('jobsList').hidden,true)});
 test('fresh not_connected restores the default copy and enabled controls',()=>{assert.equal(badgeText(),'المصادر غير متصلة');assert.equal(w.document.getElementById('jobsSourceBadge').className,'source-status');assert.equal(w.document.getElementById('jobsWorkplace').disabled,false);assert.equal(w.document.getElementById('jobsWorkplaceNote').hidden,true)});
 w.fetch=async()=>({ok:false,status:500});
 await run('loadApiJobs()');
 test('listing load failure never masquerades as an empty market',()=>{assert.equal(w.document.getElementById('jobsConnectionState').hidden,true);assert.equal(w.document.getElementById('jobsLiveState').hidden,false);assert.ok(w.document.getElementById('jobsLiveNote').textContent.includes('تعذر'))});
 test('load failure is distinct from not_connected',()=>{assert.equal(badgeText(),'تعذر التحقق من المصادر');assert.equal(w.document.getElementById('jobsSourceBadge').className,'source-status failed');assert.ok(w.document.getElementById('jobsHeroNote').textContent.includes('لم نتمكن'))});
 w.close(); console.log('CLIENT TESTS',passed);
})().catch(e=>{console.error(e);w.close();process.exitCode=1});
