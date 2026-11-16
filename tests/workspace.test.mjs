import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspace, sanitizeWorkspace, upsertProject, activateProject, removeProject, sanitizeMotif, upsertMotif, removeMotif, parseMotifFile } from '../dist/core/workspace.js';

const time = '2026-11-13T09:00:00.000Z';
function project(name = '我的毛衣') {
  return { version: 1, name, grid: Array.from({ length: 4 }, () => Array(4).fill('#f5efe3')), palette: ['#f5efe3', '#bf6373'], garmentId: 'rectangle', measurements: { width: 40, height: 50 }, gauge: { stitches: 22, rows: 30 }, placement: 'repeat', chartEdits: { rectangle: { '1:1': '#bf6373' } }, annotations: [] };
}
function motif(id = 'flower') {
  return { id, name: '  小花  ', grid: Array.from({ length: 4 }, () => Array(4).fill('#ABCDEF')), palette: ['#ABCDEF'] };
}

test('createWorkspace migrates a legacy project into an independent active project record', () => {
  const legacy = project();
  const workspace = createWorkspace(legacy, 'saved-project', time);
  assert.equal(workspace.version, 1);
  assert.equal(workspace.activeProjectId, 'saved-project');
  assert.equal(workspace.projects[0].updatedAt, time);
  assert.equal(workspace.projects[0].project.name, legacy.name);
  assert.deepEqual(workspace.projects[0].project.chartEdits, legacy.chartEdits);
  assert.deepEqual(workspace.motifs, []);
  workspace.projects[0].project.grid[0][0] = '#000000';
  workspace.projects[0].project.chartEdits.rectangle['1:1'] = '#000000';
  assert.equal(legacy.grid[0][0], '#f5efe3');
  assert.equal(legacy.chartEdits.rectangle['1:1'], '#bf6373');
});

test('saving then switching projects retains both projects and their distinct edits', () => {
  const original = createWorkspace(project('第一件'), 'a', time);
  const withSecond = upsertProject(original, 'b', project('第二件'), Date.parse(time) + 1000);
  assert.equal(withSecond.activeProjectId, 'a', 'saving does not switch the active project');
  const changed = project('第一件已编辑');
  changed.grid[0][0] = '#bf6373';
  const saved = upsertProject(withSecond, 'a', changed, Date.parse(time) + 2000);
  const switched = activateProject(saved, 'b');
  assert.equal(switched.activeProjectId, 'b');
  assert.equal(switched.projects[0].project.name, '第一件已编辑');
  assert.equal(switched.projects[0].project.grid[0][0], '#bf6373');
  assert.equal(switched.projects[1].project.name, '第二件');
  assert.equal(switched.projects[1].project.grid[0][0], '#f5efe3');
  assert.equal(switched.projects[0].updatedAt, '2026-11-13T09:00:02.000Z');
  assert.equal(original.projects.length, 1);
  assert.equal(original.projects[0].project.name, '第一件');
  changed.grid[0][0] = '#000000';
  assert.equal(switched.projects[0].project.grid[0][0], '#bf6373');
});

test('workspace snapshots clone unchanged projects and shared motif data as well', () => {
  const original = upsertMotif(upsertProject(createWorkspace(project(), 'a', time), 'b', project('另一件'), time), motif());
  const changed = activateProject(original, 'b');
  changed.projects[0].project.measurements.width = 5;
  changed.motifs[0].grid[0][0] = '#000000';
  assert.equal(original.projects[0].project.measurements.width, 40);
  assert.equal(original.motifs[0].grid[0][0], '#abcdef');
});

test('deleting a project chooses a remaining active project and refuses to delete the final one', () => {
  const original = upsertProject(createWorkspace(project(), 'a', time), 'b', project('另一件'), time);
  const remaining = removeProject(original, 'a');
  assert.equal(remaining.activeProjectId, 'b');
  assert.equal(remaining.projects.length, 1);
  assert.equal(original.projects.length, 2);
  assert.throws(() => removeProject(remaining, 'b'), /至少|最后/);
  assert.throws(() => removeProject(original, 'missing'), /未找到|不存在/);
  assert.throws(() => activateProject(original, 'missing'), /未找到|不存在/);
});

test('workspace validation round-trips JSON, strips extra fields, and rejects corrupt references and duplicate IDs', () => {
  const original = upsertMotif(createWorkspace(project(), 'a', time), motif());
  const value = JSON.parse(JSON.stringify(original));
  value.extra = 'discard';
  value.projects[0].extra = 'discard';
  const sanitized = sanitizeWorkspace(value);
  assert.deepEqual(sanitized, original);
  for (const bad of [null, [], { ...value, version: 2 }, { ...value, projects: [] }, { ...value, activeProjectId: 'missing' }, { ...value, projects: [value.projects[0], value.projects[0]] }, { ...value, motifs: [motif(), motif()] }]) {
    assert.throws(() => sanitizeWorkspace(bad), /工程|工作区|版本|提花|编号/);
  }
  assert.throws(() => sanitizeWorkspace({ ...value, projects: [{ ...value.projects[0], project: { ...project(), grid: [] } }] }), /网格|图案/);
});

test('project IDs and update timestamps are validated and normalized', () => {
  assert.equal(createWorkspace(project(), 'a', new Date(time)).projects[0].updatedAt, time);
  assert.equal(createWorkspace(project(), 'a', Date.parse(time)).projects[0].updatedAt, time);
  for (const id of ['', ' ', null, 'x'.repeat(81)]) assert.throws(() => createWorkspace(project(), id, time), /编号/);
  assert.throws(() => createWorkspace(project(), 'a', 'not-a-date'), /时间/);
});

test('project capacity blocks a new project but permits updating an existing project', () => {
  const workspace = { version: 1, activeProjectId: 'p0', projects: Array.from({ length: 30 }, (_, index) => ({ id: `p${index}`, updatedAt: time, project: project(`项目 ${index}`) })), motifs: [] };
  assert.throws(() => upsertProject(workspace, 'p30', project(), time), /30/);
  assert.equal(upsertProject(workspace, 'p0', project('更新'), time).projects.length, 30);
  assert.throws(() => sanitizeWorkspace({ ...workspace, projects: [...workspace.projects, { id: 'p30', updatedAt: time, project: project() }] }), /30/);
});

test('motif sanitization normalizes names/colors and returns independent grids and palettes', () => {
  const source = { ...motif(), unexpected: 'discard' };
  const result = sanitizeMotif(source);
  assert.deepEqual(Object.keys(result), ['id', 'name', 'grid', 'palette']);
  assert.equal(result.name, '小花');
  assert.equal(result.grid[0][0], '#abcdef');
  assert.deepEqual(result.palette, ['#abcdef']);
  result.grid[0][0] = '#000000';
  result.palette[0] = '#000000';
  assert.equal(source.grid[0][0], '#ABCDEF');
  assert.equal(source.palette[0], '#ABCDEF');
});

test('motifs can be added, replaced and removed without affecting project snapshots', () => {
  const original = createWorkspace(project(), 'a', time);
  const added = upsertMotif(original, motif());
  const replaced = upsertMotif(added, { ...motif(), name: '新名字' });
  assert.equal(replaced.motifs.length, 1);
  assert.equal(replaced.motifs[0].name, '新名字');
  assert.equal(added.motifs[0].name, '小花');
  assert.equal(original.motifs.length, 0);
  assert.deepEqual(replaced.projects, original.projects);
  assert.deepEqual(removeMotif(replaced, 'flower').motifs, []);
  assert.throws(() => removeMotif(replaced, 'missing'), /未找到|不存在/);
});

test('motif files import only the dedicated format and reject malformed or oversized motifs', () => {
  const file = { format: 'knit-motif-v1', motif: motif() };
  assert.deepEqual(parseMotifFile(file), sanitizeMotif(motif()));
  assert.deepEqual(parseMotifFile(JSON.stringify(file)), sanitizeMotif(motif()));
  assert.throws(() => parseMotifFile('{broken'), /文件|JSON|格式/);
  assert.throws(() => parseMotifFile(project()), /格式|提花/);
  assert.throws(() => parseMotifFile({ ...file, format: 'knit-motif-v2' }), /格式|版本/);
  for (const bad of [null, { ...motif(), id: '' }, { ...motif(), name: '' }, { ...motif(), grid: [] }, { ...motif(), palette: ['red'] }, { ...motif(), palette: Array(33).fill('#abcdef') }]) {
    assert.throws(() => sanitizeMotif(bad), /提花|编号|名称|色板|网格/);
  }
});

test('motif capacity blocks additions at 100 while allowing updates', () => {
  const workspace = createWorkspace(project(), 'a', time);
  workspace.motifs = Array.from({ length: 100 }, (_, index) => motif(`m${index}`));
  assert.throws(() => upsertMotif(workspace, motif('m100')), /100/);
  assert.equal(upsertMotif(workspace, { ...motif('m0'), name: '更新' }).motifs.length, 100);
});

async function withStorageGlobals(indexedDB, localStorage, run) {
  const descriptors = ['indexedDB', 'localStorage'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: indexedDB });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: localStorage });
  try { await run(); }
  finally {
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

test('storage falls back to the dedicated localStorage key when IndexedDB cannot open', async () => {
  const { readWorkspace, writeWorkspace } = await import('../dist/storage.js');
  const values = new Map();
  const local = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const unavailable = { open() { const request = {}; queueMicrotask(() => request.onerror()); return request; } };
  await withStorageGlobals(unavailable, local, async () => {
    assert.equal(await readWorkspace(), null);
    const workspace = createWorkspace(project(), 'a', time);
    await writeWorkspace(workspace);
    assert.ok(values.has('knit-studio-workspace-v1'));
    assert.deepEqual(await readWorkspace(), workspace);
  });
});

test('IndexedDB writes resolve only after transaction completion and capture an independent snapshot', async () => {
  const { writeWorkspace } = await import('../dist/storage.js');
  let transaction;
  let stored;
  let closed = false;
  const database = {
    close() { closed = true; },
    transaction(store, mode) {
      assert.equal(store, 'workspace');
      assert.equal(mode, 'readwrite');
      transaction = { objectStore() { return { put(value, key) { assert.equal(key, 'current'); stored = value; return {}; } }; } };
      return transaction;
    },
  };
  const available = { open(name, version) { assert.equal(name, 'knit-studio'); assert.equal(version, 1); const request = {}; queueMicrotask(() => { request.result = database; request.onsuccess(); }); return request; } };
  await withStorageGlobals(available, { setItem() { assert.fail('must not fall back after a successful open'); } }, async () => {
    const source = createWorkspace(project(), 'a', time);
    let completed = false;
    const pending = writeWorkspace(source).then(() => { completed = true; });
    source.projects[0].project.name = 'Changed after write request';
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(completed, false);
    assert.equal(stored.projects[0].project.name, '我的毛衣');
    transaction.oncomplete();
    await pending;
    assert.equal(closed, true);
  });
});

test('IndexedDB transaction quota errors propagate instead of switching storage backends', async () => {
  const { writeWorkspace } = await import('../dist/storage.js');
  const quotaError = new Error('quota exceeded');
  const database = { close() {}, transaction() {
    const transaction = { error: quotaError, objectStore() { return { put() { queueMicrotask(() => transaction.onabort()); return {}; } }; } };
    return transaction;
  } };
  const available = { open() { const request = {}; queueMicrotask(() => { request.result = database; request.onsuccess(); }); return request; } };
  await withStorageGlobals(available, { setItem() { assert.fail('quota failures must remain visible'); } }, async () => {
    await assert.rejects(writeWorkspace(createWorkspace(project(), 'a', time)), /quota exceeded/);
  });
});

test('an empty IndexedDB workspace can migrate a previously saved localStorage workspace', async () => {
  const { readWorkspace } = await import('../dist/storage.js');
  const saved = createWorkspace(project('先前临时存储的工程'), 'fallback-project', time);
  const database = { close() {}, transaction() {
    const transaction = { objectStore() { return { get(key) {
      assert.equal(key, 'current');
      const request = { result: undefined };
      queueMicrotask(() => { request.onsuccess(); transaction.oncomplete(); });
      return request;
    } }; } };
    return transaction;
  } };
  const available = { open() { const request = {}; queueMicrotask(() => { request.result = database; request.onsuccess(); }); return request; } };
  await withStorageGlobals(available, { getItem(key) { return key === 'knit-studio-workspace-v1' ? JSON.stringify(saved) : null; } }, async () => {
    assert.deepEqual(await readWorkspace(), saved);
  });
});

function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
}

test('staging is synchronous and pending edits recover before any older IndexedDB record', async () => {
  const { stageWorkspace, readWorkspace } = await import('../dist/storage.js');
  assert.equal(typeof stageWorkspace, 'function');
  const local = memoryStorage();
  await withStorageGlobals({ open() { assert.fail('a pending journal takes priority'); } }, local, async () => {
    const workspace = createWorkspace(project('刚刚重做的工程'), 'a', time);
    stageWorkspace(workspace);
    const expected = structuredClone(workspace);
    assert.equal(local.getItem('knit-studio-workspace-pending-v1'), JSON.stringify(expected));
    workspace.projects[0].project.name = '修改原对象';
    assert.deepEqual(await readWorkspace(), expected);
  });
});

test('a stale write completion preserves a newer journal; the matching completion clears it', async () => {
  const { stageWorkspace, writeWorkspace } = await import('../dist/storage.js');
  assert.equal(typeof stageWorkspace, 'function');
  let transaction;
  const database = { close() {}, transaction() { transaction = { objectStore() { return { put() { return {}; } }; } }; return transaction; } };
  const available = { open() { const request = {}; queueMicrotask(() => { request.result = database; request.onsuccess(); }); return request; } };
  const local = memoryStorage();
  await withStorageGlobals(available, local, async () => {
    const old = createWorkspace(project('撤销后的工程'), 'a', time);
    const latest = createWorkspace(project('重做后的工程'), 'a', time);
    stageWorkspace(old);
    const oldWrite = writeWorkspace(old);
    await new Promise(resolve => setImmediate(resolve));
    stageWorkspace(latest);
    transaction.oncomplete();
    await oldWrite;
    assert.equal(local.getItem('knit-studio-workspace-pending-v1'), JSON.stringify(latest));
    const newWrite = writeWorkspace(latest);
    await new Promise(resolve => setImmediate(resolve));
    transaction.oncomplete();
    await newWrite;
    assert.equal(local.getItem('knit-studio-workspace-pending-v1'), null);
  });
});

test('a successful fallback write also clears only its matching pending snapshot', async () => {
  const { stageWorkspace, writeWorkspace } = await import('../dist/storage.js');
  assert.equal(typeof stageWorkspace, 'function');
  const local = memoryStorage();
  await withStorageGlobals(undefined, local, async () => {
    const workspace = createWorkspace(project(), 'a', time);
    stageWorkspace(workspace);
    await writeWorkspace(workspace);
    assert.equal(local.getItem('knit-studio-workspace-pending-v1'), null);
    assert.equal(local.getItem('knit-studio-workspace-v1'), JSON.stringify(workspace));
  });
});

test('corrupt pending JSON remains a read error rather than silently loading an older version', async () => {
  const { readWorkspace } = await import('../dist/storage.js');
  const local = memoryStorage();
  local.setItem('knit-studio-workspace-pending-v1', '{broken');
  await withStorageGlobals({ open() { assert.fail('corruption must remain visible'); } }, local, async () => {
    await assert.rejects(readWorkspace(), SyntaxError);
  });
});

test('journal quota failure does not throw or leave an older journal able to override a later durable write', async () => {
  const { stageWorkspace } = await import('../dist/storage.js');
  assert.equal(typeof stageWorkspace, 'function');
  const local = memoryStorage();
  local.setItem('knit-studio-workspace-pending-v1', 'older snapshot');
  local.setItem = () => { throw new Error('quota exceeded'); };
  await withStorageGlobals(undefined, local, async () => {
    assert.doesNotThrow(() => stageWorkspace(createWorkspace(project(), 'a', time)));
    assert.equal(local.getItem('knit-studio-workspace-pending-v1'), null);
  });
});
