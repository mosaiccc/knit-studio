import {calculateMotifSize, resizeMotifDimensions, dimensionsFromCentimeters} from './core/motif-sizing.js';

const displayCm = value => String(Number(value.toFixed(2)));

function sizeField(id, label, value, unit, min, max, step) {
  return `<label class="field"><span>${label}</span><div class="input-wrap"><input id="${id}" type="number" value="${value}" min="${min}" max="${max}" step="${step}" aria-label="${label}" aria-describedby="grid-size-status"><small>${unit}</small></div></label>`;
}

export function motifSettingsHTML(grid, gauge, locked = true) {
  const width = grid[0].length, height = grid.length;
  const physical = calculateMotifSize(width, height, gauge);
  return `<section class="section motif-settings">
    <h3 class="section-title"><span class="number">02</span>画布设置<span class="muted">1 格 = 1 针</span></h3>
    <div class="form-row">${sizeField('grid-width', '横向针数', width, '针', 4, 200, 1)}${sizeField('grid-height', '纵向行数', height, '行', 4, 240, 1)}</div>
    <label class="toggle-label motif-ratio-toggle"><input id="grid-lock-ratio" type="checkbox" ${locked ? 'checked' : ''}>保持提花原比例</label>
    <div class="form-row motif-physical-fields">${sizeField('grid-width-cm', '横向实际尺寸', displayCm(physical.widthCm), 'cm', .01, 2000 / gauge.stitches, .01)}${sizeField('grid-height-cm', '纵向实际尺寸', displayCm(physical.heightCm), 'cm', .01, 2400 / gauge.rows, .01)}</div>
    <p class="hint motif-gauge-note">工程密度：每 10 cm ${gauge.stitches} 针 × ${gauge.rows} 行 <button class="btn text small" data-tab="shape">调整密度</button></p>
    <p class="hint motif-size-status" id="grid-size-status" role="status" aria-live="polite">实际约 ${displayCm(physical.widthCm)} × ${displayCm(physical.heightCm)} cm</p>
    <button class="btn full small" id="resize-grid">应用画布尺寸</button>
    <p class="hint">整幅提花同步缩放 · 最大 200 针 × 240 行<br>针数、行数按整格取整；缩小时细节会减少，可撤销。</p>
  </section>`;
}

/** Draft dimensions stay separate from artwork until the user explicitly applies them. */
export function bindMotifSettings(root, {grid, gauge, locked = true, onLockChange = () => {}, onApply = () => {}}) {
  const button = root.querySelector('#resize-grid');
  if (!button) return {destroy() {}};
  const width = grid[0].length, height = grid.length;
  const fields = [
    {id: 'grid-width', axis: 'width', cm: false},
    {id: 'grid-height', axis: 'height', cm: false},
    {id: 'grid-width-cm', axis: 'width', cm: true},
    {id: 'grid-height-cm', axis: 'height', cm: true},
  ].map(field => ({...field, element: root.querySelector('#' + field.id)}));
  const checkbox = root.querySelector('#grid-lock-ratio');
  const status = root.querySelector('#grid-size-status');
  const errors = new Map(), listeners = [], editedFields = new Set();
  let pending = {width, height}, lastAxis = 'width';
  checkbox.checked = locked;

  function listen(element, type, handler) {
    element.addEventListener(type, handler);
    listeners.push(() => element.removeEventListener(type, handler));
  }

  function refresh(exceptId) {
    const physical = calculateMotifSize(pending.width, pending.height, gauge);
    for (const field of fields) {
      if (field.id !== exceptId && !errors.has(field.id)) {
        field.element.value = field.cm ? displayCm(physical[field.axis + 'Cm']) : String(pending[field.axis]);
      }
      if (errors.has(field.id)) field.element.setAttribute('aria-invalid', 'true');
      else field.element.removeAttribute('aria-invalid');
    }
    const error = errors.values().next().value;
    status.textContent = error || `取整后实际约 ${displayCm(physical.widthCm)} × ${displayCm(physical.heightCm)} cm · ${pending.width} 针 × ${pending.height} 行`;
    status.classList.toggle('error', Boolean(error));
    button.disabled = Boolean(error);
  }

  function update(field, normalize = false) {
    try {
      const raw = field.element.value.trim(), value = Number(raw);
      if (!raw || !Number.isFinite(value)) throw new Error('请填写有效的针数、行数或实际尺寸。');
      const next = field.cm
        ? dimensionsFromCentimeters(width, height, field.axis, value, gauge, locked)
        : resizeMotifDimensions(width, height, field.axis, value, locked);
      pending = locked ? next : {...pending, [field.axis]: next[field.axis]};
      lastAxis = field.axis;
      errors.delete(field.id);
      errors.delete('ratio');
    } catch (error) {
      errors.set(field.id, error.message);
    }
    refresh(normalize ? null : field.id);
  }

  for (const field of fields) {
    listen(field.element, 'input', () => { editedFields.add(field.id); update(field); });
    listen(field.element, 'change', () => { update(field, true); editedFields.delete(field.id); });
    listen(field.element, 'blur', () => {
      if (editedFields.has(field.id)) { update(field, true); editedFields.delete(field.id); }
    });
  }
  listen(checkbox, 'change', () => {
    locked = checkbox.checked;
    onLockChange(locked);
    try {
      const next = resizeMotifDimensions(width, height, lastAxis, pending[lastAxis], locked);
      if (locked) pending = next;
      errors.delete('ratio');
    } catch (error) {
      errors.set('ratio', error.message);
    }
    // Do not replace unfinished or invalid input just because the checkbox changed.
    refresh();
  });
  listen(button, 'click', () => {
    if (errors.size) return;
    onApply(pending.width, pending.height);
  });
  refresh();
  return {destroy() { for (const remove of listeners) remove(); }};
}
