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
  // Bind any data-action/data-copy elements we added via innerHTML
  try { bindSettingsLinks(steps); } catch(e){ console.warn('bindSettingsLinks failed', e); }
}

// Unified helper to open Android Settings pages with multiple formats.
// Uses anchor-click approach to maximize Chrome/OEM compatibility.
function openSettings(action) {
  console.info('openSettings invoked', action);
  // Safer strategy: open Settings root first (safe) and offer an explicit
  // "Try deep link" button so we don't immediately trigger an unsupported
  // action that shows an "Item not found" page on some devices.
  if (!deviceIsAndroid()) {
    // Non-Android: instruct the user instead
    toast('Open your Settings app and follow the on-screen path');
    return;
  }

  // Build curated alternate action names for vendor differences.
  // IMPORTANT: avoid doing in-string replacements like replacing
  // 'APN_SETTINGS' with 'com.android.settings.APN_SETTINGS' because that
  // produced malformed actions such as
  // 'android.settings.com.android.settings.APN_SETTINGS'. Instead, add
  // standalone alternative action identifiers.
  const variants = [action];
  try {
    const base = action.split('.').pop(); // last token, e.g. 'APN_SETTINGS'
    // Curated action variants per feature to increase chance of success on OEM ROMs
    if (base === 'SIM_SETTINGS' || base === 'SIM_MANAGEMENT_SETTINGS') {
      variants.push(
        'android.settings.SIM_SETTINGS',
        'android.settings.SIM_MANAGEMENT_SETTINGS',
        'com.android.settings.SIM_SETTINGS',
        'com.android.settings.SIM_MANAGEMENT_SETTINGS'
      );
      // Samsung-specific class-based actions sometimes exist
      variants.push('com.samsung.android.settings.sim.SimSettings');
    } else if (base === 'ADD_ESIM') {
      variants.push(
        'android.settings.ADD_ESIM',
        'com.android.settings.action.ADD_ESIM',
        'com.samsung.android.settings.action.ADD_ESIM'
      );
    } else if (base === 'APN_SETTINGS') {
      variants.push(
        'android.settings.APN_SETTINGS',
        'com.android.settings.APN_SETTINGS',
        'com.samsung.android.settings.APN_SETTINGS',
        'com.samsung.settings.ApnSettings'
      );
    } else if (base === 'DATA_ROAMING_SETTINGS') {
      variants.push(
        'android.settings.DATA_ROAMING_SETTINGS',
        'com.android.settings.DATA_ROAMING_SETTINGS',
        'com.samsung.android.settings.DATA_ROAMING_SETTINGS'
      );
    } else if (base === 'NETWORK_OPERATOR_SETTINGS') {
      variants.push(
        'android.settings.NETWORK_OPERATOR_SETTINGS',
        'com.android.settings.NETWORK_OPERATOR_SETTINGS',
        'com.samsung.android.settings.NETWORK_OPERATOR_SETTINGS'
      );
    } else {
      // Generic fallback: try the base under common prefixes.
      variants.push(`android.settings.${base}`);
      variants.push(`com.android.settings.${base}`);
      variants.push(`com.samsung.android.settings.${base}`);
    }
  } catch(e) { /* ignore */ }

  let deepCandidates = [];
  const extraPackages = [
    'com.android.settings',
    'com.samsung.android.settings',
    'com.samsung.android.sm',
    'com.samsung.android.app.settings',
    'com.samsung.settings'
  ];
  for (const act of variants) {
    // Try package-less intents first (allow the system to resolve to the
    // correct OEM settings package). Then include package-specific forms.
    deepCandidates.push(`intent://open/#Intent;action=${act};end`);
    deepCandidates.push(`intent://settings/#Intent;action=${act};end`);
    deepCandidates.push(`intent:#Intent;action=${act};end`);
    for (const pkg of extraPackages) {
      deepCandidates.push(`intent://open/#Intent;action=${act};package=${pkg};end`);
      deepCandidates.push(`intent://settings/#Intent;action=${act};package=${pkg};end`);
      deepCandidates.push(`intent:#Intent;action=${act};package=${pkg};end`);
    }
  }
  // Deduplicate candidates while preserving order
  deepCandidates = deepCandidates.filter((v,i,self)=> self.indexOf(v) === i);

  const settingsRoot = 'intent://open/#Intent;action=android.settings.SETTINGS;package=com.android.settings;end';

  // Open Settings root immediately (less likely to show "Item not found").
  (function openRoot(){
    const a = document.createElement('a');
    a.href = settingsRoot;
    a.style.display = 'none';
    a.target = '_self';
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{ document.body.removeChild(a); }, 800);
  })();

  // Create a diagnostic panel listing all deep-link candidates so the user can
  // try each one individually (prevents automatic Item not found pages).
  const existing = document.getElementById('deepLinkPanel');
  if (existing) existing.remove();
  const panel = document.createElement('div');
  panel.id = 'deepLinkPanel';
  panel.style.position = 'fixed';
  panel.style.right = '12px';
  panel.style.bottom = '12px';
  panel.style.background = 'white';
  panel.style.border = '1px solid #e6e6e6';
  panel.style.padding = '10px';
  panel.style.borderRadius = '8px';
  panel.style.boxShadow = '0 6px 18px rgba(0,0,0,0.08)';
  panel.style.zIndex = 9999;
  const header = document.createElement('div');
  header.style.fontSize = '13px';
  header.style.marginBottom = '8px';
  header.style.color = '#334155';
  header.textContent = 'Settings opened. Try a direct deep-link candidate below (tap to try).';
  panel.appendChild(header);

  const list = document.createElement('div');
  list.style.maxHeight = '260px';
  list.style.overflow = 'auto';
  list.style.display = 'flex';
  list.style.flexDirection = 'column';
  list.style.gap = '6px';
  deepCandidates.forEach((href, idx)=>{
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '6px';
    row.style.alignItems = 'center';

    const txt = document.createElement('div');
    txt.style.fontSize = '12px';
    txt.style.color = '#0f172a';
    txt.style.flex = '1 1 auto';
    txt.textContent = href.length > 80 ? href.slice(0,76) + '…' : href;
    txt.title = href;

    const tryBtn = document.createElement('button');
    tryBtn.className = 'btn';
    tryBtn.textContent = 'Try';
    tryBtn.dataset.href = href;

    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn';
    copyBtn.textContent = 'Copy';
    copyBtn.dataset.href = href;

    row.appendChild(txt);
    row.appendChild(tryBtn);
    row.appendChild(copyBtn);
    list.appendChild(row);
  });

  panel.appendChild(list);

  const footer = document.createElement('div');
  footer.style.display = 'flex';
  footer.style.justifyContent = 'flex-end';
  footer.style.marginTop = '8px';
  footer.style.gap = '8px';
  const copyDiagBtn = document.createElement('button');
  copyDiagBtn.className = 'btn';
  copyDiagBtn.textContent = 'Copy diagnostics';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn';
  closeBtn.textContent = 'Close';
  footer.appendChild(copyDiagBtn);
  footer.appendChild(closeBtn);
  panel.appendChild(footer);

  document.body.appendChild(panel);

  closeBtn.addEventListener('click', ()=>{ panel.remove(); });

  copyDiagBtn.addEventListener('click', ()=>{
    const diag = {
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      candidates: deepCandidates
    };
    const txt = JSON.stringify(diag, null, 2);
    navigator.clipboard?.writeText(txt).then(()=> toast('Diagnostics copied'));
  });

  // Delegated handler for Try and Copy buttons
  list.addEventListener('click', (ev)=>{
    const t = ev.target;
    if (!t.dataset || !t.dataset.href) return;
    const href = t.dataset.href;
    if (t.textContent === 'Copy') {
      navigator.clipboard?.writeText(href).then(()=>toast('Candidate copied'));
      return;
    }
    if (t.textContent === 'Try') {
      console.info('openSettings: user-triggered try', href);
      const a = document.createElement('a');
      a.href = href;
      a.style.display = 'none';
      a.target = '_self';
      document.body.appendChild(a);
      a.click();
      setTimeout(()=>{ document.body.removeChild(a); }, 800);
    }
  });
}

// Expose helpers used by inline onclick handlers to ensure they are available
// when the DOM contains inline attributes (safer for some Android webviews).
window.openSettings = openSettings;
window.copy = copy;

// Bind programmatic listeners for elements using data-action and data-copy.
function bindSettingsLinks(root = document){
  // action links
  const els = root.querySelectorAll('[data-action]');
  els.forEach(el=>{
    // Avoid double-binding
    if (el._boundSettings) return; el._boundSettings = true;
    el.addEventListener('click', (ev)=>{
      ev.preventDefault(); ev.stopPropagation();
      const action = el.dataset.action;
      const title = el.dataset.title || el.textContent || '';
      const extras = {};
      if (el.dataset.apn) extras.apn = decodeURIComponent(el.dataset.apn);
      if (el.dataset.apnName) extras.apn_name = decodeURIComponent(el.dataset.apnName);
      if (el.dataset.activationCode) extras.activation_code = decodeURIComponent(el.dataset.activationCode);
      console.info('bound link clicked', {action, title, extras});
      // Prefer safer guide modal which opens Settings root first
      try { openSettingsOrGuide(action, title, extras); } catch(e){ console.error(e); }
    });
  });

  // copy links
  const copies = root.querySelectorAll('[data-copy-enc]');
  copies.forEach(el=>{
    if (el._boundCopy) return; el._boundCopy = true;
    el.addEventListener('click', (ev)=>{
      ev.preventDefault(); ev.stopPropagation();
      const txt = decodeURIComponent(el.dataset.copyEnc || '');
      navigator.clipboard?.writeText(txt).then(()=> toast('Copied'));
    });
  });
}

// Safer wrapper used by inline links: opens Settings root and shows a guide modal
// with manual steps, copy buttons and an option to try deep-link candidates.
function openSettingsOrGuide(action, title, extras = {}){
  console.info('openSettingsOrGuide invoked', action, title, extras);
  // Always try to open Settings root first (non-destructive)
  try { openSettings('android.settings.SETTINGS'); } catch(e){ console.warn('openSettingsOrGuide: open root failed', e); }

  // Remove existing modal if present
  const prev = document.getElementById('settingsGuideModal');
  if (prev) prev.remove();

  const modal = document.createElement('div');
  modal.id = 'settingsGuideModal';
  modal.style.position = 'fixed';
  modal.style.left = '0';
  modal.style.top = '0';
  modal.style.width = '100%';
  modal.style.height = '100%';
  modal.style.display = 'flex';
  modal.style.alignItems = 'center';
  modal.style.justifyContent = 'center';
  modal.style.background = 'rgba(2,6,23,0.4)';
  modal.style.zIndex = 10000;

  const card = document.createElement('div');
  card.style.width = 'min(720px, 96%)';
  card.style.background = 'white';
  card.style.borderRadius = '12px';
  card.style.padding = '18px';
  card.style.boxShadow = '0 20px 50px rgba(2,6,23,0.2)';

  const h = document.createElement('h3'); h.textContent = title || 'Open Settings';
  h.style.marginTop='0';
  h.style.marginBottom='8px';
  h.className='font-semibold';
  card.appendChild(h);

  const p = document.createElement('div');
  p.style.fontSize='14px';
  p.style.color='#334155';
  p.style.marginBottom='12px';

  // Provide tailored guidance for common actions (APN, SIM/eSIM, Data Roaming)
  const last = (action||'').split('.').pop() || '';
  if (last === 'APN_SETTINGS' || /APN/i.test(title)){
    p.innerHTML = `Open Settings → Connections → Mobile networks → Access Point Names (APN).<br/>If APN is missing, tap Add and use the values from this page.`;
  } else if (last === 'ADD_ESIM' || /ESIM/i.test(title)){
    p.innerHTML = `Open Settings → Connections → SIM card manager → Add mobile plan (or: Settings → Connections → SIM card manager → Add mobile plan / Add eSIM).`;
  } else if (last === 'SIM_SETTINGS' || /SIM/i.test(title)){
    p.innerHTML = `Open Settings → Connections → SIM card manager (or Mobile networks) and select your eSIM/physical SIM to adjust settings.`;
  } else if (last === 'DATA_ROAMING_SETTINGS' || /ROAM/i.test(title)){
    p.innerHTML = `Open Settings → Connections → Mobile networks → Data roaming and toggle the switch.`;
  } else {
    p.innerHTML = `Open Settings and navigate to the appropriate screen. If you want, try the deep-link candidate below.`;
  }
  card.appendChild(p);

  // Show useful values copied from extras (apn values, activation code)
  const vals = document.createElement('div');
  vals.style.display='flex'; vals.style.flexDirection='column'; vals.style.gap='8px';
  if (extras.apn || extras.apn_name){
    const box = document.createElement('div');
    box.style.display='flex'; box.style.justifyContent='space-between'; box.style.alignItems='center';
    const left = document.createElement('div');
    left.innerHTML = `<div style="font-size:12px;color:#64748b">APN</div><div style="font-weight:600">${extras.apn_name || ''}</div><div style="font-size:13px;color:#0f172a">${extras.apn || ''}</div>`;
    const copyBtn = document.createElement('button'); copyBtn.className='btn'; copyBtn.textContent='Copy APN';
    copyBtn.addEventListener('click', ()=>{ navigator.clipboard?.writeText(JSON.stringify({apn_name: extras.apn_name, apn: extras.apn}, null, 0)); toast('APN copied'); });
    box.appendChild(left); box.appendChild(copyBtn); vals.appendChild(box);
  }
  if (extras.activation_code){
    const row = document.createElement('div');
    row.style.display='flex'; row.style.justifyContent='space-between'; row.style.alignItems='center';
    const left = document.createElement('div'); left.innerHTML = `<div style="font-size:12px;color:#64748b">Activation code</div><div style="font-weight:600">${extras.activation_code}</div>`;
    const copyBtn = document.createElement('button'); copyBtn.className='btn'; copyBtn.textContent='Copy Code';
    copyBtn.addEventListener('click', ()=>{ navigator.clipboard?.writeText(extras.activation_code); toast('Code copied'); });
    row.appendChild(left); row.appendChild(copyBtn); vals.appendChild(row);
  }
  if (vals.children.length) card.appendChild(vals);

  // Controls: Try deep link (open diagnostic panel) and Close
  const ctr = document.createElement('div'); ctr.style.display='flex'; ctr.style.justifyContent='flex-end'; ctr.style.gap='8px'; ctr.style.marginTop='14px';
  const tryBtn = document.createElement('button'); tryBtn.className='btn'; tryBtn.textContent='Open Settings (again)';
  const deepBtn = document.createElement('button'); deepBtn.className='btn'; deepBtn.textContent='Show deep-link candidates';
  const closeBtn = document.createElement('button'); closeBtn.className='btn'; closeBtn.textContent='Close';
  ctr.appendChild(tryBtn); ctr.appendChild(deepBtn); ctr.appendChild(closeBtn);
  card.appendChild(ctr);

  modal.appendChild(card);
  document.body.appendChild(modal);

  tryBtn.addEventListener('click', ()=>{ try { openSettings('android.settings.SETTINGS'); } catch(e){} });
  deepBtn.addEventListener('click', ()=>{
    // Open diagnostic deep-link panel for this action
    // Reuse existing panel generator by invoking openSettings(action) which
    // will open root and show the deep-link candidate panel. We call it
    // but then remove this modal to avoid stacking UI.
    modal.remove();
    openSettings(action);
  });
  closeBtn.addEventListener('click', ()=>{ modal.remove(); });
}
window.openSettingsOrGuide = openSettingsOrGuide;

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
        <a class="btn" href="#" data-action="android.settings.ADD_ESIM">Add eSIM</a>
        <a class="btn" href="#" data-action="android.settings.SIM_SETTINGS">SIM Manager</a>
        <a class="btn" href="#" data-action="android.settings.DATA_ROAMING_SETTINGS">Data Roaming</a>
        <a class="btn" href="#" data-action="android.settings.APN_SETTINGS">APN</a>
        <a class="btn" href="#" data-action="android.settings.NETWORK_OPERATOR_SETTINGS">Network Operators</a>
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
          <a class="btn" href="#" data-copy-enc="${encodeURIComponent(row.activation_code||'')}">Copy Code</a>
          <a class="btn" href="#" data-copy-enc="${encodeURIComponent(row.smdp||'')}">Copy SM-DP+</a>
          ${
            deviceIsAndroid()
              ? `<a class="btn" href="#" data-action="android.settings.ADD_ESIM" data-activation-code="${encodeURIComponent(row.activation_code||'')}">Open eSIM Setup</a>`
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
          ? `<a class="btn" href="#" data-action="android.settings.SIM_SETTINGS">Open SIM Manager</a>`
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
        ? `<a class="btn" href="#" data-action="android.settings.SIM_SETTINGS">Open SIM Manager</a>`
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
          ? `<a class="btn" href="#" data-action="android.settings.DATA_ROAMING_SETTINGS">Open Data Roaming</a>`
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
        ? `<a class="btn" href="#" data-action="android.settings.APN_SETTINGS" data-apn="${encodeURIComponent(apn)}" data-apn-name="${encodeURIComponent(apnName)}">Open APN Settings</a>`
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
        ? `<a class="btn" href="#" data-action="android.settings.NETWORK_OPERATOR_SETTINGS">Open Network Operators</a>`
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
// Bind static settings links in the page header (and any other static nodes)
try { bindSettingsLinks(); } catch(e){ console.warn('initial bindSettingsLinks failed', e); }
