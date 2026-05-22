// ── State ──────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'monthly-pwa-data';

const PALETTE = [
  '#e94560','#f5a623','#7ed321','#4a90e2','#9b59b6',
  '#1abc9c','#e67e22','#3498db','#e91e63','#00bcd4',
  '#8bc34a','#ff5722','#607d8b','#795548','#cddc39'
];

let state = {
  year: new Date().getFullYear(),
  labels: [],        // [{id, name, color}]
  spans: [],         // [{id, labelId, days: ['YYYY-MM-DD', ...]}]
  activeLabel: null  // id
};

// ── Persistence ────────────────────────────────────────────────────────────
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (d) state = { ...state, ...d };
  } catch {}
}

// ── DOM refs ───────────────────────────────────────────────────────────────
const calendarEl   = document.getElementById('calendar');
const yearDisplay  = document.getElementById('year-display');
const labelPanel   = document.getElementById('label-chips');
const newLabelInput= document.getElementById('new-label-input');
const addLabelBtn  = document.getElementById('add-label-btn');
const ctxMenu      = document.getElementById('ctx-menu');
const ctxTitle     = document.getElementById('ctx-title');
const ctxItems     = document.getElementById('ctx-items');
const hint         = document.getElementById('hint');
const availListEl  = document.getElementById('avail-list');

// ── Selection state ────────────────────────────────────────────────────────
let selecting = false;
let selStart  = null;
let selEnd    = null;

// ── Helpers ────────────────────────────────────────────────────────────────
function dateKey(y, m, d) {
  return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

function parseKey(k) {
  const [y,m,d] = k.split('-').map(Number);
  return new Date(y, m-1, d);
}

function daysInMonth(y, m) {
  return new Date(y, m+1, 0).getDate();
}

function firstDayOfMonth(y, m) {
  return new Date(y, m, 1).getDay(); // 0=Sun
}

function todayKey() {
  const t = new Date();
  return dateKey(t.getFullYear(), t.getMonth(), t.getDate());
}

function colorFor(labelId) {
  const l = state.labels.find(l => l.id === labelId);
  return l ? l.color : '#888';
}

function nameFor(labelId) {
  const l = state.labels.find(l => l.id === labelId);
  return l ? l.name : '';
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ── Covered days set ───────────────────────────────────────────────────────
function coveredDays() {
  const s = new Set();
  for (const sp of state.spans) {
    for (const d of sp.days) s.add(d);
  }
  return s;
}

// ── Render labels panel ────────────────────────────────────────────────────
function renderLabelPanel() {
  labelPanel.innerHTML = '';
  for (const l of state.labels) {
    const chip = document.createElement('div');
    chip.className = 'label-chip' + (state.activeLabel === l.id ? ' active' : '');
    chip.style.background = l.color;
    chip.style.color = 'rgba(0,0,0,0.8)';
    chip.dataset.id = l.id;
    chip.innerHTML = `<span>${l.name}</span><span class="del" data-del="${l.id}" title="Delete label">✕</span>`;
    chip.addEventListener('click', e => {
      if (e.target.dataset.del) return;
      state.activeLabel = state.activeLabel === l.id ? null : l.id;
      save();
      renderLabelPanel();
      showHint();
    });
    chip.querySelector('.del').addEventListener('click', e => {
      e.stopPropagation();
      if (!confirm(`Delete label "${l.name}" and all its spans?`)) return;
      state.spans = state.spans.filter(s => s.labelId !== l.id);
      state.labels = state.labels.filter(x => x.id !== l.id);
      if (state.activeLabel === l.id) state.activeLabel = null;
      save();
      renderLabelPanel();
      renderCalendar();
    });
    labelPanel.appendChild(chip);
  }
}

function showHint() {
  if (state.activeLabel) {
    hint.textContent = `Click a day to start selecting — drag or click end day to finish`;
    hint.classList.add('visible');
  } else {
    hint.classList.remove('visible');
  }
}

// ── Bar layout constants ───────────────────────────────────────────────────
const BAR_H        = 14;   // px — bar height
const LANE_STEP    = 17;   // px — bar height + gap between lanes
const CELL_TOP_PAD = 28;   // px — room for day number
const CELL_BOT_PAD = 6;    // px — padding below bottom bar
const CELL_MIN_H   = 56;   // px — minimum cell height (no bars)

// ── Render calendar ──────────────────────────────────────────────────────
const WEEKDAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MONTHS   = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];

function renderCalendar() {
  yearDisplay.textContent = state.year;
  calendarEl.innerHTML = '';
  const covered = coveredDays();
  const tkey = todayKey();

  for (let m = 0; m < 12; m++) {
    const block = document.createElement('div');
    block.className = 'month-block';

    // Title
    const title = document.createElement('div');
    title.className = 'month-title';
    title.textContent = MONTHS[m];
    block.appendChild(title);

    // Weekday headers
    const wh = document.createElement('div');
    wh.className = 'weekday-header';
    WEEKDAYS.forEach(w => {
      const s = document.createElement('span');
      s.textContent = w;
      wh.appendChild(s);
    });
    block.appendChild(wh);

    // Build days grid
    const grid = document.createElement('div');
    grid.className = 'month-grid-wrap';
    grid.dataset.month = m;

    const firstDay = firstDayOfMonth(state.year, m);
    const numDays  = daysInMonth(state.year, m);

    // Empty cells before 1st
    for (let i = 0; i < firstDay; i++) {
      const empty = document.createElement('div');
      empty.className = 'day-cell empty';
      grid.appendChild(empty);
    }

    for (let d = 1; d <= numDays; d++) {
      const key = dateKey(state.year, m, d);
      const cell = document.createElement('div');
      cell.className = 'day-cell' +
        (covered.has(key) ? ' covered' : '') +
        (key === tkey ? ' today' : '');
      cell.dataset.key = key;

      const num = document.createElement('div');
      num.className = 'day-number';
      num.textContent = d;
      cell.appendChild(num);

      // Mouse events for selection
      cell.addEventListener('mousedown', onDayMouseDown);
      cell.addEventListener('mouseenter', onDayMouseEnter);
      cell.addEventListener('mouseup', onDayMouseUp);
      cell.addEventListener('click', onDayClick);
      cell.addEventListener('contextmenu', onDayContextMenu);

      grid.appendChild(cell);
    }

    // Compute segments first so we can size cells before they hit the DOM
    const segments = computeSegments(m, firstDay, numDays);

    // Calculate max lanes per grid row
    const maxLanesPerRow = {};
    for (const seg of segments) {
      const gr = Math.floor((firstDay + seg.startDay - 1) / 7);
      maxLanesPerRow[gr] = Math.max(maxLanesPerRow[gr] || 0, seg.laneRow + 1);
    }

    // Size every cell so its row can hold its bars
    grid.querySelectorAll('.day-cell').forEach(cell => {
      const gr = cell.classList.contains('empty')
        ? 0
        : Math.floor((firstDay + parseInt(cell.dataset.key.split('-')[2]) - 1) / 7);
      const lanes = maxLanesPerRow[gr] || 0;
      cell.style.minHeight = Math.max(CELL_MIN_H, CELL_TOP_PAD + lanes * LANE_STEP + CELL_BOT_PAD) + 'px';
    });

    block.appendChild(grid);
    calendarEl.appendChild(block); // must be in DOM before measuring

    placeBars(grid, m, segments, firstDay);
  }
  renderAvailability();
}

// ── Compute bar segment metadata for a month ──────────────────────────────
function computeSegments(month, firstDay, numDays) {
  const relevantSpans = state.spans.filter(sp =>
    sp.days.some(dk => {
      const d = parseKey(dk);
      return d.getFullYear() === state.year && d.getMonth() === month;
    })
  );
  if (relevantSpans.length === 0) return [];

  const totalCells = firstDay + numDays;
  const numRows    = Math.ceil(totalCells / 7);
  const rowSlots   = [];

  function getOrCreateRow(rowIdx) {
    while (rowSlots.length <= rowIdx) rowSlots.push(new Array(7).fill(null));
    return rowSlots[rowIdx];
  }

  const segments = [];

  for (const sp of relevantSpans) {
    const monthDays = sp.days
      .map(dk => { const d = parseKey(dk); return d.getFullYear()===state.year && d.getMonth()===month ? d.getDate() : null; })
      .filter(x => x !== null)
      .sort((a,b) => a-b);
    if (monthDays.length === 0) continue;

    const allSorted      = [...sp.days].sort();
    const spanStartsHere = (() => { const d = parseKey(allSorted[0]); return d.getFullYear()===state.year && d.getMonth()===month; })();
    const spanEndsHere   = (() => { const d = parseKey(allSorted[allSorted.length-1]); return d.getFullYear()===state.year && d.getMonth()===month; })();

    const runs = [];
    let runStart = monthDays[0], runEnd = monthDays[0];
    for (let i = 1; i < monthDays.length; i++) {
      const prev = monthDays[i-1], cur = monthDays[i];
      if (Math.floor((firstDay+prev-1)/7) === Math.floor((firstDay+cur-1)/7)) {
        runEnd = cur;
      } else {
        runs.push({start: runStart, end: runEnd});
        runStart = cur; runEnd = cur;
      }
    }
    runs.push({start: runStart, end: runEnd});

    let laneRow = 0;
    outer: for (laneRow = 0; ; laneRow++) {
      for (const run of runs) {
        const colStart = (firstDay+run.start-1) % 7;
        const colEnd   = (firstDay+run.end-1)   % 7;
        const row      = Math.floor((firstDay+run.start-1) / 7);
        const slots    = getOrCreateRow(laneRow * numRows + row);
        for (let c = colStart; c <= colEnd; c++) {
          if (slots[c] !== null) continue outer;
        }
      }
      break;
    }

    for (const run of runs) {
      const colStart = (firstDay+run.start-1) % 7;
      const row      = Math.floor((firstDay+run.start-1) / 7);
      const slotKey  = laneRow * numRows + row;
      const colEnd   = (firstDay+run.end-1) % 7;
      getOrCreateRow(slotKey);
      for (let c = colStart; c <= colEnd; c++) rowSlots[slotKey][c] = sp.id;

      segments.push({
        spanId: sp.id, labelId: sp.labelId, laneRow,
        startDay: run.start, endDay: run.end, colStart,
        isStart: run.start === monthDays[0] && spanStartsHere,
        isEnd:   run.end   === monthDays[monthDays.length-1] && spanEndsHere,
      });
    }
  }
  return segments;
}

// ── Place bars as absolutely-positioned elements using measured cell rects ─
function placeBars(grid, month, segments, firstDay) {
  if (!segments.length) return;
  const gridRect = grid.getBoundingClientRect();

  for (const seg of segments) {
    const startCell = grid.querySelector(`[data-key="${dateKey(state.year, month, seg.startDay)}"]`);
    const endCell   = grid.querySelector(`[data-key="${dateKey(state.year, month, seg.endDay)}"]`);
    if (!startCell || !endCell) continue;

    const sr = startCell.getBoundingClientRect();
    const er = endCell.getBoundingClientRect();

    const left  = sr.left - gridRect.left;
    const width = er.right - sr.left;
    const top   = sr.bottom - gridRect.top - BAR_H - (seg.laneRow * LANE_STEP + CELL_BOT_PAD);

    const bar = document.createElement('div');
    const cls = seg.isStart && seg.isEnd ? 'start end' :
                seg.isStart ? 'start' : seg.isEnd ? 'end' : 'middle';
    bar.className    = `bar-seg ${cls}`;
    bar.style.left   = `${left}px`;
    bar.style.top    = `${top}px`;
    bar.style.width  = `${width}px`;
    bar.style.background = colorFor(seg.labelId);
    if (seg.isStart || seg.colStart === 0) {
      const txt = document.createElement('span');
      txt.textContent = nameFor(seg.labelId);
      bar.appendChild(txt);
    }
    bar.title = nameFor(seg.labelId);
    bar.dataset.spanId = seg.spanId;
    bar.addEventListener('click', onBarClick);
    grid.appendChild(bar);
  }
}

// ── Day interaction ────────────────────────────────────────────────────────
function onDayMouseDown(e) {
  if (e.button !== 0) return;
  if (!state.activeLabel) return;
  selecting = true;
  selStart  = e.currentTarget.dataset.key;
  selEnd    = selStart;
  highlightSelection();
}

function onDayMouseEnter(e) {
  if (!selecting) return;
  selEnd = e.currentTarget.dataset.key;
  highlightSelection();
}

function onDayMouseUp(e) {
  if (!selecting) return;
  selecting = false;
  selEnd = e.currentTarget.dataset.key;
  commitSelection();
  clearHighlight();
}

function onDayClick(e) {
  // single-click without drag — handled via mousedown+up
}

function onDayContextMenu(e) {
  e.preventDefault();
  const key = e.currentTarget.dataset.key;
  showContextMenu(e.clientX, e.clientY, key);
}

function highlightSelection() {
  // Clear previous
  document.querySelectorAll('.day-cell.selecting').forEach(c => c.classList.remove('selecting'));
  if (!selStart || !selEnd) return;
  const [a,b] = [selStart, selEnd].sort();
  document.querySelectorAll('.day-cell[data-key]').forEach(cell => {
    const k = cell.dataset.key;
    if (k >= a && k <= b) cell.classList.add('selecting');
  });
}

function clearHighlight() {
  document.querySelectorAll('.day-cell.selecting').forEach(c => c.classList.remove('selecting'));
}

function commitSelection() {
  if (!state.activeLabel || !selStart || !selEnd) return;
  const [a, b] = [selStart, selEnd].sort();
  const days = [];
  const d = parseKey(a);
  const end = parseKey(b);
  while (d <= end) {
    days.push(dateKey(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setDate(d.getDate() + 1);
  }
  state.spans.push({ id: uid(), labelId: state.activeLabel, days });
  selStart = selEnd = null;
  save();
  renderCalendar();
}

// ── Bar click → remove span ────────────────────────────────────────────────
function onBarClick(e) {
  e.stopPropagation();
  const spanId = e.currentTarget.dataset.spanId;
  const sp = state.spans.find(s => s.id === spanId);
  if (!sp) return;
  const label = nameFor(sp.labelId);
  if (!confirm(`Remove "${label}" span?`)) return;
  state.spans = state.spans.filter(s => s.id !== spanId);
  save();
  renderCalendar();
}

// ── Context menu ───────────────────────────────────────────────────────────
function showContextMenu(x, y, dayKey) {
  ctxTitle.textContent = dayKey;
  ctxItems.innerHTML = '';

  // Option to assign any label as single-day span
  for (const l of state.labels) {
    const item = document.createElement('div');
    item.className = 'ctx-item';
    item.innerHTML = `<span class="dot" style="background:${l.color}"></span><span>${l.name}</span>`;
    item.addEventListener('click', () => {
      state.spans.push({ id: uid(), labelId: l.id, days: [dayKey] });
      save();
      renderCalendar();
      hideCtxMenu();
    });
    ctxItems.appendChild(item);
  }

  // Remove options for existing spans on this day
  const spansOnDay = state.spans.filter(s => s.days.includes(dayKey));
  if (spansOnDay.length > 0) {
    const sep = document.createElement('div');
    sep.style.cssText = 'border-top:1px solid var(--border);margin:4px 0';
    ctxItems.appendChild(sep);
    for (const sp of spansOnDay) {
      const item = document.createElement('div');
      item.className = 'ctx-item';
      item.style.color = '#e94560';
      item.innerHTML = `<span class="dot" style="background:${colorFor(sp.labelId)}"></span><span>Remove "${nameFor(sp.labelId)}"</span>`;
      item.addEventListener('click', () => {
        state.spans = state.spans.filter(s => s.id !== sp.id);
        save();
        renderCalendar();
        hideCtxMenu();
      });
      ctxItems.appendChild(item);
    }
  }

  ctxMenu.style.left = Math.min(x, window.innerWidth  - 180) + 'px';
  ctxMenu.style.top  = Math.min(y, window.innerHeight - 200) + 'px';
  ctxMenu.classList.add('visible');
}

function hideCtxMenu() { ctxMenu.classList.remove('visible'); }
document.addEventListener('click', hideCtxMenu);
document.addEventListener('mouseup', e => { if (selecting) { selecting = false; commitSelection(); clearHighlight(); } });

// ── Year controls ──────────────────────────────────────────────────────────
document.getElementById('prev-year').addEventListener('click', () => {
  state.year--; save(); renderCalendar();
});
document.getElementById('next-year').addEventListener('click', () => {
  state.year++; save(); renderCalendar();
});

// ── Add label ──────────────────────────────────────────────────────────────
function addLabel() {
  const name = newLabelInput.value.trim();
  if (!name) return;
  const color = PALETTE[state.labels.length % PALETTE.length];
  const id    = uid();
  state.labels.push({ id, name, color });
  state.activeLabel = id;
  newLabelInput.value = '';
  save();
  renderLabelPanel();
  renderCalendar();
  showHint();
}

addLabelBtn.addEventListener('click', addLabel);
newLabelInput.addEventListener('keydown', e => { if (e.key === 'Enter') addLabel(); });

// ── Share / Export / Import ────────────────────────────────────────────────
function copyShareLink() {
  const payload = encodeURIComponent(JSON.stringify({ labels: state.labels, spans: state.spans, year: state.year }));
  const url = `${location.origin}${location.pathname}#share=${payload}`;
  navigator.clipboard.writeText(url).then(() => {
    const btn = document.getElementById('share-btn');
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = orig; }, 1800);
  });
}

function exportData() {
  const payload = JSON.stringify({ labels: state.labels, spans: state.spans, year: state.year }, null, 2);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
  a.download = `monthly-${state.year}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!data.labels || !data.spans) throw new Error();
      state.labels = data.labels;
      state.spans  = data.spans;
      if (data.year) state.year = data.year;
      state.activeLabel = null;
      save();
      renderLabelPanel();
      renderCalendar();
      showHint();
    } catch { alert('Invalid file — expected a Monthly export.'); }
  };
  reader.readAsText(file);
}

function tryLoadFromHash() {
  const hash = location.hash;
  if (!hash.startsWith('#share=')) return;
  try {
    const data = JSON.parse(decodeURIComponent(hash.slice(7)));
    if (!data.labels || !data.spans) return;
    state.labels = data.labels;
    state.spans  = data.spans;
    if (data.year) state.year = data.year;
    state.activeLabel = null;
    save();
    history.replaceState(null, '', location.pathname); // clean URL
  } catch {}
}

document.getElementById('share-btn').addEventListener('click', copyShareLink);
document.getElementById('export-btn').addEventListener('click', exportData);
document.getElementById('import-file').addEventListener('change', e => {
  importFile(e.target.files[0]);
  e.target.value = ''; // reset so same file can be re-imported
});

// ── Availability sidebar ───────────────────────────────────────────────────
function renderAvailability() {
  const covered = coveredDays();
  availListEl.innerHTML = '';

  for (let m = 0; m < 12; m++) {
    const total = daysInMonth(state.year, m);
    let free = 0;
    for (let d = 1; d <= total; d++) {
      if (!covered.has(dateKey(state.year, m, d))) free++;
    }
    const pct = Math.round((free / total) * 100);

    const row = document.createElement('div');
    row.className = 'avail-row';
    row.innerHTML = `
      <div class="avail-row-top">
        <span class="avail-month">${MONTHS[m].slice(0, 3)}</span>
        <span class="avail-count">${free}<span style="opacity:0.45">/${total}</span></span>
      </div>
      <div class="avail-bar-wrap">
        <div class="avail-bar-fill" style="width:${pct}%"></div>
      </div>`;
    row.addEventListener('click', () => {
      const blocks = document.querySelectorAll('.month-block');
      if (blocks[m]) blocks[m].scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    availListEl.appendChild(row);
  }
}

// ── Init ───────────────────────────────────────────────────────────────────
load();
tryLoadFromHash();
renderLabelPanel();
renderCalendar();
renderAvailability();
showHint();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js');
}

window.addEventListener('resize', renderCalendar);
