// Local-only Plan → Shop → Today → Family fixture. Set PLAYWRIGHT_MODULE to an installed Playwright package.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE);
const root = process.cwd();
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
const json = (res, body, code=200) => { res.writeHead(code, {'content-type':'application/json','cache-control':'no-store'}); res.end(JSON.stringify(body)); };
const server = createServer(async (req,res) => {
  const path = new URL(req.url,'http://localhost').pathname;
  if(path === '/.netlify/functions/households') return json(res,{household:{id:'day7-fixture',name:'Day 7 household'}});
  if(path === '/.netlify/functions/recipes') return json(res,{recipes});
  const records = { '/.netlify/functions/schedule':schedule, '/.netlify/functions/groceries':groceries, '/.netlify/functions/family-state':state, '/.netlify/functions/dinner-history':history };
  if(path in records){
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
  for(const [lang,width] of [['en',360],['es',390]]){
    schedule={schedule:{},calendarMeals:{},weekStartKey:monday,version:1};groceries={items:[],version:1};state=initialState();history={items:[],version:1};writes.length=0;
    const context=await browser.newContext({viewport:{width,height:800}});
    await context.addInitScript(lang=>{localStorage.setItem('family-menu-household-key','fm_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');localStorage.setItem('dinner-lang',lang);},lang);
    const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(`http://127.0.0.1:${server.address().port}/`,{waitUntil:'networkidle'});
    await page.locator('#householdGate').waitFor({state:'hidden'});
    await page.locator('button[data-view="schedule"]').click();
    await page.locator('[data-week-draft="generate"]').click();
    const choices=await page.locator('[data-week-draft-select]').count();
    assert.ok(choices>0,'A valid catalog must produce draft choices');
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
    await page.locator('[data-week-draft="shopping"]').click();
    await page.locator('[data-week-draft="update-shopping"]').waitFor();
    await page.locator('[data-week-draft="update-shopping"]').click();
    await page.getByText(lang==='es'?'Se actualizó la lista de compras para el plan guardado.':'Shopping list updated for the saved meal plan.').waitFor();
    const shopped=await page.locator('#weekDraftPanel').innerText();
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
    assert.equal(schedule.version,2);
    assert.equal(groceries.version,2);
    assert.ok(groceries.items.length>0);
    assert.equal(writes.filter(write=>write.path.endsWith('/schedule')).length,1);
    assert.equal(writes.filter(write=>write.path.endsWith('/groceries')).length,1);
    assert.equal(overflow,0);
    assert.deepEqual(errors,[]);
    await page.locator('button[data-view="today"]').click();
    await page.locator('#dinnerFeedback').waitFor({state:'visible'});
    await page.locator('#todayChange summary').click();
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
    await page.locator('button[data-view="schedule"]').click();
    await page.locator('[data-week-draft="generate"]').click();
    schedule={...schedule,version:schedule.version+1};
    await page.reload({waitUntil:'networkidle'});
    await page.locator('button[data-view="schedule"]').click();
    await page.getByText(lang==='es'?'Tu borrador guardado ya no coincide con el plan o las recetas de esta semana. Crea uno nuevo para revisar las opciones actuales.':'Your saved draft no longer matches this week’s plan or recipes. Make a new draft to review the latest choices.').waitFor();
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({lang,width,choices,groceryCount:groceries.items.length,shoppingStatus:shopped.slice(-80),attendanceSaved:schedule.version>=3,dinnerRecorded:history.version===2,memoryVisible:Boolean(memory),draftRecoveryAndStaleReview:true,overflow,pageErrors:errors.length}));
    await context.close();
  }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
