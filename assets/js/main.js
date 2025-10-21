// ======== Event Private 5G — eSIM Helper (FULL main.js) ========
// Requires (in this order) in index.html:
//   <script src="./assets/js/vendors/papaparse.min.js"></script>
//   <script src="./assets/js/vendors/qrcode.min.js"></script>
//   <script src="./assets/js/config.js"></script>
//   <script src="./assets/js/main.js"></script>
// Config object comes from assets/js/config.js as window.ESIM_HELPER_CONFIG
// ================================================================

// -- Config & query params ---------------------------------
const CONFIG = window.ESIM_HELPER_CONFIG || {};
const qs = new URLSearchParams(location.search);

// Allow runtime override of the sheet via ?csv=<published-csv-url>
const csvOverride = qs.get('csv');
if (csvOverride) CONFIG.SHEET_CSV_URL = csvOverride;

// Participant code (id) from URL (or empty -> prompt)
let participantId = qs.get('id') || '';

// -- Small utils --------------------------------------------
function html(strings, ...values){ return String.raw({raw:strings}, ...values); }
function deviceIsAndroid(){ return /Android/i.test(navigator.userAgent); }
function deviceIsIOS(){ return /iPhone|iPad|iPod/i.test(navigator.userAgent); }

function toast(msg){
  const s = document.getElementById('status');
  s.textContent = msg;
  s.className = 'mb-4 text-xs px-3 py-2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200';
  setTimeout(()=>{ s.textContent=''; s.className='mb-4 text-sm text-slate-700'; }, 2200);
}

function copy(text){ navigator.clipboard?.writeText(text).then(()=>toast('Copied')); }

// Try a list of URLs; fall through until one works (or gives us Settings root)
function openAny(urls = []) {
  if (!urls.length) return;
  const u = urls.shift();
  try {
    window.location.href = u;
    // Keep trying after a delay, in case the browser ignores an intent form
    setTimeout(()=> openAny(urls), 1200);
  } catch(e) {
    openAny(urls);
  }
}

// Unified helper to open Android Settings pages with multiple formats.
// Uses anchor-click approach to maximize Chrome/OEM compatibility.
function openSettings(action) {
  const candidates = [
    // Chrome-friendly intent URIs (with dummy host + package)
    `intent://open/#Intent;action=${action};package=com.android.settings;end`,
    `intent://settings/#Intent;action=${action};package=com.android.settings;end`,
    // Simple intent fallback
    `intent:#Intent;action=${action};package=com.android.settings;end`,
    // Last resort: Settings root
    'intent://open/#Intent;action=android.settings.SETTINGS;package=com.android.settings;end'
  ];

  (function tryNext(i=0){
    if (i >= candidates.length) return;
    const a = document.createElement('a');
    a.href = candidates[i];
    a.style.display = 'none';
    a.target = '_self'; // same tab keeps gesture context
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ document.body.removeChild(a); tryNext(i+1); }, 1200);
  })();
}

// Normalize CSV row into our expected field names
function normalizeRow(r){
  const map = {};
  for (const k in r) map[k.trim().toLowerCase()] = (r[k] ?? '').toString().trim();
  return {
    id: map['id'] || '',
    name: map['name'] || '',
    activation_code: map['activation_code'] || map['activationcode'] || map['lpa'] || '',
    smdp: map['smdp'] || map['sm-dp+'] || map['sm-dp'] || '',
    iccid: map['iccid'] || '',
    imsi: map['imsi'] || '',
    apn_name: map['apn_name'] || map['apn name'] || '',
    apn_apn: map['apn_apn'] || map['apn'] || '',
    apn_user: map['apn_user'] || map['apn user'] || '',
    apn_pass: map['apn_pass'] || map['apn pass'] || '',
    apn_mcc: map['apn_mcc'] || map['mcc'] || '',
    apn_mnc: map['apn_mnc'] || map['mnc'] || '',
    operator_code: map['operator_code'] || map['operator'] || map['plmn'] || '',
    qr_url: map['qr_url'] || map['qr code'] || map['qr'] || ''
  };
}

// -- Render --------------------------------------------------
function render(row){
  // Header card
  const p = document.getElementById('participant');
  p.classList.remove('hidden');
  p.innerHTML = html`
    <div class="flex items-center justify-between gap-4">
      <div>
        <div class="text-xs uppercase tracking-wider text-slate-500">Participant</div>
        <div class="font-semibold">${row.name || 'Unknown'}</div>
        <div class="text-xs text-slate-500">ID: ${row.id}</div>
      </div>
      <div class="text-right space-y-1 text-xs">
        <div><span class="font-medium">ICCID:</span> ${row.iccid || '-'}</div>
        <div><span class="font-medium">IMSI:</span> ${row.imsi || '-'}</div>
      </div>
    </div>`;

  const steps = document.getElementById('steps');
  steps.innerHTML = '';

  // ---- Quick Access (Android) --------------------------------
  if (deviceIsAndroid()) {
    const quick = document.createElement('li');
    quick.className = 'step-card';
    quick.innerHTML = html`
      <h2 class="font-semibold text-lg mb-2">Quick Access (Android)</h2>
      <div class="flex flex-wrap gap-2">
        <a class="btn" href="javascript:void(0)" onclick="openSettings('android.settings.ADD_ESIM')">Add eSIM</a>
        <a class="btn" href="javascript:void(0)" onclick="openSettings('android.settings.SIM_SETTINGS')">SIM Manager</a>
        <a class="btn" href="javascript:void(0)" onclick="openSettings('android.settings.DATA_ROAMING_SETTINGS')">Data Roaming</a>
        <a class="btn" href="javascript:void(0)" onclick="openSettings('android.settings.APN_SETTINGS')">APN</a>
        <a class="btn" href="javascript:void(0)" onclick="openSettings('android.settings.NETWORK_OPERATOR_SETTINGS')">Network Operators</a>
      </div>
      <p class="text-xs text-slate-500 mt-2">If a deep link is blocked on this device, the Settings root will open. Follow the on-screen path.</p>
    `;
    steps.appendChild(quick);
  }

  // ---- Step 1 — Install eSIM --------------------------------
  const s1 = document.createElement('li');
  s1.className = 'step-card';
  s1.innerHTML = html`
    <h2 class="font-semibold text-lg mb-2">1) Install your eSIM</h2>
    <p class="text-sm text-slate-600 mb-3">Scan the QR below, or tap <span class="kbd">Copy Code</span> then open the eSIM setup screen.</p>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
      <div class="md:col-span-1"><canvas id="qrCanvas" class="bg-white rounded-xl p-2"></canvas></div>
      <div class="md:col-span-2 space-y-2">
        <div class="text-sm"><span class="font-medium">SM-DP+:</span> ${row.smdp || ''}</div>
        <div class="text-sm break-all"><span class="font-medium">Activation code:</span> ${row.activation_code || ''}</div>
        <div class="flex gap-2 pt-1">
          <a class="btn" href="javascript:void(0)" onclick="copy('${(row.activation_code||'').replace(/'/g, '\\\'')}')">Copy Code</a>
          <a class="btn" href="javascript:void(0)" onclick="copy('${(row.smdp||'').replace(/'/g, '\\\'')}')">Copy SM-DP+</a>
          ${
            deviceIsAndroid()
              ? `<a class="btn" href="javascript:void(0)" onclick="openSettings('android.settings.ADD_ESIM')">Open eSIM Setup</a>`
              : `<div class="text-sm">iPhone: open <span class="kbd">Settings → Cellular → Add eSIM</span></div>`
          }
        </div>
        <p class="text-xs text-slate-500">If QR doesn’t auto-open: <span class="kbd">Settings → Network & Internet → SIMs / eSIM</span>, add with activation code.</p>
      </div>
    </div>`;
  steps.appendChild(s1);

  // Render QR safely (don’t block later steps if library issues)
  try {
    const canvas = s1.querySelector('#qrCanvas');
    const qrText = (row.qr_url && row.qr_url.trim()) ? row.qr_url.trim() : (row.activation_code || '');
    if (window.QRCode && canvas && qrText) {
      QRCode.toCanvas(canvas, qrText, { width: 220, margin: 1 }, ()=>{});
    }
  } catch (e) {
    console.warn('QR render failed:', e);
  }

  // ---- Step 2 — Primary SIM & data switching ----------------
  const s2 = document.createElement('li');
  s2.className = 'step-card';
  s2.innerHTML = html`
    <h2 class="font-semibold text-lg mb-2">2) Primary SIM & Data Switching</h2>
    <div class="flex flex-wrap gap-2 mb-2">
      ${
        deviceIsAndroid()
          ? `<a class="btn" href="javascript:void(0)" onclick="openSettings('android.settings.SIM_SETTINGS')">Open SIM Manager</a>`
          : `<div class="text-sm">iPhone: Settings → Cellular → Default Voice Line & Data Switching</div>`
      }
    </div>
    <ul class="list-disc ml-5 text-sm text-slate-700">
      <li>Keep physical SIM as <strong>Primary</strong> for calls/SMS.</li>
      <li>Turn <strong>Data switching</strong> ON.</li>
    </ul>`;
  steps.appendChild(s2);

  // ---- Step 3 — Ensure eSIM enabled -------------------------
  const s3 = document.createElement('li');
  s3.className = 'step-card';
  s3.innerHTML = html`
    <h2 class="font-semibold text-lg mb-2">3) Ensure the eSIM is enabled</h2>
    ${
      deviceIsAndroid()
        ? `<a class="btn" href="javascript:void(0)" onclick="openSettings('android.settings.SIM_SETTINGS')">Open SIM Manager</a>`
        : `<div class="text-sm">iPhone: Settings → Cellular → your eSIM → Enable</div>`
    }`;
  steps.appendChild(s3);

  // ---- Step 4 — Disable Data Roaming ------------------------
  const s4 = document.createElement('li');
  s4.className = 'step-card';
  s4.innerHTML = html`
    <h2 class="font-semibold text-lg mb-2">4) Disable Data Roaming (eSIM)</h2>
    <div class="flex flex-wrap gap-2 mb-2">
      ${
        deviceIsAndroid()
          ? `<a class="btn" href="javascript:void(0)" onclick="openSettings('android.settings.DATA_ROAMING_SETTINGS')">Open Data Roaming</a>`
          : `<div class="text-sm">iPhone: Settings → Cellular → your eSIM → Data Roaming → OFF</div>`
      }
    </div>`;
  steps.appendChild(s4);

  // ---- Step 5 — Validate APN --------------------------------
  const apnName = row.apn_name || 'Event 5G APN';
  const apn = row.apn_apn || 'apn.event5g.local';
  const apnUser = row.apn_user || '';
  const apnPass = row.apn_pass || '';
  const mcc = row.apn_mcc || '';
  const mnc = row.apn_mnc || '';

  const s5 = document.createElement('li');
  s5.className = 'step-card';
  s5.innerHTML = html`
    <h2 class="font-semibold text-lg mb-2">5) Validate APN</h2>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3 text-sm">
      <div><span class="font-medium">Name:</span> ${apnName}</div>
      <div><span class="font-medium">APN:</span> ${apn}</div>
      <div><span class="font-medium">Username:</span> ${apnUser || '—'}</div>
      <div><span class="font-medium">Password:</span> ${apnPass || '—'}</div>
      <div><span class="font-medium">MCC:</span> ${mcc || '—'}</div>
      <div><span class="font-medium">MNC:</span> ${mnc || '—'}</div>
    </div>
    ${
      deviceIsAndroid()
        ? `<a class="btn" href="javascript:void(0)" onclick="openSettings('android.settings.APN_SETTINGS')">Open APN Settings</a>`
        : `<div class="text-sm">iPhone: APN is carrier-controlled and may not be editable.</div>`
    }
    <p class="text-xs text-slate-500 mt-2">If APN is missing, add a new APN with the values above and select it.</p>`;
  steps.appendChild(s5);

  // ---- Step 6 — Network Operators ---------------------------
  const s6 = document.createElement('li');
  s6.className = 'step-card';
  s6.innerHTML = html`
    <h2 class="font-semibold text-lg mb-2">6) Network Operators</h2>
    <p class="text-sm mb-2">Set to Automatic. If multiple networks appear, choose <strong>${row.operator_code || '12345'}</strong>.</p>
    ${
      deviceIsAndroid()
        ? `<a class="btn" href="javascript:void(0)" onclick="openSettings('android.settings.NETWORK_OPERATOR_SETTINGS')">Open Network Operators</a>`
        : `<div class="text-sm">iPhone: Settings → Cellular → Network Selection → Automatic (or choose the event operator).</div>`
    }`;
  steps.appendChild(s6);

  // ---- Optional: simple wizard mode -------------------------
  if (CONFIG.STEP_MODE === 'wizard') {
    const li = [...document.querySelectorAll('#steps > li')];
    li.forEach((el,i)=>{ if(i>0) el.style.display='none'; });
    let i = 0;
    const nav = document.createElement('div');
    nav.className = 'mt-4 flex gap-2';
    nav.innerHTML = `
      <button id="prevBtn" class="btn">Previous</button>
      <button id="nextBtn" class="btn btn-primary">Next</button>`;
    steps.appendChild(nav);
    function show(idx){
      li.forEach((el,j)=>{ el.style.display = j===idx ? '' : 'none'; });
      document.getElementById('prevBtn').disabled = idx===0;
      document.getElementById('nextBtn').textContent = idx===li.length-1 ? 'Finish' : 'Next';
    }
    document.getElementById('prevBtn').onclick = ()=>{ if(i>0) show(--i); };
    document.getElementById('nextBtn').onclick = ()=>{ if(i<li.length-1) show(++i); else toast('All steps done!'); };
    show(0);
  }
}

// -- Data load -----------------------------------------------
async function loadData(){
  const status = document.getElementById('status');
  status.textContent = 'Loading…';

  // No ID? Prompt for setup code inline
  if (!participantId) {
    status.textContent = '';
    const steps = document.getElementById('steps');
    steps.innerHTML = '';
    const card = document.createElement('div');
    card.className = 'step-card';
    card.innerHTML = `
      <h2 class="font-semibold text-lg mb-2">Enter your setup code</h2>
      <p class="text-sm text-slate-600 mb-3">Type the code printed on your badge or sent by SMS.</p>
      <div class="flex gap-2 items-center">
        <input id="codeInput" class="border rounded-xl px-3 py-2 w-48" placeholder="e.g., 1042" />
        <button class="btn btn-primary" id="goBtn">Continue</button>
      </div>
      <p class="text-xs text-slate-500 mt-2">Tip: open with <span class="kbd">?id=1042</span> or switch data with <span class="kbd">?csv=</span>.</p>`;
    steps.appendChild(card);
    card.querySelector('#goBtn').addEventListener('click', ()=>{
      const v = (document.getElementById('codeInput').value || '').trim();
      if (!v) return toast('Please enter your code');
      const url = new URL(location.href);
      url.searchParams.set('id', v);
      location.href = url.toString();
    });
    return;
  }

  // Load CSV
  const csvUrl = CONFIG.SHEET_CSV_URL;
  let row = null;

  if (csvUrl && csvUrl.startsWith('http')) {
    try {
      const res = await fetch(csvUrl, { cache: 'no-store' });
      const text = await res.text();
      const parsed = Papa.parse(text, { header: true });
      const rows = parsed.data.map(normalizeRow);
      row = rows.find(r => r.id === participantId) || null;
    } catch (e) {
      console.warn('Failed to load sheet CSV:', e);
    }
  }

  // Fallback to demo row
  if (!row) {
    row = { ...(CONFIG.DEMO_ROW || {}) };
    row.id = row.id || participantId || 'demo-001';
  }

  status.textContent = '';
  render(row);
}

loadData();
