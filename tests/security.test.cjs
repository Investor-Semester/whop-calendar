const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.CALENDAR_SOURCE_DIR || path.resolve(__dirname, '..');
const ts = require(path.join(root, 'node_modules/typescript'));
const { NextResponse } = require(path.join(root, 'node_modules/next/server'));

const sample = () => ({ id: 'evt_sample', experienceId: 'exp_original', title: 'Workshop',
  description: '', startDate: '2026-11-02T19:00:00.000Z', endDate: '2026-11-02T20:00:00.000Z',
  meetingLink: 'https://example.com/unchanged', rsvps: ['customer'], createdBy: 'owner',
  createdAt: '2026-01-01T00:00:00.000Z', color: 'indigo', maxAttendees: null,
  recurrence: {frequency: 'weekly', interval: 1},
});

function fixture(options = {}) {
  const state = { events: [sample()], writes: 0, uploads: [], checks: [], parsed: 0,
    user: 'owner', access: {has_access: true, access_level: 'admin'}, ...options };
  const cache = new Map();
  const sdk = { verifyUserToken: async () => {
    if (state.invalidToken) throw new Error('Invalid token');
    return {userId: state.user};
  }, users: {checkAccess: async (resource, user) => {
    state.checks.push({resource, user}); return state.access;
  }}};
  const mocks = {
    'next/server': {NextResponse}, 'next/headers': {headers: async () => new Headers()},
    '@/lib/whop-sdk': {whopsdk: sdk}, './whop-sdk': {whopsdk: sdk},
    '@vercel/blob': {put: async (name, file, opts) => {
      state.uploads.push({name, file, opts}); return {url: 'https://example.com/cover.png'};
    }},
    '@upstash/redis': {Redis: class {
      async get() { return structuredClone(state.events); }
      async set(_key, events) { state.writes++; state.events = structuredClone(events); }
    }},
  };
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const mod = {exports: {}}; cache.set(file, mod);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
    }).outputText;
    const localRequire = name => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      const base = name.startsWith('@/') ? path.join(root, name.slice(2)) : path.resolve(path.dirname(file), name);
      const resolved = [base, base + '.ts'].find(p => fs.existsSync(p) && fs.statSync(p).isFile());
      if (!resolved) throw new Error('Unexpected dependency (no network allowed): ' + name);
      return load(resolved);
    };
    new Function('require', 'module', 'exports', code)(localRequire, mod, mod.exports);
    return mod.exports;
  }
  const req = body => ({json: async () => body});
  const params = {params: Promise.resolve({eventId: 'evt_sample'})};
  return {state, load: rel => load(path.join(root, rel)), req, params,
    uploadReq: (experience = 'exp_original', file = new File(['synthetic'], 'cover.png', {type: 'image/png'})) => ({
      nextUrl: new URL('https://example.com/api/upload' + (experience === null ? '' : '?experienceId=' + encodeURIComponent(experience))),
      formData: async () => { state.parsed++; const data = new FormData(); if(file !== null) data.set('file', file); return data; },
    }),
  };
}

test('uploads reject missing/invalid identity before parsing or storage', async () => {
  for (const auth of [{user: null}, {invalidToken: true}]) {
    const f = fixture(auth); const response = await f.load('app/api/upload/route.ts').POST(f.uploadReq());
    assert.equal(response.status, 401); assert.equal(f.state.parsed, 0); assert.equal(f.state.uploads.length, 0);
  }
});

test('customer, no-access, and inconsistent admin uploads are denied before file parsing', async () => {
  for (const access of [{has_access: true, access_level: 'customer'}, {has_access: false, access_level: 'no_access'}, {has_access: false, access_level: 'admin'}]) {
    const f = fixture({access}); const response = await f.load('app/api/upload/route.ts').POST(f.uploadReq());
    assert.equal(response.status, 403); assert.equal(f.state.parsed, 0); assert.equal(f.state.uploads.length, 0);
    assert.deepEqual(f.state.checks, [{resource: 'exp_original', user: {id: 'owner'}}]);
  }
});

test('uploads validate experience, file type, and size; valid admin upload uses authorized experience', async () => {
  for (const [experience, file] of [[null, null], ['not-an-experience', null], ['exp_original', 'not a file'], ['exp_original', new File(['x'], 'active.svg', {type: 'image/svg+xml'})], ['exp_original', new File([], 'empty.png', {type: 'image/png'})], ['exp_original', new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', {type: 'image/png'})]]) {
    const f = fixture(); const response = await f.load('app/api/upload/route.ts').POST(f.uploadReq(experience, file));
    assert.equal(response.status, 400); assert.equal(f.state.uploads.length, 0);
  }
  const f = fixture(); const response = await f.load('app/api/upload/route.ts').POST(f.uploadReq());
  assert.equal(response.status, 200); assert.equal(f.state.uploads.length, 1);
  assert.match(f.state.uploads[0].name, /^event-covers\/exp_original\/.+\.png$/);
});

test('all event management routes reject unauthenticated and customer requests without writes', async () => {
  for (const options of [{user: null}, {invalidToken: true}, {access: {has_access: true, access_level: 'customer'}}, {access: {has_access: false, access_level: 'admin'}}]) {
    for (const method of ['POST', 'PATCH', 'DELETE']) {
      const f = fixture(options); const route = f.load(method === 'POST' ? 'app/api/events/route.ts' : 'app/api/events/[eventId]/route.ts');
      const response = await route[method](f.req({experienceId: 'exp_original', title: 'New', startDate: sample().startDate, endDate: sample().endDate}), f.params);
      assert.equal(response.status, options.user === null || options.invalidToken ? 401 : 403); assert.equal(f.state.writes, 0);
    }
  }
});

test('protected PATCH fields rejected for every recurrence mode and visibility action', async () => {
  for (const mode of ['all', 'single', 'future']) {
    for (const key of ['experienceId', 'id', 'createdBy', 'createdAt', 'rsvps', 'recurringBaseId', 'excludedDates', 'hiddenDates', 'hiddenFromDate', '__proto__']) {
      for (const action of [undefined, 'hide', 'unhide']) {
        const f = fixture(); const fields = Object.fromEntries([[key, 'exp_other']]);
        const response = await f.load('app/api/events/[eventId]/route.ts').PATCH(f.req({...fields, mode, occurrenceDate: sample().startDate, action}), f.params);
        assert.equal(response.status, 400, `${mode}/${key}/${action}`); assert.equal(f.state.writes, 0);
        assert.deepEqual(f.state.checks, [{resource: 'exp_original', user: {id: 'owner'}}]);
      }
    }
  }
});

test('malformed PATCH bodies and invalid mutable values fail without writes', async () => {
  for (const body of [null, [], {mode: 'bad'}, {mode: 'single'}, {title: []}, {startDate: 'bad'}, {endDate: '2000-01-01'}, {meetingType: ['zoom']}, {meetingLink: 'javascript:alert(1)'}, {maxAttendees: -1}, {recurrence: {frequency: 'weekly', interval: 0}}, {recurrence: {frequency: 'weekly', interval: 1, experienceId: 'exp_other'}}, {hidden: 'false'}, {action: 'bad'}, {action: 'hide', title: 'ignore'}]) {
    const f = fixture(); const response = await f.load('app/api/events/[eventId]/route.ts').PATCH(f.req(body), f.params);
    assert.equal(response.status, 400); assert.equal(f.state.writes, 0);
  }
});

test('valid admin create/edit/delete and all recurrence paths preserve identity and binding', async () => {
  for (const [mode, occurrenceDate] of [['all', sample().startDate], ['single', '2026-11-09T19:00:00.000Z'], ['future', sample().startDate], ['future', '2026-11-09T19:00:00.000Z']]) {
    const f = fixture(); const response = await f.load('app/api/events/[eventId]/route.ts').PATCH(f.req({title: 'Updated', mode, occurrenceDate}), f.params);
    assert.equal(response.status, 200); assert.ok(f.state.writes > 0);
    for(const event of f.state.events) { assert.equal(event.experienceId, 'exp_original'); assert.equal(event.createdBy, 'owner'); assert.equal(event.meetingLink, sample().meetingLink); }
    assert.ok(f.state.events.some(e => e.title === 'Updated'));
  }
  const f = fixture(); const created = await f.load('app/api/events/route.ts').POST(f.req({experienceId: 'exp_original', title: 'Synthetic new', startDate: sample().startDate, endDate: sample().endDate, createdBy: 'spoofed'}));
  assert.equal(created.status, 201); assert.equal((await created.json()).event.createdBy, 'owner');
  const removed = await f.load('app/api/events/[eventId]/route.ts').DELETE(f.req({mode: 'all'}), f.params);
  assert.equal(removed.status, 200); assert.ok(!f.state.events.some(e => e.id === 'evt_sample'));
});

test('store itself rejects binding changes on every update entry point before writing', async () => {
  for (const method of ['updateEvent', 'updateEventOccurrence', 'updateEventFuture']) {
    const f = fixture(); const store = f.load('lib/events-store.ts');
    const args = method === 'updateEvent' ? ['evt_sample', {experienceId: 'exp_other'}] : ['evt_sample', sample().startDate, {experienceId: 'exp_other'}];
    await assert.rejects(store[method](...args), /cannot be updated/); assert.equal(f.state.writes, 0);
  }
});
