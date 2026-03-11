// JuhBDI Dashboard V2 — app.js
// Pure vanilla JS, no framework, no bundler

(() => {
'use strict';

// ================================================================
// CONSTANTS
// ================================================================
const VIEWS = ['overview', 'execution', 'cost', 'trust', 'sessions', 'trail', 'memory', 'codehealth'];
const VIEW_LABELS = {
  overview: 'Overview',
  execution: 'Execution',
  cost: 'Cost Intelligence',
  trust: 'Trust & Governance',
  sessions: 'Sessions & Context',
  trail: 'Decision Trail',
  memory: 'Intelligence Memory',
  codehealth: 'Code Health',
};

// Spritesheet icon CSS class per view (3D glass-morphism icons)
const VIEW_ICONS = {
  execution: 'panel-icon-exec',
  cost: 'panel-icon-cost',
  trust: 'panel-icon-trust',
  sessions: 'panel-icon-sessions',
  trail: 'panel-icon-trail',
  memory: 'panel-icon-memory',
  codehealth: 'panel-icon-trail', // reuse path icon for code health
};

// ================================================================
// STATE
// ================================================================
let currentView = 'overview';
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

// ================================================================
// NAVIGATION
// ================================================================
const navigateTo = (view) => {
  if (!VIEWS.includes(view)) view = 'overview';
  currentView = view;

  // Update sidebar
  $$('.nav-item[data-view]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });

  // Update views
  $$('.view').forEach(v => {
    v.classList.toggle('active', v.dataset.view === view);
  });

  // Update hash
  window.location.hash = view === 'overview' ? '' : view;

  // Render current view
  renderView(view);

  // Lazy-fetch codehealth
  if (view === 'codehealth' && !codehealthData && !codehealthLoading) {
    fetchCodeHealth();
  }
};

const initFromHash = () => {
  const hash = window.location.hash.slice(1);
  if (hash && VIEWS.includes(hash)) {
    navigateTo(hash);
  }
};

// ================================================================
// KEYBOARD SHORTCUTS
// ================================================================
document.addEventListener('keydown', (e) => {
  // Ignore when typing in input/textarea
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    if (e.key === 'Escape') e.target.blur();
    return;
  }

  const overlay = $('#shortcutOverlay');

  if (e.key === '?') {
    overlay.classList.toggle('active');
    return;
  }

  if (e.key === 'Escape') {
    if (overlay.classList.contains('active')) {
      overlay.classList.remove('active');
    } else {
      navigateTo('overview');
    }
    return;
  }

  if (e.key === '/') {
    e.preventDefault();
    navigateTo('trail');
    setTimeout(() => {
      const search = $('#trailSearchInput');
      if (search) search.focus();
    }, 100);
    return;
  }

  const num = parseInt(e.key);
  if (num >= 1 && num <= 8) {
    navigateTo(VIEWS[num - 1]);
  }
});

// ================================================================
// CLOCK
// ================================================================
const tickClock = () => {
  const timeEl = $('#headerTime');
  if (timeEl) {
    const now = new Date();
    timeEl.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
};

// ================================================================
// CONNECTION
// ================================================================
const setConnected = (state) => {
  connected = state;
  const indicator = $('#connectionIndicator');
  if (indicator) {
    indicator.classList.toggle('connected', state);
    const label = $('.connection-label', indicator);
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

  eventSource.onopen = () => setConnected(true);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'connected') {
        setConnected(true);
        return;
      }
      updateDashboard(data);
    } catch {}
  };

  eventSource.onerror = () => {
    setConnected(false);
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
  renderView('codehealth'); // Show skeleton
  const url = refresh ? '/api/codehealth?refresh=true' : '/api/codehealth';
  fetch(url)
    .then(r => r.json())
    .then(data => {
      codehealthData = data;
      codehealthLoading = false;
      if (currentView === 'codehealth') renderView('codehealth');
    })
    .catch(() => {
      codehealthLoading = false;
      codehealthData = null;
      if (currentView === 'codehealth') renderView('codehealth');
    });
};

const fetchInitialData = () => {
  fetch('/api/state').then(r => r.json()).then(d => {
    cachedState = d;
    updateMetricsBar();
    if (currentView === 'overview' || currentView === 'execution') renderView(currentView);
  }).catch(() => {});

  fetch('/api/trail?limit=200').then(r => r.json()).then(d => {
    cachedTrail = d;
    if (currentView === 'trail' || currentView === 'overview') renderView(currentView);
  }).catch(() => {});

  fetch('/api/cost').then(r => r.json()).then(d => {
    cachedCost = d;
    updateMetricsBar();
    if (currentView === 'cost' || currentView === 'overview') renderView(currentView);
  }).catch(() => {});

  fetch('/api/memory').then(r => r.json()).then(d => {
    cachedMemory = d;
    if (currentView === 'memory' || currentView === 'overview') renderView(currentView);
  }).catch(() => {});

  fetch('/api/sessions').then(r => r.json()).then(d => {
    cachedSessions = d;
    updateMetricsBar();
    if (currentView === 'sessions' || currentView === 'overview') renderView(currentView);
  }).catch(() => {});

  fetchTrends();
  fetchHotPrinciples();
};

const fetchSimilarWork = (query) => {
  if (!query) return;
  fetch('/api/similar-work?q=' + encodeURIComponent(query) + '&limit=5')
    .then(r => r.json())
    .then(d => {
      cachedSimilarWork = d;
      if (currentView === 'overview') renderOverview();
    })
    .catch(() => {});
};

const fetchTrends = () => {
  fetch('/api/trends')
    .then(r => r.json())
    .then(d => {
      cachedTrends = d;
      if (currentView === 'cost') renderCost();
    })
    .catch(() => {});
};

const fetchHotPrinciples = () => {
  fetch('/api/hot-principles')
    .then(r => r.json())
    .then(d => {
      cachedHotPrinciples = d;
      if (currentView === 'memory') renderMemory();
    })
    .catch(() => {});
};

// ================================================================
// MASTER UPDATE
// ================================================================
const updateDashboard = (data) => {
  if (data.state) cachedState = data.state;
  if (data.trail) cachedTrail = data.trail;
  if (data.cost) cachedCost = data.cost;
  if (data.memory) cachedMemory = data.memory;
  if (data.context) cachedContext = data.context;
  if (data.sessions) cachedSessions = data.sessions;
  updateMetricsBar();
  renderView(currentView);
};

// ================================================================
// METRICS BAR
// ================================================================
const updateMetricsBar = () => {
  // Exec
  const execVal = $('#metricExecValue');
  if (execVal && cachedState) {
    const st = cachedState.state?.state || cachedState.state;
    const wave = st?.current_wave ?? '--';
    execVal.textContent = 'W' + wave;
  }

  // Cost
  const costVal = $('#metricCostValue');
  const costSub = $('#metricCostSub');
  if (costVal && cachedCost) {
    costVal.textContent = fmt$(cachedCost.total_spend);
    if (costSub) costSub.textContent = cachedCost.savings_pct > 0 ? cachedCost.savings_pct + '% saved' : '';
  }

  // Trust
  const trustVal = $('#metricTrustValue');
  const trustSub = $('#metricTrustSub');
  if (trustVal && cachedMemory) {
    const score = cachedMemory.trust_score;
    trustVal.textContent = typeof score === 'number' ? Math.round(score * 100) + '%' : '--%';
    if (trustSub) trustSub.textContent = cachedMemory.trust_tier !== 'unknown' ? cachedMemory.trust_tier : '';
  }

  // Context
  const ctxVal = $('#metricCtxValue');
  if (ctxVal) {
    let worstPct = 100;
    for (const group of cachedSessions) {
      for (const s of group.sessions) {
        if (!s.stale && s.remaining_pct < worstPct) worstPct = s.remaining_pct;
      }
    }
    ctxVal.textContent = worstPct + '%';
    ctxVal.style.color = worstPct <= 22 ? 'var(--red)' :
                         worstPct <= 35 ? 'var(--peach)' :
                         worstPct <= 45 ? 'var(--yellow)' : 'var(--text)';
  }
};

// ================================================================
// VIEW RENDERER
// ================================================================
const renderView = (view) => {
  switch (view) {
    case 'overview': renderOverview(); break;
    case 'execution': renderExecution(); break;
    case 'cost': renderCost(); break;
    case 'trust': renderTrust(); break;
    case 'sessions': renderSessions(); break;
    case 'trail': renderTrail(); break;
    case 'memory': renderMemory(); break;
    case 'codehealth': renderCodeHealth(); break;
  }
};

// ================================================================
// OVERVIEW VIEW
// ================================================================
const renderOverview = () => {
  const container = $('#viewOverview');
  if (!container) return;
  clear(container);

  // Robot mascot
  const robot = el('div', { className: 'overview-robot' }, [
    el('img', { src: '/assets/juhbdilogo.png', alt: 'JuhBDI' }),
  ]);
  container.appendChild(robot);

  const grid = el('div', { className: 'overview-grid' });

  // Execution mini-card
  grid.appendChild(miniCard('execution', 'Execution', () => {
    const st = cachedState?.state?.state || cachedState?.state;
    const wave = st?.current_wave ?? '--';
    const phase = st?.current_phase ?? '--';
    return { value: 'Wave ' + wave, sub: 'Phase: ' + phase };
  }, 'var(--accent-exec)'));

  // Cost mini-card
  grid.appendChild(miniCard('cost', 'Cost', () => {
    if (!cachedCost) return { value: '--', sub: '' };
    return { value: fmt$(cachedCost.total_spend), sub: cachedCost.savings_pct + '% saved' };
  }, 'var(--accent-cost)'));

  // Trust mini-card
  grid.appendChild(miniCard('trust', 'Trust', () => {
    if (!cachedMemory) return { value: '--%', sub: '' };
    const score = cachedMemory.trust_score;
    return {
      value: typeof score === 'number' ? Math.round(score * 100) + '%' : '--%',
      sub: cachedMemory.trust_tier || '',
    };
  }, 'var(--accent-trust)'));

  // Sessions mini-card
  grid.appendChild(miniCard('sessions', 'Sessions', () => {
    let active = 0;
    for (const g of cachedSessions) for (const s of g.sessions) if (!s.stale) active++;
    return { value: active + ' active', sub: cachedSessions.length + ' project(s)' };
  }, 'var(--accent-context)'));

  // Trail mini-card
  grid.appendChild(miniCard('trail', 'Trail', () => {
    return { value: cachedTrail.length + ' entries', sub: cachedTrail.length > 0 ? 'Latest: ' + (cachedTrail[cachedTrail.length - 1]?.event_type || '') : '' };
  }, 'var(--accent-trail)'));

  // Memory mini-card
  grid.appendChild(miniCard('memory', 'Memory', () => {
    if (!cachedMemory) return { value: '--', sub: '' };
    return { value: cachedMemory.reflexion_count + ' reflexions', sub: cachedMemory.trace_count + ' traces, ' + cachedMemory.principle_count + ' principles' };
  }, 'var(--accent-memory)'));

  // Code Health mini-card
  grid.appendChild(miniCard('codehealth', 'Code Health', () => {
    if (!codehealthData) return { value: 'Not loaded', sub: 'Click to analyze' };
    const s = codehealthData.summary;
    return { value: s.clean + ' clean', sub: s.warning + ' warning, ' + s.hot + ' hot' };
  }, 'var(--accent-codehealth)'));

  container.appendChild(grid);

  // Similar Work panel (Decision Intelligence)
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

  // Similar Work search input
  const swSearch = el('div', { className: 'card mt-md' }, [
    el('div', { className: 'card-title' }, [
      el('span', { className: 'accent-dot', style: { background: 'var(--lavender)' } }),
      document.createTextNode('SEARCH PAST WORK'),
    ]),
    el('div', { className: 'flex-row gap-sm' }, [
      el('input', {
        className: 'trail-search',
        type: 'text',
        placeholder: 'Describe your next task...',
        id: 'similarWorkInput',
      }),
      el('button', {
        className: 'filter-btn active',
        textContent: 'Find Similar',
        onclick: () => {
          const input = document.getElementById('similarWorkInput');
          if (input && input.value.trim()) fetchSimilarWork(input.value.trim());
        },
      }),
    ]),
  ]);
  container.appendChild(swSearch);
};

const miniCard = (view, title, dataFn, accentColor) => {
  const data = dataFn();
  const iconClass = VIEW_ICONS[view];
  const children = [];

  if (iconClass) {
    children.push(el('div', { className: 'panel-icon ' + iconClass }));
  }
  children.push(
    el('div', { style: { flex: '1' } }, [
      el('div', { className: 'mini-card-title' }, [
        el('span', { className: 'accent-dot', style: { background: accentColor } }),
        document.createTextNode(title),
      ]),
      el('div', { className: 'mini-card-value', textContent: data.value }),
      el('div', { className: 'mini-card-sub', textContent: data.sub }),
    ])
  );

  const card = el('div', { className: 'mini-card', onClick: () => navigateTo(view) }, [
    el('div', { className: 'flex-row gap-md', style: { alignItems: 'center' } }, children),
  ]);
  return card;
};

// ================================================================
// EXECUTION VIEW
// ================================================================
const renderExecution = () => {
  const container = $('#viewExecution');
  if (!container) return;
  clear(container);

  const st = cachedState?.state?.state || cachedState?.state;
  const roadmap = cachedState?.roadmap?.roadmap || cachedState?.roadmap;

  // Header
  container.appendChild(el('div', { className: 'card mb-md' }, [
    el('div', { className: 'card-title' }, [
      el('span', { className: 'accent-dot', style: { background: 'var(--accent-exec)' } }),
      document.createTextNode('EXECUTION STATUS'),
    ]),
    el('div', { className: 'flex-row gap-lg', style: { flexWrap: 'wrap' } }, [
      statPill('Phase', st?.current_phase ?? '--'),
      statPill('Wave', st?.current_wave ?? '--'),
      statPill('Status', st?.status ?? 'idle'),
      statPill('Project', cachedState?.intentSpec?.project_name || st?.project_name || '--'),
    ]),
  ]));

  // Tasks
  const phases = roadmap?.phases || [];
  const curPhase = st?.current_phase || 1;
  const phase = phases.find(p => p.phase === curPhase) || phases[0];

  if (phase && phase.tasks && phase.tasks.length > 0) {
    const taskCard = el('div', { className: 'card' }, [
      el('div', { className: 'card-title' }, [
        el('span', { className: 'accent-dot', style: { background: 'var(--accent-exec)' } }),
        document.createTextNode('TASKS \u2014 Phase ' + phase.phase),
      ]),
    ]);

    for (const task of phase.tasks) {
      const statusClass = task.status === 'done' ? 'done' : task.status === 'active' || task.status === 'in_progress' ? 'active' : 'pending';
      const bar = el('div', { className: 'task-bar' }, [
        el('div', { className: 'task-status-dot ' + statusClass }),
        el('span', { className: 'task-name', textContent: task.description || task.name || 'Task ' + task.id }),
        el('span', { className: 'badge badge-' + (statusClass === 'done' ? 'success' : statusClass === 'active' ? 'info' : 'neutral'), textContent: task.status || 'pending' }),
      ]);
      const detail = el('div', { className: 'task-detail' });
      if (task.description) detail.textContent = task.description;
      if (task.routed_to) detail.textContent += '\nModel: ' + task.routed_to;

      bar.addEventListener('click', () => detail.classList.toggle('expanded'));
      taskCard.appendChild(bar);
      taskCard.appendChild(detail);
    }

    container.appendChild(taskCard);
  } else {
    container.appendChild(emptyState('No tasks', 'Run /juhbdi:plan to create a roadmap with tasks.'));
  }
};

const statPill = (label, value) =>
  el('div', {}, [
    el('div', { className: 'text-xs text-muted', textContent: label }),
    el('div', { className: 'text-mono', style: { fontSize: '1.1rem', fontWeight: '700' }, textContent: String(value) }),
  ]);

const emptyState = (title, text) =>
  el('div', { className: 'card' }, [
    el('div', { className: 'empty-state' }, [
      el('div', { className: 'empty-state-title', textContent: title }),
      el('div', { className: 'empty-state-text', textContent: text }),
    ]),
  ]);

// ================================================================
// COST VIEW
// ================================================================
const renderCost = () => {
  const container = $('#viewCost');
  if (!container) return;
  clear(container);

  if (!cachedCost) {
    container.appendChild(emptyState('No cost data', 'Cost intelligence appears after model routing decisions.'));
    return;
  }

  // Summary stats
  const statsCard = el('div', { className: 'card mb-md' }, [
    el('div', { className: 'card-title' }, [
      el('span', { className: 'accent-dot', style: { background: 'var(--accent-cost)' } }),
      document.createTextNode('COST INTELLIGENCE'),
    ]),
    el('div', { className: 'flex-row gap-lg', style: { flexWrap: 'wrap' } }, [
      statPill('Total Spend', fmt$(cachedCost.total_spend)),
      statPill('Opus Equivalent', fmt$(cachedCost.opus_equivalent)),
      statPill('Savings', fmt$(cachedCost.savings)),
      statPill('Savings %', cachedCost.savings_pct + '%'),
    ]),
  ]);
  container.appendChild(statsCard);

  // Sparkline chart
  if (cachedCost.spend_over_time && cachedCost.spend_over_time.length > 1) {
    const chartCard = el('div', { className: 'card mb-md' }, [
      el('div', { className: 'card-title' }, [
        document.createTextNode('CUMULATIVE SPEND'),
      ]),
    ]);
    const chartDiv = el('div', { className: 'chart-container' });
    chartDiv.appendChild(buildSparkline(cachedCost.spend_over_time, 600, 140));
    chartCard.appendChild(chartDiv);
    container.appendChild(chartCard);
  }

  // Donut chart
  const dist = cachedCost.model_distribution;
  if (dist && Object.keys(dist).length > 0) {
    const donutCard = el('div', { className: 'card' }, [
      el('div', { className: 'card-title' }, [
        document.createTextNode('MODEL DISTRIBUTION'),
      ]),
    ]);
    const donutRow = el('div', { className: 'flex-row gap-lg', style: { flexWrap: 'wrap', alignItems: 'flex-start' } });

    const donutDiv = el('div', { className: 'chart-container', style: { maxWidth: '180px' } });
    donutDiv.appendChild(buildDonut(dist, 180));
    donutRow.appendChild(donutDiv);

    // Legend
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

  // Trend Line panels (Decision Intelligence — Phase 3)
  if (cachedTrends) {
    if (cachedTrends.cost_trend && cachedTrends.cost_trend.length > 1) {
      const trendCard = el('div', { className: 'card mt-md' }, [
        el('div', { className: 'card-title' }, [
          el('span', { className: 'accent-dot', style: { background: 'var(--teal)' } }),
          document.createTextNode('COST TREND (CUMULATIVE)'),
        ]),
      ]);
      const chartDiv = el('div', { className: 'chart-container' });
      chartDiv.appendChild(buildSparkline(
        cachedTrends.cost_trend.map(d => ({ timestamp: d.date, cumulative: d.cumulative_cost })),
        600, 140
      ));
      trendCard.appendChild(chartDiv);
      container.appendChild(trendCard);
    }

    if (cachedTrends.pass_rate_trend && cachedTrends.pass_rate_trend.length > 1) {
      const passCard = el('div', { className: 'card mt-md' }, [
        el('div', { className: 'card-title' }, [
          el('span', { className: 'accent-dot', style: { background: 'var(--green)' } }),
          document.createTextNode('PASS RATE (7-DAY ROLLING)'),
        ]),
      ]);
      const chartDiv = el('div', { className: 'chart-container' });
      chartDiv.appendChild(buildSparkline(
        cachedTrends.pass_rate_trend.map(d => ({ timestamp: d.date, cumulative: d.pass_rate })),
        600, 140
      ));
      passCard.appendChild(chartDiv);
      container.appendChild(passCard);
    }

    if (cachedTrends.router_accuracy_trend && cachedTrends.router_accuracy_trend.length > 1) {
      const routerCard = el('div', { className: 'card mt-md' }, [
        el('div', { className: 'card-title' }, [
          el('span', { className: 'accent-dot', style: { background: 'var(--blue)' } }),
          document.createTextNode('ROUTER ACCURACY'),
        ]),
      ]);
      const chartDiv = el('div', { className: 'chart-container' });
      chartDiv.appendChild(buildSparkline(
        cachedTrends.router_accuracy_trend.map(d => ({ timestamp: d.date, cumulative: d.accuracy })),
        600, 140
      ));
      routerCard.appendChild(chartDiv);
      container.appendChild(routerCard);
    }
  } else {
    fetchTrends();
  }
};

// ================================================================
// SVG CHARTS
// ================================================================
const buildSparkline = (data, width, height) => {
  const svg = svgEl('svg', { viewBox: '0 0 ' + width + ' ' + height, preserveAspectRatio: 'none' });

  const maxVal = Math.max(...data.map(d => d.cumulative), 0.001);
  const padTop = 10;
  const padBot = 10;
  const usableH = height - padTop - padBot;

  const points = data.map((d, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * width;
    const y = padTop + usableH - (d.cumulative / maxVal) * usableH;
    return x + ',' + y;
  });

  // Gradient
  const defs = svgEl('defs');
  const grad = svgEl('linearGradient', { id: 'sparkGrad', x1: '0', y1: '0', x2: '0', y2: '1' });
  const stop1 = svgEl('stop', { offset: '0%', 'stop-color': '#a6e3a1', 'stop-opacity': '0.4' });
  const stop2 = svgEl('stop', { offset: '100%', 'stop-color': '#a6e3a1', 'stop-opacity': '0.02' });
  grad.appendChild(stop1);
  grad.appendChild(stop2);
  defs.appendChild(grad);
  svg.appendChild(defs);

  // Area
  const areaPoints = points.join(' ') + ' ' + width + ',' + height + ' 0,' + height;
  const polygon = svgEl('polygon', { points: areaPoints, fill: 'url(#sparkGrad)' });
  svg.appendChild(polygon);

  // Line
  const polyline = svgEl('polyline', {
    points: points.join(' '),
    fill: 'none',
    stroke: '#a6e3a1',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  });
  svg.appendChild(polyline);

  // End dot
  if (data.length > 0) {
    const lastPt = points[points.length - 1].split(',');
    const circle = svgEl('circle', {
      cx: lastPt[0], cy: lastPt[1], r: '4',
      fill: '#a6e3a1', stroke: '#11111b', 'stroke-width': '2',
    });
    svg.appendChild(circle);
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
    const circle = svgEl('circle', {
      cx: String(cx), cy: String(cy), r: String(r),
      fill: 'none',
      stroke: colors[model] || '#7f849c',
      'stroke-width': '12',
      'stroke-dasharray': dash + ' ' + (circumference - dash),
      'stroke-dashoffset': String(-offset),
      transform: 'rotate(-90 50 50)',
    });
    svg.appendChild(circle);
    offset += dash;
  }

  // Center text
  const text = svgEl('text', {
    x: '50', y: '52',
    'text-anchor': 'middle',
    'dominant-baseline': 'middle',
    fill: '#cdd6f4',
    'font-family': "'IBM Plex Mono', monospace",
    'font-size': '12',
    'font-weight': '700',
  });
  text.textContent = String(total);
  svg.appendChild(text);

  const subtext = svgEl('text', {
    x: '50', y: '64',
    'text-anchor': 'middle',
    fill: '#a6adc8',
    'font-family': "'IBM Plex Mono', monospace",
    'font-size': '6',
  });
  subtext.textContent = 'routes';
  svg.appendChild(subtext);

  return svg;
};

// ================================================================
// TRUST VIEW
// ================================================================
const renderTrust = () => {
  const container = $('#viewTrust');
  if (!container) return;
  clear(container);

  const score = cachedMemory?.trust_score ?? 0;
  const tier = cachedMemory?.trust_tier ?? 'unknown';

  // Trust gauge
  const gaugeCard = el('div', { className: 'card mb-md' }, [
    el('div', { className: 'card-title' }, [
      el('span', { className: 'accent-dot', style: { background: 'var(--accent-trust)' } }),
      document.createTextNode('TRUST SCORE'),
    ]),
    el('div', { className: 'gauge-container' }, [buildGauge(score)]),
  ]);
  container.appendChild(gaugeCard);

  // Tier ladder
  const tiers = ['probation', 'supervised', 'junior', 'independent'];
  const ladderCard = el('div', { className: 'card mb-md' }, [
    el('div', { className: 'card-title' }, [document.createTextNode('TRUST TIER')]),
  ]);
  const ladder = el('div', { className: 'tier-ladder' });
  for (const t of tiers) {
    const isCurrent = tier.toLowerCase() === t;
    const box = el('div', { className: 'tier-box' + (isCurrent ? ' current' : '') }, [
      el('div', { className: 'tier-box-name', textContent: t }),
    ]);
    ladder.appendChild(box);
  }
  ladderCard.appendChild(ladder);
  container.appendChild(ladderCard);

  // Governance log
  const govEntries = cachedTrail.filter(e =>
    e.event_type === 'governance' || e.event_type === 'verification'
  ).slice(-20);

  const logCard = el('div', { className: 'card' }, [
    el('div', { className: 'card-title' }, [document.createTextNode('GOVERNANCE LOG')]),
  ]);

  if (govEntries.length === 0) {
    logCard.appendChild(el('div', { className: 'text-sm text-muted', textContent: 'No governance events yet.' }));
  } else {
    for (const entry of govEntries.reverse()) {
      logCard.appendChild(el('div', { className: 'trail-entry' }, [
        el('span', { className: 'trail-entry-time', textContent: fmtTs(entry.timestamp) }),
        el('span', { className: 'badge type-' + entry.event_type, textContent: entry.event_type }),
        el('span', { className: 'trail-entry-desc', textContent: entry.description || '' }),
      ]));
    }
  }
  container.appendChild(logCard);
};

const buildGauge = (score) => {
  const pct = typeof score === 'number' ? Math.round(score * 100) : 0;
  const svg = svgEl('svg', { viewBox: '0 0 120 70', width: '200', height: '120' });

  // Arc background
  const bgArc = svgEl('path', {
    d: describeArc(60, 60, 45, 180, 360),
    fill: 'none', stroke: '#313244', 'stroke-width': '10', 'stroke-linecap': 'round',
  });
  svg.appendChild(bgArc);

  // Arc fill
  const endAngle = 180 + (pct / 100) * 180;
  const color = pct > 70 ? '#a6e3a1' : pct > 40 ? '#f9e2af' : '#f38ba8';
  const fgArc = svgEl('path', {
    d: describeArc(60, 60, 45, 180, endAngle),
    fill: 'none', stroke: color, 'stroke-width': '10', 'stroke-linecap': 'round',
  });
  svg.appendChild(fgArc);

  // Text
  const text = svgEl('text', {
    x: '60', y: '55',
    'text-anchor': 'middle', fill: '#cdd6f4',
    'font-family': "'IBM Plex Mono', monospace", 'font-size': '18', 'font-weight': '700',
  });
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
// SESSIONS VIEW
// ================================================================
const renderSessions = () => {
  const container = $('#viewSessions');
  if (!container) return;
  clear(container);

  // Separate active and stale sessions
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

  // Active sessions — shown prominently
  if (activeSessions.length > 0) {
    container.appendChild(el('div', { className: 'project-group-header', textContent: 'Active Sessions (' + activeSessions.length + ')' }));
    for (const s of activeSessions) {
      container.appendChild(buildSessionCard(s, false));
    }
  }

  // Stale sessions — collapsed by default
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
    for (const s of staleSessions) {
      staleBody.appendChild(buildSessionCard(s, true));
    }
    staleSection.appendChild(staleBody);
    container.appendChild(staleSection);
  }

  if (activeSessions.length === 0 && staleSessions.length > 0) {
    container.insertBefore(
      emptyState('No active sessions', 'All sessions are stale. Start a new JuhBDI session to see live context.'),
      container.firstChild
    );
  }
};

const buildSessionCard = (s, isStale) => {
  const levelColor = s.level === 'EMERGENCY' ? 'var(--red)' :
                     s.level === 'CRITICAL' ? 'var(--peach)' :
                     s.level === 'URGENT' ? 'var(--yellow)' :
                     s.level === 'WARNING' ? 'var(--yellow)' : 'var(--green)';

  const progressClass = s.remaining_pct <= 22 ? 'progress-red' :
                        s.remaining_pct <= 35 ? 'progress-yellow' :
                        s.remaining_pct <= 45 ? 'progress-yellow' : 'progress-green';

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
// TRAIL VIEW
// ================================================================
const renderTrail = () => {
  const container = $('#viewTrail');
  if (!container) return;

  // Only rebuild toolbar if not present
  let toolbar = $('#trailToolbar', container);
  if (!toolbar) {
    clear(container);

    toolbar = el('div', { className: 'trail-toolbar', id: 'trailToolbar' });

    const searchInput = el('input', {
      className: 'trail-search',
      id: 'trailSearchInput',
      type: 'text',
      placeholder: 'Search trail...',
    });
    searchInput.addEventListener('input', (e) => {
      trailSearch = e.target.value;
      if (searchTimeout) clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => renderTrailEntries(), 200);
    });
    toolbar.appendChild(searchInput);

    const types = ['all', 'routing', 'execution', 'decision', 'governance', 'verification', 'error'];
    for (const t of types) {
      const btn = el('button', {
        className: 'filter-btn' + (trailFilter === t ? ' active' : ''),
        textContent: t,
        onClick: () => {
          trailFilter = t;
          $$('.filter-btn', toolbar).forEach(b => b.classList.toggle('active', b.textContent === t));
          renderTrailEntries();
        },
      });
      toolbar.appendChild(btn);
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

    container.appendChild(toolbar);

    const entriesDiv = el('div', { id: 'trailEntries' });
    container.appendChild(entriesDiv);
  }

  renderTrailEntries();
};

const renderTrailEntries = () => {
  const entriesDiv = $('#trailEntries');
  if (!entriesDiv) return;
  clear(entriesDiv);

  let filtered = cachedTrail;
  if (trailFilter !== 'all') {
    filtered = filtered.filter(e => e.event_type === trailFilter);
  }
  if (trailSearch) {
    const q = trailSearch.toLowerCase();
    filtered = filtered.filter(e =>
      (e.description || '').toLowerCase().includes(q) ||
      (e.event_type || '').toLowerCase().includes(q)
    );
  }

  if (filtered.length === 0) {
    entriesDiv.appendChild(el('div', { className: 'text-sm text-muted', style: { padding: '20px', textAlign: 'center' }, textContent: 'No matching trail entries.' }));
    return;
  }

  const countBadge = el('div', { className: 'text-xs text-muted mb-sm', textContent: filtered.length + ' entries' });
  entriesDiv.appendChild(countBadge);

  for (const entry of filtered) {
    const row = el('div', { className: 'trail-entry' }, [
      el('span', { className: 'trail-entry-time', textContent: fmtTs(entry.timestamp) }),
      el('span', { className: 'badge type-' + (entry.event_type || 'decision'), textContent: entry.event_type || 'unknown' }),
      el('span', { className: 'trail-entry-desc', textContent: entry.description || '' }),
    ]);

    const detail = el('div', { className: 'trail-entry-detail' });
    detail.textContent = JSON.stringify(entry, null, 2);

    row.addEventListener('click', () => detail.classList.toggle('expanded'));
    entriesDiv.appendChild(row);
    entriesDiv.appendChild(detail);
  }

  // Cursor
  entriesDiv.appendChild(el('span', { className: 'trail-cursor' }));

  // Auto-scroll
  if (trailAutoScroll) {
    entriesDiv.scrollTop = entriesDiv.scrollHeight;
  }
};

// ================================================================
// MEMORY VIEW
// ================================================================
const renderMemory = () => {
  const container = $('#viewMemory');
  if (!container) return;
  clear(container);

  if (!cachedMemory) {
    container.appendChild(emptyState('No memory data', 'Intelligence memory builds after execution.'));
    return;
  }

  // Stats row
  const statsRow = el('div', { className: 'memory-stats-row' });
  statsRow.appendChild(statBox(cachedMemory.reflexion_count, 'Reflexions'));
  statsRow.appendChild(statBox(cachedMemory.trace_count, 'Traces'));
  statsRow.appendChild(statBox(cachedMemory.principle_count, 'Principles'));
  container.appendChild(statsRow);

  // Reflexions
  const reflexions = cachedMemory.all_reflexions || cachedMemory.recent_reflexions || [];
  container.appendChild(expandableSection('Reflexions', reflexions.length, reflexions.map(r =>
    expandItem(r.task || 'Unknown task', [
      'Lesson: ' + (r.lesson || '--'),
      'Outcome: ' + (r.outcome || '--'),
    ], r.outcome === 'success' ? 'var(--green)' : r.outcome === 'failure' ? 'var(--red)' : 'var(--yellow)')
  )));

  // Traces
  const traces = cachedMemory.all_traces || [];
  container.appendChild(expandableSection('Traces', traces.length, traces.map(t =>
    expandItem(t.summary || 'Trace', [
      'Result: ' + (t.success ? 'Success' : 'Failure'),
    ], t.success ? 'var(--green)' : 'var(--red)')
  )));

  // Principles
  const principles = cachedMemory.all_principles || [];
  container.appendChild(expandableSection('Principles', principles.length, principles.map(p =>
    expandItem(p.text || 'Principle', [
      'Source: ' + (p.source || '--'),
      'Confidence: ' + (typeof p.confidence === 'number' ? Math.round(p.confidence * 100) + '%' : '--'),
    ], 'var(--lavender)')
  )));

  // Hot Principles panel (Decision Intelligence — Phase 3)
  if (cachedHotPrinciples) {
    if (cachedHotPrinciples.top_applied && cachedHotPrinciples.top_applied.length > 0) {
      const hotCard = el('div', { className: 'card mt-md' }, [
        el('div', { className: 'card-title' }, [
          el('span', { className: 'accent-dot', style: { background: 'var(--peach)' } }),
          document.createTextNode('HOT PRINCIPLES (MOST APPLIED)'),
        ]),
      ]);
      for (const p of cachedHotPrinciples.top_applied) {
        const confColor = p.confidence >= 0.8 ? 'var(--green)' :
                          p.confidence >= 0.5 ? 'var(--yellow)' : 'var(--red)';
        hotCard.appendChild(el('div', { className: 'trail-entry' }, [
          el('span', { className: 'text-mono text-sm', style: { color: confColor, minWidth: '40px' },
            textContent: Math.round(p.confidence * 100) + '%' }),
          el('span', { className: 'badge badge-neutral', textContent: p.times_applied + 'x' }),
          el('span', { className: 'trail-entry-desc', textContent: p.text }),
          el('span', { className: 'text-xs text-muted', textContent: p.source }),
        ]));
      }
      container.appendChild(hotCard);
    }

    if (cachedHotPrinciples.recently_promoted && cachedHotPrinciples.recently_promoted.length > 0) {
      const promoCard = el('div', { className: 'card mt-md' }, [
        el('div', { className: 'card-title' }, [
          el('span', { className: 'accent-dot', style: { background: 'var(--green)' } }),
          document.createTextNode('RECENTLY PROMOTED TO GLOBAL'),
        ]),
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
        el('div', { className: 'card-title' }, [
          el('span', { className: 'accent-dot', style: { background: 'var(--red)' } }),
          document.createTextNode('DECAY WARNINGS'),
        ]),
      ]);
      for (const p of cachedHotPrinciples.decay_warnings) {
        decayCard.appendChild(el('div', { className: 'trail-entry' }, [
          el('span', { className: 'text-mono text-sm', style: { color: 'var(--red)', minWidth: '40px' },
            textContent: Math.round(p.confidence * 100) + '%' }),
          el('span', { className: 'badge badge-error',
            textContent: p.times_validated + '/' + p.times_applied + ' validated' }),
          el('span', { className: 'trail-entry-desc', textContent: p.text }),
        ]));
      }
      container.appendChild(decayCard);
    }
  } else {
    fetchHotPrinciples();
  }
};

const statBox = (value, label) =>
  el('div', { className: 'stat-box' }, [
    el('div', { className: 'stat-box-value', textContent: String(value) }),
    el('div', { className: 'stat-box-label', textContent: label }),
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
  item.addEventListener('click', (e) => {
    e.stopPropagation();
    item.classList.toggle('open');
  });
  return item;
};

// ================================================================
// CODE HEALTH VIEW
// ================================================================
const renderCodeHealth = () => {
  const container = $('#viewCodehealth');
  if (!container) return;
  clear(container);

  if (codehealthLoading) {
    // Skeleton
    const skel = el('div', { className: 'card' }, [
      el('div', { className: 'card-title' }, [document.createTextNode('CODE HEALTH')]),
      el('div', { className: 'skeleton', style: { height: '24px', width: '60%', marginBottom: '12px' } }),
      el('div', { className: 'skeleton', style: { height: '16px', width: '80%', marginBottom: '8px' } }),
      el('div', { className: 'skeleton', style: { height: '16px', width: '70%', marginBottom: '8px' } }),
      el('div', { className: 'skeleton', style: { height: '16px', width: '90%', marginBottom: '8px' } }),
      el('div', { className: 'skeleton', style: { height: '16px', width: '50%' } }),
    ]);
    container.appendChild(skel);
    return;
  }

  if (!codehealthData) {
    const errCard = el('div', { className: 'card' }, [
      el('div', { className: 'empty-state' }, [
        el('div', { className: 'empty-state-title', textContent: 'Analysis unavailable' }),
        el('div', { className: 'empty-state-text', textContent: 'Could not run code health analysis.' }),
        el('button', { className: 'refresh-btn mt-md', textContent: 'Retry', onClick: () => fetchCodeHealth(true) }),
      ]),
    ]);
    container.appendChild(errCard);
    return;
  }

  const data = codehealthData;

  // Summary bar
  const summaryCard = el('div', { className: 'card mb-md' }, [
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
  ]);
  container.appendChild(summaryCard);

  // Complexity hotspots
  if (data.complexity.length > 0) {
    const complexCard = el('div', { className: 'card mb-md' }, [
      el('div', { className: 'card-title' }, [document.createTextNode('COMPLEXITY HOTSPOTS')]),
    ]);

    const table = el('table', { className: 'health-table' });
    const thead = el('thead', {}, [
      el('tr', {}, [
        el('th', { textContent: 'Function' }),
        el('th', { textContent: 'File' }),
        el('th', { textContent: 'Complexity' }),
        el('th', { textContent: '' }),
      ]),
    ]);
    table.appendChild(thead);

    const tbody = el('tbody');
    for (const item of data.complexity) {
      const level = item.complexity < 8 ? 'low' : item.complexity < 15 ? 'medium' : 'high';
      const pct = Math.min(100, (item.complexity / 20) * 100);
      tbody.appendChild(el('tr', {}, [
        el('td', { textContent: item.function }),
        el('td', { className: 'text-muted', textContent: item.file }),
        el('td', {}, [
          el('div', { className: 'complexity-bar' }, [
            el('div', { className: 'complexity-fill ' + level, style: { width: pct + '%' } }),
          ]),
        ]),
        el('td', { textContent: String(item.complexity) }),
      ]));
    }
    table.appendChild(tbody);
    complexCard.appendChild(table);
    container.appendChild(complexCard);
  }

  // Dead code
  if (data.deadCode.length > 0) {
    const deadCard = el('div', { className: 'card mb-md' }, [
      el('div', { className: 'card-title' }, [document.createTextNode('DEAD CODE')]),
    ]);

    const table = el('table', { className: 'health-table' });
    const thead = el('thead', {}, [
      el('tr', {}, [
        el('th', { textContent: 'Export' }),
        el('th', { textContent: 'File' }),
        el('th', { textContent: 'Confidence' }),
      ]),
    ]);
    table.appendChild(thead);

    const tbody = el('tbody');
    for (const item of data.deadCode) {
      tbody.appendChild(el('tr', {}, [
        el('td', { textContent: item.export }),
        el('td', { className: 'text-muted', textContent: item.file }),
        el('td', {}, [
          el('span', { className: 'badge badge-' + (item.confidence === 'high' ? 'error' : 'warning'), textContent: item.confidence }),
        ]),
      ]));
    }
    table.appendChild(tbody);
    deadCard.appendChild(table);
    container.appendChild(deadCard);
  }

  // Call graph stats
  const graphCard = el('div', { className: 'card' }, [
    el('div', { className: 'card-title' }, [document.createTextNode('CALL GRAPH')]),
    el('div', { className: 'memory-stats-row' }, [
      statBox(data.callGraph.edgeCount, 'Edges'),
      statBox(data.callGraph.entryPoints.length, 'Entry Points'),
      statBox(data.callGraph.hotPaths.length, 'Hot Paths'),
    ]),
  ]);
  container.appendChild(graphCard);
};

// ================================================================
// INIT
// ================================================================
document.addEventListener('DOMContentLoaded', () => {
  // Sidebar navigation
  $$('.nav-item[data-view]').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.view));
  });

  // Metrics bar navigation
  $$('.metric[data-view]').forEach(m => {
    m.addEventListener('click', () => navigateTo(m.dataset.view));
  });

  // Shortcut button
  const shortcutBtn = $('#btnShortcuts');
  if (shortcutBtn) {
    shortcutBtn.addEventListener('click', () => {
      $('#shortcutOverlay').classList.toggle('active');
    });
  }

  // Close overlay on backdrop click
  const overlay = $('#shortcutOverlay');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('active');
    });
  }

  // Hash routing
  window.addEventListener('hashchange', initFromHash);

  // Clock
  tickClock();
  setInterval(tickClock, 1000);

  // Initial data fetch
  fetchInitialData();

  // SSE connection
  connectSSE();

  // Init from hash
  initFromHash();

  console.log('[JuhBDI] Dashboard V2 ready');
});

})();
