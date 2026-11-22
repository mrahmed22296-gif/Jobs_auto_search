const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const html=fs.readFileSync(require('node:path').join(__dirname,'index.html'),'utf8');
const script=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
const dom=new JSDOM(html,{url:'http://localhost:8888',runScripts:'outside-only'}),w=dom.window,d=w.document;
w.firebase={initializeApp(){},auth(){return {getRedirectResult:()=>Promise.resolve(null),onAuthStateChanged(cb){w.__onAuth=cb;cb({uid:'workspace-offline-test'})}}}};
w.eval(script);w.initializeAuth();
let passed=0;function test(name,fn){fn();passed++;console.log('PASS',name)}
function value(id,text){d.getElementById(id).value=text}
function getFilters(){return JSON.parse(w.JSON.stringify(w.readJobFilters()))}
const key=w.storageKey('savedJobSearches');
w.fetch=()=>{throw new Error('Source-ready workspace must not call an external API')};
test('default workspace is jobs, suggestions remain separate',()=>{w.setView('jobs');assert.ok(!d.querySelector('#jobsView').classList.contains('hidden'));assert.ok(d.querySelector('#searchView').classList.contains('hidden'))});
test('six Gulf countries only plus all selector',()=>assert.deepEqual([...d.querySelector('#jobsCountry').options].map(x=>x.value),['all','KW','SA','AE','QA','BH','OM']));
test('default AI suggestion location is Kuwait, not unrelated geography',()=>assert.equal(d.querySelector('#location').value,'الكويت'));
test('source state is not connected, not fake live results',()=>{assert.match(d.querySelector('#jobsConnectionState').textContent,/لم يُربط/);assert.equal(d.querySelectorAll('#jobsView article').length,0)});
test('applying filters forwards no CV and makes no network request',()=>{value('jobsQuery','Accountant');value('jobsCountry','KW');value('jobsWorkplace','remote');value('jobsPeriod','week');w.applyJobFilters({preventDefault(){}});assert.deepEqual(getFilters(),{query:'Accountant',country:'KW',workplace:'remote',period:'week'});assert.match(d.querySelector('#jobsFilterSummary').textContent,/الكويت/)});
test('save/load local search retains every filter',()=>{w.saveJobSearch();assert.equal(JSON.parse(w.localStorage.getItem(key)).length,1);w.resetJobFilters(false);const id=JSON.parse(w.localStorage.getItem(key))[0].id;w.loadSavedJobSearch(id);assert.equal(getFilters().query,'Accountant');assert.equal(getFilters().country,'KW');assert.equal(getFilters().period,'week')});
test('duplicate saved search is not added twice',()=>{w.saveJobSearch();assert.equal(JSON.parse(w.localStorage.getItem(key)).length,1)});
test('blank query does not create a saved search',()=>{value('jobsQuery',' ');w.saveJobSearch();assert.equal(JSON.parse(w.localStorage.getItem(key)).length,1)});
test('saved query text never becomes HTML',()=>{value('jobsQuery','<img src=x onerror=alert(1)>');w.saveJobSearch();assert.equal(d.querySelectorAll('#savedJobSearches img').length,0);assert.match(d.querySelector('#savedJobSearches').textContent,/<img/)});
test('corrupt saved collection is not overwritten',()=>{w.localStorage.setItem(key,'{"broken":true}');value('jobsQuery','Another');w.saveJobSearch();assert.equal(w.localStorage.getItem(key),'{"broken":true}')});
test('invalid saved rows are hidden without deleting raw data',()=>{w.localStorage.setItem(key,JSON.stringify([null,{id:'bad',query:'test',country:'GB',workplace:'all',period:'all'}]));w.renderSavedJobSearches();assert.equal(d.querySelectorAll('.saved-search-card').length,0);assert.equal(JSON.parse(w.localStorage.getItem(key)).length,2)});
test('saved searches are scoped by signed-in user',()=>{w.localStorage.setItem(key,JSON.stringify([{id:'one',query:'Private search',country:'KW',workplace:'all',period:'all'}]));w.__onAuth({uid:'other-offline-user'});w.renderSavedJobSearches();assert.equal(d.querySelectorAll('.saved-search-card').length,0);w.__onAuth({uid:'workspace-offline-test'})});
test('remove saved search affects only selected row',()=>{w.localStorage.setItem(key,JSON.stringify([{id:'one',query:'one',country:'KW',workplace:'all',period:'all'},{id:'two',query:'two',country:'SA',workplace:'all',period:'all'}]));w.removeSavedJobSearch('one');assert.deepEqual(JSON.parse(w.localStorage.getItem(key)).map(x=>x.id),['two'])});
test('reset does not delete saved searches',()=>{w.resetJobFilters(false);assert.equal(JSON.parse(w.localStorage.getItem(key)).length,1);assert.equal(getFilters().country,'all')});
test('invalid programmatic country resets to all Gulf',()=>{value('jobsCountry','GB');assert.equal(getFilters().country,'all')});
test('mobile and desktop navigation share active state',()=>{w.setView('applications');assert.equal(d.querySelectorAll('[data-view="applications"][aria-current="page"]').length,2);assert.ok(d.querySelector('#jobsView').classList.contains('hidden'));assert.ok(!d.querySelector('#applicationsView').classList.contains('hidden'))});
test('unknown view does not hide current workspace',()=>{w.setView('bad');assert.ok(!d.querySelector('#applicationsView').classList.contains('hidden'))});
const rows=[{id:'one',title:'OFFLINE Accountant',company:'Company One',url:'https://www.linkedin.com/jobs/view/123',status:'تم التقديم',createdAt:'2026-11-22T12:00:00Z'},{id:'two',title:'OFFLINE Engineer',company:'Company Two',url:'https://www.linkedin.com/jobs/view/456',status:'مقابلة',createdAt:'2026-11-22T12:00:00Z'}];
w.localStorage.setItem(w.storageKey('applications'),JSON.stringify(rows));
test('tracker statistics use actual stored applications',()=>{w.renderApplications();assert.equal(d.querySelector('#totalApplications').textContent,'2');assert.equal(d.querySelector('#submittedApplications').textContent,'1');assert.equal(d.querySelector('#interviewApplications').textContent,'1')});
test('tracker title/company query filters, not mutates data',()=>{value('applicationQuery','Company Two');w.renderApplications();assert.equal(d.querySelectorAll('#applicationsList article').length,1);assert.match(d.querySelector('#applicationsList').textContent,/Engineer/);assert.equal(JSON.parse(w.localStorage.getItem(w.storageKey('applications'))).length,2)});
test('tracker status and keyword filters combine',()=>{value('applicationStatusFilter','تم التقديم');w.renderApplications();assert.equal(d.querySelectorAll('#applicationsList article').length,0);assert.ok(!d.querySelector('#applicationsNoMatch').classList.contains('hidden'))});
test('clear tracker filters restores cards',()=>{value('applicationQuery','');value('applicationStatusFilter','all');w.renderApplications();assert.equal(d.querySelectorAll('#applicationsList article').length,2)});
test('jobs workspace does not consume AI free attempt',()=>assert.equal(w.getSearchCount(),0));
w.close();console.log('WORKSPACE TESTS',passed);
