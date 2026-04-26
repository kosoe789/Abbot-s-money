// ================================================================
//  CONFIG
// ================================================================
const SHEET_ID = '1LpXHsyhyjmOV_S5BYw7imBwgHIsSMsaE6Qt6VyVtuos';
const SHEETS = { incomes: 'incomes', outgoings: 'outgoings' };

// Columns to exclude (exact match after trim)
const EXCLUDE_COLS = [
  'မေဃဝတီဆရာတော်နှင့်ဆက်စပ်ရငွေစာရင်း အစဥ်',
  'မေဃဝတီဆရာတော်နှင့်ဆက်စပ်သုံးငွေစာရင်း အစဥ်',
  'မေဃဝတီဆရာတော်နှင့်ဆက်စပ်သုံးငွေစာရင်း',
  'မေဃဝတီဆရာတော်နှင့်ဆက်စပ်ရငွေစာရင်း',
];

// ================================================================
//  STATE
// ================================================================
let allRows = [];
let combinedHeaders = [];

// ================================================================
//  FETCH
// ================================================================
function sheetUrl(name) {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(name)}`;
}

async function fetchSheet(name) {
  const res = await fetch(sheetUrl(name));
  const text = await res.text();
  const json = JSON.parse(text.slice(text.indexOf('(') + 1, text.lastIndexOf(')')));
  const cols = json.table.cols.map(c => (c.label || c.id || '').trim());
  const rows = (json.table.rows || []).map(row =>
    row.c.map(cell => {
      if (!cell) return '';
      // Prefer formatted value (f), fallback to raw value (v)
      if (cell.f !== undefined && cell.f !== null) return cell.f;
      if (cell.v !== undefined && cell.v !== null) return cell.v;
      return '';
    })
  );
  return { cols, rows };
}

// ================================================================
//  INIT
// ================================================================
async function init() {
  try {
    const [inc, out] = await Promise.all([
      fetchSheet(SHEETS.incomes),
      fetchSheet(SHEETS.outgoings)
    ]);

    // Filter out excluded columns, get indices to keep
    function getKeepIndices(cols) {
      return cols.map((c, i) => ({ c, i }))
                 .filter(({ c }) => !EXCLUDE_COLS.some(ex => c.includes(ex) || ex.includes(c)))
                 .map(({ c, i }) => ({ col: c, idx: i }));
    }

    const incKeep = getKeepIndices(inc.cols);
    const outKeep = getKeepIndices(out.cols);

    // Build combined headers (union of both sheets' kept cols)
    const incColNames = incKeep.map(k => k.col);
    const outColNames = outKeep.map(k => k.col);
    combinedHeaders = [...incColNames];
    outColNames.forEach(c => { if (c && !combinedHeaders.includes(c)) combinedHeaders.push(c); });

    // Map a row to combined headers using keep indices
    function mapRow(row, keepList, type) {
      // Build a map: colName -> value
      const valMap = {};
      keepList.forEach(({ col, idx }) => {
        valMap[col] = row[idx] !== undefined ? String(row[idx]) : '';
      });
      const mapped = combinedHeaders.map(h => valMap[h] !== undefined ? valMap[h] : '');
      return { type, cols: mapped };
    }

    // Filter empty rows
    const isEmptyRow = r => r.every(c => String(c).trim() === '');

    const incRows = inc.rows.filter(r => !isEmptyRow(r)).map(r => mapRow(r, incKeep, 'ဝင်ငွေ'));
    const outRows = out.rows.filter(r => !isEmptyRow(r)).map(r => mapRow(r, outKeep, 'ထွက်ငွေ'));

    allRows = [...incRows, ...outRows];

    document.getElementById('loading-main').style.display = 'none';

    buildNameFilter();
    updateSummary();
    applyFilters();

    document.getElementById('last-updated').textContent =
      'နောက်ဆုံးပြင်ဆင်ချိန်: ' + new Date().toLocaleString('my-MM');
  } catch (e) {
    document.getElementById('loading-main').innerHTML =
      `<span style="color:#e74c3c">❌ Sheet ဖတ်၍မရပါ။ Sheet ကို <b>Anyone with link → Viewer</b> ထားပြီး refresh လုပ်ပါ။</span>`;
    console.error(e);
  }
}

// ================================================================
//  NAME FILTER — find "နာမည်" column index and populate dropdown
// ================================================================
function getNameColIndex() {
  // Look for column whose name contains "နာမည်"
  const idx = combinedHeaders.findIndex(h => h.includes('နာမည်'));
  return idx >= 0 ? idx : 0; // fallback to first col
}

function buildNameFilter() {
  const sel = document.getElementById('col-filter');
  const nameIdx = getNameColIndex();
  const vals = [...new Set(allRows.map(r => String(r.cols[nameIdx]).trim()).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">အားလုံး</option>';
  vals.forEach(v => {
    const o = document.createElement('option');
    o.value = v; o.textContent = v;
    sel.appendChild(o);
  });
}

// ================================================================
//  SUMMARY — find last numeric column per row (amount column)
// ================================================================
function parseAmount(val) {
  if (val === '' || val === null || val === undefined) return NaN;
  return parseFloat(String(val).replace(/,/g, '').replace(/[^0-9.-]/g, ''));
}

function sumRows(rows) {
  let total = 0;
  rows.forEach(r => {
    // Find the last column with a valid positive number (amount)
    for (let i = r.cols.length - 1; i >= 0; i--) {
      const v = parseAmount(r.cols[i]);
      if (!isNaN(v) && v > 0) {
        total += v;
        break;
      }
    }
  });
  return total;
}

function fmt(n) {
  return Math.round(n).toLocaleString('en-US');
}

function updateSummary() {
  const incRows = allRows.filter(r => r.type === 'ဝင်ငွေ');
  const outRows = allRows.filter(r => r.type === 'ထွက်ငွေ');
  const inc = sumRows(incRows);
  const out = sumRows(outRows);
  const bal = inc - out;

  document.getElementById('total-income').textContent   = fmt(inc);
  document.getElementById('total-outgoing').textContent = fmt(out);
  const balEl = document.getElementById('balance');
  balEl.textContent = fmt(bal);
  balEl.style.color = bal >= 0 ? 'var(--income-green)' : 'var(--outgoing-red)';
}

// ================================================================
//  RENDER TABLE
// ================================================================
function renderTable(rows) {
  const thead   = document.getElementById('main-thead');
  const tbody   = document.getElementById('main-tbody');
  const nodata  = document.getElementById('nodata-main');

  // Header
  thead.innerHTML = '';
  const tr = document.createElement('tr');
  const thNum = document.createElement('th'); thNum.textContent = 'စဉ်'; tr.appendChild(thNum);
  const thType = document.createElement('th'); thType.textContent = 'အမျိုးအစား'; tr.appendChild(thType);
  combinedHeaders.forEach(h => {
    const th = document.createElement('th'); th.textContent = h; tr.appendChild(th);
  });
  thead.appendChild(tr);

  // Body
  tbody.innerHTML = '';
  if (rows.length === 0) { nodata.style.display = 'block'; return; }
  nodata.style.display = 'none';

  rows.forEach((row, i) => {
    const tr = document.createElement('tr');
    const isIncome = row.type === 'ဝင်ငွေ';

    // Row number
    const tdNum = document.createElement('td');
    tdNum.textContent = i + 1;
    tdNum.style.cssText = 'color:#999;font-size:0.8rem;';
    tr.appendChild(tdNum);

    // Type badge
    const tdType = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = 'badge ' + (isIncome ? 'badge-income' : 'badge-outgoing');
    badge.textContent = isIncome ? '📈 ဝင်ငွေ' : '📉 ထွက်ငွေ';
    tdType.appendChild(badge);
    tr.appendChild(tdType);

    // Data cells
    row.cols.forEach(cell => {
      const td = document.createElement('td');
      const val = String(cell);
      const num = parseAmount(val);
      if (!isNaN(num) && num > 0 && val.trim() !== '') {
        td.classList.add(isIncome ? 'num-income' : 'num-outgoing');
      }
      td.textContent = val;
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
}

// ================================================================
//  FILTERS
// ================================================================
function applyFilters() {
  const search  = document.getElementById('search-input').value.toLowerCase().trim();
  const typeF   = document.getElementById('type-filter').value;
  const nameF   = document.getElementById('col-filter').value;
  const nameIdx = getNameColIndex();

  const filtered = allRows.filter(row => {
    const matchSearch = !search || row.cols.some(c => String(c).toLowerCase().includes(search));
    const matchType   = !typeF  || row.type === typeF;
    const matchName   = !nameF  || String(row.cols[nameIdx]).trim() === nameF;
    return matchSearch && matchType && matchName;
  });

  renderTable(filtered);
}

// ================================================================
//  START
// ================================================================
init();
