import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkspace, upsertProject, activateProject, upsertMotif, removeMotif, sanitizeWorkspace } from '../dist/core/workspace.js';
import { sanitizeProject } from '../dist/core/project.js';
import { composeProjectChart } from '../dist/core/placements.js';
import { buildChartSVG } from '../dist/export.js';

const CREAM = '#f5efe3';
const RED = '#bf6373';
const BLUE = '#657f93';
const GREEN = '#79836a';
const GOLD = '#d7b68b';
const time = '2026-11-13T12:00:00.000Z';
const grid = color => Array.from({ length: 4 }, () => Array(4).fill(color));

function project(name, fabricColor = CREAM) {
  return {
    version: 1, name, grid: grid(CREAM), palette: [CREAM, RED, BLUE, GREEN],
    garmentId: 'rectangle', measurements: { width: 8, height: 8 }, gauge: { stitches: 10, rows: 10 },
    placement: 'repeat', arrangement: 'custom', fabricColor,
    motifPlacements: [], chartEdits: {}, annotations: []
  };
}

function createWorkflow() {
  let workspace = createWorkspace(project('第一件：双花样'), 'first', time);
  workspace = upsertProject(workspace, 'second', project('第二件：独立底色', GOLD), time);
  workspace = upsertMotif(workspace, { id: 'red', name: '红花样', grid: grid(RED), palette: [CREAM, RED] });
  workspace = upsertMotif(workspace, { id: 'blue', name: '蓝花样', grid: grid(BLUE), palette: [CREAM, BLUE] });
  const placement = (motif, id, row, stitch) => ({
    ...motif, id, motifId: motif.id, garmentId: 'rectangle', row, stitch,
    transparentBackground: false, flipX: false, flipY: false
  });
  const first = {
    ...workspace.projects.find(entry => entry.id === 'first').project,
    motifPlacements: [placement(workspace.motifs[0], 'placed-red', 1, 1), placement(workspace.motifs[1], 'placed-blue', 3, 3)],
    chartEdits: { rectangle: { '3:3': GREEN } }
  };
  return upsertProject(workspace, 'first', first, time);
}

function counts(chart) {
  const result = new Map();
  for (const row of chart.grid) for (const color of row) if (color) result.set(color, (result.get(color) || 0) + 1);
  return Object.fromEntries([...result].sort(([a], [b]) => a.localeCompare(b)));
}

test('two projects and two placed motifs survive switching, JSON restore, composition, and SVG export', () => {
  const saved = activateProject(createWorkflow(), 'second');
  const restoredWorkspace = sanitizeWorkspace(JSON.parse(JSON.stringify(saved)));
  assert.equal(restoredWorkspace.activeProjectId, 'second');
  assert.equal(restoredWorkspace.projects.length, 2);
  assert.equal(restoredWorkspace.motifs.length, 2);

  const restoredProject = sanitizeProject(JSON.parse(JSON.stringify(restoredWorkspace.projects.find(entry => entry.id === 'first').project)));
  assert.deepEqual(restoredProject.motifPlacements.map(entry => [entry.id, entry.row, entry.stitch]), [['placed-red', 1, 1], ['placed-blue', 3, 3]]);
  const chart = composeProjectChart(restoredProject);
  assert.deepEqual([chart.width, chart.height, chart.stitches, chart.rows], [8, 8, 8, 8]);
  assert.equal(chart.grid[7][7], RED, 'first motif occupies the bottom-right corner');
  assert.equal(chart.grid[4][4], BLUE, 'later blue motif covers the overlapping red motif');
  assert.equal(chart.grid[5][5], GREEN, 'hand-drawn stitch covers both placement layers');
  assert.equal(chart.grid[0][0], CREAM);
  assert.deepEqual(counts(chart), Object.fromEntries([[CREAM, 36], [RED, 12], [BLUE, 15], [GREEN, 1]].sort(([a], [b]) => a.localeCompare(b))));
  assert.ok(chart.rowCounts.every(row => row.count === 8));

  const svg = buildChartSVG(restoredProject, chart, '直筒矩形');
  const cells = [...svg.matchAll(/<rect data-cell="true" data-row="(\d+)" data-stitch="(\d+)"[^>]*fill="(#[A-F0-9]{6})"/g)];
  assert.equal(cells.length, 64);
  assert.equal(cells.find(cell => cell[1] === '3' && cell[2] === '3')?.[3], GREEN.toUpperCase());
  for (const [color, count] of Object.entries(counts(chart))) {
    assert.equal(cells.filter(cell => cell[3] === color.toUpperCase()).length, count);
    assert.ok(svg.includes(`${color.toUpperCase()} · ${count} 针`), 'legend matches composed stitch counts');
  }

  const second = restoredWorkspace.projects.find(entry => entry.id === 'second').project;
  assert.deepEqual(second.motifPlacements, []);
  assert.deepEqual(second.chartEdits, {});
  assert.deepEqual(counts(composeProjectChart(second)), { [GOLD]: 64 });
});

test('editing and deleting library originals cannot alter saved placement snapshots or exported stitches', () => {
  const original = createWorkflow();
  const originalProject = original.projects.find(entry => entry.id === 'first').project;
  const originalChart = composeProjectChart(originalProject);
  const originalSVG = buildChartSVG(originalProject, originalChart, '直筒矩形');

  let changed = upsertMotif(original, { id: 'red', name: '库中已改成黑色', grid: grid('#000000'), palette: ['#000000'] });
  changed = removeMotif(changed, 'blue');
  assert.equal(changed.motifs.length, 1);
  assert.equal(changed.motifs[0].grid[0][0], '#000000');
  const retained = sanitizeProject(JSON.parse(JSON.stringify(changed.projects.find(entry => entry.id === 'first').project)));
  assert.deepEqual(retained.motifPlacements, originalProject.motifPlacements);
  assert.deepEqual(retained.motifPlacements.map(entry => entry.name), ['红花样', '蓝花样']);
  assert.deepEqual(composeProjectChart(retained), originalChart);
  assert.equal(buildChartSVG(retained, composeProjectChart(retained), '直筒矩形'), originalSVG);

  changed.motifs[0].grid[0][0] = '#ffffff';
  changed.motifs[0].palette[0] = '#ffffff';
  assert.deepEqual(changed.projects.find(entry => entry.id === 'first').project.motifPlacements, originalProject.motifPlacements);
  assert.equal(original.motifs.length, 2);
  assert.equal(original.motifs[0].grid[0][0], RED);
});
