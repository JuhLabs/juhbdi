// JuhBDI Dashboard — Cognitive Flow
// Pure vanilla JS, no framework, no bundler

(() => {
'use strict';

// ================================================================
// CONSTANTS
// ================================================================
const FOCUS_VIEWS = ['overview', 'state', 'trust', 'memory', 'goals', 'spec', 'waves', 'tasks', 'trail', 'cost', 'context', 'codehealth'];

// Spritesheet icon CSS class per view (3D glass-morphism icons)
const VIEW_ICONS = {
  waves: 'panel-icon-exec',
  tasks: 'panel-icon-exec',
  cost: 'panel-icon-cost',
  trust: 'panel-icon-trust',
  context: 'panel-icon-sessions',
  trail: 'panel-icon-trail',
  memory: 'panel-icon-memory',
  codehealth: 'panel-icon-trail',
};

// ================================================================
// STATE
// ================================================================
let currentFocus = 'overview';
let connected = false;
let cachedState = null;
let cachedTrail = [];
let cachedCost = null;
let cachedMemory = null;
let cachedContext = null;
let cachedSessions = [];
let codehealthData = null;
let codehealthLoading = false;
let trailFilter = 'all';
let trailSearch = '';
let trailAutoScroll = true;
let searchTimeout = null;
let cachedSimilarWork = null;
let cachedTrends = null;
let cachedHotPrinciples = null;
let cachedAmbient = null;
let renderDebounceTimer = null;
let overviewStaggerDone = false;
let lastToastTime = {};

// ================================================================
// DOM HELPERS
// ================================================================
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

const el = (tag, attrs = {}, children = []) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'className') e.className = v;
    else if (k === 'textContent') e.textContent = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else e.setAttribute(k, v);
  }
  for (const c of children) {
    if (typeof c === 'string') e.appendChild(document.createTextNode(c));
    else if (c) e.appendChild(c);
  }
  return e;
};

const svgEl = (tag, attrs = {}) => {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
};

const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); };

// Build an SVG icon element from path data (safe alternative to innerHTML)
const svgIcon = (pathData) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.style.stroke = 'currentColor';
  svg.style.fill = 'none';
  svg.style.strokeWidth = '2';
  svg.style.strokeLinecap = 'round';
  svg.style.strokeLinejoin = 'round';
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  path.setAttribute('points', pathData);
  svg.appendChild(path);
  return svg;
};

// ================================================================
// TOAST NOTIFICATIONS
// ================================================================
const toastContainer = el('div', { className: 'toast-container' });
document.body.appendChild(toastContainer);

const TOAST_ICONS = { success: '\u2713', info: '\u2139', warning: '\u26A0', error: '\u2717' };
const MAX_TOASTS = 4;

const showToast = (message, type = 'info', cooldownKey = null) => {
  if (cooldownKey) {
    const now = Date.now();
    if (lastToastTime[cooldownKey] && now - lastToastTime[cooldownKey] < 5000) return;
    lastToastTime[cooldownKey] = now;
  }
  const icon = TOAST_ICONS[type] || TOAST_ICONS.info;
  const toast = el('div', { className: 'toast toast-' + type }, [
    el('span', { className: 'toast-icon', textContent: icon }),
    el('span', { textContent: message }),
  ]);
  toastContainer.appendChild(toast);
  while (toastContainer.children.length > MAX_TOASTS) {
    toastContainer.removeChild(toastContainer.firstChild);
  }
  setTimeout(() => {
    toast.classList.add('toast-fade-out');
    setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
  }, 4200);
};

// ================================================================
// ACTION SYSTEM
// ================================================================
async function dashAction(endpoint, body = {}) {
  let token = sessionStorage.getItem('juhbdi-action-token');
  if (!token) {
    token = await showTokenModal();
    if (!token) return;
    sessionStorage.setItem('juhbdi-action-token', token);
  }
  try {
    const res = await fetch('/api/action/' + endpoint, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.ok) {
      showToast(data.deferred ? data.message + ' (deferred)' : data.message, 'success');
    } else {
      if (res.status === 401) {
        sessionStorage.removeItem('juhbdi-action-token');
        showToast('Invalid token \u2014 try again', 'error');
      } else {
        showToast(data.error || 'Action failed', 'error');
      }
    }
  } catch (e) {
    showToast('Action failed: ' + e.message, 'error');
  }
}

function showTokenModal() {
  return new Promise((resolve) => {
    const overlay = el('div', { className: 'token-modal-overlay' });
    const modal = el('div', { className: 'token-modal' });
    const title = el('h3', { textContent: 'Enter Action Token' });
    const desc = el('p', { textContent: 'Find the token in your terminal where the dashboard was started, or at ' });
    const code = el('code', { textContent: '/tmp/juhbdi-dashboard-*.token' });
    desc.appendChild(code);
    const input = el('input', { type: 'text', id: 'token-input', placeholder: 'Paste action token...', autocomplete: 'off' });
    const btnRow = el('div', { className: 'btn-row' });
    const cancelBtn = el('button', { className: 'action-btn', textContent: 'Cancel' });
    const submitBtn = el('button', { className: 'action-btn primary', textContent: 'Submit' });
    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(submitBtn);
    modal.appendChild(title);
    modal.appendChild(desc);
    modal.appendChild(input);
    modal.appendChild(btnRow);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    cancelBtn.onclick = () => { overlay.remove(); resolve(null); };
    submitBtn.onclick = () => { const v = input.value.trim(); overlay.remove(); resolve(v || null); };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const v = input.value.trim(); overlay.remove(); resolve(v || null); } });
    input.focus();
  });
}

// ================================================================
// FORMATTERS
// ================================================================
const viewIcon = (view, large) => {
  const iconClass = VIEW_ICONS[view];
  if (!iconClass) return null;
  return el('div', { className: 'panel-icon ' + (large ? 'panel-icon-lg ' : '') + iconClass });
};

const fmt$ = (n) => typeof n === 'number' ? '$' + n.toFixed(4) : '--';
const fmtPct = (n) => typeof n === 'number' ? n + '%' : '--%';

const fmtTs = (ts) => {
  if (!ts) return '';
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch { return ''; }
};

const relativeTime = (ts) => {
  if (!ts) return '';
  try {
    const diff = Date.now() - new Date(ts).getTime();
    if (diff < 60000) return Math.round(diff / 1000) + 's ago';
    if (diff < 3600000) return Math.round(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.round(diff / 3600000) + 'h ago';
    return Math.round(diff / 86400000) + 'd ago';
  } catch { return ''; }
};

// ================================================================
// ANIMATED COUNTERS
// ================================================================
const prevMetrics = {};

const animateValue = (element, start, end, duration, formatter) => {
  if (!element || start === end) return;
  const startTime = performance.now();
  const step = (now) => {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = start + (end - start) * eased;
    element.textContent = formatter(current);
    if (progress < 1) requestAnimationFrame(step);
    else {
      element.textContent = formatter(end);
      element.classList.add('counter-pulse');
      setTimeout(() => element.classList.remove('counter-pulse'), 400);
    }
  };
  requestAnimationFrame(step);
};

// ================================================================
// CONTEXT RADIAL GAUGE (Canvas)
// ================================================================
const drawCtxGauge = (pct) => {
  const canvas = $('#ctxGaugeCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const r = (Math.min(w, h) / 2) - 6;
  const lineW = 5;

  ctx.clearRect(0, 0, w, h);

  // Background arc
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI * 0.75, Math.PI * 0.75);
  ctx.strokeStyle = 'rgba(49, 50, 68, 0.6)';
  ctx.lineWidth = lineW;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Foreground arc
  const totalAngle = Math.PI * 1.5;
  const fillAngle = (pct / 100) * totalAngle;
  const color = pct > 45 ? '#74c7ec' : pct > 28 ? '#fab387' : '#f38ba8';

  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI * 0.75, -Math.PI * 0.75 + fillAngle);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineW;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Glow
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI * 0.75, -Math.PI * 0.75 + fillAngle);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineW + 4;
  ctx.lineCap = 'round';
  ctx.globalAlpha = 0.15;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // Update text
  const pctEl = $('#ctxGaugePct');
  if (pctEl) {
    pctEl.textContent = Math.round(pct) + '%';
    pctEl.style.color = color;
  }
};

// ================================================================
// WORST CONTEXT CALC
// ================================================================
const getWorstContext = () => {
  let worst = 100;
  for (const group of cachedSessions) {
    for (const s of group.sessions) {
      if (!s.stale && s.remaining_pct < worst) worst = s.remaining_pct;
    }
  }
  return worst;
};

// ================================================================
// NAVIGATION — BDI Focus Model
// ================================================================
const navigateTo = (focus) => {
  if (!FOCUS_VIEWS.includes(focus)) focus = 'overview';
  const changed = currentFocus !== focus;
  currentFocus = focus;
  if (changed) overviewStaggerDone = false;

  // Update sidebar
  $$('.sidebar-card').forEach(card => {
    card.classList.toggle('active', card.dataset.focus === focus);
  });

  // Update hash
  window.location.hash = focus === 'overview' ? '' : focus;

  // Render
  renderCanvas();

  // Lazy fetch
  if (focus === 'codehealth' && !codehealthData && !codehealthLoading) fetchCodeHealth();
};

const initFromHash = () => {
  const hash = window.location.hash.slice(1);
  if (hash && FOCUS_VIEWS.includes(hash)) navigateTo(hash);
};

// ================================================================
// KEYBOARD SHORTCUTS
// ================================================================
document.addEventListener('keydown', (e) => {
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    if (e.key === 'Escape') e.target.blur();
    return;
  }

  const overlay = $('#shortcutOverlay');

  if (e.key === '?') { overlay.classList.toggle('active'); return; }

  if (e.key === 'Escape') {
    if ($('#detailPanel').classList.contains('open')) { closeDetailPanel(); return; }
    if (overlay.classList.contains('active')) { overlay.classList.remove('active'); return; }
    navigateTo('overview');
    return;
  }

  if (e.key === '/') {
    e.preventDefault();
    navigateTo('trail');
    setTimeout(() => { const s = $('#trailSearchInput'); if (s) s.focus(); }, 100);
    return;
  }

  const keyMap = { b: 'trust', d: 'goals', i: 'waves', o: 'overview' };
  if (keyMap[e.key.toLowerCase()]) navigateTo(keyMap[e.key.toLowerCase()]);
});

// ================================================================
// DETAIL PANEL
// ================================================================
const openDetailPanel = (title, content) => {
  const panel = $('#detailPanel');
  const overlay = $('#detailOverlay');
  const titleEl = $('#detailTitle');
  const body = $('#detailBody');

  titleEl.textContent = title;
  if (typeof content === 'string') {
    body.textContent = content;
  } else {
    clear(body);
    body.appendChild(content);
  }

  panel.classList.add('open');
  overlay.classList.add('open');
};

const closeDetailPanel = () => {
  $('#detailPanel').classList.remove('open');
  $('#detailOverlay').classList.remove('open');
};

// ================================================================
// CLOCK
// ================================================================
const tickClock = () => {
  const timeEl = $('#headerTime');
  if (timeEl) {
    timeEl.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
};

// ================================================================
// CONNECTION STATE
// ================================================================
const setConnected = (state) => {
  connected = state;
  const pulse = $('#sessionPulse');
  if (pulse) {
    pulse.classList.toggle('connected', state);
    const label = $('.session-pulse-label', pulse);
    if (label) label.textContent = state ? 'LIVE' : 'SSE';
  }
};

// ================================================================
// SSE
// ================================================================
let eventSource = null;
let reconnectTimer = null;

const connectSSE = () => {
  if (eventSource) { try { eventSource.close(); } catch {} }

  eventSource = new EventSource('/api/events');

  eventSource.onopen = () => {
    setConnected(true);
    showToast('Connected to dashboard', 'success', 'sse-connect');
  };

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'connected' || data.type === 'replay_complete') {
        setConnected(true);
        return;
      }
      updateDashboard(data);
    } catch {}
  };

  eventSource.onerror = () => {
    setConnected(false);
    showToast('Connection lost \u2014 reconnecting\u2026', 'error', 'sse-disconnect');
    if (eventSource) { try { eventSource.close(); } catch {} }
    eventSource = null;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectSSE, 3000);
  };
};

// ================================================================
// FETCH HELPERS
// ================================================================
const fetchCodeHealth = (refresh = false) => {
  codehealthLoading = true;
  if (currentFocus === 'codehealth') renderCanvas();
  const url = refresh ? '/api/codehealth?refresh=true' : '/api/codehealth';
  fetch(url)
    .then(r => r.json())
    .then(data => { codehealthData = data; codehealthLoading = false; if (currentFocus === 'codehealth') renderCanvas(); })
    .catch(() => { codehealthLoading = false; codehealthData = null; if (currentFocus === 'codehealth') renderCanvas(); });
};

const fetchInitialData = () => {
  fetch('/api/state').then(r => r.json()).then(d => { cachedState = d; updateSidebar(); renderCanvas(); }).catch(() => {});
  fetch('/api/trail?limit=200').then(r => r.json()).then(d => { cachedTrail = d; updateSidebar(); renderCanvas(); }).catch(() => {});
  fetch('/api/cost').then(r => r.json()).then(d => { cachedCost = d; updateSidebar(); renderCanvas(); }).catch(() => {});
  fetch('/api/memory').then(r => r.json()).then(d => { cachedMemory = d; updateSidebar(); renderCanvas(); }).catch(() => {});
  fetch('/api/sessions').then(r => r.json()).then(d => { cachedSessions = d; updateSidebar(); drawCtxGauge(getWorstContext()); renderCanvas(); }).catch(() => {});
  fetchTrends();
  fetchHotPrinciples();
  fetchAmbient();
};

const fetchSimilarWork = (query) => {
  if (!query) return;
  fetch('/api/similar-work?q=' + encodeURIComponent(query) + '&limit=5')
    .then(r => r.json())
    .then(d => { cachedSimilarWork = d; if (currentFocus === 'overview') renderCanvas(); })
    .catch(() => {});
};

const fetchTrends = () => {
  fetch('/api/trends').then(r => r.json()).then(d => { cachedTrends = d; if (currentFocus === 'cost') renderCanvas(); }).catch(() => {});
};

const fetchHotPrinciples = () => {
  fetch('/api/hot-principles').then(r => r.json()).then(d => { cachedHotPrinciples = d; if (currentFocus === 'memory') renderCanvas(); }).catch(() => {});
};

const fetchAmbient = () => {
  fetch('/api/ambient?limit=200').then(r => r.json()).then(d => {
    cachedAmbient = d;
    updateTicker();
    if (currentFocus === 'overview') renderCanvas();
  }).catch(() => {});
};

// ================================================================
// MASTER UPDATE (from SSE)
// ================================================================
const updateDashboard = (data) => {
  const prevTrailLen = cachedTrail.length;
  if (data.state) cachedState = data.state;
  if (data.trail) cachedTrail = data.trail;
  if (data.cost) cachedCost = data.cost;
  if (data.memory) cachedMemory = data.memory;
  if (data.context) cachedContext = data.context;
  if (data.sessions) cachedSessions = data.sessions;

  // Toast for new trail entries
  if (data.trail && data.trail.length > prevTrailLen) {
    const newest = data.trail[data.trail.length - 1];
    if (newest) {
      const typeMap = { governance: 'warning', verification: 'warning', error: 'error', execution: 'info', command: 'info', routing: 'success', decision: 'info' };
      showToast(newest.description || newest.event_type, typeMap[newest.event_type] || 'info');
    }
  }

  // Pulse flow arrows
  const arrows = $('#flowArrows');
  if (arrows) {
    arrows.classList.add('pulse');
    setTimeout(() => arrows.classList.remove('pulse'), 600);
  }

  updateSidebar();
  drawCtxGauge(getWorstContext());
  renderView();
};

// ================================================================
// SIDEBAR STATS UPDATE
// ================================================================
const updateSidebar = () => {
  const st = cachedState?.state?.state || cachedState?.state;

  // State
  const stateVal = $('#sidebarStateVal');
  if (stateVal) stateVal.textContent = st?.status === 'executing' ? 'W' + (st?.current_wave ?? '--') : st?.status || 'idle';

  // Trust
  const trustVal = $('#sidebarTrustVal');
  if (trustVal && cachedMemory) {
    const score = cachedMemory.trust_score;
    trustVal.textContent = typeof score === 'number' ? Math.round(score * 100) + '% ' + (cachedMemory.trust_tier || '') : '--';
  }

  // Memory
  const memVal = $('#sidebarMemoryVal');
  if (memVal && cachedMemory) memVal.textContent = cachedMemory.reflexion_count + 'r ' + cachedMemory.trace_count + 't ' + cachedMemory.principle_count + 'p';

  // Goals
  const goalsVal = $('#sidebarGoalsVal');
  if (goalsVal) {
    const goals = cachedState?.intentSpec?.goals || [];
    goalsVal.textContent = goals.length + ' goals';
  }

  // Spec
  const specVal = $('#sidebarSpecVal');
  if (specVal) {
    const name = cachedState?.intentSpec?.project_name || st?.project_name;
    specVal.textContent = name || '--';
  }

  // Waves
  const wavesVal = $('#sidebarWavesVal');
  if (wavesVal) {
    const roadmap = cachedState?.roadmap?.roadmap || cachedState?.roadmap;
    const phases = roadmap?.phases || [];
    const totalTasks = phases.reduce((s, p) => s + (p.tasks?.length || 0), 0);
    wavesVal.textContent = phases.length + ' phases, ' + totalTasks + ' tasks';
  }

  // Tasks
  const tasksVal = $('#sidebarTasksVal');
  if (tasksVal) {
    const roadmap = cachedState?.roadmap?.roadmap || cachedState?.roadmap;
    const phases = roadmap?.phases || [];
    let done = 0, total = 0;
    for (const p of phases) for (const t of (p.tasks || [])) { total++; if (t.status === 'done') done++; }
    tasksVal.textContent = done + '/' + total + ' done';
  }

  // Trail
  const trailVal = $('#sidebarTrailVal');
  if (trailVal) trailVal.textContent = cachedTrail.length + ' entries';

  // Cost
  const costVal = $('#sidebarCostVal');
  if (costVal && cachedCost) costVal.textContent = fmt$(cachedCost.total_spend);

  // Context
  const ctxVal = $('#sidebarCtxVal');
  if (ctxVal) {
    const w = getWorstContext();
    ctxVal.textContent = w + '%';
    ctxVal.style.color = w <= 22 ? 'var(--red)' : w <= 35 ? 'var(--peach)' : w <= 45 ? 'var(--yellow)' : '';
  }

  // Trust tier in header
  const tierEl = $('#headerTrustTier');
  if (tierEl && cachedMemory) tierEl.textContent = cachedMemory.trust_tier !== 'unknown' ? cachedMemory.trust_tier : '--';
};

// ================================================================
// AMBIENT TICKER
// ================================================================
const updateTicker = () => {
  const inner = $('#tickerInner');
  if (!inner || !cachedAmbient) return;
  const events = cachedAmbient.events || [];
  if (events.length === 0) return;

  clear(inner);

  const iconMap = { edit: '\u270E', test: '\u2697', git: '\u2387', build: '\u2692', read: '\u25CE', other: '\u2022' };

  // Double the items for seamless loop
  const buildItems = () => {
    for (const e of events.slice(-30)) {
      const icon = iconMap[e.category] || iconMap.other;
      const label = (e.target || e.category || '').slice(0, 50);
      inner.appendChild(el('span', { className: 'ticker-item' }, [
        el('span', { className: 'ticker-icon', textContent: icon }),
        document.createTextNode(label),
      ]));
    }
  };

  buildItems();
  buildItems(); // duplicate for seamless scroll
};

// ================================================================
// RENDER DISPATCHER (debounced)
// ================================================================
const renderCanvas = () => {
  if (renderDebounceTimer) clearTimeout(renderDebounceTimer);
  renderDebounceTimer = setTimeout(renderView, 80);
};

const renderView = () => {
  renderDebounceTimer = null;
  const container = $('#canvasInner');
  if (!container) return;

  switch (currentFocus) {
    case 'overview': renderOverview(container); break;
    case 'state': renderFocusedState(container); break;
    case 'trust': renderFocusedTrust(container); break;
    case 'memory': renderFocusedMemory(container); break;
    case 'goals': renderFocusedGoals(container); break;
    case 'spec': renderFocusedSpec(container); break;
    case 'waves': renderFocusedWaves(container); break;
    case 'tasks': renderFocusedTasks(container); break;
    case 'trail': renderFocusedTrail(container); break;
    case 'cost': renderFocusedCost(container); break;
    case 'context': renderFocusedContext(container); break;
    case 'codehealth': renderFocusedCodeHealth(container); break;
  }
};

// ================================================================
// FOCUSED VIEW WRAPPER
// ================================================================
const focusedHeader = (title, accentColor) => {
  const hdr = el('div', { className: 'focused-header' });
  const backBtn = el('button', { className: 'focused-back', onClick: () => navigateTo('overview') });
  backBtn.appendChild(svgIcon('15 18 9 12 15 6'));
  hdr.appendChild(backBtn);
  hdr.appendChild(el('span', { className: 'focused-title', textContent: title, style: { color: accentColor || '' } }));
  return hdr;
};

// ================================================================
// OVERVIEW — 3 BDI Columns
// ================================================================
const renderOverview = (container) => {
  clear(container);

  const wrapper = el('div', { style: { position: 'relative' } });

  // BDI Columns
  const cols = el('div', { className: 'overview-columns' });

  // --- Beliefs Column ---
  const beliefsCol = el('div', { className: 'bdi-column col-beliefs' });
  beliefsCol.appendChild(el('div', { className: 'bdi-column-header' }, [
    el('div', { className: 'bdi-column-dot' }),
    el('div', { className: 'bdi-column-title', textContent: 'Beliefs' }),
  ]));

  // Trust card
  beliefsCol.appendChild(bdiCard('trust', 'Trust', () => {
    if (!cachedMemory) return { value: '--%', sub: '' };
    const s = cachedMemory.trust_score;
    return { value: typeof s === 'number' ? Math.round(s * 100) + '%' : '--%', sub: cachedMemory.trust_tier || '' };
  }, 'var(--bdi-belief)'));

  // Memory card
  beliefsCol.appendChild(bdiCard('memory', 'Memory', () => {
    if (!cachedMemory) return { value: '--', sub: '' };
    return { value: cachedMemory.reflexion_count + ' reflexions', sub: cachedMemory.trace_count + ' traces, ' + cachedMemory.principle_count + ' principles' };
  }, 'var(--bdi-belief)'));

  // State card
  beliefsCol.appendChild(bdiCard('state', 'State', () => {
    const st = cachedState?.state?.state || cachedState?.state;
    return { value: st?.status === 'executing' ? 'Executing' : st?.status || 'Idle', sub: 'Phase ' + (st?.current_phase ?? '--') + ', Wave ' + (st?.current_wave ?? '--') };
  }, 'var(--bdi-belief)'));

  cols.appendChild(beliefsCol);

  // --- Desires Column ---
  const desiresCol = el('div', { className: 'bdi-column col-desires' });
  desiresCol.appendChild(el('div', { className: 'bdi-column-header' }, [
    el('div', { className: 'bdi-column-dot' }),
    el('div', { className: 'bdi-column-title', textContent: 'Desires' }),
  ]));

  // Roadmap progress
  const roadmap = cachedState?.roadmap?.roadmap || cachedState?.roadmap;
  const phases = roadmap?.phases || [];
  let doneTasks = 0, totalTasks = 0;
  for (const p of phases) for (const t of (p.tasks || [])) { totalTasks++; if (t.status === 'done') doneTasks++; }
  const progressPct = totalTasks > 0 ? Math.round(doneTasks / totalTasks * 100) : 0;

  desiresCol.appendChild(bdiCard('waves', 'Roadmap', () => ({
    value: progressPct + '% complete',
    sub: doneTasks + '/' + totalTasks + ' tasks done',
  }), 'var(--bdi-desire)', () => {
    return el('div', { className: 'progress-bar progress-mauve mt-sm' }, [
      el('div', { className: 'progress-fill', style: { width: progressPct + '%' } }),
    ]);
  }));

  // Goals card
  desiresCol.appendChild(bdiCard('goals', 'Goals', () => {
    const goals = cachedState?.intentSpec?.goals || [];
    return { value: goals.length + ' goals', sub: goals.slice(0, 2).join(', ').slice(0, 60) || 'No goals defined' };
  }, 'var(--bdi-desire)'));

  // Spec card
  desiresCol.appendChild(bdiCard('spec', 'Intent Spec', () => {
    const desc = cachedState?.intentSpec?.description;
    return { value: cachedState?.intentSpec?.project_name || '--', sub: desc ? desc.slice(0, 60) + (desc.length > 60 ? '...' : '') : 'No spec loaded' };
  }, 'var(--bdi-desire)'));

  cols.appendChild(desiresCol);

  // --- Intentions Column ---
  const intentCol = el('div', { className: 'bdi-column col-intentions' });
  intentCol.appendChild(el('div', { className: 'bdi-column-header' }, [
    el('div', { className: 'bdi-column-dot' }),
    el('div', { className: 'bdi-column-title', textContent: 'Intentions' }),
  ]));

  // Active wave card
  const st = cachedState?.state?.state || cachedState?.state;
  intentCol.appendChild(bdiCard('tasks', 'Active Wave', () => {
    const wave = st?.current_wave;
    if (!wave) return { value: 'No active wave', sub: 'Run /juhbdi:execute to begin' };
    const curPhase = phases.find(p => p.phase === (st?.current_phase || 1)) || phases[0];
    const tasks = curPhase?.tasks || [];
    const passed = tasks.filter(t => t.status === 'done').length;
    const failed = tasks.filter(t => t.status === 'failed' || t.status === 'error').length;
    return { value: 'Wave ' + wave, sub: passed + ' passed, ' + failed + ' failed, ' + (tasks.length - passed - failed) + ' pending' };
  }, 'var(--bdi-intention)'));

  // Trail card (last 5)
  const recentTrail = cachedTrail.slice(-5);
  const trailCard = el('div', { className: 'card clickable', onClick: () => navigateTo('trail') });
  trailCard.appendChild(el('div', { className: 'card-title' }, [
    el('span', { className: 'accent-dot', style: { background: 'var(--bdi-intention)' } }),
    document.createTextNode('RECENT TRAIL'),
    el('span', { className: 'text-xs text-muted', style: { marginLeft: 'auto' }, textContent: cachedTrail.length + ' total' }),
  ]));
  if (recentTrail.length === 0) {
    trailCard.appendChild(el('div', { className: 'text-sm text-muted', textContent: 'No trail entries yet' }));
  } else {
    for (const entry of recentTrail) {
      const evType = entry.event_type || 'decision';
      trailCard.appendChild(el('div', { className: 'flex-row gap-sm', style: { padding: '3px 0', fontSize: '0.68rem' } }, [
        el('span', { className: 'badge type-' + evType, textContent: evType }),
        el('span', { className: 'text-sub', textContent: (entry.description || '').slice(0, 50), style: { flex: '1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }),
        el('span', { className: 'trail-relative-time', textContent: relativeTime(entry.timestamp) }),
      ]));
    }
  }
  intentCol.appendChild(trailCard);

  // Cost vital card
  intentCol.appendChild(bdiCard('cost', 'Cost', () => {
    if (!cachedCost) return { value: '--', sub: '' };
    return { value: fmt$(cachedCost.total_spend), sub: cachedCost.savings_pct + '% saved' };
  }, 'var(--bdi-intention)'));

  cols.appendChild(intentCol);

  // Flow arrows SVG overlay
  const arrowsSvg = el('div', { className: 'flow-arrows', id: 'flowArrows' });
  const svg = svgEl('svg', { viewBox: '0 0 1000 400', preserveAspectRatio: 'none' });
  const path1 = svgEl('path', { d: 'M 310 100 C 370 100, 360 100, 370 100 L 380 100', class: 'flow-arrow-path belief-desire' });
  const path2 = svgEl('path', { d: 'M 640 100 C 700 100, 690 100, 700 100 L 710 100', class: 'flow-arrow-path desire-intention' });
  svg.appendChild(path1);
  svg.appendChild(path2);
  arrowsSvg.appendChild(svg);
  wrapper.appendChild(arrowsSvg);
  wrapper.appendChild(cols);
  container.appendChild(wrapper);

  // Ambient cards below
  container.appendChild(renderAmbientCards());

  // Similar work
  if (cachedSimilarWork && cachedSimilarWork.length > 0) {
    const swCard = el('div', { className: 'card mt-md' }, [
      el('div', { className: 'card-title' }, [
        el('span', { className: 'accent-dot', style: { background: 'var(--lavender)' } }),
        document.createTextNode('SIMILAR WORK'),
      ]),
    ]);
    for (const match of cachedSimilarWork) {
      swCard.appendChild(el('div', { className: 'trail-entry' }, [
        el('span', { className: 'badge badge-' + (match.outcome === 'pass' ? 'success' : match.outcome === 'fail' ? 'error' : 'warning'), textContent: match.outcome }),
        el('span', { className: 'text-mono text-sm', textContent: Math.round(match.similarity * 100) + '% match' }),
        el('span', { className: 'trail-entry-desc', textContent: match.description }),
      ]));
    }
    container.appendChild(swCard);
  }

  // Similar work search
  container.appendChild(el('div', { className: 'card mt-md' }, [
    el('div', { className: 'card-title' }, [
      el('span', { className: 'accent-dot', style: { background: 'var(--lavender)' } }),
      document.createTextNode('SEARCH PAST WORK'),
    ]),
    el('div', { className: 'flex-row gap-sm' }, [
      el('input', { className: 'trail-search', type: 'text', placeholder: 'Describe your next task...', id: 'similarWorkInput' }),
      el('button', { className: 'filter-btn active', textContent: 'Find Similar', onclick: () => {
        const inp = document.getElementById('similarWorkInput');
        if (inp && inp.value.trim()) fetchSimilarWork(inp.value.trim());
      }}),
    ]),
  ]));

  // Stagger cards
  if (!overviewStaggerDone) {
    overviewStaggerDone = true;
    const cards = cols.querySelectorAll('.card');
    cards.forEach((card, i) => {
      card.style.opacity = '0';
      card.style.transform = 'translateY(12px)';
      card.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
      setTimeout(() => { card.style.opacity = '1'; card.style.transform = 'translateY(0)'; }, i * 60);
    });
  }
};

const bdiCard = (focus, title, dataFn, accentColor, extraFn) => {
  const data = dataFn();
  const card = el('div', { className: 'card clickable', onClick: () => navigateTo(focus) });
  card.appendChild(el('div', { className: 'card-title' }, [
    el('span', { className: 'accent-dot', style: { background: accentColor } }),
    document.createTextNode(title.toUpperCase()),
  ]));
  card.appendChild(el('div', { className: 'card-value', textContent: data.value }));
  card.appendChild(el('div', { className: 'card-sub', textContent: data.sub }));
  if (extraFn) {
    const extra = extraFn();
    if (extra) card.appendChild(extra);
  }
  return card;
};

// ================================================================
// AMBIENT CARDS
// ================================================================
const renderAmbientCards = () => {
  const summary = cachedAmbient?.summary || null;
  const events = cachedAmbient?.events || [];
  const grid = el('div', { className: 'ambient-grid' });

  // File hotspots
  const hotspots = summary?.hotspots || [];
  const maxEdits = hotspots.length > 0 ? hotspots[0].edits : 1;
  const hotspotsCard = el('div', { className: 'ambient-card' }, [
    el('div', { className: 'ambient-card-title' }, [el('span', { className: 'accent-dot', style: { background: 'var(--lavender)' } }), document.createTextNode('File Hotspots')]),
  ]);
  const hBody = el('div', { className: 'ambient-card-body' });
  if (hotspots.length === 0) { hBody.appendChild(el('div', { className: 'ambient-empty', textContent: 'No activity yet' })); }
  else {
    for (const h of hotspots.slice(0, 5)) {
      const pct = Math.max(8, Math.round((h.edits / maxEdits) * 100));
      const fname = h.file.split('/').pop() || h.file;
      hBody.appendChild(el('div', { className: 'hotspot-bar-row' }, [
        el('div', { className: 'hotspot-bar-label', textContent: fname, title: h.file }),
        el('div', { className: 'hotspot-bar-track' }, [el('div', { className: 'hotspot-bar-fill', style: { width: pct + '%' } })]),
        el('div', { className: 'hotspot-bar-count', textContent: String(h.edits) }),
      ]));
    }
  }
  hotspotsCard.appendChild(hBody);
  grid.appendChild(hotspotsCard);

  // Test pulse
  const testEvents = events.filter(e => e.category === 'test');
  const testCard = el('div', { className: 'ambient-card' }, [
    el('div', { className: 'ambient-card-title' }, [el('span', { className: 'accent-dot', style: { background: 'var(--green)' } }), document.createTextNode('Test Pulse')]),
  ]);
  const tBody = el('div', { className: 'ambient-card-body' });
  if (testEvents.length === 0) { tBody.appendChild(el('div', { className: 'ambient-empty', textContent: 'No test runs yet' })); }
  else {
    const dotsRow = el('div', { className: 'test-dots-row' });
    for (const t of testEvents.slice(-40)) {
      dotsRow.appendChild(el('div', { className: 'test-dot test-dot-' + (t.result === 'pass' ? 'pass' : t.result === 'fail' ? 'fail' : 'unknown'), title: t.result }));
    }
    tBody.appendChild(dotsRow);
    const passed = testEvents.filter(t => t.result === 'pass').length;
    const failed = testEvents.filter(t => t.result === 'fail').length;
    const rate = summary?.test_pass_rate ?? 0;
    tBody.appendChild(el('div', { className: 'test-pulse-summary', textContent: passed + ' passed, ' + failed + ' failed \u2014 ' + Math.round(rate * 100) + '% pass rate' }));
  }
  testCard.appendChild(tBody);
  grid.appendChild(testCard);

  // Git timeline
  const gitEvents = events.filter(e => e.category === 'git');
  const gitCard = el('div', { className: 'ambient-card' }, [
    el('div', { className: 'ambient-card-title' }, [el('span', { className: 'accent-dot', style: { background: 'var(--teal)' } }), document.createTextNode('Git Timeline')]),
  ]);
  const gBody = el('div', { className: 'ambient-card-body' });
  if (gitEvents.length === 0) { gBody.appendChild(el('div', { className: 'ambient-empty', textContent: 'No git commands yet' })); }
  else {
    for (const g of gitEvents.slice(-6).reverse()) {
      const cmd = (g.target || '').replace(/^git\s+/, '').slice(0, 60);
      gBody.appendChild(el('div', { className: 'git-event-row' }, [
        el('div', { className: 'git-event-dot' }),
        el('div', { className: 'git-event-cmd', textContent: cmd, title: g.target }),
        el('div', { className: 'git-event-time', textContent: relativeTime(g.timestamp) }),
      ]));
    }
  }
  gitCard.appendChild(gBody);
  grid.appendChild(gitCard);

  // Session activity
  const categoryCounts = {};
  for (const e of events) categoryCounts[e.category] = (categoryCounts[e.category] || 0) + 1;
  const actCard = el('div', { className: 'ambient-card' }, [
    el('div', { className: 'ambient-card-title' }, [el('span', { className: 'accent-dot', style: { background: 'var(--peach)' } }), document.createTextNode('Session Activity')]),
  ]);
  const aBody = el('div', { className: 'ambient-card-body' });
  if (events.length === 0) { aBody.appendChild(el('div', { className: 'ambient-empty', textContent: 'No activity yet' })); }
  else {
    for (const cat of ['edit', 'read', 'test', 'git', 'build', 'other']) {
      const count = categoryCounts[cat] || 0;
      if (count === 0) continue;
      aBody.appendChild(el('div', { className: 'activity-row' }, [
        el('span', { className: 'activity-label', textContent: cat }),
        el('span', { className: 'activity-count', textContent: String(count) }),
      ]));
    }
    if (summary?.session_duration && summary.session_duration !== 'N/A') {
      aBody.appendChild(el('div', { className: 'activity-row', style: { marginTop: '4px' } }, [
        el('span', { className: 'activity-label', textContent: 'duration' }),
        el('span', { className: 'activity-count', style: { color: 'var(--sapphire)' }, textContent: summary.session_duration }),
      ]));
    }
  }
  actCard.appendChild(aBody);
  grid.appendChild(actCard);

  return grid;
};

// ================================================================
// FOCUSED: STATE
// ================================================================
const renderFocusedState = (container) => {
  clear(container);
  container.appendChild(focusedHeader('State', 'var(--bdi-belief)'));

  const st = cachedState?.state?.state || cachedState?.state;

  container.appendChild(el('div', { className: 'card mb-md' }, [
    el('div', { className: 'card-title' }, [el('span', { className: 'accent-dot', style: { background: 'var(--bdi-belief)' } }), document.createTextNode('EXECUTION STATUS')]),
    el('div', { className: 'flex-row gap-lg', style: { flexWrap: 'wrap' } }, [
      statPill('Phase', st?.current_phase ?? '--'),
      statPill('Wave', st?.current_wave ?? '--'),
      statPill('Status', st?.status ?? 'idle'),
      statPill('Project', cachedState?.intentSpec?.project_name || st?.project_name || '--'),
    ]),
  ]));

  // Conventions
  const conventions = st?.conventions;
  if (conventions && typeof conventions === 'object') {
    const convCard = el('div', { className: 'card mb-md' }, [
      el('div', { className: 'card-title' }, [document.createTextNode('CONVENTIONS')]),
    ]);
    for (const [k, v] of Object.entries(conventions)) {
      convCard.appendChild(el('div', { className: 'flex-row', style: { padding: '3px 0' } }, [
        el('span', { className: 'text-mono text-xs text-muted', style: { minWidth: '120px' }, textContent: k }),
        el('span', { className: 'text-mono text-sm', textContent: typeof v === 'object' ? JSON.stringify(v) : String(v) }),
      ]));
    }
    container.appendChild(convCard);
  }

  // Architecture
  const arch = st?.architecture;
  if (arch && typeof arch === 'object') {
    const archCard = el('div', { className: 'card' }, [
      el('div', { className: 'card-title' }, [document.createTextNode('ARCHITECTURE')]),
    ]);
    for (const [k, v] of Object.entries(arch)) {
      archCard.appendChild(el('div', { className: 'flex-row', style: { padding: '3px 0' } }, [
        el('span', { className: 'text-mono text-xs text-muted', style: { minWidth: '120px' }, textContent: k }),
        el('span', { className: 'text-mono text-sm', textContent: typeof v === 'object' ? JSON.stringify(v) : String(v) }),
      ]));
    }
    container.appendChild(archCard);
  }
};

// ================================================================
// FOCUSED: TRUST
// ================================================================
const renderFocusedTrust = (container) => {
  clear(container);
  container.appendChild(focusedHeader('Trust & Governance', 'var(--bdi-belief)'));

  const score = cachedMemory?.trust_score ?? 0;
  const tier = cachedMemory?.trust_tier ?? 'unknown';

  container.appendChild(el('div', { className: 'card mb-md' }, [
    el('div', { className: 'card-title' }, [el('span', { className: 'accent-dot', style: { background: 'var(--accent-trust)' } }), document.createTextNode('TRUST SCORE')]),
    el('div', { className: 'gauge-container' }, [buildGauge(score)]),
  ]));

  // Tier ladder
  const tiers = ['probation', 'supervised', 'junior', 'independent'];
  const ladderCard = el('div', { className: 'card mb-md' }, [
    el('div', { className: 'card-title' }, [document.createTextNode('TRUST TIER')]),
  ]);
  const ladder = el('div', { className: 'tier-ladder' });
  for (const t of tiers) {
    ladder.appendChild(el('div', { className: 'tier-box' + (tier.toLowerCase() === t ? ' current' : '') }, [
      el('div', { className: 'tier-box-name', textContent: t }),
    ]));
  }
  ladderCard.appendChild(ladder);
  container.appendChild(ladderCard);

  // Governance log
  const govEntries = cachedTrail.filter(e => e.event_type === 'governance' || e.event_type === 'verification').slice(-20);
  const logCard = el('div', { className: 'card' }, [
    el('div', { className: 'card-title' }, [document.createTextNode('GOVERNANCE LOG')]),
  ]);
  if (govEntries.length === 0) {
    logCard.appendChild(el('div', { className: 'text-sm text-muted', textContent: 'No governance events yet.' }));
  } else {
    for (const entry of govEntries.reverse()) {
      const decisionId = entry.id || entry.decision_id || (entry.event_type + '-' + (entry.timestamp || Date.now()));
      const row = el('div', { className: 'trail-entry' }, [
        el('span', { className: 'trail-entry-time', textContent: fmtTs(entry.timestamp) }),
        el('span', { className: 'badge type-' + entry.event_type, textContent: entry.event_type }),
        el('span', { className: 'trail-entry-desc', textContent: entry.description || '' }),
      ]);
      if (entry.event_type === 'governance') {
        row.appendChild(el('button', { className: 'action-btn primary', textContent: 'Approve', onClick: () => dashAction('approve', { decision_id: decisionId }) }));
        row.appendChild(el('button', { className: 'action-btn danger', textContent: 'Reject', onClick: () => dashAction('reject', { decision_id: decisionId }) }));
      }
      logCard.appendChild(row);
    }
  }
  container.appendChild(logCard);
};

// ================================================================
// FOCUSED: MEMORY
// ================================================================
const renderFocusedMemory = (container) => {
  clear(container);
  container.appendChild(focusedHeader('Intelligence Memory', 'var(--bdi-belief)'));

  if (!cachedMemory) {
    container.appendChild(emptyState('No memory data', 'Intelligence memory builds after execution.'));
    return;
  }

  const stats = el('div', { className: 'memory-stats-row' });
  stats.appendChild(statBox(cachedMemory.reflexion_count, 'Reflexions'));
  stats.appendChild(statBox(cachedMemory.trace_count, 'Traces'));
  stats.appendChild(statBox(cachedMemory.principle_count, 'Principles'));
  container.appendChild(stats);

  const reflexions = cachedMemory.all_reflexions || cachedMemory.recent_reflexions || [];
  container.appendChild(expandableSection('Reflexions', reflexions.length, reflexions.map(r =>
    expandItem(r.task || 'Unknown task', ['Lesson: ' + (r.lesson || '--'), 'Outcome: ' + (r.outcome || '--')],
      r.outcome === 'success' ? 'var(--green)' : r.outcome === 'failure' ? 'var(--red)' : 'var(--yellow)')
  )));

  const traces = cachedMemory.all_traces || [];
  container.appendChild(expandableSection('Traces', traces.length, traces.map(t =>
    expandItem(t.summary || 'Trace', ['Result: ' + (t.success ? 'Success' : 'Failure')], t.success ? 'var(--green)' : 'var(--red)')
  )));

  const principles = cachedMemory.all_principles || [];
  container.appendChild(expandableSection('Principles', principles.length, principles.map(p =>
    expandItem(p.text || 'Principle', [
      'Source: ' + (p.source || '--'),
      'Confidence: ' + (typeof p.confidence === 'number' ? Math.round(p.confidence * 100) + '%' : '--'),
    ], 'var(--lavender)')
  )));

  if (cachedHotPrinciples) {
    if (cachedHotPrinciples.top_applied && cachedHotPrinciples.top_applied.length > 0) {
      const hotCard = el('div', { className: 'card mt-md' }, [
        el('div', { className: 'card-title' }, [el('span', { className: 'accent-dot', style: { background: 'var(--peach)' } }), document.createTextNode('HOT PRINCIPLES')]),
      ]);
      for (const p of cachedHotPrinciples.top_applied) {
        const confColor = p.confidence >= 0.8 ? 'var(--green)' : p.confidence >= 0.5 ? 'var(--yellow)' : 'var(--red)';
        hotCard.appendChild(el('div', { className: 'trail-entry', onClick: () => openDetailPanel('Principle', JSON.stringify(p, null, 2)) }, [
          el('span', { className: 'text-mono text-sm', style: { color: confColor, minWidth: '40px' }, textContent: Math.round(p.confidence * 100) + '%' }),
          el('span', { className: 'badge badge-neutral', textContent: p.times_applied + 'x' }),
          el('span', { className: 'trail-entry-desc', textContent: p.text }),
          el('span', { className: 'text-xs text-muted', textContent: p.source }),
        ]));
      }
      container.appendChild(hotCard);
    }

    if (cachedHotPrinciples.recently_promoted && cachedHotPrinciples.recently_promoted.length > 0) {
      const promoCard = el('div', { className: 'card mt-md' }, [
        el('div', { className: 'card-title' }, [el('span', { className: 'accent-dot', style: { background: 'var(--green)' } }), document.createTextNode('RECENTLY PROMOTED')]),
      ]);
      for (const p of cachedHotPrinciples.recently_promoted) {
        promoCard.appendChild(el('div', { className: 'trail-entry' }, [
          el('span', { className: 'trail-entry-time', textContent: fmtTs(p.promoted_at) }),
          el('span', { className: 'badge badge-success', textContent: 'promoted' }),
          el('span', { className: 'trail-entry-desc', textContent: p.text }),
          el('span', { className: 'text-xs text-muted', textContent: 'from ' + p.source_project }),
        ]));
      }
      container.appendChild(promoCard);
    }

    if (cachedHotPrinciples.decay_warnings && cachedHotPrinciples.decay_warnings.length > 0) {
      const decayCard = el('div', { className: 'card mt-md' }, [
        el('div', { className: 'card-title' }, [el('span', { className: 'accent-dot', style: { background: 'var(--red)' } }), document.createTextNode('DECAY WARNINGS')]),
      ]);
      for (const p of cachedHotPrinciples.decay_warnings) {
        decayCard.appendChild(el('div', { className: 'trail-entry' }, [
          el('span', { className: 'text-mono text-sm', style: { color: 'var(--red)', minWidth: '40px' }, textContent: Math.round(p.confidence * 100) + '%' }),
          el('span', { className: 'badge badge-error', textContent: p.times_validated + '/' + p.times_applied + ' validated' }),
          el('span', { className: 'trail-entry-desc', textContent: p.text }),
        ]));
      }
      container.appendChild(decayCard);
    }
  } else {
    fetchHotPrinciples();
  }
};

// ================================================================
// FOCUSED: GOALS
// ================================================================
const renderFocusedGoals = (container) => {
  clear(container);
  container.appendChild(focusedHeader('Goals', 'var(--bdi-desire)'));

  const goals = cachedState?.intentSpec?.goals || [];
  if (goals.length === 0) {
    container.appendChild(emptyState('No goals defined', 'Create an intent-spec.json with goals to see them here.'));
    return;
  }

  const card = el('div', { className: 'card' }, [
    el('div', { className: 'card-title' }, [el('span', { className: 'accent-dot', style: { background: 'var(--bdi-desire)' } }), document.createTextNode('GOAL LIST')]),
  ]);
  goals.forEach((g, i) => {
    card.appendChild(el('div', { className: 'flex-row', style: { padding: '8px 0', borderBottom: '1px solid rgba(49, 50, 68, 0.2)' } }, [
      el('span', { className: 'text-mono text-xs text-muted', textContent: '#' + (i + 1) }),
      el('span', { className: 'text-sm', textContent: typeof g === 'string' ? g : g.description || JSON.stringify(g) }),
    ]));
  });
  container.appendChild(card);
};

// ================================================================
// FOCUSED: SPEC
// ================================================================
const renderFocusedSpec = (container) => {
  clear(container);
  container.appendChild(focusedHeader('Intent Spec', 'var(--bdi-desire)'));

  const spec = cachedState?.intentSpec;
  if (!spec) {
    container.appendChild(emptyState('No intent spec', 'Run /juhbdi:plan to create an intent spec.'));
    return;
  }

  const card = el('div', { className: 'card mb-md' }, [
    el('div', { className: 'card-title' }, [el('span', { className: 'accent-dot', style: { background: 'var(--bdi-desire)' } }), document.createTextNode('SPEC DETAILS')]),
  ]);

  const fields = [['Project', spec.project_name], ['Description', spec.description], ['Version', spec.version]];
  for (const [label, val] of fields) {
    if (!val) continue;
    card.appendChild(el('div', { className: 'flex-row', style: { padding: '4px 0' } }, [
      el('span', { className: 'text-mono text-xs text-muted', style: { minWidth: '100px' }, textContent: label }),
      el('span', { className: 'text-sm', textContent: String(val) }),
    ]));
  }

  if (spec.tradeoff_weights && typeof spec.tradeoff_weights === 'object') {
    card.appendChild(el('div', { className: 'card-title mt-md' }, [document.createTextNode('TRADEOFF WEIGHTS')]));
    for (const [k, v] of Object.entries(spec.tradeoff_weights)) {
      const pct = Math.round((v || 0) * 100);
      card.appendChild(el('div', { className: 'flex-row gap-sm', style: { padding: '3px 0' } }, [
        el('span', { className: 'text-mono text-xs text-muted', style: { minWidth: '100px' }, textContent: k }),
        el('div', { className: 'progress-bar progress-mauve', style: { flex: '1' } }, [el('div', { className: 'progress-fill', style: { width: pct + '%' } })]),
        el('span', { className: 'text-mono text-xs', textContent: pct + '%' }),
      ]));
    }
  }

  if (spec.constraints && spec.constraints.length > 0) {
    card.appendChild(el('div', { className: 'card-title mt-md' }, [document.createTextNode('CONSTRAINTS')]));
    for (const c of spec.constraints) {
      card.appendChild(el('div', { className: 'text-sm', style: { padding: '3px 0', color: 'var(--subtext0)' }, textContent: typeof c === 'string' ? c : JSON.stringify(c) }));
    }
  }

  container.appendChild(card);
};

// ================================================================
// FOCUSED: WAVES (Execution)
// ================================================================
const renderFocusedWaves = (container) => {
  clear(container);
  container.appendChild(focusedHeader('Waves & Execution', 'var(--bdi-intention)'));

  const st = cachedState?.state?.state || cachedState?.state;
  const roadmap = cachedState?.roadmap?.roadmap || cachedState?.roadmap;
  const phases = roadmap?.phases || [];

  container.appendChild(el('div', { className: 'card mb-md' }, [
    el('div', { className: 'card-title' }, [el('span', { className: 'accent-dot', style: { background: 'var(--bdi-intention)' } }), document.createTextNode('EXECUTION STATUS')]),
    el('div', { className: 'flex-row gap-lg', style: { flexWrap: 'wrap' } }, [
      statPill('Phase', st?.current_phase ?? '--'),
      statPill('Wave', st?.current_wave ?? '--'),
      statPill('Status', st?.status ?? 'idle'),
    ]),
  ]));

  if (phases.length === 0) {
    container.appendChild(emptyState('No roadmap', 'Run /juhbdi:plan to create a roadmap.'));
    return;
  }

  for (const phase of phases) {
    const phaseCard = el('div', { className: 'card mb-md' }, [
      el('div', { className: 'card-title' }, [document.createTextNode('PHASE ' + phase.phase + (phase.name ? ' \u2014 ' + phase.name : ''))]),
    ]);

    const tasks = phase.tasks || [];
    for (const task of tasks) {
      const statusClass = task.status === 'done' ? 'done' : task.status === 'active' || task.status === 'in_progress' ? 'active' : task.status === 'failed' || task.status === 'error' ? 'failed' : 'pending';
      const barChildren = [
        el('div', { className: 'task-status-dot ' + statusClass }),
        el('span', { className: 'task-name', textContent: task.description || task.name || 'Task ' + task.id }),
        el('span', { className: 'badge badge-' + (statusClass === 'done' ? 'success' : statusClass === 'active' ? 'info' : statusClass === 'failed' ? 'error' : 'neutral'), textContent: task.status || 'pending' }),
      ];
      if (task.status === 'failed' || task.status === 'error') {
        barChildren.push(el('button', { className: 'action-btn deferred', textContent: 'Re-run', onClick: (e) => { e.stopPropagation(); dashAction('queue-rerun', { wave_id: String(task.id || task.wave_id || '') }); } }));
      }
      const bar = el('div', { className: 'task-bar' }, barChildren);
      bar.addEventListener('click', () => openDetailPanel('Task: ' + (task.name || task.id), JSON.stringify(task, null, 2)));
      phaseCard.appendChild(bar);
    }

    container.appendChild(phaseCard);
  }
};

// ================================================================
// FOCUSED: TASKS
// ================================================================
const renderFocusedTasks = (container) => {
  renderFocusedWaves(container);
};

// ================================================================
// FOCUSED: TRAIL
// ================================================================
const renderFocusedTrail = (container) => {
  let toolbar = $('#trailToolbar', container);
  if (!toolbar) {
    clear(container);
    container.appendChild(focusedHeader('Decision Trail', 'var(--bdi-intention)'));

    toolbar = el('div', { className: 'trail-toolbar', id: 'trailToolbar' });

    const searchInput = el('input', { className: 'trail-search', id: 'trailSearchInput', type: 'text', placeholder: 'Search trail...' });
    searchInput.addEventListener('input', (e) => {
      trailSearch = e.target.value;
      if (searchTimeout) clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => renderTrailEntries(), 200);
    });
    toolbar.appendChild(searchInput);

    const types = ['all', 'routing', 'execution', 'decision', 'governance', 'verification', 'error'];
    for (const t of types) {
      toolbar.appendChild(el('button', {
        className: 'filter-btn' + (trailFilter === t ? ' active' : ''),
        textContent: t,
        onClick: () => { trailFilter = t; $$('.filter-btn', toolbar).forEach(b => b.classList.toggle('active', b.textContent === t)); renderTrailEntries(); },
      }));
    }

    const scrollBtn = el('button', {
      className: 'scroll-lock-btn' + (trailAutoScroll ? ' active' : ''),
      textContent: trailAutoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF',
      onClick: () => {
        trailAutoScroll = !trailAutoScroll;
        scrollBtn.classList.toggle('active', trailAutoScroll);
        scrollBtn.textContent = trailAutoScroll ? 'Auto-scroll ON' : 'Auto-scroll OFF';
      },
    });
    toolbar.appendChild(scrollBtn);

    toolbar.appendChild(el('button', { className: 'action-btn deferred', textContent: 'Export', onClick: () => dashAction('export-trail', { format: 'json' }) }));
    container.appendChild(toolbar);
    container.appendChild(el('div', { id: 'trailEntries' }));
  }

  renderTrailEntries();
};

const renderTrailEntries = () => {
  const entriesDiv = $('#trailEntries');
  if (!entriesDiv) return;
  clear(entriesDiv);

  let filtered = cachedTrail;
  if (trailFilter !== 'all') filtered = filtered.filter(e => e.event_type === trailFilter);
  if (trailSearch) {
    const q = trailSearch.toLowerCase();
    filtered = filtered.filter(e => (e.description || '').toLowerCase().includes(q) || (e.event_type || '').toLowerCase().includes(q));
  }

  if (filtered.length === 0) {
    entriesDiv.appendChild(el('div', { className: 'text-sm text-muted', style: { padding: '20px', textAlign: 'center' }, textContent: 'No matching trail entries.' }));
    return;
  }

  entriesDiv.appendChild(el('div', { className: 'text-xs text-muted mb-sm', textContent: filtered.length + ' entries' }));

  for (const entry of filtered) {
    const evType = entry.event_type || 'decision';
    const row = el('div', { className: 'trail-entry trail-connector trail-type-border-' + evType }, [
      el('span', { className: 'trail-entry-time' }, [
        document.createTextNode(fmtTs(entry.timestamp)),
        el('span', { className: 'trail-relative-time', textContent: relativeTime(entry.timestamp) }),
      ]),
      el('span', { className: 'badge type-' + evType, textContent: evType }),
      el('span', { className: 'trail-entry-desc', textContent: entry.description || '' }),
    ]);

    row.addEventListener('click', () => openDetailPanel('Trail Entry', JSON.stringify(entry, null, 2)));
    entriesDiv.appendChild(row);
  }

  const entries = entriesDiv.querySelectorAll('.trail-entry');
  entries.forEach((entry, i) => {
    if (i < 15) {
      entry.style.opacity = '0';
      entry.style.transform = 'translateX(-12px)';
      entry.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
      entry.style.transitionDelay = (i * 30) + 'ms';
      requestAnimationFrame(() => { entry.style.opacity = '1'; entry.style.transform = 'translateX(0)'; });
    }
  });

  entriesDiv.appendChild(el('span', { className: 'trail-cursor' }));
  if (trailAutoScroll) entriesDiv.scrollTop = entriesDiv.scrollHeight;
};

// ================================================================
// FOCUSED: COST
// ================================================================
const renderFocusedCost = (container) => {
  clear(container);
  container.appendChild(focusedHeader('Cost Intelligence', 'var(--vital-ok)'));

  if (!cachedCost) {
    container.appendChild(emptyState('No cost data', 'Cost intelligence appears after model routing decisions.'));
    return;
  }

  container.appendChild(el('div', { className: 'card mb-md' }, [
    el('div', { className: 'card-title' }, [el('span', { className: 'accent-dot', style: { background: 'var(--accent-cost)' } }), document.createTextNode('COST INTELLIGENCE')]),
    el('div', { className: 'flex-row gap-lg', style: { flexWrap: 'wrap' } }, [
      statPill('Total Spend', fmt$(cachedCost.total_spend)),
      statPill('Opus Equivalent', fmt$(cachedCost.opus_equivalent)),
      statPill('Savings', fmt$(cachedCost.savings)),
      statPill('Savings %', cachedCost.savings_pct + '%'),
    ]),
  ]));

  if (cachedCost.spend_over_time && cachedCost.spend_over_time.length > 1) {
    const chartCard = el('div', { className: 'card mb-md' }, [el('div', { className: 'card-title' }, [document.createTextNode('CUMULATIVE SPEND')])]);
    const chartDiv = el('div', { className: 'chart-container' });
    chartDiv.appendChild(buildSparkline(cachedCost.spend_over_time, 600, 140));
    chartCard.appendChild(chartDiv);
    container.appendChild(chartCard);
  }

  const dist = cachedCost.model_distribution;
  if (dist && Object.keys(dist).length > 0) {
    const donutCard = el('div', { className: 'card mb-md' }, [el('div', { className: 'card-title' }, [document.createTextNode('MODEL DISTRIBUTION')])]);
    const donutRow = el('div', { className: 'flex-row gap-lg', style: { flexWrap: 'wrap', alignItems: 'flex-start' } });
    const donutDiv = el('div', { className: 'chart-container', style: { maxWidth: '180px' } });
    donutDiv.appendChild(buildDonut(dist, 180));
    donutRow.appendChild(donutDiv);

    const legend = el('div', { className: 'flex-col gap-sm' });
    const total = Object.values(dist).reduce((a, b) => a + b, 0);
    const colors = { opus: 'var(--mauve)', sonnet: 'var(--blue)', haiku: 'var(--teal)', unknown: 'var(--overlay0)' };
    for (const [model, count] of Object.entries(dist)) {
      legend.appendChild(el('div', { className: 'flex-row gap-sm' }, [
        el('span', { style: { width: '10px', height: '10px', borderRadius: '50%', background: colors[model] || 'var(--overlay1)', flexShrink: '0' } }),
        el('span', { className: 'text-mono text-sm', textContent: model + ': ' + count + ' (' + Math.round(count / total * 100) + '%)' }),
      ]));
    }
    donutRow.appendChild(legend);
    donutCard.appendChild(donutRow);
    container.appendChild(donutCard);
  }

  if (cachedTrends) {
    if (cachedTrends.cost_trend && cachedTrends.cost_trend.length > 1) {
      const c = el('div', { className: 'card mb-md' }, [el('div', { className: 'card-title' }, [el('span', { className: 'accent-dot', style: { background: 'var(--teal)' } }), document.createTextNode('COST TREND')])]);
      const d = el('div', { className: 'chart-container' });
      d.appendChild(buildSparkline(cachedTrends.cost_trend.map(dd => ({ timestamp: dd.date, cumulative: dd.cumulative_cost })), 600, 140));
      c.appendChild(d); container.appendChild(c);
    }
    if (cachedTrends.pass_rate_trend && cachedTrends.pass_rate_trend.length > 1) {
      const c = el('div', { className: 'card mb-md' }, [el('div', { className: 'card-title' }, [el('span', { className: 'accent-dot', style: { background: 'var(--green)' } }), document.createTextNode('PASS RATE (7-DAY)')])]);
      const d = el('div', { className: 'chart-container' });
      d.appendChild(buildSparkline(cachedTrends.pass_rate_trend.map(dd => ({ timestamp: dd.date, cumulative: dd.pass_rate })), 600, 140));
      c.appendChild(d); container.appendChild(c);
    }
    if (cachedTrends.router_accuracy_trend && cachedTrends.router_accuracy_trend.length > 1) {
      const c = el('div', { className: 'card mb-md' }, [el('div', { className: 'card-title' }, [el('span', { className: 'accent-dot', style: { background: 'var(--blue)' } }), document.createTextNode('ROUTER ACCURACY')])]);
      const d = el('div', { className: 'chart-container' });
      d.appendChild(buildSparkline(cachedTrends.router_accuracy_trend.map(dd => ({ timestamp: dd.date, cumulative: dd.accuracy })), 600, 140));
      c.appendChild(d); container.appendChild(c);
    }
  } else { fetchTrends(); }
};

// ================================================================
// FOCUSED: CONTEXT (Sessions)
// ================================================================
const renderFocusedContext = (container) => {
  clear(container);
  container.appendChild(focusedHeader('Sessions & Context', 'var(--bdi-belief)'));

  const activeSessions = [];
  const staleSessions = [];
  for (const group of cachedSessions) {
    for (const s of group.sessions) {
      if (s.stale) staleSessions.push({ ...s, project_dir: group.project_dir });
      else activeSessions.push({ ...s, project_dir: group.project_dir });
    }
  }

  if (activeSessions.length === 0 && staleSessions.length === 0) {
    container.appendChild(emptyState('No active sessions', 'Sessions appear when JuhBDI context bridges are active.'));
    return;
  }

  if (activeSessions.length > 0) {
    container.appendChild(el('div', { className: 'project-group-header', textContent: 'Active Sessions (' + activeSessions.length + ')' }));
    for (const s of activeSessions) container.appendChild(buildSessionCard(s, false));
  }

  if (staleSessions.length > 0) {
    const staleSection = el('div', { className: 'expand-section' });
    const staleHeader = el('div', { className: 'expand-header' }, [
      el('span', { className: 'expand-header-title', textContent: 'Stale Sessions' }),
      el('span', { className: 'expand-header-count', textContent: staleSessions.length + ' inactive' }),
      el('span', { className: 'expand-header-arrow', textContent: '\u25B6' }),
    ]);
    staleHeader.addEventListener('click', () => staleSection.classList.toggle('open'));
    staleSection.appendChild(staleHeader);
    const staleBody = el('div', { className: 'expand-body' });
    for (const s of staleSessions) staleBody.appendChild(buildSessionCard(s, true));
    staleSection.appendChild(staleBody);
    container.appendChild(staleSection);
  }

  if (activeSessions.length === 0 && staleSessions.length > 0) {
    container.insertBefore(emptyState('No active sessions', 'All sessions are stale.'), container.children[1]);
  }
};

const buildSessionCard = (s, isStale) => {
  const levelColor = s.level === 'EMERGENCY' ? 'var(--red)' : s.level === 'CRITICAL' ? 'var(--peach)' : s.level === 'URGENT' ? 'var(--yellow)' : s.level === 'WARNING' ? 'var(--yellow)' : 'var(--green)';
  const progressClass = s.remaining_pct <= 22 ? 'progress-red' : s.remaining_pct <= 35 ? 'progress-yellow' : s.remaining_pct <= 45 ? 'progress-yellow' : 'progress-green';

  return el('div', { className: 'session-card' + (isStale ? ' stale' : '') }, [
    el('div', { className: 'session-card-header' }, [
      el('span', { className: 'session-id', textContent: s.session_id.slice(0, 12) + '...' }),
      el('span', { className: 'session-ide', textContent: s.ide_platform }),
    ]),
    el('div', { className: 'flex-row', style: { justifyContent: 'space-between', marginBottom: '6px' } }, [
      el('span', { className: 'text-mono', style: { fontSize: '1.1rem', fontWeight: '700', color: levelColor }, textContent: s.remaining_pct + '%' }),
      el('span', { className: 'badge badge-' + (s.level === 'NORMAL' ? 'success' : s.level === 'WARNING' ? 'warning' : 'error'), textContent: s.level }),
    ]),
    el('div', { className: 'progress-bar ' + progressClass }, [
      el('div', { className: 'progress-fill', style: { width: s.remaining_pct + '%' } }),
    ]),
    el('div', { className: 'text-xs text-muted mt-sm', textContent: isStale ? 'Stale \u2014 ' + fmtTs(s.timestamp) : fmtTs(s.timestamp) }),
  ]);
};

// ================================================================
// FOCUSED: CODE HEALTH
// ================================================================
const renderFocusedCodeHealth = (container) => {
  clear(container);
  container.appendChild(focusedHeader('Code Health', 'var(--accent-codehealth)'));

  if (codehealthLoading) {
    container.appendChild(el('div', { className: 'card' }, [
      el('div', { className: 'card-title' }, [document.createTextNode('CODE HEALTH')]),
      el('div', { className: 'skeleton', style: { height: '24px', width: '60%', marginBottom: '12px' } }),
      el('div', { className: 'skeleton', style: { height: '16px', width: '80%', marginBottom: '8px' } }),
      el('div', { className: 'skeleton', style: { height: '16px', width: '70%', marginBottom: '8px' } }),
      el('div', { className: 'skeleton', style: { height: '16px', width: '90%' } }),
    ]));
    return;
  }

  if (!codehealthData) {
    container.appendChild(el('div', { className: 'card' }, [
      el('div', { className: 'empty-state' }, [
        el('div', { className: 'empty-state-title', textContent: 'Analysis unavailable' }),
        el('div', { className: 'empty-state-text', textContent: 'Could not run code health analysis.' }),
        el('button', { className: 'refresh-btn mt-md', textContent: 'Retry', onClick: () => fetchCodeHealth(true) }),
      ]),
    ]));
    return;
  }

  const data = codehealthData;

  container.appendChild(el('div', { className: 'card mb-md' }, [
    el('div', { className: 'card-title' }, [
      el('span', { className: 'accent-dot', style: { background: 'var(--accent-codehealth)' } }),
      document.createTextNode('CODE HEALTH'),
      el('button', { className: 'refresh-btn', style: { marginLeft: 'auto' }, textContent: 'Refresh', onClick: () => fetchCodeHealth(true) }),
    ]),
    el('div', { className: 'flex-row gap-md', style: { flexWrap: 'wrap' } }, [
      el('span', { className: 'badge badge-success', textContent: data.summary.clean + ' clean' }),
      el('span', { className: 'badge badge-warning', textContent: data.summary.warning + ' warning' }),
      el('span', { className: 'badge badge-error', textContent: data.summary.hot + ' hot' }),
      el('span', { className: 'text-xs text-muted', textContent: 'Cached: ' + fmtTs(data.cached_at) }),
    ]),
  ]));

  if (data.complexity.length > 0) {
    const cCard = el('div', { className: 'card mb-md' }, [el('div', { className: 'card-title' }, [document.createTextNode('COMPLEXITY HOTSPOTS')])]);
    const table = el('table', { className: 'health-table' });
    table.appendChild(el('thead', {}, [el('tr', {}, [el('th', { textContent: 'Function' }), el('th', { textContent: 'File' }), el('th', { textContent: 'Complexity' }), el('th'), el('th')])]));
    const tbody = el('tbody');
    for (const item of data.complexity) {
      const level = item.complexity < 8 ? 'low' : item.complexity < 15 ? 'medium' : 'high';
      const pct = Math.min(100, (item.complexity / 20) * 100);
      tbody.appendChild(el('tr', {}, [
        el('td', { textContent: item.function }),
        el('td', { className: 'text-muted', textContent: item.file }),
        el('td', {}, [el('div', { className: 'complexity-bar' }, [el('div', { className: 'complexity-fill ' + level, style: { width: pct + '%' } })])]),
        el('td', { textContent: String(item.complexity) }),
        el('td', {}, [el('button', { className: 'action-btn primary', textContent: 'Fix', onClick: () => dashAction('health-fix', { file: item.file }) })]),
      ]));
    }
    table.appendChild(tbody);
    cCard.appendChild(table);
    container.appendChild(cCard);
  }

  if (data.deadCode.length > 0) {
    const dCard = el('div', { className: 'card mb-md' }, [el('div', { className: 'card-title' }, [document.createTextNode('DEAD CODE')])]);
    const table = el('table', { className: 'health-table' });
    table.appendChild(el('thead', {}, [el('tr', {}, [el('th', { textContent: 'Export' }), el('th', { textContent: 'File' }), el('th', { textContent: 'Confidence' })])]));
    const tbody = el('tbody');
    for (const item of data.deadCode) {
      tbody.appendChild(el('tr', {}, [
        el('td', { textContent: item.export }),
        el('td', { className: 'text-muted', textContent: item.file }),
        el('td', {}, [el('span', { className: 'badge badge-' + (item.confidence === 'high' ? 'error' : 'warning'), textContent: item.confidence })]),
      ]));
    }
    table.appendChild(tbody);
    dCard.appendChild(table);
    container.appendChild(dCard);
  }

  container.appendChild(el('div', { className: 'card' }, [
    el('div', { className: 'card-title' }, [document.createTextNode('CALL GRAPH')]),
    el('div', { className: 'memory-stats-row' }, [
      statBox(data.callGraph.edgeCount, 'Edges'),
      statBox(data.callGraph.entryPoints.length, 'Entry Points'),
      statBox(data.callGraph.hotPaths.length, 'Hot Paths'),
    ]),
  ]));
};

// ================================================================
// SVG CHARTS
// ================================================================
const buildSparkline = (data, width, height) => {
  const svg = svgEl('svg', { viewBox: '0 0 ' + width + ' ' + height, preserveAspectRatio: 'none' });
  const maxVal = Math.max(...data.map(d => d.cumulative), 0.001);
  const padTop = 10, padBot = 10;
  const usableH = height - padTop - padBot;

  const points = data.map((d, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * width;
    const y = padTop + usableH - (d.cumulative / maxVal) * usableH;
    return x + ',' + y;
  });

  const defs = svgEl('defs');
  const gradId = 'sparkGrad' + Math.random().toString(36).slice(2, 8);
  const grad = svgEl('linearGradient', { id: gradId, x1: '0', y1: '0', x2: '0', y2: '1' });
  grad.appendChild(svgEl('stop', { offset: '0%', 'stop-color': '#a6e3a1', 'stop-opacity': '0.4' }));
  grad.appendChild(svgEl('stop', { offset: '100%', 'stop-color': '#a6e3a1', 'stop-opacity': '0.02' }));
  defs.appendChild(grad);
  svg.appendChild(defs);

  svg.appendChild(svgEl('polygon', { points: points.join(' ') + ' ' + width + ',' + height + ' 0,' + height, fill: 'url(#' + gradId + ')' }));
  svg.appendChild(svgEl('polyline', { points: points.join(' '), fill: 'none', stroke: '#a6e3a1', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));

  if (data.length > 0) {
    const lastPt = points[points.length - 1].split(',');
    svg.appendChild(svgEl('circle', { cx: lastPt[0], cy: lastPt[1], r: '4', fill: '#a6e3a1', stroke: '#11111b', 'stroke-width': '2' }));
  }

  if (data.length > 1) {
    const segW = width / data.length;
    const hoverCircle = svgEl('circle', { r: '5', fill: '#a6e3a1', stroke: '#11111b', 'stroke-width': '2', display: 'none' });
    svg.appendChild(hoverCircle);
    const dashLine = svgEl('line', { stroke: '#585b70', 'stroke-width': '1', 'stroke-dasharray': '3,3', display: 'none' });
    svg.appendChild(dashLine);
    const tipGroup = svgEl('foreignObject', { width: '120', height: '40', display: 'none' });
    const tipDiv = document.createElement('div');
    tipDiv.className = 'chart-tooltip';
    tipGroup.appendChild(tipDiv);
    svg.appendChild(tipGroup);

    for (let i = 0; i < data.length; i++) {
      const pt = points[i].split(',');
      const px = parseFloat(pt[0]), py = parseFloat(pt[1]);
      const rect = svgEl('rect', { x: String(px - segW / 2), y: '0', width: String(segW), height: String(height), fill: 'transparent', style: 'cursor:crosshair' });
      rect.addEventListener('mouseenter', () => {
        hoverCircle.setAttribute('cx', String(px)); hoverCircle.setAttribute('cy', String(py)); hoverCircle.setAttribute('display', '');
        dashLine.setAttribute('x1', String(px)); dashLine.setAttribute('y1', String(py)); dashLine.setAttribute('x2', String(px)); dashLine.setAttribute('y2', String(height)); dashLine.setAttribute('display', '');
        tipGroup.setAttribute('x', String(Math.max(0, Math.min(px - 55, width - 120)))); tipGroup.setAttribute('y', String(py > 30 ? py - 38 : py + 10)); tipGroup.setAttribute('display', '');
        tipDiv.textContent = (data[i].timestamp ? fmtTs(data[i].timestamp) + ' \u2014 ' : '') + (typeof data[i].cumulative === 'number' ? data[i].cumulative.toFixed(4) : data[i].cumulative);
      });
      rect.addEventListener('mouseleave', () => {
        hoverCircle.setAttribute('display', 'none'); dashLine.setAttribute('display', 'none'); tipGroup.setAttribute('display', 'none');
      });
      svg.appendChild(rect);
    }
  }

  return svg;
};

const buildDonut = (distribution, size) => {
  const svg = svgEl('svg', { viewBox: '0 0 100 100', width: String(size), height: String(size) });
  const total = Object.values(distribution).reduce((a, b) => a + b, 0);
  if (total === 0) return svg;

  const colors = { opus: '#cba6f7', sonnet: '#89b4fa', haiku: '#94e2d5', unknown: '#6c7086' };
  const cx = 50, cy = 50, r = 35;
  const circumference = 2 * Math.PI * r;
  let offset = 0;

  for (const [model, count] of Object.entries(distribution)) {
    const pct = count / total;
    const dash = circumference * pct;
    svg.appendChild(svgEl('circle', {
      cx: String(cx), cy: String(cy), r: String(r),
      fill: 'none', stroke: colors[model] || '#7f849c', 'stroke-width': '12',
      'stroke-dasharray': dash + ' ' + (circumference - dash),
      'stroke-dashoffset': String(-offset),
      transform: 'rotate(-90 50 50)',
    }));
    offset += dash;
  }

  const text = svgEl('text', { x: '50', y: '52', 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: '#cdd6f4', 'font-family': "'IBM Plex Mono', monospace", 'font-size': '12', 'font-weight': '700' });
  text.textContent = String(total);
  svg.appendChild(text);
  const subtext = svgEl('text', { x: '50', y: '64', 'text-anchor': 'middle', fill: '#a6adc8', 'font-family': "'IBM Plex Mono', monospace", 'font-size': '6' });
  subtext.textContent = 'routes';
  svg.appendChild(subtext);

  return svg;
};

// ================================================================
// TRUST GAUGE
// ================================================================
const buildGauge = (score) => {
  const pct = typeof score === 'number' ? Math.round(score * 100) : 0;
  const svg = svgEl('svg', { viewBox: '0 0 120 70', width: '200', height: '120' });

  svg.appendChild(svgEl('path', { d: describeArc(60, 60, 45, 180, 360), fill: 'none', stroke: '#313244', 'stroke-width': '10', 'stroke-linecap': 'round' }));

  const color = pct > 70 ? '#a6e3a1' : pct > 40 ? '#f9e2af' : '#f38ba8';
  const arcLen = Math.PI * 45;
  const fillLen = (pct / 100) * arcLen;
  const fgArc = svgEl('path', { d: describeArc(60, 60, 45, 180, 360), fill: 'none', stroke: color, 'stroke-width': '10', 'stroke-linecap': 'round', 'stroke-dasharray': arcLen, 'stroke-dashoffset': arcLen, class: 'gauge-arc-animated' });
  svg.appendChild(fgArc);
  requestAnimationFrame(() => { fgArc.setAttribute('stroke-dashoffset', String(arcLen - fillLen)); });

  const thresh40 = polarToCartesian(60, 60, 45, 180 + 0.4 * 180);
  const thresh70 = polarToCartesian(60, 60, 45, 180 + 0.7 * 180);
  const mark40i = polarToCartesian(60, 60, 38, 180 + 0.4 * 180);
  const mark70i = polarToCartesian(60, 60, 38, 180 + 0.7 * 180);
  svg.appendChild(svgEl('line', { x1: String(mark40i.x), y1: String(mark40i.y), x2: String(thresh40.x), y2: String(thresh40.y), stroke: '#f9e2af', class: 'gauge-threshold' }));
  svg.appendChild(svgEl('line', { x1: String(mark70i.x), y1: String(mark70i.y), x2: String(thresh70.x), y2: String(thresh70.y), stroke: '#a6e3a1', class: 'gauge-threshold' }));

  const dotPos = polarToCartesian(60, 60, 45, 180 + (pct / 100) * 180);
  svg.appendChild(svgEl('circle', { cx: String(dotPos.x), cy: String(dotPos.y), r: '4', fill: color, stroke: '#11111b', 'stroke-width': '1.5', class: 'gauge-glow' }));

  const text = svgEl('text', { x: '60', y: '55', 'text-anchor': 'middle', fill: '#cdd6f4', 'font-family': "'IBM Plex Mono', monospace", 'font-size': '18', 'font-weight': '700' });
  text.textContent = pct + '%';
  svg.appendChild(text);

  return svg;
};

const describeArc = (x, y, r, startAngle, endAngle) => {
  const start = polarToCartesian(x, y, r, endAngle);
  const end = polarToCartesian(x, y, r, startAngle);
  const largeArc = endAngle - startAngle <= 180 ? '0' : '1';
  return ['M', start.x, start.y, 'A', r, r, 0, largeArc, 0, end.x, end.y].join(' ');
};

const polarToCartesian = (cx, cy, r, angleDeg) => {
  const rad = (angleDeg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
};

// ================================================================
// SHARED COMPONENTS
// ================================================================
const statPill = (label, value) =>
  el('div', {}, [
    el('div', { className: 'text-xs text-muted', textContent: label }),
    el('div', { className: 'text-mono', style: { fontSize: '1.1rem', fontWeight: '700' }, textContent: String(value) }),
  ]);

const statBox = (value, label) =>
  el('div', { className: 'stat-box' }, [
    el('div', { className: 'stat-box-value', textContent: String(value) }),
    el('div', { className: 'stat-box-label', textContent: label }),
  ]);

const emptyState = (title, text) =>
  el('div', { className: 'card' }, [
    el('div', { className: 'empty-state' }, [
      el('div', { className: 'empty-state-title', textContent: title }),
      el('div', { className: 'empty-state-text', textContent: text }),
    ]),
  ]);

const expandableSection = (title, count, items) => {
  const section = el('div', { className: 'expand-section' });
  const header = el('div', { className: 'expand-header' }, [
    el('span', { className: 'expand-header-title', textContent: title }),
    el('span', { className: 'expand-header-count', textContent: count + ' items' }),
    el('span', { className: 'expand-header-arrow', textContent: '\u25B6' }),
  ]);
  header.addEventListener('click', () => section.classList.toggle('open'));
  const body = el('div', { className: 'expand-body' });
  for (const item of items) body.appendChild(item);
  section.appendChild(header);
  section.appendChild(body);
  return section;
};

const expandItem = (title, details, accentColor) => {
  const item = el('div', { className: 'expand-item', style: { borderLeftColor: accentColor } });
  item.appendChild(el('div', { className: 'expand-item-title', textContent: title }));
  const detailDiv = el('div', { className: 'expand-item-detail' });
  for (const d of details) detailDiv.appendChild(el('div', { textContent: d }));
  item.appendChild(detailDiv);
  item.addEventListener('click', (e) => { e.stopPropagation(); item.classList.toggle('open'); });
  return item;
};

// ================================================================
// INIT
// ================================================================
document.addEventListener('DOMContentLoaded', () => {
  // Sidebar card navigation
  $$('.sidebar-card[data-focus]').forEach(card => {
    card.addEventListener('click', () => navigateTo(card.dataset.focus));
  });

  // Code Health gear button
  const gearBtn = $('#btnCodeHealth');
  if (gearBtn) gearBtn.addEventListener('click', () => navigateTo('codehealth'));

  // Context gauge click -> context view
  const gaugeWrap = $('#ctxGaugeWrap');
  if (gaugeWrap) gaugeWrap.addEventListener('click', () => navigateTo('context'));

  // Detail panel close
  $('#detailClose').addEventListener('click', closeDetailPanel);
  $('#detailOverlay').addEventListener('click', closeDetailPanel);

  // Shortcut overlay backdrop click
  const overlay = $('#shortcutOverlay');
  if (overlay) overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('active'); });

  // Hash routing
  window.addEventListener('hashchange', initFromHash);

  // Clock
  tickClock();
  setInterval(tickClock, 1000);

  // Initial data
  fetchInitialData();

  // SSE
  connectSSE();

  // Init from hash
  initFromHash();

  // If no hash, show overview
  if (!window.location.hash) navigateTo('overview');

  // Ambient ticker polling (30s)
  setInterval(fetchAmbient, 30000);

  // Draw initial gauge
  drawCtxGauge(100);

  // Ripple click effect
  document.addEventListener('click', (e) => {
    const card = e.target.closest('.card');
    if (!card) return;
    if (!card.style.position || card.style.position === 'static') card.style.position = 'relative';
    card.style.overflow = 'hidden';
    const rect = card.getBoundingClientRect();
    const ripple = el('span', { className: 'ripple-effect', style: { left: (e.clientX - rect.left) + 'px', top: (e.clientY - rect.top) + 'px' } });
    card.appendChild(ripple);
    setTimeout(() => ripple.remove(), 500);
  });

  console.log('[JuhBDI] Cognitive Flow dashboard ready');
});

})();
