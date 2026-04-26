// ================================================================
//  CONFIG
// ================================================================
const SHEET_ID = '1LpXHsyhyjmOV_S5BYw7imBwgHIsSMsaE6Qt6VyVtuos';
const SHEETS = { incomes: 'incomes', outgoings: 'outgoings' };

// ================================================================
//  STATE
// ================================================================
let allRows = [];       // combined rows: { type, cols:[] }
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
  const cols = json.table.cols.map(c => c.label || c.id);
  const rows = (json.table.rows || []).map(row =>
    row.c.map(cell => {
      if (!cell) return '';
      return cell.f !== undefined && cell.f !== null ? cell.f : (cell.v !== null && cell.v !== undefined ? cell.v : '');
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

    // Build unified headers: merge both sheets' headers (excluding duplicate "မေဃဝတီဆရာတော်နှင့်ဆက်စပ်သုံးငွေစာရင်း" type cols)
    const EXCLUDE = ['မေဃဝတီဆရာတော်နှင့်ဆက်စပ်သုံးငွေစာရင်း'];

    const incCols = inc.cols.filter(c => !EXCLUDE.includes(c.trim()));
    const outCols = out.cols.filter(c => !EXCLUDE.includes(c.trim()));

    // Use incomes headers as base, add any extra from outgoings
    combinedHeaders = [...incCols];
    outCols.forEach(c => { if (!combinedHeaders.includes(c)) combinedHeaders.push(c); });

    // Map rows to combined headers
    function mapRow(row, origCols, type) {
      const filtered = origCols
        .map((col, i) => ({ col: col.trim(), val: row[i] !== undefined ? row[i] : '' }))
        .filter(({ col }) => !EXCLUDE.includes(col));

      const mapped = combinedHeaders.map(h => {
        const found = filtered.find(f => f.col === h);
        return found ? found.val : '';
      });
      return { type, cols: mapped };
    }

    // Filter out completely empty rows
    const incRows = inc.rows
      .filter(r => r.some(c => String(c).trim() !== ''))
      .map(r => mapRow(r, inc.cols, 'ဝင်ငွေ'));
    const outRows = out.rows
      .filter(r => r.some(c => String(c).trim() !== ''))
      .map(r => mapRow(r, out.cols, 'ထွက်ငွေ'));

    allRows = [...incRows, ...outRows];

    document.getElementById('loading-main').style.display = 'none';

    buildColFilter();
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
//  BUILD COLUMN FILTER (first non-empty column values)
// ================================================================
function buildColFilter() {
  const sel = document.getElementById('col-filter');
  const vals = [...new Set(allRows.map(r => String(r.cols[0])).filter(Boolean))];
  sel.innerHTML = '<option value="">အားလုံး</option>';
  vals.forEach(v => {
    const o = document.createElement('option');
    o.value = v; o.textContent = v;
    sel.appendChild(o);
  });
}

// ================================================================
//  SUMMARY
// ================================================================
function sumAmount(rows) {
  let total = 0;
  rows.forEach(r => {
    for (let i = r.cols.length - 1; i >= 0; i--) {
      const v = parseFloat(String(r.cols[i]).replace(/,/g, ''));
      if (!isNaN(v)) { total += v; break; }
    }
  });
  return total;
}

function fmt(n) { return n.toLocaleString('en-US'); }

function updateSummary() {
  const inc = sumAmount(allRows.filter(r => r.type === 'ဝင်ငွေ'));
  const out = sumAmount(allRows.filter(r => r.type === 'ထွက်ငွေ'));
  const bal = inc - out;
  document.getElementById('total-income').textContent   = fmt(inc);
  document.getElementById('total-outgoing').textContent = fmt(out);
  const balEl = document.getElementById('balance');
  balEl.textContent = fmt(bal);
  balEl.style.color = bal >= 0 ? 'var(--income-green)' : 'var(--outgoing-red)';
}

// ================================================================
//  RENDER
// ================================================================
function renderTable(rows) {
  const thead = document.getElementById('main-thead');
  const tbody = document.getElementById('main-tbody');
  const nodata = document.getElementById('nodata-main');

  // Header
  thead.innerHTML = '';
  const tr = document.createElement('tr');
  // Row number
  const thNum = document.createElement('th'); thNum.textContent = 'စဉ်'; tr.appendChild(thNum);
  // Type
  const thType = document.createElement('th'); thType.textContent = 'အမျိုးအစား'; tr.appendChild(thType);
  // Data cols
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
    tr.classList.add(row.type === 'ဝင်ငွေ' ? 'row-income' : 'row-outgoing');

    const tdNum = document.createElement('td');
    tdNum.textContent = i + 1;
    tdNum.style.color = '#999'; tdNum.style.fontSize = '0.8rem';
    tr.appendChild(tdNum);

    const tdType = document.createElement('td');
    const badge = document.createElement('span');
    badge.classList.add('badge', row.type === 'ဝင်ငွေ' ? 'badge-income' : 'badge-outgoing');
    badge.textContent = row.type === 'ဝင်ငွေ' ? '📈 ဝင်ငွေ' : '📉 ထွက်ငွေ';
    tdType.appendChild(badge);
    tr.appendChild(tdType);

    row.cols.forEach((cell, ci) => {
      const td = document.createElement('td');
      const val = String(cell);
      const num = parseFloat(val.replace(/,/g, ''));
      // Last column or numeric — color it
      if (!isNaN(num) && val.trim() !== '') {
        td.classList.add(row.type === 'ဝင်ငွေ' ? 'num-income' : 'num-outgoing');
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
  const search = document.getElementById('search-input').value.toLowerCase();
  const typeF  = document.getElementById('type-filter').value;
  const colF   = document.getElementById('col-filter').value;

  const filtered = allRows.filter(row => {
    const matchSearch = !search || row.cols.some(c => String(c).toLowerCase().includes(search));
    const matchType   = !typeF  || row.type === typeF;
    const matchCol    = !colF   || String(row.cols[0]) === colF;
    return matchSearch && matchType && matchCol;
  });

  renderTable(filtered);
}

// ================================================================
//  START
// ================================================================
init();
