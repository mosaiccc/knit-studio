import test from 'node:test';
import assert from 'node:assert/strict';

const launcher = await import('../launch.mjs').catch(error => {
  if (error.code === 'ERR_MODULE_NOT_FOUND') return {};
  throw error;
});

function ensure(options) {
  assert.equal(typeof launcher.ensureStudioRunning, 'function', 'the launcher must expose its startup workflow');
  return launcher.ensureStudioRunning(options);
}

test('a running Knit Studio is reused without creating a second process', async () => {
  let launches = 0;
  const result = await ensure({ probe: async () => 'ready', launch: async () => launches++ });
  assert.equal(result.started, false);
  assert.equal(result.url, 'http://127.0.0.1:4173/');
  assert.equal(launches, 0);
});

test('another service or an unexpected probe failure never starts or kills a process', async () => {
  let launches = 0;
  const conflict = new Error('4173 端口正在被其他程序使用。');
  await assert.rejects(() => ensure({ probe: async () => { throw conflict; }, launch: async () => launches++ }), error => error === conflict);
  assert.equal(launches, 0);
  await assert.rejects(() => ensure({ probe: async () => 'unknown', launch: async () => launches++ }), /无法确认|异常/);
  assert.equal(launches, 0);
});

test('an offline tool starts once and reports success only after the health check is ready', async () => {
  const events = [];
  const states = ['offline', 'offline', 'ready'];
  const result = await ensure({
    probe: async () => { const state = states.shift(); events.push('probe:' + state); return state; },
    launch: async () => { events.push('launch'); },
    delay: async () => { events.push('delay'); },
    maxAttempts: 3,
    intervalMs: 1,
  });
  assert.equal(result.started, true);
  assert.deepEqual(events, ['probe:offline', 'launch', 'delay', 'probe:offline', 'delay', 'probe:ready']);
});

test('a failed server spawn surfaces a Chinese error and cannot report a ready tool', async () => {
  let probes = 0;
  await assert.rejects(() => ensure({
    probe: async () => { probes++; return 'offline'; },
    launch: async () => { throw Object.assign(new Error('spawn failed'), { code: 'ENOENT' }); },
    delay: async () => {},
  }), /启动.*失败/);
  assert.equal(probes, 1);
});

test('startup times out after bounded health checks without spawning duplicate processes', async () => {
  let probes = 0, launches = 0;
  await assert.rejects(() => ensure({
    probe: async () => { probes++; return 'offline'; },
    launch: async () => { launches++; },
    delay: async () => {},
    maxAttempts: 3,
    intervalMs: 1,
  }), /启动.*超时/);
  assert.equal(probes, 4);
  assert.equal(launches, 1);
});
