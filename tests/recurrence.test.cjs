const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const ts = require(path.join(root, 'node_modules/typescript'));

function fixture(events = [], overrides = {}) {
  const state = {events: structuredClone(events), writes: 0};
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const mod = {exports: {}}; cache.set(file, mod);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX},
    }).outputText;
    const localRequire = name => {
      if (Object.hasOwn(overrides, name)) return overrides[name];
      if (name === '@upstash/redis') return {Redis: class {
        async get() {return structuredClone(state.events);}
        async set(_key, events) {state.writes++; state.events = structuredClone(events);}
      }};
      if (name === 'next/server') return require('next/server');
      if (name === '@/lib/calendar-auth') return {verifiedCalendarUser: async () => 'owner'};
      if (name === '@/lib/whop-sdk') return {whopsdk: {users: {checkAccess: async () => ({has_access: true, access_level: 'admin'})}}};
      if (['react', 'react/jsx-runtime'].includes(name)) return require(name);
      const base = name.startsWith('@/') ? path.join(root, name.slice(2)) : path.resolve(path.dirname(file), name);
      const resolved = [base, base+'.ts', base+'.tsx'].find(p => fs.existsSync(p) && fs.statSync(p).isFile());
      if (!resolved) throw Error('Unexpected dependency: '+name);
      return load(resolved);
    };
    new Function('require','module','exports',code)(localRequire,mod,mod.exports);
    return mod.exports;
  }
  return {state, load: rel => load(path.join(root,rel))};
}
const base = (start, overrides={}) => ({id:'evt_test', experienceId:'exp_test', title:'Fixture', description:'',
  startDate:start, endDate:new Date(Date.parse(start)+3600000).toISOString(), maxAttendees:null,
  rsvps:['member'], createdBy:'owner', createdAt:'2026-01-01T00:00:00.000Z', color:'indigo',
  meetingLink:'https://example.com/meeting', recurrence:{frequency:'weekly', interval:1, count:5}, ...overrides});
const expand = (event, now) => fixture().load('lib/recurrence.ts').expandRecurringEvent(event,new Date(now));
const local = (iso,zone='America/Denver') => fixture().load('lib/event-time.ts').dateTimeInputValue(new Date(iso),zone);

for (const host of ['UTC','America/Denver','Asia/Tokyo']) {
  test('actual Whop schedules retain Mountain hours across fall DST on host '+host, () => {
    const old=process.env.TZ; process.env.TZ=host;
    try {
      for (const [title, start, last, hour, duration] of [
        ['Momentum Monday','2026-10-19T23:00:00Z','2026-11-17T00:00:00.000Z','17:00',1],
        ['Tuesday Q&As','2026-10-20T23:00:00Z','2026-11-18T00:00:00.000Z','17:00',1],
        ['Power Hour','2026-10-22T18:00:00Z','2026-11-19T19:00:00.000Z','12:00',3],
        ['Friday Frameworks','2026-10-23T19:00:00Z','2026-11-20T20:00:00.000Z','13:00',1],
      ]) {
        const event=base(start,{title,endDate:new Date(Date.parse(start)+duration*3600000).toISOString()});
        const before=structuredClone(event); const result=expand(event,'2026-11-09T12:00:00Z');
        assert.equal(result.length,5); assert.equal(result.at(-1).startDate,last,title);
        for (const [i, e] of result.entries()) {
          assert.equal(local(e.startDate).slice(11),hour,title);
          assert.equal(Date.parse(e.endDate)-Date.parse(e.startDate),duration*3600000);
          assert.equal(e.id,i===0?event.id:event.id+'_occ'+i);
          assert.equal(e.timeZone,'America/Denver'); assert.equal(e.meetingLink,event.meetingLink);
          assert.deepEqual(e.rsvps,event.rsvps);
        }
        assert.deepEqual(event,before,'No data migration or mutation during reads');
      }
    } finally {if(old===undefined) delete process.env.TZ; else process.env.TZ=old;}
  });
}

test('daily, weekly, custom, and monthly repeat at the wall-clock hour through spring DST', () => {
  for (const [frequency,interval,start,count] of [['daily',1,'2026-03-06T20:00:00Z',5],['weekly',1,'2026-03-06T20:00:00Z',3],['custom',2,'2026-03-06T20:00:00Z',4],['monthly',1,'2026-02-06T20:00:00Z',3]]) {
    const result=expand(base(start,{recurrence:{frequency,interval,count}}),'2026-03-01T12:00:00Z');
    assert.equal(result.length,count);
    assert.ok(result.every(e=>local(e.startDate).endsWith('13:00')));
    assert.match(result.at(-1).startDate,/T19:00:00.000Z$/);
  }
});

test('explicit zones override legacy fallback, including non-DST Phoenix and half-hour DST', () => {
  for(const [zone,start,last] of [
    ['America/New_York','2026-10-23T21:00:00Z','2026-11-20T22:00:00.000Z'],
    ['America/Phoenix','2026-10-23T20:00:00Z','2026-11-20T20:00:00.000Z'],
    ['UTC','2026-10-23T20:00:00Z','2026-11-20T20:00:00.000Z'],
    ['Australia/Lord_Howe','2026-09-25T02:30:00Z','2026-10-23T02:00:00.000Z'],
  ]) {
    const result=expand(base(start,{timeZone:zone}),'2026-10-01T12:00:00Z');
    assert.equal(result.at(-1).startDate,last);
    assert.ok(result.every(e=>local(e.startDate,zone).slice(11)===local(start,zone).slice(11)));
  }
});

test('gap moves only that occurrence forward; fold chooses earlier instant without duplicate', () => {
  const spring=expand(base('2026-03-07T09:30:00Z',{recurrence:{frequency:'daily',interval:1,count:3}}),'2026-03-01T12:00:00Z');
  assert.deepEqual(spring.map(e=>local(e.startDate).slice(11)),['02:30','03:30','02:30']);
  const fall=expand(base('2026-10-31T07:30:00Z',{recurrence:{frequency:'daily',interval:1,count:3}}),'2026-11-01T12:00:00Z');
  assert.deepEqual(fall.map(e=>e.startDate),['2026-10-31T07:30:00.000Z','2026-11-01T07:30:00.000Z','2026-11-02T08:30:00.000Z']);
});

test('one-off events stay byte-for-byte unchanged', () => {
  const event=base('2026-11-09T23:00:00Z',{recurrence:undefined});
  assert.deepEqual(expand(event,'2026-11-01T12:00:00Z'),[event]);
});

test('legacy excluded/hidden dates and hide-future survive a DST-shifted UTC timestamp', () => {
  const event=base('2026-10-19T23:00:00Z',{excludedDates:['2026-11-02T23:00:00Z'],hiddenDates:['2026-10-26T23:00:00Z'],hiddenFromDate:'2026-11-09T23:00:00Z'});
  const result=expand(event,'2026-11-09T12:00:00Z');
  assert.deepEqual(result.map(e=>e.id),['evt_test','evt_test_occ1','evt_test_occ3','evt_test_occ4']);
  assert.deepEqual(result.map(e=>e.hidden),[false,true,true,true]);
});

test('date-only and legacy midnight recurrence until include the full final local day', () => {
  for (const endDate of ['2026-11-09','2026-11-09T00:00:00.000Z']) {
    const result=expand(base('2026-10-19T23:00:00Z',{recurrence:{frequency:'weekly',interval:1,endDate}}),'2026-11-09T12:00:00Z');
    assert.equal(result.length,4); assert.equal(local(result.at(-1).startDate),'2026-11-09T17:00');
  }
});

test('create and all/single/future updates persist or inherit the timezone', async () => {
  const event=base('2026-10-19T23:00:00Z',{timeZone:'America/Denver'});
  const f=fixture([event]); const store=f.load('lib/events-store.ts');
  assert.equal((await store.createEvent({...event,timeZone:'America/New_York'})).timeZone,'America/New_York');
  assert.equal((await store.updateEvent(event.id,{title:'New'})).timeZone,'America/Denver');
  assert.equal((await store.updateEventOccurrence(event.id,'2026-11-10T00:00:00Z',{title:'Single'})).timeZone,'America/Denver');
  const next=await store.updateEventFuture(event.id,'2026-11-10T00:00:00Z',{title:'Future'});
  assert.equal(next.timeZone,'America/Denver');
  const original=f.state.events.find(e=>e.id===event.id);
  assert.equal(original.recurrence.endDate,'2026-11-09T23:59:59.999Z');
  assert.ok(expand(original,'2026-11-09T12:00:00Z').every(e=>e.startDate<'2026-11-10T00:00:00.000Z'));
  assert.equal(local(expand(next,'2026-11-09T12:00:00Z').at(-1).startDate).slice(11),'17:00');
});

test('new-event API stores IANA zone and rejects invalid zones without writing', async () => {
  for(const timeZone of ['America/Denver','America/New_York','America/Phoenix','UTC','fake/zone','',23,null]) {
    const f=fixture(); const route=f.load('app/api/events/route.ts');
    const response=await route.POST({json:async()=>({...base('2026-11-09T23:00:00Z'),timeZone})});
    const valid=typeof timeZone==='string'&&!!timeZone&&!timeZone.startsWith('fake');
    assert.equal(response.status,valid?201:400,String(timeZone));
    assert.equal(f.state.writes,valid?1:0);
    if(valid) assert.equal(f.state.events[0].timeZone,timeZone);
  }
});

test('input conversion uses series zone, rejects spring-gap input and invalid timezone patches', () => {
  const f=fixture(); const time=f.load('lib/event-time.ts');
  assert.equal(time.dateTimeInputToInstant('2026-11-09T17:00','America/Denver').toISOString(),'2026-11-10T00:00:00.000Z');
  assert.equal(time.dateTimeInputToInstant('2026-10-19T17:00','America/Denver').toISOString(),'2026-10-19T23:00:00.000Z');
  assert.throws(()=>time.dateTimeInputToInstant('2026-03-08T02:30','America/Denver'),/does not exist/);
  assert.throws(()=>f.load('lib/event-validation.ts').validateEventUpdates({timeZone:'bad/zone'}),/Invalid timeZone/);
});

test('edit form shows series timezone and dates even for admin browser in a different zone', () => {
  const React=require('react'); const {renderToStaticMarkup}=require('react-dom/server');
  const old=process.env.TZ; process.env.TZ='Asia/Tokyo';
  try {
    const Form=fixture().load('components/CreateEventModal.tsx').default;
    const html=renderToStaticMarkup(React.createElement(Form,{experienceId:'exp_test',editEvent:base('2026-11-10T00:00:00Z'),onClose:()=>{},onSave:async()=>{}}));
    assert.ok(html.includes('America/Denver'));  assert.match(html,/value="2026-11-09T17:00"/); assert.match(html,/value="2026-11-09T18:00"/);
  } finally {if(old===undefined) delete process.env.TZ; else process.env.TZ=old;}
});


test('unchanged edit preserves exact fold instant, split cutoff, and finite count', async () => {
  const event=base('2026-11-01T08:30:00Z', {
    endDate:'2026-11-01T09:30:00Z', timeZone:'America/Denver',
    recurrence:{frequency:'weekly',interval:1,endDate:'2026-11-09T23:59:59.999Z',count:4},
  });
  const f=fixture([], {react:{useState:value=>[typeof value==='function'?value():value,()=>{}],useRef:value=>({current:value})}});
  const Form=f.load('components/CreateEventModal.tsx').default;
  let saved;
  const tree=Form({experienceId:'exp_test',editEvent:event,onClose:()=>{},onSave:async data=>{saved=data;}});
  function find(node,type) {
    if (!node || typeof node!=='object') return null;
    if(node.type===type) return node;
    const children=[node.props?.children].flat(Infinity);
    for(const child of children) {const result=find(child,type); if(result)return result;}
    return null;
  }
  await find(tree,'form').props.onSubmit({preventDefault(){}});
  assert.equal(saved.startDate,'2026-11-01T08:30:00.000Z');
  assert.equal(saved.endDate,'2026-11-01T09:30:00.000Z');
  assert.equal(saved.recurrence.endDate,event.recurrence.endDate);
  assert.equal(saved.recurrence.count,4);
});
