import { statusLabels, summariseImplementation } from './implementation-status.mjs';
import { escapeHtml, renderNotice } from './views.mjs';

function pieChart(groups, total) {
  if (!total) return '<p class="empty">No controls in this component selection.</p>';
  let start = -Math.PI / 2;
  const slices = Object.entries(groups).filter(([,rows]) => rows.length).map(([status, rows]) => {
    const count = rows.length, angle = count / total * Math.PI * 2, end = start + angle;
    const title = `<title>${statusLabels[status]}: ${count} (${Math.round(count / total * 100)}%)</title>`;
    const attributes = `class="summary-slice ssp-status-${status}"`;
    let shape;
    if (count === total) shape = `<circle ${attributes} cx="120" cy="120" r="110">${title}</circle>`;
    else {
      const point = a => `${(120 + 110 * Math.cos(a)).toFixed(4)} ${(120 + 110 * Math.sin(a)).toFixed(4)}`;
      shape = `<path ${attributes} d="M120 120 L${point(start)} A110 110 0 ${angle > Math.PI ? 1 : 0} 1 ${point(end)} Z">${title}</path>`;
    }
    start = end;
    return shape;
  }).join('');
  return `<svg class="implementation-pie" viewBox="0 0 240 240" role="img" aria-label="Implementation status of ${total} controls"><title>Control implementation statuses</title><desc>${Object.entries(groups).map(([status,rows]) => statusLabels[status] + ': ' + rows.length).join('; ')}</desc>${slices}</svg>`;
}

export function renderImplementationSummary(result, excluded = new Set(), problem, errorCount = 0) {
  const {groups,total,selected,all} = summariseImplementation(result, excluded);
  const components = result.components || [];
  const options = components.map(component => `<label><input type="checkbox" data-summary-component="${escapeHtml(component.id)}"${selected.has(component.id) ? ' checked' : ''}> ${escapeHtml(component.title)}</label>`).join('');
  const notices = [problem, ...(result.notes || [])].filter(Boolean).map(note => renderNotice(note, true)).join('');
  const legend = `<ul class="summary-key">${Object.entries(groups).map(([status,rows]) => `<li><span class="ssp-status-badge ssp-status-${status}">${statusLabels[status]}</span><strong>${rows.length}</strong><span>${total ? Math.round(rows.length / total * 100) : 0}%</span></li>`).join('')}</ul>`;
  const lists = Object.entries(groups).map(([status,rows]) => `<details class="summary-status-group ssp-status-${status}"><summary><span class="ssp-status-badge ssp-status-${status}">${statusLabels[status]}</span> ${rows.length} ${rows.length === 1 ? 'control' : 'controls'}</summary>${rows.length ? `<ul>${rows.map(row => `<li><strong>${escapeHtml(row.control.id)}</strong> ${escapeHtml(row.control.title)}${row.source ? `<small>${escapeHtml(row.source)}</small>` : ''}</li>`).join('')}</ul>` : '<p>No controls with this status.</p>'}</details>`).join('');
  return `<section class="implementation-summary"><h3>Implementation Summary</h3>
    <fieldset class="summary-components"><legend>Components</legend>${components.length ? '<div class="summary-selection-actions"><button type="button" data-summary-select="all">Select all</button><button type="button" data-summary-select="none">Clear selection</button></div>' : ''}${options || '<p>No component definitions. Showing system-wide controls.</p>'}</fieldset>
    <p class="summary-scope">${all ? 'All components · includes baseline controls without recorded implementations' : selected.size + (selected.size === 1 ? ' component selected' : ' components selected')} · ${total} ${total === 1 ? 'control' : 'controls'}. Each control is counted once. This summary is independent of the Controls tab filters.</p>
    ${errorCount ? renderNotice('This document has validation errors. The summary is for inspection only.', true) : ''}${notices}
    <div class="summary-chart">${pieChart(groups,total)}${legend}</div>
    <h3>Controls by implementation status</h3>${lists}</section>`;
}
