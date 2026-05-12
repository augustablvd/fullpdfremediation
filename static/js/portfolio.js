/* =======================================================
   PORTFOLIO.EXE — MAIN SCRIPT
   ======================================================= */

// ─── BOOT SEQUENCE ───────────────────────────────────────
const BOOT_LINES = [
  'PORTFOLIO.EXE v1.0.0',
  '─────────────────────────────────────────',
  '> INITIALIZING RENDER ENGINE ......... [OK]',
  '> LOADING FONTS + ASSETS ............. [OK]',
  '> MOUNTING INTERFACE COMPONENTS ...... [OK]',
  '> DETECTING NETWORK ORIGIN ........... [PENDING]',
  '> STARTING SESSION ................... [OK]',
  '',
  '  READY.',
];

async function runBoot() {
  const overlay  = document.getElementById('bootOverlay');
  const bootText = document.getElementById('bootText');
  if (!overlay || !bootText) return;

  for (const text of BOOT_LINES) {
    await sleep(100);
    const line = document.createElement('span');
    line.className = 'boot-line';
    line.textContent = text || ' ';
    bootText.appendChild(line);
    await sleep(10);
    line.classList.add('visible');
  }

  await sleep(550);
  overlay.classList.add('fade-out');
  await sleep(500);
  overlay.style.display = 'none';
}

// ─── UTILITIES ───────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── IP / VISITOR DETECTION ──────────────────────────────
async function detectVisitor() {
  try {
    const res  = await fetch('/api/visitor');
    const data = await res.json();

    const ip      = data.query   || '';
    const city    = data.city    || '';
    const region  = data.regionName || '';
    const country = data.country || '';
    const org     = data.org     || '';
    const asn     = data.as      || '';
    const isp     = data.isp     || '';

    const loc = [city, region, country].filter(Boolean).join(', ') || 'UNKNOWN';
    const net = (isp || org || asn || 'UNKNOWN').substring(0, 32);

    setStatVal('statIP',  ip  || 'UNKNOWN', false);
    setStatVal('statLoc', loc, false);
    setStatVal('statOrg', net, false);
    setStatVal('statStatus', 'IDENTIFIED', true);

    const navEl = document.getElementById('navStatus');
    if (navEl) navEl.textContent = (country || 'UNKNOWN') + ' — CONNECTED';

    const footerEl = document.getElementById('footerIp');
    if (footerEl && ip) footerEl.textContent = 'VISITOR: ' + ip;

    // ── Allstate detection ──
    // Allstate Insurance uses ASN AS10796; also check org/isp strings
    const combined = (org + ' ' + asn + ' ' + isp).toUpperCase();
    const isAllstate = combined.includes('ALLSTATE') || combined.includes('AS10796');

    if (isAllstate) {
      await sleep(1400);
      showAllstateModal({ ip, loc, org, asn, isp });
    }

  } catch (_) {
    setStatFallback();
  }
}

function setStatVal(id, text, isOk) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.classList.remove('loading');
  if (isOk) el.classList.add('ok');
}

function setStatFallback() {
  ['statIP', 'statLoc', 'statOrg'].forEach(id => setStatVal(id, 'UNAVAILABLE', false));
  setStatVal('statStatus', 'CONNECTED', true);
  const nav = document.getElementById('navStatus');
  if (nav) nav.textContent = 'CONNECTED';
}

// ─── ALLSTATE MODAL ──────────────────────────────────────
function showAllstateModal({ ip, loc, org, asn, isp }) {
  const modal   = document.getElementById('allstateModal');
  const dataBlk = document.getElementById('modalDataBlock');
  if (!modal) return;

  dataBlk.innerHTML =
    '> IP_ADDRESS:  <span class="val">' + (ip  || 'N/A') + '</span>\n' +
    '> LOCATION:    <span class="val">' + (loc || 'N/A') + '</span>\n' +
    '> NETWORK_ORG: <span class="val">' + (org || isp || 'N/A') + '</span>\n' +
    '> ASN:         <span class="val">' + (asn || 'N/A') + '</span>\n' +
    '> NETWORK:     <span class="ok">ALLSTATE ENTERPRISE NETWORK ✓</span>';

  modal.classList.add('active');

  // Focus the first focusable element for a11y
  const firstFocus = modal.querySelector('button, [href], input');
  if (firstFocus) firstFocus.focus();
}

function closeAllstateModal() {
  const modal = document.getElementById('allstateModal');
  if (modal) modal.classList.remove('active');
}
window.closeAllstateModal = closeAllstateModal;

// Close on backdrop click
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('allstateModal');
  if (modal) {
    modal.addEventListener('click', e => { if (e.target === modal) closeAllstateModal(); });
  }
});

// Close on Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeAllstateModal();
});

// ─── SCROLL REVEAL ───────────────────────────────────────
function initScrollReveal() {
  const els = document.querySelectorAll('.reveal');
  const obs = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08 });
  els.forEach(el => obs.observe(el));
}

// ─── SKILL BAR ANIMATION ─────────────────────────────────
function initSkillBars() {
  const fills = document.querySelectorAll('.skill-fill');
  const obs   = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const pct = entry.target.getAttribute('data-pct') || '0';
        entry.target.style.width = pct + '%';
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.4 });
  fills.forEach(f => obs.observe(f));
}

// ─── CONTACT FORM ────────────────────────────────────────
function handleFormSubmit(e) {
  e.preventDefault();
  const btn = document.getElementById('formSubmitBtn');
  if (!btn) return;
  btn.textContent = 'MESSAGE SENT ✓';
  btn.disabled    = true;
  btn.style.cssText += ';background:#000;color:#ffe600;border-color:#000';
  setTimeout(() => {
    btn.textContent = 'SEND MESSAGE →';
    btn.disabled    = false;
    btn.style.cssText = btn.style.cssText
      .replace('background:#000', '')
      .replace('color:#ffe600', '')
      .replace('border-color:#000', '');
    e.target.reset();
  }, 3000);
}
window.handleFormSubmit = handleFormSubmit;

// ─── INIT ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await runBoot();
  initScrollReveal();
  initSkillBars();
  detectVisitor();
});
