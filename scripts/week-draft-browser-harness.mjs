// Local-only Plan → Shop → Today → Family fixture. Set PLAYWRIGHT_MODULE to an installed Playwright package.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE);
const root = process.cwd();
const screenshotDirectory = join(root,'test-artifacts','day7');
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.webmanifest':'application/manifest+json', '.svg':'image/svg+xml', '.png':'image/png' };
const start = new Date();
start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
const monday = `${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,'0')}-${String(start.getDate()).padStart(2,'0')}`;
const recipes = [
  { id:'rice', category:'main', name:{en:'Rice bowl',es:'Tazón de arroz'}, meta:{en:'20 minutes',es:'20 minutos'}, ingredientsText:{en:'1 cup rice\n2 carrots',es:'1 taza de arroz\n2 zanahorias'}, stepsText:{en:'Cook rice.',es:'Cocina el arroz.'}, servings:4 },
  { id:'pasta', category:'main', name:{en:'Pasta',es:'Pasta'}, meta:{en:'25 minutes',es:'25 minutos'}, ingredientsText:{en:'1 box pasta',es:'1 caja de pasta'}, stepsText:{en:'Cook pasta.',es:'Cocina la pasta.'}, servings:4 },
];
let schedule = { schedule:{}, calendarMeals:{}, weekStartKey:monday, version:1 };
let groceries = { items:[], version:1 };
const initialState = () => ({ state:{ familyMembers:[{id:'adult',name:'Avery',role:'adult',active:true}], familyPreferences:[], familyRules:{}, weekStartKey:monday, schedule:{}, calendarMeals:{} }, version:1 });
let state = initialState();
let history = { items:[], version:1 };
const writes = [];
let failNextGroceryRead = false;
let aiRequests = 0;
let initialReadGate = null;
const json = (res, body, code=200) => { res.writeHead(code, {'content-type':'application/json','cache-control':'no-store'}); res.end(JSON.stringify(body)); };
const server = createServer(async (req,res) => {
  const path = new URL(req.url,'http://localhost').pathname;
  if(/^\/\.netlify\/functions\/(?:assistant|recognize-|translate-recipe|import-recipe-url)/.test(path)) aiRequests += 1;
  if(req.method==='GET' && ['/.netlify/functions/recipes','/.netlify/functions/schedule','/.netlify/functions/groceries'].includes(path) && initialReadGate) await initialReadGate;
  if(path === '/.netlify/functions/households') return json(res,{household:{id:'day7-fixture',name:'Day 7 household'}});
  if(path === '/.netlify/functions/recipes') return json(res,{recipes});
  const records = { '/.netlify/functions/schedule':schedule, '/.netlify/functions/groceries':groceries, '/.netlify/functions/family-state':state, '/.netlify/functions/dinner-history':history };
  if(path in records){
    if(path.endsWith('/groceries') && req.method==='GET' && failNextGroceryRead){failNextGroceryRead=false;return json(res,{error:'Controlled read failure'},503);}
    if(req.method === 'PUT'){
      let raw=''; for await(const chunk of req) raw += chunk;
      const body=JSON.parse(raw||'{}'); const current=records[path];
      if(body.version !== current.version) return json(res,current,409);
      const next={...body,version:current.version+1};
      if(path.includes('family-state')) next.state=body.state;
      if(path.includes('dinner-history')) next.items=body.items;
      if(path.includes('groceries')) next.items=body.items;
      if(path.includes('schedule')){next.schedule=body.schedule;next.calendarMeals=body.calendarMeals;next.weekStartKey=body.weekStartKey;}
      writes.push({path,version:current.version,items:next.items?.length,dates:Object.keys(next.calendarMeals||{})});
      if(path.includes('schedule')) schedule=next;
      if(path.includes('groceries')) groceries=next;
      if(path.includes('family-state')) state=next;
      if(path.includes('dinner-history')) history=next;
      return json(res,next);
    }
    return json(res,records[path]);
  }
  if(path.startsWith('/.netlify/functions/')) return json(res,{items:[],state:{},recipes:[],lists:[],version:0});
  const file=normalize(join(root,path==='/'?'index.html':path));
  if(!file.startsWith(root)){res.writeHead(403);res.end();return;}
  try{res.writeHead(200,{'content-type':mime[extname(file)]||'application/octet-stream'});res.end(await readFile(file));}
  catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  for(const [lang,width] of process.env.ONLY_RESTRICTION==='1'?[]:[['en',360],['es',390],['en',1280]]){
    schedule={schedule:{},calendarMeals:{},weekStartKey:monday,version:1};groceries={items:[],version:1};state=initialState();history={items:[],version:1};writes.length=0;failNextGroceryRead=false;aiRequests=0;
    let releaseInitialReads;
    initialReadGate=new Promise(resolve=>{releaseInitialReads=resolve;});
    const context=await browser.newContext({viewport:{width,height:800},reducedMotion:lang==='es'?'reduce':'no-preference'});
    await context.addInitScript(lang=>{localStorage.setItem('family-menu-household-key','fm_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');localStorage.setItem('dinner-lang',lang);},lang);
    const page=await context.newPage();const pageErrors=[],consoleErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
    await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded'});
    await page.locator('#householdGate').waitFor({state:'hidden'});
    await page.locator('#todayMealLoading').waitFor({state:'visible'});
    assert.equal(await page.locator('#todayMealLoading .meal-loading-title').evaluate(node=>getComputedStyle(node).animationName),'none','Loading outline remains still');
    assert.equal(await page.locator('#weekPlanLoading').getAttribute('hidden'),null);
    assert.equal(await page.locator('#groceryList .grocery-loading-row').count(),3);
    assert.equal(await page.locator('#recipeList .recipe-loading-card').count(),4);
    assert.equal(await page.locator('#todayBand').isHidden(),true);
    releaseInitialReads();initialReadGate=null;
    await page.locator('#todayMealLoading').waitFor({state:'hidden'});
    await page.locator('#groceryList .grocery-loading-row').first().waitFor({state:'detached'});
    await page.locator('#recipeList .recipe-loading-card').first().waitFor({state:'detached'});
    await page.locator('button[data-view="schedule"]').click();
    await page.locator('[data-week-draft="generate"]').focus();
    await page.keyboard.press('Enter');
    if(process.env.CAPTURE_SCREENSHOTS==='1'){await mkdir(screenshotDirectory,{recursive:true});await page.locator('#weekDraftPanel').screenshot({path:join(screenshotDirectory,`${lang}-${width}-draft.png`)});}
    const choices=await page.locator('[data-week-draft-select]').count();
    assert.ok(choices>0,'A valid catalog must produce draft choices');
    const controls=await page.locator('#weekDraftPanel button').evaluateAll(nodes=>nodes.slice(0,8).map(node=>({action:node.dataset.weekDraft||node.dataset.weekDraftSwap||node.dataset.weekDraftKeep||'',width:Math.round(node.getBoundingClientRect().width),height:Math.round(node.getBoundingClientRect().height)})));
    assert.ok(controls.every(control=>control.height>=44),'Draft controls must have practical touch targets');
    await page.locator('.week-draft-controls details summary').first().click();
    await page.locator('[data-week-draft-keep]').first().click();
    if(await page.locator('[data-week-draft-swap]').count()) await page.locator('[data-week-draft-swap]').last().click();
    await page.reload({waitUntil:'networkidle'});
    await page.locator('button[data-view="schedule"]').click();
    await page.getByText(lang==='es'?'Tu borrador sin terminar volvió a este dispositivo. Revísalo antes de aprobarlo.':'Your unfinished draft is back on this device. Review it before approving.').waitFor();
    assert.equal(await page.locator('[data-week-draft-select]').count(),choices);
    const approvalEnabled=await page.locator('[data-week-draft="approve"]').isEnabled();
    assert.ok(approvalEnabled,'Reviewed draft should be approvable');
    await page.locator('[data-week-draft="approve"]').click();
    await page.locator('[data-week-draft="shopping"]').waitFor();
    assert.ok(await page.locator('.week-draft-message').evaluate(node=>document.activeElement===node),'Approval focus returns to its status');
    await page.locator('button[data-view="grocery"]').click();
    await page.locator('#weekShoppingReminder').waitFor({state:'visible'});
    await page.reload({waitUntil:'networkidle'});
    await page.locator('#householdGate').waitFor({state:'hidden'});
    await page.locator('button[data-view="grocery"]').click();
    await page.locator('#weekShoppingReminder').waitFor({state:'visible'});
    await page.locator('#weekShoppingOpenPlan').click();
    assert.ok(await page.locator('[data-week-draft="shopping"]').evaluate(node=>document.activeElement===node),'Shop reminder opens Plan at shopping review');
    failNextGroceryRead=true;
    await page.locator('[data-week-draft="shopping"]').click();
    await page.getByText(lang==='es'?'No se pudo consultar la lista compartida de compras más reciente. Inténtalo al conectarte.':'Could not check the latest shared shopping list. Try again when connected.').waitFor();
    assert.ok(await page.locator('[data-week-draft="shopping"]').evaluate(node=>document.activeElement===node),'Failed preview returns focus to Retry');
    assert.equal(groceries.version,1,'Failed preview must not write groceries');
    await page.locator('[data-week-draft="shopping"]').click();
    await page.locator('[data-week-draft="update-shopping"]').waitFor();
    await page.locator('[data-week-draft="update-shopping"]').click();
    await page.getByText(lang==='es'?'Se actualizó la lista de compras para el plan guardado.':'Shopping list updated for the saved meal plan.').waitFor();
    assert.ok(await page.locator('.week-draft-shopping [role=status]').evaluate(node=>document.activeElement===node),'Shopping update returns focus to saved status');
    if(process.env.CAPTURE_SCREENSHOTS==='1'){await mkdir(screenshotDirectory,{recursive:true});await page.screenshot({path:join(screenshotDirectory,`${lang}-${width}-plan.png`),fullPage:true});}
    const shopped=await page.locator('#weekDraftPanel').innerText();
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
    assert.equal(schedule.version,2);
    assert.equal(groceries.version,2);
    assert.ok(groceries.items.length>0);
    assert.equal(writes.filter(write=>write.path.endsWith('/schedule')).length,1);
    assert.equal(writes.filter(write=>write.path.endsWith('/groceries')).length,1);
    assert.equal(overflow,0);
    assert.deepEqual(pageErrors,[]);
    assert.ok(consoleErrors.every(message=>message.includes('503')),'Only the controlled failed read may log a console error');
    assert.equal(aiRequests,0,'The ordinary family journey must not invoke AI endpoints');
    let releaseCachedReads;
    initialReadGate=new Promise(resolve=>{releaseCachedReads=resolve;});
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('#householdGate').waitFor({state:'hidden'});
    assert.equal(await page.locator('#todayMealLoading').isHidden(),true,'Cached meal plan should not flash a loading outline');
    assert.equal(await page.locator('#groceryList .grocery-loading-row').count(),0,'Cached shopping list should not flash loading rows');
    assert.equal(await page.locator('#recipeList .recipe-loading-card').count(),0,'Cached recipes should not flash loading cards');
    releaseCachedReads();initialReadGate=null;
    await page.locator('button[data-view="today"]').click();
    await page.locator('#dinnerFeedback').waitFor({state:'visible'});
    await page.locator('#todayChange summary').click();
    const today=new Date();
    const todayKey=`${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    const savedAttendance=schedule.calendarMeals[todayKey]?.servingPlans?.dinner;
    assert.ok(savedAttendance,'Approved dinner must provide a current-day serving plan');
    for(const [field,amount] of [['Adults',savedAttendance.adults],['Kids',savedAttendance.kids],['Guests',savedAttendance.guests]]){
      assert.equal(await page.locator(`#todayChange${field}`).inputValue(),String(amount),'Change-of-plans values must prefill from the saved dinner');
    }
    await page.locator('#todayChangeGuests').fill('1');
    await page.locator('#todayChangeForm button[type="submit"]').click();
    await page.locator('[data-apply-attendance]').waitFor();
    const attendanceWrite=page.waitForResponse(response=>response.url().includes('/.netlify/functions/schedule')&&response.request().method()==='PUT');
    await page.locator('[data-apply-attendance]').click();
    assert.equal((await attendanceWrite).status(),200);
    await page.locator('[data-undo-attendance]').waitFor();
    assert.equal(schedule.version,3);
    assert.equal(groceries.version,2,'Attendance does not silently rebuild shopping');
    const feedbackWrite=page.waitForResponse(response=>response.url().includes('/.netlify/functions/dinner-history')&&response.request().method()==='PUT');
    await page.locator('[data-dinner-outcome="loved"]').click();
    assert.equal((await feedbackWrite).status(),200);
    assert.equal(history.version,2);
    await page.locator('#openFamily').evaluate(node=>node.click());
    const memory=await page.locator('#familyMemorySummary').innerText();
    assert.match(memory,/Pasta|Rice bowl|Tazón de arroz/);
    const familyOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
    assert.equal(familyOverflow,0,'Family view must fit the viewport');
    await page.locator('.household-menu > summary').click();
    const openMenuOverflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
    assert.equal(openMenuOverflow,0,'Open household menu must fit the viewport');
    await page.locator('.household-menu > summary').click();
    if(process.env.CAPTURE_SCREENSHOTS==='1')await page.screenshot({path:join(screenshotDirectory,`${lang}-${width}-family.png`),fullPage:true});
    const tomorrow=new Date();tomorrow.setDate(tomorrow.getDate()+1);
    const tomorrowKey=`${tomorrow.getFullYear()}-${String(tomorrow.getMonth()+1).padStart(2,'0')}-${String(tomorrow.getDate()).padStart(2,'0')}`;
    const calendarMeals={...schedule.calendarMeals};delete calendarMeals[tomorrowKey];
    schedule={...schedule,calendarMeals,version:schedule.version+1};
    await page.reload({waitUntil:'networkidle'});
    await page.locator('#householdGate').waitFor({state:'hidden'});
    const laterSuggestion=await page.locator('#smartSuggestionList').innerText();
    assert.match(laterSuggestion,lang==='es'?/Considera (Pasta|Tazón de arroz) mañana/:/Consider (Pasta|Rice bowl) tomorrow/,'Recorded feedback must feed a later open-day suggestion');
    assert.ok(laterSuggestion.includes(lang==='es'?'Una receta conocida para considerar para una cena sin plan.':'A known recipe to consider for an open dinner.'),'Neutral suggestion copy must not claim an unrecorded preference');
    await page.locator('button[data-view="schedule"]').click();
    await page.locator('[data-week-draft="generate"]').click();
    schedule={...schedule,version:schedule.version+1};
    await page.reload({waitUntil:'networkidle'});
    await page.locator('button[data-view="schedule"]').click();
    await page.getByText(lang==='es'?'Tu borrador guardado ya no coincide con el plan o las recetas de esta semana. Crea uno nuevo para revisar las opciones actuales.':'Your saved draft no longer matches this week’s plan or recipes. Make a new draft to review the latest choices.').waitFor();
    assert.deepEqual(pageErrors,[]);
    assert.ok(consoleErrors.every(message=>message.includes('503')));
    console.log(JSON.stringify({lang,width,choices,controls,groceryCount:groceries.items.length,shoppingStatus:shopped.slice(-80),failedShoppingReadRecovered:true,attendanceSaved:schedule.version>=3,dinnerRecorded:history.version===2,memoryVisible:Boolean(memory),laterSuggestion,draftRecoveryAndStaleReview:true,aiRequests,overflow,familyOverflow,openMenuOverflow,pageErrors:pageErrors.length,controlledConsoleErrors:consoleErrors.length}));
    await context.close();
  }
  const lockedContext=await browser.newContext({viewport:{width:390,height:800}});
  const lockedPage=await lockedContext.newPage();
  await lockedPage.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'domcontentloaded'});
  await lockedPage.locator('#householdGate').waitFor({state:'visible'});
  assert.ok(await lockedPage.locator('.app-header').evaluate(node=>node.inert && getComputedStyle(node).display==='none'),'Locked app shell is hidden and inert');
  await lockedPage.locator('#showJoinHousehold').focus();
  for(let index=0;index<16;index+=1){await lockedPage.keyboard.press('Tab');assert.ok(await lockedPage.evaluate(()=>document.activeElement?.closest('#householdGate')!==null),'Tab must stay inside locked household gate');}
  if(process.env.CAPTURE_SCREENSHOTS==='1')await lockedPage.screenshot({path:join(screenshotDirectory,'locked-gate-390.png')});
  await lockedContext.close();
  schedule={schedule:{},calendarMeals:{},weekStartKey:monday,version:1};
  state=initialState();
  state.state.familyPreferences=[{memberId:'adult',kind:'restriction',value:'peanut'}];
  const reviewContext=await browser.newContext({viewport:{width:390,height:800}});
  await reviewContext.addInitScript(()=>localStorage.setItem('family-menu-household-key','fm_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'));
  const reviewPage=await reviewContext.newPage();
  await reviewPage.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'networkidle'});
  await reviewPage.locator('#householdGate').waitFor({state:'hidden'});
  await reviewPage.locator('button[data-view="schedule"]').click();
  await reviewPage.locator('[data-week-draft="generate"]').click();
  assert.ok(await reviewPage.locator('[data-week-draft-review]').count()>0,'Restricted household sees recipes for manual review');
  assert.equal(await reviewPage.locator('[data-week-draft="approve"]').isEnabled(),false,'Restriction review blocks approval');
  if(process.env.CAPTURE_SCREENSHOTS==='1')await reviewPage.locator('#weekDraftPanel').screenshot({path:join(screenshotDirectory,'restriction-review-390.png')});
  await reviewPage.locator('.week-draft-restriction summary').first().click();
  await reviewPage.locator(`[data-week-draft-review="${monday}"]`).click();
  assert.equal(await reviewPage.locator('[data-week-draft="approve"]').isEnabled(),true,'Explicit ingredient review allows approval');
  await reviewPage.locator('[data-week-draft="approve"]').click();
  await reviewPage.locator('button[data-view="today"]').click();
  await reviewPage.locator('#todayChange summary').click();
  await reviewPage.locator('#todayChangeReason').selectOption('time');
  await reviewPage.locator('#todayChangeForm button[type="submit"]').click();
  await reviewPage.locator('[data-confirm-quick]').waitFor({state:'attached'});
  assert.equal(await reviewPage.locator('[data-preview-quick]').first().isEnabled(),false,'Quick swap needs restriction review');
  await reviewPage.locator('.today-quick-restriction summary').first().click();
  await reviewPage.locator('[data-confirm-quick]').first().check();
  assert.equal(await reviewPage.locator('[data-preview-quick]').first().isEnabled(),true,'Reviewed quick swap can be previewed');
  await reviewPage.locator('[data-preview-quick]').first().click();
  await reviewPage.locator('[data-apply-quick]').waitFor();
  await reviewPage.evaluate(() => navigator.serviceWorker.ready);
  const offlineFailures=[];
  reviewPage.on('requestfailed',request=>offlineFailures.push(new URL(request.url()).pathname));
  await reviewContext.setOffline(true);
  await reviewPage.reload({waitUntil:'domcontentloaded'});
  await reviewPage.locator('#householdGate').waitFor({state:'hidden'});
  assert.ok(await reviewPage.locator('.app-header').evaluate(node=>!node.inert),'Cached household opens from offline shell');
  assert.ok(offlineFailures.every(path=>!(/\.(?:js|css)$/.test(path))),'Offline shell must load cached first-party scripts and styles');
  await reviewContext.close();
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
