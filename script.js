// ================================================================
//  CONFIG
// ================================================================
const SHEET_ID = '1LpXHsyhyjmOV_S5BYw7imBwgHIsSMsaE6Qt6VyVtuos';
const SHEETS = { incomes: 'incomes', outgoings: 'outgoings' };

// Columns to exclude
const EXCLUDE_COLS = ['အစဥ်'];

// ================================================================
//  STATE
// ================================================================
let allRows = [];
let combinedHeaders = [];

// ================================================================
//  FETCH — Sheet has title in row1, empty row2, headers in row3
//  So we fetch with range starting from row 3
// ================================================================
function sheetUrl(name) {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(name)}&range=A3:Z1000`;
}

async function fetchSheet(name) {
  const res = await fetch(sheetUrl(name));
  const text = await res.text();
  const json = JSON.parse(text.slice(text.indexOf('(') + 1, text.lastIndexOf(')')));

  const cols = json.table.cols.map(c => (c.label || c.id || '').trim());
  const rows = (json.table.rows || []).map(row =>
    row.c.map(cell => {
      if (!cell) return '';
      if (cell.f !== undefined && cell.f !== null) return String(cell.f);
      if (cell.v !== undefined && cell.v !== null) return String(cell.v);
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

    // Keep only non-excluded, non-empty columns
    function getKeepIndices(cols) {
      return cols
        .map((c, i) => ({ col: c, idx: i }))
        .filter(({ col }) => col !== '' && !EXCLUDE_COLS.includes(col.trim()));
    }

    const incKeep = getKeepIndices(inc.cols);
    const outKeep = getKeepIndices(out.cols);

    // Build unified headers
    const incColNames = incKeep.map(k => k.col);
    const outColNames = outKeep.map(k => k.col);
    combinedHeaders = [...incColNames];
    outColNames.forEach(c => { if (c && !combinedHeaders.includes(c)) combinedHeaders.push(c); });

    // Map row to combined headers
    function mapRow(row, keepList, type) {
      const valMap = {};
      keepList.forEach(({ col, idx }) => {
        valMap[col] = row[idx] !== undefined ? String(row[idx]) : '';
      });
      const mapped = combinedHeaders.map(h => valMap[h] !== undefined ? valMap[h] : '');
      return { type, cols: mapped };
    }

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
//  NAME FILTER
// ================================================================
function getNameColIndex() {
  const idx = combinedHeaders.findIndex(h => h.includes('နာမည်'));
  return idx >= 0 ? idx : 0;
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
//  SUMMARY — ပမာဏ column (index 1, value "ပမာဏ") ကနေ တွက်မည်
// ================================================================
function getAmountColIndex() {
  const idx = combinedHeaders.findIndex(h => h.includes('ပမာဏ'));
  return idx >= 0 ? idx : combinedHeaders.length - 1;
}

function parseAmount(val) {
  return parseFloat(String(val).replace(/,/g, '').replace(/[^0-9.-]/g, ''));
}

function sumRows(rows) {
  const amtIdx = getAmountColIndex();
  let total = 0;
  rows.forEach(r => {
    const v = parseAmount(r.cols[amtIdx]);
    if (!isNaN(v)) total += v;
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
  const thead  = document.getElementById('main-thead');
  const tbody  = document.getElementById('main-tbody');
  const nodata = document.getElementById('nodata-main');

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

  const amtIdx = getAmountColIndex();

  rows.forEach((row, i) => {
    const tr = document.createElement('tr');
    const isIncome = row.type === 'ဝင်ငွေ';

    const tdNum = document.createElement('td');
    tdNum.textContent = i + 1;
    tdNum.style.cssText = 'color:#999;font-size:0.8rem;text-align:center;';
    tr.appendChild(tdNum);

    const tdType = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = 'badge ' + (isIncome ? 'badge-income' : 'badge-outgoing');
    badge.textContent = isIncome ? '📈 ဝင်ငွေ' : '📉 ထွက်ငွေ';
    tdType.appendChild(badge);
    tr.appendChild(tdType);

    row.cols.forEach((cell, ci) => {
      const td = document.createElement('td');
      const val = String(cell);
      if (ci === amtIdx) {
        const num = parseAmount(val);
        if (!isNaN(num)) {
          td.classList.add(isIncome ? 'num-income' : 'num-outgoing');
          td.textContent = Math.round(num).toLocaleString('en-US');
          td.style.textAlign = 'right';
        } else {
          td.textContent = val;
        }
      } else {
        td.textContent = val;
      }
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
