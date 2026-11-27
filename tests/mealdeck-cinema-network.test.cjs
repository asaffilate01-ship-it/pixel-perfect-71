const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const ts = require('typescript');
const root = process.env.MEALDECK_CINEMA_TEST_ROOT || join(__dirname, '..');
const hookPath = process.env.MEALDECK_CINEMA_TEST_ROOT ? join(root, 'use-cinema-promotion.ts') : join(root, 'src/components/marketing/use-cinema-promotion.ts');
const schedulePath = process.env.MEALDECK_CINEMA_TEST_ROOT ? join(root, 'mealdeck-cinema-promotion.ts') : join(root, 'src/lib/mealdeck-cinema-promotion.ts');
function compile(path) {
  const result = ts.transpileModule(readFileSync(path, 'utf8'), { fileName: path, reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } });
  assert.deepEqual(result.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error), []);
  return result.outputText;
}
function load(code, globals = {}) {
  const exports = {};
  runInNewContext(code, { exports, ...globals });
  return exports;
}
const schedule = load(compile(schedulePath));
const hook = compile(hookPath);
const epoch = Date.parse(schedule.MUNCHBOX_CINEMA_SCHEDULE.startsAt);
const snapshot = (remaining = 180000, phase = 'active') => ({ phase, approved: true, serverNow: new Date(epoch).toISOString(), nextTransitionAt: remaining === null ? null : new Date(epoch + remaining).toISOString(), terms: 'fixture only', eligibleProducts: ['fixture'] });
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
function harness({online = true, visibility = 'visible'} = {}) {
  let clock = 0, id = 0, state = null, cleanup;
  const requests = [], updates = [], timers = new Map(), window = new EventTarget(), document = new EventTarget(), navigator = { onLine: online };
  document.visibilityState = visibility;
  const require = name => {
    if (name === 'react') return {useState: initial => [initial, next => {state = next; updates.push(next);}], useEffect: fn => {cleanup = fn();}};
    if (name.endsWith('.functions')) return { getMealDeckCinemaPromotion: () => new Promise((resolve, reject) => requests.push({resolve, reject})) };
    if (name === '@/lib/mealdeck-cinema-promotion') return schedule;
    throw new Error('Unexpected import: ' + name);
  };
  const setTimeout = (fn, delay) => { const key = ++id; timers.set(key, { fn, at: clock + delay }); return key; };
  const clearTimeout = key => { timers.delete(key); };
  const api = load(hook, { require, window, document, navigator, setTimeout, clearTimeout, performance: {now: () => clock} });
  api.useCinemaPromotion();
  const event = (target, type) => target.dispatchEvent(new Event(type));
  return {requests, updates, timers, state: () => state, dispose: () => cleanup(), async advance(ms) {
    const end = clock + ms;
    while (true) {
      const next = [...timers].sort((a,b) => a[1].at-b[1].at || a[0]-b[0])[0];
      if (!next || next[1].at > end) break;
      clock = next[1].at; timers.delete(next[0]); next[1].fn(); await flush();
    }
    clock = end; await flush();
  }, async resolve(index, value = snapshot()) { requests[index].resolve(value); await flush(); }, async reject(index) {requests[index].reject(new Error('fixture network error')); await flush();}, online(value) {navigator.onLine = value; event(window, value ? 'online' : 'offline');}, visible(value) {document.visibilityState = value; event(document, 'visibilitychange');}, page(type) {event(window, type);} };
}
test('starts hidden and only displays a fresh server answer', async () => {const h=harness(); assert.equal(h.state(), null); assert.equal(h.requests.length,1); await h.resolve(0); assert.equal(h.state().phase,'active'); h.dispose();});
test('offline invalidates pending reply, reconnect fetches again', async () => {const h=harness(); h.online(false); await h.resolve(0); assert.equal(h.state(),null); h.online(true); assert.equal(h.requests.length,2); await h.resolve(1); assert.equal(h.state().phase,'active'); h.online(false); assert.equal(h.state(),null); h.dispose();});
test('initial offline or hidden page does not fetch until resumed', async () => {for (const options of [{online:false},{visibility:'hidden'}]) {const h=harness(options); assert.equal(h.requests.length,0); if (options.online===false) h.online(true); else h.visible('visible'); assert.equal(h.requests.length,1); h.dispose();}});
test('watchdog clears stalled requests and retries without accepting late results', async () => {const h=harness(); await h.advance(15000); assert.equal(h.state(),null); await h.resolve(0); assert.equal(h.state(),null); await h.advance(29999); assert.equal(h.requests.length,1); await h.advance(1); assert.equal(h.requests.length,2); await h.resolve(1); assert.equal(h.state().phase,'active'); h.dispose();});
test('failed network request clears state and retries in 30 seconds', async () => {const h=harness(); await h.reject(0); assert.equal(h.state(),null); await h.advance(30000); assert.equal(h.requests.length,2); await h.resolve(1); assert.equal(h.state().phase,'active'); h.dispose();});
test('pagehide and pageshow invalidate cached content and ignore stale reply', async () => {const h=harness(); await h.resolve(0); h.page('pagehide'); assert.equal(h.state(),null); h.page('pageshow'); assert.equal(h.requests.length,2); h.visible('hidden'); await h.resolve(1); assert.equal(h.state(),null); h.visible('visible'); assert.equal(h.requests.length,3); await h.resolve(2); assert.equal(h.state().phase,'active'); h.dispose();});
test('server phase boundary expires active copy while next response is pending', async () => {const h=harness(); await h.resolve(0,snapshot(1000)); await h.advance(999); assert.equal(h.state().phase,'active'); await h.advance(1); assert.equal(h.state(),null); assert.equal(h.requests.length,2); await h.resolve(1,snapshot(null,'ended')); assert.equal(h.state().phase,'ended'); h.dispose();});
test('response crossing a transition is discarded and immediately refreshed', async () => {const h=harness(); await h.advance(1001); await h.resolve(0,snapshot(1000)); assert.equal(h.state(),null); await h.advance(250); assert.equal(h.requests.length,2); h.dispose();});
test('cleanup removes listeners and invalidates pending responses', async () => {const h=harness(); h.dispose(); const count=h.updates.length; h.online(false); h.online(true); h.visible('visible'); h.page('pageshow'); await h.resolve(0); await h.advance(120000); assert.equal(h.requests.length,1); assert.equal(h.updates.length,count); assert.equal(h.timers.size,0);});
