// ================================================================
//  CONFIG — သင့် Google Sheet ID ထည့်ပါ
// ================================================================
const SHEET_ID = '1LpXHsyhyjmOV_S5BYw7imBwgHIsSMsaE6Qt6VyVtuos';

// Sheet names (Google Sheets ထဲမှ Sheet tab နာမည်တိတိပပ ထည့်ပါ)
const SHEETS = {
  incomes:   'incomes',
  outgoings: 'outgoings'
};

// ================================================================
//  STATE
// ================================================================
let allData = { incomes: [], outgoings: [] };
let headers = { incomes: [], outgoings: [] };
let activeTab = 'incomes';

// ================================================================
//  FETCH SHEET DATA via Google Visualization API (no API key needed)
// ================================================================
function sheetUrl(sheetName) {
  return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
}

async function fetchSheet(sheetName) {
  const url = sheetUrl(sheetName);
  const res = await fetch(url);
  const text = await res.text();
  // Google wraps response in: google.visualization.Query.setResponse({...});
  const jsonStr = text.slice(text.indexOf('(') + 1, text.lastIndexOf(')'));
  const json = JSON.parse(jsonStr);
  return json;
}

function parseGvizResponse(json) {
  const cols = json.table.cols.map(c => c.label || c.id);
  const rows = (json.table.rows || []).map(row => {
    return row.c.map(cell => {
      if (!cell) return '';
      return cell.f !== undefined && cell.f !== null ? cell.f : (cell.v !== null && cell.v !== undefined ? cell.v : '');
    });
  });
  return { cols, rows };
}

// ================================================================
//  INIT — load both sheets
// ================================================================
async function init() {
  await Promise.all([
    loadSheet('incomes'),
    loadSheet('outgoings')
  ]);
  updateSummary();
  populateFilters();
  applyFilters();
  document.getElementById('last-updated').textContent =
    'နောက်ဆုံးပြင်ဆင်ချိန်: ' + new Date().toLocaleString('my-MM');
}

async function loadSheet(sheetKey) {
  const loadingEl = document.getElementById(`loading-${sheetKey}`);
  try {
    const json = await fetchSheet(SHEETS[sheetKey]);
    const { cols, rows } = parseGvizResponse(json);
    headers[sheetKey] = cols;
    allData[sheetKey] = rows;
    renderTable(sheetKey, rows, cols);
    loadingEl.style.display = 'none';
  } catch (e) {
    loadingEl.innerHTML = `<span style="color:#e74c3c">❌ Sheet ဖတ်၍မရပါ။ Sheet ကို <b>Anyone with link - Viewer</b> ထားပြီး refresh လုပ်ပါ။</span>`;
    console.error(`Error loading ${sheetKey}:`, e);
  }
}

// ================================================================
//  RENDER TABLE
// ================================================================
function renderTable(sheetKey, rows, cols) {
  const thead = document.getElementById(`thead-${sheetKey}`);
  const tbody = document.getElementById(`tbody-${sheetKey}`);
  const nodata = document.getElementById(`nodata-${sheetKey}`);

  // Header
  thead.innerHTML = '';
  const tr = document.createElement('tr');
  const numTh = document.createElement('th');
  numTh.textContent = 'စဉ်';
  tr.appendChild(numTh);
  cols.forEach(col => {
    const th = document.createElement('th');
    th.textContent = col;
    tr.appendChild(th);
  });
  thead.appendChild(tr);

  // Body
  tbody.innerHTML = '';
  if (rows.length === 0) {
    nodata.style.display = 'block';
    return;
  }
  nodata.style.display = 'none';

  rows.forEach((row, i) => {
    const tr = document.createElement('tr');
    const numTd = document.createElement('td');
    numTd.textContent = i + 1;
    numTd.style.color = '#999';
    numTd.style.fontSize = '0.82rem';
    tr.appendChild(numTd);

    row.forEach(cell => {
      const td = document.createElement('td');
      const val = String(cell);
      // Try to detect numeric/money columns and color them
      const numVal = parseFloat(String(cell).replace(/,/g, ''));
      if (!isNaN(numVal) && String(cell).trim() !== '') {
        if (sheetKey === 'incomes') {
          td.classList.add('num-positive');
        } else {
          td.classList.add('num-negative');
        }
        td.textContent = val;
      } else {
        td.textContent = val;
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

// ================================================================
//  SUMMARY
// ================================================================
function sumLastNumericCol(rows) {
  let total = 0;
  rows.forEach(row => {
    for (let i = row.length - 1; i >= 0; i--) {
      const v = parseFloat(String(row[i]).replace(/,/g, ''));
      if (!isNaN(v)) { total += v; break; }
    }
  });
  return total;
}

function formatNum(n) {
  return n.toLocaleString('en-US');
}

function updateSummary() {
  const inc  = sumLastNumericCol(allData.incomes);
  const out  = sumLastNumericCol(allData.outgoings);
  const bal  = inc - out;
  document.getElementById('total-income').textContent   = formatNum(inc);
  document.getElementById('total-outgoing').textContent = formatNum(out);
  const balEl = document.getElementById('balance');
  balEl.textContent = formatNum(bal);
  balEl.style.color = bal >= 0 ? 'var(--income-green)' : 'var(--outgoing-red)';
}

// ================================================================
//  FILTERS
// ================================================================
function populateFilters() {
  // Populate dropdowns based on first two columns
  populateDropdown('col-filter-1', 0);
  populateDropdown('col-filter-2', 1);
}

function populateDropdown(selectId, colIndex) {
  const sel = document.getElementById(selectId);
  const data = allData[activeTab];
  const values = [...new Set(data.map(row => row[colIndex]).filter(Boolean))];
  sel.innerHTML = '<option value="">အားလုံး</option>';
  values.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    sel.appendChild(opt);
  });
}

function applyFilters() {
  const search = document.getElementById('search-input').value.toLowerCase();
  const f1 = document.getElementById('col-filter-1').value;
  const f2 = document.getElementById('col-filter-2').value;
  const data = allData[activeTab];
  const cols = headers[activeTab];

  const filtered = data.filter(row => {
    const matchSearch = !search || row.some(c => String(c).toLowerCase().includes(search));
    const match1 = !f1 || String(row[0]) === f1;
    const match2 = !f2 || String(row[1]) === f2;
    return matchSearch && match1 && match2;
  });

  renderTable(activeTab, filtered, cols);
}

// ================================================================
//  TAB SWITCH
// ================================================================
function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  document.querySelectorAll('.table-section').forEach(sec => {
    sec.classList.toggle('hidden', sec.id !== `tab-${tab}`);
  });
  // reset filters
  document.getElementById('search-input').value = '';
  document.getElementById('col-filter-1').value = '';
  document.getElementById('col-filter-2').value = '';
  populateFilters();
  applyFilters();
}

// ================================================================
//  START
// ================================================================
init();
