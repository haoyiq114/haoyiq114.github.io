/* Turning the Mismatch Knob: interactive figures. Needs d3 v7 and KaTeX; reads data.json next to this file. */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const NS = 'http://www.w3.org/2000/svg';
  const tip = $('#tip');
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const isDark = () => {
    const t = document.documentElement.dataset.theme;
    if (t) return t === 'dark';
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  };

  /* ---------- estimated reading time: prose and figure text at 265 words a minute, plus 12 seconds a figure; references excluded ---------- */
  (() => {
    const out = $('#read-time');
    if (!out) return;
    const els = [...document.querySelectorAll('.tldr p, article.col p, article.col li, article.col h2, .fig-title, .fig-sub, figcaption')].filter(e => !e.closest('.refs, details'));
    const words = els.reduce((n, e) => n + (e.textContent.trim().match(/\S+/g) || []).length, 0);
    const mins = Math.max(1, Math.round(words / 265 + document.querySelectorAll('main figure').length * 0.2));
    out.textContent = `${mins} min read`;
  })();

  /* ---------- theme ---------- */
  const themeBtn = $('#theme');
  function setTheme(t) {
    if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
    themeBtn.textContent = isDark() ? 'Light' : 'Dark';
    try { if (t) localStorage.setItem('mk-theme', t); } catch (e) { /* storage unavailable */ }
  }
  try { const saved = localStorage.getItem('mk-theme'); if (saved) setTheme(saved); else setTheme(null); } catch (e) { setTheme(null); }
  themeBtn.addEventListener('click', () => { setTheme(isDark() ? 'light' : 'dark'); renderAll(); });
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { setTheme(document.documentElement.dataset.theme || null); renderAll(); });

  /* ---------- math ---------- */
  document.querySelectorAll('[data-tex]').forEach(el => {
    try { katex.render(el.dataset.tex, el, { displayMode: el.classList.contains('math'), throwOnError: false }); } catch (e) { el.textContent = el.dataset.tex; }
  });

  /* ---------- side contents: highlight the section in view ---------- */
  (() => {
    const nav = document.querySelector('.side-toc'), marker = document.querySelector('.toc-marker');
    const links = [...document.querySelectorAll('.side-toc a')];
    const heads = links.map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
    let last = null;
    const update = () => {
      let cur = heads[0];
      heads.forEach(h => { if (h.getBoundingClientRect().top < window.innerHeight * 0.35) cur = h; });
      const act = links.find(a => a.getAttribute('href') === `#${cur.id}`);
      links.forEach(a => { a.classList.toggle('active', a === act); if (a === act) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current'); });
      if (act && nav && marker && nav.offsetParent) {
        // centre the dot on the first line of the active entry
        const y = act.getBoundingClientRect().top - nav.getBoundingClientRect().top + nav.scrollTop + 9;
        if (y !== last) { nav.style.setProperty('--y', `${y}px`); marker.style.setProperty('--y', `${y}px`); last = y; }
        nav.classList.add('has-marker');
      }
      // a wide figure scrolling past the contents hides it until the figure has gone by
      if (nav && nav.offsetParent) {
        const r = nav.getBoundingClientRect();
        const covered = [...document.querySelectorAll('figure.xwide .scroll')].some(s => {
          const b = s.getBoundingClientRect();
          return b.left < r.right + 12 && b.top < r.bottom && b.bottom > r.top;
        });
        nav.classList.toggle('covered', covered);
      }
    };
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
  })();

  /* ---------- shared helpers ---------- */
  const MN = { none: 'No correction', sc: 'SC', tis: 'TIS', sc_tis: 'SC+TIS', sc_kl: 'SC+KL', sc_klm: 'SC+KL+mask' };
  const SYNC_M = ['none', 'sc', 'tis', 'sc_tis', 'sc_kl'];
  const ASYNC_M = ['none', 'sc', 'tis', 'sc_tis', 'sc_klm'];
  const LAGS = [0, 2, 4, 16, 64];
  const LAGN = l => (l === 0 ? 'Synchronous' : `Every ${l} updates`);
  const mcol = m => `var(--m-${m})`;
  const mkind = m => (m === 'sc_tis' ? 'dash' : m === 'sc_kl' || m === 'sc_klm' ? 'dot' : null);
  const mdash = m => ({ dash: '6 3', dot: '1.5 3.5' }[mkind(m)] || null);
  const mw = m => (m === 'none' ? 2 : 1.8);
  const f3 = d3.format('.3f'), f4 = v => (v < 0.01 ? v.toFixed(4) : v.toFixed(3)), f1 = d3.format('.1f');

  function showTip(html, ev) {
    tip.innerHTML = html;
    tip.style.opacity = 1;
    const pad = 14, w = tip.offsetWidth, h = tip.offsetHeight;
    let x = ev.pageX + pad, y = ev.pageY + pad;
    if (x + w > window.scrollX + document.documentElement.clientWidth - 8) x = ev.pageX - w - pad;
    if (y + h > window.scrollY + window.innerHeight - 8) y = ev.pageY - h - pad;
    tip.style.left = `${Math.max(window.scrollX + 4, x)}px`;
    tip.style.top = `${y}px`;
  }
  function hideTip() { tip.style.opacity = 0; }
  const row = (sw, label, val) => `<div class="row">${sw || ''}<span>${label}</span><i>${val}</i></div>`;
  const swLine = (color, kind) => `<span class="sw${kind ? ` ${kind}` : ''}" style="border-top-color:${color}"></span>`;
  /* panels and y-scales in the style of the results page: surface card, hairline grid, the low range squeezed into a band */
  const MET = {
    acc: { lo: 0, hi: 90, brk: [40, 0.2], ticks: [0, 50, 70, 90], fmt: v => `${f1(v)}%`, tick: String },
    dacc: { lo: -90, hi: 6, brk: [-8, 0.15], ticks: [-5, 0, 5], fmt: v => `${v > 0 ? '+' : ''}${f1(v)}`, tick: v => `${v > 0 ? '+' : ''}${v}` },
    fin: { lo: 0, hi: 100, brk: [90, 0.2], ticks: [0, 90, 100], fmt: v => `${f1(v)}%`, tick: String },
    gap: { lo: 0.003, hi: 3, log: true, ticks: [0.01, 0.1, 1], fmt: v => f4(v), tick: d3.format('~g') },
  };
  function yOf(M, v, top, h) {
    const c = Math.min(Math.max(v, M.lo), M.hi);
    let t;
    if (M.log) t = (Math.log(c) - Math.log(M.lo)) / (Math.log(M.hi) - Math.log(M.lo));
    else if (M.brk) t = c < M.brk[0] ? (c - M.lo) / (M.brk[0] - M.lo) * M.brk[1] : M.brk[1] + (c - M.brk[0]) / (M.hi - M.brk[0]) * (1 - M.brk[1]);
    else t = (c - M.lo) / (M.hi - M.lo);
    return top + (1 - t) * h;
  }
  function panelFrame(g, M, x0, top, w, h, yTicks) {
    g.append('rect').attr('x', x0).attr('y', top).attr('width', w).attr('height', h).attr('rx', 3).attr('class', 'panel-bg');
    g.append('line').attr('x1', x0).attr('x2', x0 + w).attr('y1', top + h).attr('y2', top + h).style('stroke', 'var(--axis)');
    if (M.brk) { const yb = yOf(M, M.brk[0], top, h); g.append('rect').attr('x', x0 + 0.5).attr('y', yb).attr('width', w - 1).attr('height', top + h - yb - 0.5).style('fill', 'var(--squeeze)'); }
    M.ticks.forEach(t => {
      const y = yOf(M, t, top, h);
      g.append('line').attr('x1', x0).attr('x2', x0 + w).attr('y1', y).attr('y2', y).attr('class', 'gridline');
      if (yTicks) g.append('text').attr('x', x0 - 5).attr('y', y + 3.5).attr('text-anchor', 'end').attr('class', 'lbl').text(M.tick(t));
    });
  }
  function baseLine(g, M, v, x0, top, w, h) {
    if (v == null) return;
    const y = yOf(M, v, top, h);
    g.append('line').attr('x1', x0 + 1).attr('x2', x0 + w - 1).attr('y1', y).attr('y2', y).style('stroke', 'var(--base)').style('stroke-width', 1.3).style('stroke-dasharray', '4 3');
    g.append('text').attr('x', x0 + w - 4).attr('y', y - 3.5 < top + 9 ? y + 10.5 : y - 3.5).attr('text-anchor', 'end').style('font-size', '9px').style('fill', 'var(--ink2)')
      .style('stroke', 'var(--surface)').style('stroke-width', '3px').style('paint-order', 'stroke').style('font-variant-numeric', 'tabular-nums').text(M.log ? M.fmt(v) : f1(v));
  }
  const swDot = color => `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${color}"></span>`;

  function svgIn(el, W, H, label) {
    el.innerHTML = '';
    return d3.select(el).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', label);
  }
  function markers(svg, id, names) {
    const defs = svg.append('defs');
    names.forEach(([name, color]) => {
      defs.append('marker').attr('id', `${id}-${name}`).attr('viewBox', '0 0 10 10').attr('refX', 8.5).attr('refY', 5)
        .attr('markerUnits', 'userSpaceOnUse').attr('markerWidth', 6).attr('markerHeight', 6).attr('orient', 'auto-start-reverse')
        .append('path').attr('d', 'M0,0 L10,5 L0,10 z').style('fill', color);
    });
    return name => `url(#${id}-${name})`;
  }
  function seg(el, opts, value, onChange) {
    el.innerHTML = '';
    opts.forEach(([v, label]) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = label; b.dataset.v = v;
      b.setAttribute('aria-pressed', String(v === value));
      b.addEventListener('click', () => {
        el.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.v === v)));
        onChange(v);
      });
      el.appendChild(b);
    });
  }
  function chips(el, items, state, onChange) {
    el.innerHTML = '';
    items.forEach(([key, label, color, dash]) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip';
      b.setAttribute('aria-pressed', String(state[key] !== false));
      b.innerHTML = `${swLine(color, dash)}${label}`;
      b.addEventListener('click', () => {
        state[key] = state[key] === false;
        b.setAttribute('aria-pressed', String(state[key] !== false));
        onChange();
      });
      el.appendChild(b);
    });
  }
  function smooth(a, w) {
    if (!a) return a;
    if (w <= 1) return a.slice();
    const out = [];
    for (let i = 0; i < a.length; i++) {
      let s = 0, n = 0;
      for (let j = Math.max(0, i - w + 1); j <= i; j++) if (a[j] != null) { s += a[j]; n++; }
      out.push(n ? s / n : null);
    }
    return out;
  }
  const pct = a => (a ? a.map(v => (v == null ? null : v / 10)) : a);
  const cross = (g, x, y, r, color, w = 2.2) => g.append('path').attr('d', `M${x - r},${y - r}L${x + r},${y + r}M${x - r},${y + r}L${x + r},${y - r}`)
    .style('stroke', color).style('stroke-width', w).style('stroke-linecap', 'round').style('fill', 'none');
  function axisStyle(g) { g.attr('class', 'ax'); g.select('.domain').remove(); return g; }

  let D = null;
  const renders = [];
  function renderAll() { if (!D) return; hideTip(); renders.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); }
  // the wide figures lay out to their width, so redraw them when it changes
  let lastW = window.innerWidth, rTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(rTimer);
    rTimer = setTimeout(() => { if (window.innerWidth !== lastW) { lastW = window.innerWidth; renderAll(); } }, 150);
  });

  /* =========================================================
     2. Architecture: standard vs looped vs LRT
     ========================================================= */
  function renderArch() {
    const el = $('#c-arch'), W = 700, H = 214;
    const svg = svgIn(el, W, H, 'Three diagrams of two tokens with four layers each: a standard transformer, a looped transformer that repeats its middle layers, and a recurrent transformer, whose last layer of token t feeds every layer of token t+1');
    const mk = markers(svg, 'arch', [['i', 'var(--ink)'], ['b', 'var(--m-sc)']]);
    const panels = [
      ['Standard transformer', 'Attention only, layer by layer', 'std'],
      ['Looped transformer', 'Middle layers run 3× per token', 'loop'],
      ['Recurrent transformer', 'Last layer of t feeds every layer of t+1', 'lrt'],
    ];
    const nw = 40, nh = 14, L = 4, rowY = l => 160 - l * 30;   // layer l = 0..3, bottom to top
    panels.forEach(([title, desc, kind], pi) => {
      const ox = pi * 236, g = svg.append('g').attr('transform', `translate(${ox},0)`);
      g.append('text').attr('x', 0).attr('y', 13).attr('class', 'ink').style('font-size', '12.5px').style('font-weight', 600).text(title);
      g.append('text').attr('x', 0).attr('y', 29).attr('class', 'ink2').style('font-size', '11.5px').text(desc);
      const cols = [62, 162];
      const hot = (ti, l) => (kind === 'loop' && (l === 1 || l === 2)) || (kind === 'lrt' && ((ti === 0 && l === L - 1) || ti === 1));
      // attention between tokens, layer by layer
      for (let l = 0; l < L; l++) g.append('line').attr('x1', cols[0] + nw / 2 + 3).attr('x2', cols[1] - nw / 2 - 3).attr('y1', rowY(l) - 3).attr('y2', rowY(l) - 3)
        .style('stroke', 'var(--axis)').style('stroke-dasharray', '2 3');
      cols.forEach((cx, ti) => {
        // residual stream up through the layers
        g.append('line').attr('x1', cx).attr('x2', cx).attr('y1', rowY(0) + 16).attr('y2', rowY(L - 1) - 16).style('stroke', 'var(--axis)');
        for (let l = 0; l < L; l++) {
          const on = hot(ti, l), c = kind === 'lrt' ? 'var(--m-sc)' : 'var(--ink)';
          g.append('rect').attr('x', cx - nw / 2).attr('y', rowY(l) - nh / 2).attr('width', nw).attr('height', nh).attr('rx', 7)
            .style('fill', on ? `color-mix(in srgb, ${c} 14%, var(--bg))` : 'var(--bg)').style('stroke', on ? c : 'var(--axis)').style('stroke-width', on ? 1.2 : 1);
        }
        g.append('text').attr('x', cx).attr('y', rowY(0) + 30).attr('text-anchor', 'middle').attr('class', 'ink2').style('font-size', '11.5px').text(ti ? 'token t+1' : 'token t');
      });
      if (pi === 0) for (let l = 0; l < L; l++) g.append('text').attr('x', cols[0] - nw / 2 - 8).attr('y', rowY(l) + 3.5).attr('text-anchor', 'end').attr('class', 'lbl').style('font-size', '10px').text(`L${l + 1}`);
      if (kind === 'loop') {
        cols.forEach((cx, ti) => {
          // loop on the outer side of each token so it never crosses the attention lines
          const s = ti ? 1 : -1, xr = cx + s * (nw / 2 + 2), y1 = rowY(2), y0 = rowY(1);
          g.append('path').attr('d', `M${xr},${y1} C${xr + s * 16},${y1} ${xr + s * 16},${y0} ${xr + s},${y0}`).style('fill', 'none').style('stroke', 'var(--ink)').style('stroke-width', 1.2).attr('marker-end', mk('i'));
          g.append('text').attr('x', xr + s * 17).attr('y', (y0 + y1) / 2 + 3.5).attr('text-anchor', ti ? 'start' : 'end').attr('class', 'ink').style('font-size', '10.5px').text('×3');
        });
      }
      if (kind === 'lrt') {
        // the last layer of token t is the memory; it is fed into EVERY layer of token t+1 (key/value projection and residual stream)
        const x1 = cols[0] + nw / 2, x2 = cols[1] - nw / 2, xm = 120, off = 3, yT = rowY(L - 1) + off, yB = rowY(0) + off;
        const line = d => g.append('path').attr('d', d).style('fill', 'none').style('stroke', 'var(--m-sc)').style('stroke-width', 1.6);
        line(`M${x1},${yT} H${x2 - 1}`).attr('marker-end', mk('b'));
        line(`M${xm},${yT} V${yB - 5} Q${xm},${yB} ${xm + 5},${yB} H${x2 - 1}`).attr('marker-end', mk('b'));
        for (let l = 1; l < L - 1; l++) line(`M${xm},${rowY(l) + off} H${x2 - 1}`).attr('marker-end', mk('b'));
        g.append('text').attr('x', xm - 5).attr('y', (rowY(1) + rowY(2)) / 2 + 3.5).attr('text-anchor', 'end').attr('class', 'ink').style('font-size', '10px').style('fill', 'var(--m-sc)').text('memory');
      }
    });
  }
  renders.push(renderArch);

  /* =========================================================
     3. Refinement: K training passes vs P prefill passes + decoding
     ========================================================= */
  const ref = { K: 3, P: 3, col: 8 };
  function renderRefine() {
    const el = $('#c-refine'), W = 700, H = 214;
    const svg = svgIn(el, W, H, 'Two grids of states, passes by positions: training with K parallel passes, and generation with P prefill passes followed by token-by-token recurrence; the highlighted chain shows how far memory reaches from the selected position');
    svg.attr('tabindex', 0).style('outline', 'none');
    const NP = 4, NR = 5, N = NP + NR, dx = 32, dy = 30, r = 6;
    const K = ref.K, P = ref.P, base = 160;
    const ny = j => base - j * dy;
    const lab = i => (i < NP ? `x${i + 1}` : `y${i - NP + 1}`);
    const panels = [
      { side: 't', x0: 46, rows: K, title: 'Training', sub: `${K} pass${K > 1 ? 'es' : ''} over the whole sequence` },
      { side: 'g', x0: 398, rows: P, title: 'Generation', sub: `${P} prefill pass${P > 1 ? 'es' : ''}, then one token at a time` },
    ];
    const nodes = {}, edges = {}, bands = [], labels = [];
    panels.forEach(pn => {
      const nx = i => pn.x0 + i * dx;
      const g = svg.append('g');
      g.append('text').attr('x', pn.x0 - 40).attr('y', 13).attr('class', 'ink').style('font-size', '12.5px').style('font-weight', 600).text(pn.title);
      g.append('text').attr('x', pn.x0 - 40).attr('y', 29).attr('class', 'ink2').style('font-size', '11.5px').text(pn.sub);
      // a soft band marks the selected position
      bands.push({ g: g.append('rect').attr('y', 44).attr('width', dx - 4).attr('height', base - 44 + 30).attr('rx', 6).style('fill', 'var(--panel)'), nx });
      for (let j = 0; j < pn.rows; j++) g.append('text').attr('x', pn.x0 - 14).attr('y', ny(j) + 3.5).attr('text-anchor', 'end').attr('class', 'lbl').style('font-size', '10px').text(`pass ${j + 1}`);
      const edge = (k, a, b) => { edges[k] = g.append('line').attr('x1', a[0]).attr('y1', a[1]).attr('x2', b[0]).attr('y2', b[1]).style('stroke', 'var(--axis)').style('stroke-width', 1.2); };
      const top = pn.rows - 1;
      for (let j = 1; j < pn.rows; j++) for (let i = 1; i < (pn.side === 't' ? N : NP); i++) edge(`${pn.side}-${j}-${i}`, [nx(i - 1), ny(j - 1)], [nx(i), ny(j)]);
      if (pn.side === 'g') for (let i = NP; i < N; i++) edge(`g-${top}-${i}`, [nx(i - 1), ny(top)], [nx(i), ny(top)]);
      const node = (k, i, j, resp) => { nodes[k] = { c: g.append('circle').attr('cx', nx(i)).attr('cy', ny(j)).attr('r', r).style('stroke-width', 1), resp }; };
      for (let j = 0; j < pn.rows; j++) for (let i = 0; i < (pn.side === 't' ? N : NP); i++) node(`${pn.side}-${j}-${i}`, i, j, i >= NP);
      if (pn.side === 'g') for (let i = NP; i < N; i++) node(`g-${top}-${i}`, i, top, true);
      for (let i = 0; i < N; i++) labels.push({ i, t: g.append('text').attr('x', nx(i)).attr('y', base + 22).attr('text-anchor', 'middle').attr('class', 'lbl').style('font-size', '10px').text(lab(i)) });
      const brace = (i0, i1, label) => {
        const a = nx(i0) - 8, b = nx(i1) + 8, y = base + 32;
        g.append('path').attr('d', `M${a},${y - 3} L${a},${y} L${b},${y} L${b},${y - 3}`).style('fill', 'none').style('stroke', 'var(--axis)');
        g.append('text').attr('x', (a + b) / 2).attr('y', y + 13).attr('text-anchor', 'middle').attr('class', 'lbl').style('font-size', '10px').text(label);
      };
      brace(0, NP - 1, 'prompt');
      brace(NP, N - 1, pn.side === 't' ? 'response' : 'generated');
      // the whole panel is the hit area: moving across it picks the nearest position, and the choice stays after the pointer leaves
      g.append('rect').attr('x', pn.x0 - dx / 2).attr('y', 40).attr('width', N * dx).attr('height', base - 40 + 50).style('fill', 'transparent').style('cursor', 'pointer')
        .on('pointermove pointerdown', ev => {
          const [mx] = d3.pointer(ev);
          const i = Math.max(0, Math.min(N - 1, Math.round((mx - pn.x0) / dx)));
          if (i !== ref.col) { ref.col = i; paint(); }
        });
    });
    const reach = (side, i) => {
      if (side === 't') return Math.min(K - 1, i);
      return i >= NP ? (i - NP + 1) + Math.min(P - 1, NP - 1) : Math.min(P - 1, i);
    };
    function chainOf(side, i) {
      const top = (side === 't' ? K : P) - 1; let j = top; const out = [`${side}-${j}-${i}`];
      if (side === 't') { while (j > 0 && i > 0) { out.push(`t-${j - 1}-${i - 1}`); j--; i--; } }
      else {
        while (i >= NP) { out.push(`g-${top}-${i - 1}`); i--; }
        while (j > 0 && i > 0) { out.push(`g-${j - 1}-${i - 1}`); j--; i--; }
      }
      return out;
    }
    function paint() {
      const i = ref.col;
      const on = new Set([...chainOf('t', i), ...chainOf('g', i)]);
      bands.forEach(b => b.g.attr('x', b.nx(i) - (dx - 4) / 2));
      labels.forEach(l => l.t.style('fill', l.i === i ? 'var(--ink)' : null).style('font-weight', l.i === i ? 600 : null));
      Object.entries(nodes).forEach(([k, n]) => n.c.style('fill', on.has(k) ? 'var(--m-sc)' : n.resp ? 'var(--panel)' : 'var(--bg)').style('stroke', on.has(k) ? 'var(--m-sc)' : 'var(--axis)'));
      Object.entries(edges).forEach(([k, e]) => {
        const [side, j, ii] = k.split('-');
        const from = side === 't' || +ii < NP ? `${side}-${+j - 1}-${+ii - 1}` : `${side}-${j}-${+ii - 1}`;
        const lit = on.has(k) && on.has(from);
        e.style('stroke', lit ? 'var(--m-sc)' : 'var(--axis)').style('stroke-width', lit ? 1.8 : 1.2);
      });
      const a = reach('t', i), b = reach('g', i);
      const gap = D.gapgrid[`${P}${K}`], sc = D.scores.pf3[`${P}${K}none`], collapsed = sc && sc[2] !== 0;
      $('#refine-readout').innerHTML = `At <strong>${lab(i)}</strong>, the trainer's state carries memory from <strong>${a}</strong> position${a === 1 ? '' : 's'} back; the rollout's from <strong>${b}</strong>. Move across the figure, or use ← →, to pick another position. Measured gap for prefill ${P}, trainer ${K}: <strong>${f4(gap)}</strong> per token; uncorrected GRPO <strong>${collapsed ? 'collapsed' : 'trained normally'}</strong>.`;
    }
    svg.on('keydown', ev => {
      if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
        ev.preventDefault();
        ref.col = Math.max(0, Math.min(N - 1, ref.col + (ev.key === 'ArrowRight' ? 1 : -1)));
        paint();
      }
    });
    paint();
  }
  function bindRefine() {
    const opts = [1, 2, 3, 4].map(v => [String(v), String(v)]);
    seg($('#k-seg'), opts, String(ref.K), v => { ref.K = +v; renderRefine(); });
    seg($('#p-seg'), opts, String(ref.P), v => { ref.P = +v; renderRefine(); });
  }
  renders.push(renderRefine);

  /* =========================================================
     4. Gap heatmap + selected run's gap over training
     ========================================================= */
  // soft single-hue blue that tops out at the SC blue; red is kept for "collapsed", as in Figure 1
  function seqColor(v) {
    const lo = isDark() ? '#1e2836' : '#eef4fb', hi = isDark() ? '#6aa6ec' : '#2a78d6';
    return d3.scaleSequentialLog(d3.interpolateLab(lo, hi)).domain([0.0025, 0.08]).clamp(true)(v);
  }
  const inkOn = c => (d3.lab(c).l > 60 ? '#123a66' : '#ffffff');
  function collapsedSync(pf, k, m) {
    const s = D.scores.own[`${pf}${k}${m}`];
    return s ? s[2] === 1 : false;
  }
  // early gap of a corrected run: its first 10 logged points are updates 1–20 (stride 2)
  const earlyGap = (pf, k, m) => m === 'none' ? D.gapgrid[`${pf}${k}`] : d3.mean(D.grid[`${pf}${k}${m}`].gap.slice(0, 10).filter(v => v != null));
  function renderGap() {
    const el = $('#c-gap'), W = 664, H = 258;
    const svg = svgIn(el, W, H, 'Two heatmaps of the per-token gap over updates 1–20 by rollout prefill passes and training passes: uncorrected runs and SC runs, plus a column of four replay runs. The gaps are almost the same in both; ten uncorrected runs collapsed and no SC run did');
    const cw = 58, chh = 34, y0 = 64;
    const head = (x, y, s, w) => svg.append('text').attr('x', x).attr('y', y).attr('text-anchor', 'middle').attr('class', 'ink').style('font-size', '12px').style('font-weight', w || 500).text(s);
    svg.append('text').attr('transform', `translate(14,${y0 + 2 * chh}) rotate(-90)`).attr('text-anchor', 'middle').attr('class', 'ink').style('font-size', '12px').style('font-weight', 500).text('Rollout prefill passes');
    const cell = (x, y, v, bad, tipHead, outcome) => {
      const col = seqColor(v), ink = inkOn(col);
      const g = svg.append('g');
      g.append('rect').attr('x', x + 1).attr('y', y + 1).attr('width', cw - 2).attr('height', chh - 2).attr('rx', 3).style('fill', col);
      g.append('text').attr('x', x + cw / 2).attr('y', y + chh / 2 + 4).attr('text-anchor', 'middle').style('fill', ink).style('font-size', '11.5px').style('font-variant-numeric', 'tabular-nums').text(f3(v));
      if (bad) g.append('circle').attr('cx', x + 8).attr('cy', y + 8).attr('r', 3).style('fill', 'var(--bad)').style('stroke', 'var(--bg)').style('stroke-width', 1.4);
      g.on('mousemove', ev => showTip(`<b>${tipHead}</b>${row('', 'Gap, updates 1–20', f4(v))}${row('', 'Outcome', outcome)}`, ev)).on('mouseleave', hideTip);
    };
    const rowNums = x0 => { for (let pf = 1; pf <= 4; pf++) svg.append('text').attr('x', x0 - 10).attr('y', y0 + (pf - 1) * chh + chh / 2 + 4).attr('text-anchor', 'end').attr('class', 'lbl').text(pf); };
    function panel(x0, m, name) {
      head(x0 + 2 * cw, 14, name, 600);
      svg.append('text').attr('x', x0 + 2 * cw).attr('y', 34).attr('text-anchor', 'middle').attr('class', 'lbl').text('Training passes');
      for (let k = 1; k <= 4; k++) svg.append('text').attr('x', x0 + (k - 1) * cw + cw / 2).attr('y', y0 - 9).attr('text-anchor', 'middle').attr('class', 'lbl').text(k);
      rowNums(x0);
      for (let pf = 1; pf <= 4; pf++) for (let k = 1; k <= 4; k++) {
        const bad = collapsedSync(pf, k, m);
        cell(x0 + (k - 1) * cw, y0 + (pf - 1) * chh, earlyGap(pf, k, m), bad, `${name} · prefill ${pf}, trainer ${k}`, bad ? 'collapsed' : 'trained normally');
      }
    }
    const xa = 52, xb = xa + 4 * cw + 44, xr = xb + 4 * cw + 34;
    panel(xa, 'none', 'No correction');
    panel(xb, 'sc', 'SC');
    // replay: its own column on the right, uncorrected loss with a 3-pass trainer
    head(xr + cw / 2, 14, 'Replay', 600);
    svg.append('text').attr('x', xr + cw / 2).attr('y', y0 - 9).attr('text-anchor', 'middle').attr('class', 'lbl').text('trainer 3');
    for (let pf = 1; pf <= 4; pf++) cell(xr, y0 + (pf - 1) * chh, D.gapreplay[pf], false, `Replay · prefill ${pf}, trainer 3`, 'trained normally');
    // one centred key row: colour scale, then the collapse marker
    const kw = 200, kx = (W - (kw + 40 + 70)) / 2, ky = y0 + 4 * chh + 26, steps = 60;
    for (let i = 0; i < steps; i++) {
      const v = Math.exp(Math.log(0.0025) + (Math.log(0.08) - Math.log(0.0025)) * i / (steps - 1));
      svg.append('rect').attr('x', kx + i * kw / steps).attr('y', ky).attr('width', kw / steps + 0.5).attr('height', 8).style('fill', seqColor(v));
    }
    const kxs = d3.scaleLog().domain([0.0025, 0.08]).range([kx, kx + kw]);
    axisStyle(svg.append('g').attr('transform', `translate(0,${ky + 8})`).call(d3.axisBottom(kxs).tickValues([0.003, 0.01, 0.03, 0.08]).tickFormat(d3.format('~g')).tickSize(3)));
    svg.append('text').attr('x', kx).attr('y', ky - 6).attr('class', 'lbl').text('Gap per token, updates 1–20');
    svg.append('circle').attr('cx', kx + kw + 44).attr('cy', ky + 4).attr('r', 3).style('fill', 'var(--bad)');
    svg.append('text').attr('x', kx + kw + 52).attr('y', ky + 8).attr('class', 'lbl').text('collapsed');
  }
  renders.push(renderGap);

  /* =========================================================
     5. One collapse: gap, accuracy and finished responses
     ========================================================= */
  function renderCollapse() {
    const el = $('#c-collapse'), W = 700, H = 444;
    const svg = svgIn(el, W, H, 'Three stacked line charts over 304 updates for an uncorrected run and an SC run at prefill 3 with a 2-pass trainer');
    const m0 = 40, m1 = 690, ph = 104, gap = 32, top = 44;
    const xs = d3.scaleLinear().domain([1, 304]).range([m0, m1]);
    const C = D.collapse;
    const ser = {
      gap: { none: smooth(C.none.gap, 3), sc: smooth(C.sc.gap, 3) },
      acc: { none: smooth(pct(C.none.acc), 4), sc: smooth(pct(C.sc.acc), 4) },
      fin: { none: smooth(pct(C.none.fin), 4), sc: smooth(pct(C.sc.fin), 4) },
    };
    const panels = [
      ['gap', 'Per-token gap (log scale)', d3.scaleLog().domain([0.005, 20]).clamp(true), [0.01, 0.1, 1, 10]],
      ['acc', 'Rollout accuracy on training problems (%)', d3.scaleLinear().domain([0, 100]), [0, 50, 100]],
      ['fin', 'Responses that finish within 768 tokens (%)', d3.scaleLinear().domain([0, 100]), [0, 50, 100]],
    ];
    const lg = svg.append('g').attr('transform', `translate(${m0},16)`);
    [['none', 'No correction'], ['sc', 'SC']].forEach(([m, n], i) => {
      lg.append('line').attr('x1', i * 140).attr('x2', i * 140 + 22).attr('y1', 0).attr('y2', 0).style('stroke', mcol(m)).style('stroke-width', mw(m) + 0.6);
      lg.append('text').attr('x', i * 140 + 28).attr('y', 4).attr('class', 'ink').style('font-size', '12.5px').text(n);
    });
    const ys = {};
    panels.forEach(([key, title, scale, ticks], pi) => {
      const y0 = top + pi * (ph + gap);
      scale.range([y0 + ph, y0 + 14]);
      ys[key] = scale;
      svg.append('text').attr('x', m0).attr('y', y0 + 2).attr('class', 'sub').text(title);
      svg.append('rect').attr('x', m0).attr('y', y0 + 8).attr('width', m1 - m0).attr('height', ph - 4).attr('rx', 3).attr('class', 'panel-bg');
      ticks.forEach(t => svg.append('line').attr('x1', m0).attr('x2', m1).attr('y1', scale(t)).attr('y2', scale(t)).attr('class', 'gridline'));
      axisStyle(svg.append('g').attr('transform', `translate(${m0 - 6},0)`).call(d3.axisLeft(scale).tickValues(ticks).tickFormat(d3.format('~g')).tickSize(0)));
      if (key === 'gap') svg.append('rect').attr('x', m0).attr('width', m1 - m0).attr('y', scale(D.band[1])).attr('height', scale(D.band[0]) - scale(D.band[1])).style('fill', 'var(--band)');
      ['sc', 'none'].forEach(m => {
        const pts = ser[key][m].map((v, i) => [i + 1, v]);
        svg.append('path').attr('d', d3.line().defined(d => d[1] != null && (key !== 'gap' || d[1] > 0)).x(d => xs(d[0])).y(d => scale(d[1]))(pts))
          .style('fill', 'none').style('stroke', mcol(m)).style('stroke-width', mw(m));
      });
    });
    const yb = top + 3 * (ph + gap) - gap;
    axisStyle(svg.append('g').attr('transform', `translate(0,${yb + 4})`).call(d3.axisBottom(xs).tickValues([1, 50, 100, 150, 200, 250, 304]).tickSize(3)));
    svg.append('text').attr('x', (m0 + m1) / 2).attr('y', yb + 32).attr('text-anchor', 'middle').attr('class', 'lbl').text('Update');
    // annotations
    // each label sits in the panel it talks about, clear of both curves there
    [[90, 'gap starts to climb', top + 22], [157, 'accuracy near zero', top + (ph + gap) + ph * 0.6]].forEach(([s, t, ty]) => {
      svg.append('line').attr('x1', xs(s)).attr('x2', xs(s)).attr('y1', top + 10).attr('y2', yb).style('stroke', 'var(--muted)').style('stroke-dasharray', '2 3');
      svg.append('text').attr('x', xs(s) + 5).attr('y', ty).attr('class', 'lbl').text(t);
    });
    const hl = svg.append('line').attr('y1', top + 10).attr('y2', yb).style('stroke', 'var(--ink2)').style('display', 'none');
    svg.append('rect').attr('x', m0).attr('y', top).attr('width', m1 - m0).attr('height', yb - top).style('fill', 'transparent')
      .on('mousemove', ev => {
        const [mx] = d3.pointer(ev); const i = Math.max(0, Math.min(303, Math.round(xs.invert(mx)) - 1));
        hl.style('display', null).attr('x1', xs(i + 1)).attr('x2', xs(i + 1));
        const v = (k, m) => ser[k][m][i];
        const fmt = (k, x) => (x == null ? '–' : k === 'gap' ? f4(x) : `${f1(x)}%`);
        showTip(`<b>Update ${i + 1}</b>${['none', 'sc'].map(m => `<div style="margin-top:3px;font-weight:600">${MN[m]}</div>${row(swLine(mcol(m)), 'Gap', fmt('gap', v('gap', m)))}${row('', 'Accuracy', fmt('acc', v('acc', m)))}${row('', 'Finished', fmt('fin', v('fin', m)))}`).join('')}`, ev);
      })
      .on('mouseleave', () => { hl.style('display', 'none'); hideTip(); });
  }
  renders.push(renderCollapse);

  /* =========================================================
     6. 4x4 grid of training curves (results-page style)
     ========================================================= */
  const gridState = { metric: 'acc', show: {}, zoom: null };
  const GRID_METRICS = [['acc', 'Training accuracy'], ['dacc', 'Accuracy vs. SC'], ['fin', 'Finished responses'], ['gap', 'Rollout–trainer gap']];
  const GRID_NOTES = {
    acc: 'Share of correct rollouts at each update, in % (16-update moving average). Below 40% the axis is squeezed into the grey band, so a line that drops into it is a run that collapsed. The dashed grey line, with its value, is the SFT checkpoint itself on the same problems: the mean over the problems of the first 64 updates, with rollouts sampled from the SFT weights.',
    dacc: 'Training accuracy of each method minus that of SC in the same panel, in points (50-update moving average). All runs see the same problems in the same order, so the noise they share cancels and SC is the flat line at 0. Below −8 the axis is squeezed into the grey band.',
    fin: 'Share of rollouts that end within the 768-token limit, in %. Below 90% the axis is squeezed into the grey band; a collapsing run falls to about 0. The dashed grey line is the SFT checkpoint itself, measured on the problems of the first 64 updates.',
    gap: 'Mean per-token |log p(trainer) − log p(rollout)|, log scale. The red band is 0.011–0.019; the dashed grey line is the gap on the first batch, before any update.',
  };
  function gridSeries(pf, k, m, metric) {
    const r = D.grid[`${pf}${k}${m}`];
    if (!r) return null;
    if (metric === 'gap') return smooth(r.gap, 8);
    if (metric === 'dacc') {
      const a = smooth(pct(r.acc), 25), b = smooth(pct(D.grid[`${pf}${k}sc`].acc), 25);
      return a.map((v, i) => (v == null || b[i] == null ? null : v - b[i]));
    }
    return smooth(pct(r[metric]), 8);
  }
  function baseOf(metric, pf, k) {
    const B = D.base;
    if (metric === 'acc') return B.acc[pf] == null ? null : 100 * B.acc[pf];
    if (metric === 'fin') return B.fin[pf] == null ? null : 100 * B.fin[pf];
    if (metric === 'gap') return B.dl[`${pf}${k}`];
    return null;
  }
  // series path for stride-s data on [x0, x0+w]
  function seriesPath(vals, M, x0, top, w, h, stride = 2, steps = 304) {
    let d = '', pen = false;
    vals.forEach((v, i) => {
      if (v == null || (M.log && v <= 0)) { pen = false; return; }
      const x = x0 + (stride * i + 1) / steps * w, y = yOf(M, v, top, h);
      d += `${pen ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`; pen = true;
    });
    return d;
  }
  // hover: crosshair, a dot on every line, tooltip
  function hoverLayer(g, o) {
    const { x0, top, w, h, n, stride = 2, steps = 304, series, title, extra = '', onClick, cursor } = o;
    const hov = g.append('g').style('display', 'none');
    const hl = hov.append('line').attr('y1', top).attr('y2', top + h).style('stroke', 'var(--muted)');
    const dots = series.map(s => hov.append('circle').attr('r', 3.2).style('fill', s.color).style('stroke', 'var(--surface)').style('stroke-width', 1.5));
    g.append('rect').attr('x', x0).attr('y', top).attr('width', w).attr('height', h).style('fill', 'transparent')
      .on('pointermove', ev => {
        const [mx] = d3.pointer(ev);
        const i = Math.max(0, Math.min(n - 1, Math.round(((mx - x0) / w * steps - 1) / stride)));
        const x = x0 + (stride * i + 1) / steps * w;
        hov.style('display', null); hl.attr('x1', x).attr('x2', x);
        series.forEach((s, j) => {
          const v = s.vals ? s.vals[i] : null;
          dots[j].style('display', v == null ? 'none' : null).attr('cx', x).attr('cy', v == null ? top : s.y(v));
        });
        showTip(`<b>${title(stride * i + 1)}</b>${series.map(s => {
          const v = s.vals ? s.vals[i] : null;
          return `<div class="row${v == null ? ' off' : ''}">${s.sw}<span>${s.name}</span><i>${v == null ? (s.missing || 'n/a') : s.fmt(v)}</i></div>`;
        }).join('')}${extra}`, ev);
      })
      .on('pointerleave', () => { hov.style('display', 'none'); hideTip(); })
      .style('cursor', cursor || null).on('click', onClick ? () => { hideTip(); onClick(); } : null);
  }
  function xTicks(g, x0, top, w, h, labels, first = true, last = true) {
    [0, 100, 200, 300].forEach(s => {
      const x = x0 + s / 304 * w;
      if (s) g.append('line').attr('x1', x).attr('x2', x).attr('y1', top + h - 4).attr('y2', top + h).style('stroke', 'var(--axis)');
      if (labels && (s === 100 || s === 200 || (s === 0 && first) || (s === 300 && last))) g.append('text').attr('x', x).attr('y', top + h + 13).attr('text-anchor', s === 0 ? 'start' : s === 300 ? 'end' : 'middle').attr('class', 'lbl').text(s);
    });
  }
  function renderGrid() {
    const el = $('#c-grid'), zoom = gridState.zoom;
    // zoomed: the single panel fits the screen instead of scrolling sideways
    el.classList.toggle('fit', !!zoom);
    const W = Math.max(zoom ? 320 : 700, Math.round(el.clientWidth || 700));
    const metric = gridState.metric, M = MET[metric];
    const x0 = zoom && W < 560 ? 30 : 64, top0 = 26, gx = 8, gy = 12, pw = Math.floor((W - x0 - 3 * gx - 6) / 4), ph = Math.round(pw * 0.62);
    const gridH = 4 * ph + 3 * gy;
    const zw = W - x0 - 6, zh = Math.round(Math.max(240, Math.min(zw * 0.5, 520)));
    const H = top0 + (zoom ? zh : gridH) + 36;
    const svg = svgIn(el, W, H, zoom ? `One chart of ${metric} over training for prefill ${zoom[0]} with ${zoom[1]} training passes` : `Sixteen small charts of ${metric} over training, one per prefill and trainer setting`);
    const methods = SYNC_M.filter(m => gridState.show[m] !== false);
    function panel(pf, k, px, py, w, h, yTicks, xLabels, first, last, big) {
      const g = svg.append('g');
      panelFrame(g, M, px, py, w, h, yTicks);
      if (metric === 'gap') { const yt = yOf(M, D.band[1], py, h), yb = yOf(M, D.band[0], py, h); g.append('rect').attr('x', px + 0.5).attr('y', yt).attr('width', w - 1).attr('height', yb - yt).style('fill', 'var(--band)'); }
      xTicks(g, px, py, w, h, xLabels, first, last);
      const bv = baseOf(metric, pf, k);
      baseLine(g, M, bv, px, py, w, h);
      const S = {};
      methods.forEach(m => { S[m] = gridSeries(pf, k, m, metric); });
      methods.forEach(m => {
        g.append('path').attr('d', seriesPath(S[m], M, px, py, w, h)).style('fill', 'none').style('stroke', mcol(m)).style('stroke-width', big ? 2.1 : 1.7)
          .style('stroke-linejoin', 'round').style('stroke-linecap', 'round').style('stroke-dasharray', mdash(m));
      });
      hoverLayer(g, {
        x0: px, top: py, w, h, n: 152,
        series: methods.map(m => ({ name: MN[m], color: mcol(m), sw: swLine(mcol(m), mkind(m)), vals: S[m], fmt: M.fmt, y: v => yOf(M, v, py, h) })),
        title: s => `Prefill ${pf} · trainer ${k} · update ${s}`,
        extra: bv != null ? `<div class="row"><span class="sw dash" style="border-top-color:var(--base)"></span><span>SFT checkpoint</span><i>${M.fmt(bv)}</i></div>` : '',
        cursor: big ? 'zoom-out' : 'zoom-in',
        onClick: () => { gridState.zoom = big ? null : [pf, k]; renderGrid(); },
      });
    }
    if (zoom) {
      const [pf, k] = zoom;
      svg.append('text').attr('x', x0 + zw / 2).attr('y', 16).attr('text-anchor', 'middle').attr('class', 'ink').style('font-size', '12.5px').style('font-weight', 500).text(`Rollout prefill: ${pf} · Training passes: ${k}`);
      panel(pf, k, x0, top0, zw, zh, true, true, true, true, true);
      svg.append('text').attr('x', x0 + zw / 2).attr('y', H - 4).attr('text-anchor', 'middle').attr('class', 'lbl').text('Update');
    } else {
      const PX = k => x0 + (k - 1) * (pw + gx), PY = pf => top0 + (pf - 1) * (ph + gy);
      for (let k = 1; k <= 4; k++) svg.append('text').attr('x', PX(k) + pw / 2).attr('y', 16).attr('text-anchor', 'middle').attr('class', 'ink2').style('font-size', '12px').text(`Training passes: ${k}`);
      for (let pf = 1; pf <= 4; pf++) {
        svg.append('text').attr('transform', `translate(12,${PY(pf) + ph / 2}) rotate(-90)`).attr('text-anchor', 'middle').attr('class', 'ink2').style('font-size', '11.5px').text(`Rollout prefill: ${pf}`);
        for (let k = 1; k <= 4; k++) panel(pf, k, PX(k), PY(pf), pw, ph, k === 1, pf === 4, k === 1, k === 4, false);
      }
      svg.append('text').attr('x', x0 + 2 * (pw + gx) - gx / 2).attr('y', H - 4).attr('text-anchor', 'middle').attr('class', 'lbl').text('Update');
    }
    $('#grid-back').hidden = !zoom;
    $('#grid-note').textContent = GRID_NOTES[metric];
  }
  function bindGrid() {
    seg($('#grid-metric'), GRID_METRICS, gridState.metric, v => { gridState.metric = v; renderGrid(); });
    chips($('#grid-methods'), SYNC_M.map(m => [m, MN[m], mcol(m), mkind(m)]), gridState.show, renderGrid);
    $('#grid-back').addEventListener('click', () => { gridState.zoom = null; renderGrid(); });
    document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && gridState.zoom) { gridState.zoom = null; renderGrid(); } });
  }
  renders.push(renderGrid);

  /* =========================================================
     7. Score heatmaps: SFT column + one 4x4 grid per method, GSM8K and MATH-500 stacked
     ========================================================= */
  const scState = { ev: 'pf3' };
  const hmLevel = d => { const a = Math.abs(d); return a < 1 ? 0 : a < 3 ? 1 : a < 5 ? 2 : a < 7 ? 3 : 4; };
  const hmFill = d => { const l = hmLevel(d); return l === 0 ? 'var(--hm0)' : `var(--h${d > 0 ? 'b' : 'r'}${l})`; };
  const hmInk = d => `var(--ht${hmLevel(d)})`;
  const signed = d => `${d > 0 ? '+' : d < 0 ? '−' : ''}${Math.abs(d).toFixed(1)}`;
  function renderScoreKey() {
    const key = $('#sc-key');
    key.innerHTML = '<span>Change from the SFT baseline, in points:</span>' + [[-8, '≤ −7'], [-6, '−7 to −5'], [-4, '−5 to −3'], [-2, '−3 to −1'], [0, '±1'], [2, '+1 to +3'], [4, '+3 to +5'], [6, '+5 to +7'], [8, '≥ +7']]
      .map(([d, t]) => `<span><i style="background:${hmFill(d)}"></i>${t}</span>`).join('');
  }
  function renderScores() {
    renderScoreKey();
    const el = $('#c-scores'), W = Math.max(860, Math.round(el.clientWidth || 860));
    const ev = scState.ev, own = ev === 'own';
    const runs = own ? D.scores.own : D.scores.pf3, starts = own ? D.scores.start_own : D.scores.start_pf3;
    const refs = own ? D.scores.refs_own : D.scores.refs_pf3;
    // layout, as on the results page: SFT column | one 4x4 grid per method | Replay column | Exact rollout block
    const cg = 2, chh = 24, sx = 50, gx0 = 102, repW = 62, exW = 128;
    const stride = Math.floor((W - gx0 - repW - exW + 12) / 5), cw = Math.min(40, Math.floor((stride - 12) / 4) - cg);
    const rx = gx0 + 5 * stride + 4, ex = rx + repW + 10;
    const cy = (b0, r) => b0 + 74 + (r - 1) * (chh + cg);
    const blockH = 74 + 4 * (chh + cg) + 26;
    const H = 2 * blockH;
    const svg = svgIn(el, W, H, 'Score heatmaps after RL for GSM8K and MATH-500: an SFT column, one 4 by 4 grid per method, a replay column and an exact-rollout block');
    const cell = (x, y, w, s, b, base, title, bench) => {
      if (!s) return;
      const g = svg.append('g').style('cursor', 'default');
      let lines;
      if (s[2] === 2 || s[b] == null) {
        g.append('rect').attr('x', x).attr('y', y).attr('width', w).attr('height', chh).attr('rx', 3).style('fill', 'var(--hr4)');
        g.append('text').attr('x', x + w / 2).attr('y', y + chh / 2 + 4).attr('text-anchor', 'middle').style('fill', 'var(--ht4)').style('font-size', '11px').text('✕');
        lines = row('', bench, 'collapsed in training, not evaluated');
      } else {
        const v = s[b], d = base == null ? null : v - base;   // no baseline: the cell stays neutral
        g.append('rect').attr('x', x).attr('y', y).attr('width', w).attr('height', chh).attr('rx', 3).style('fill', d == null ? 'var(--hm0)' : hmFill(d));
        g.append('text').attr('x', x + w / 2).attr('y', y + chh / 2 + 3.5).attr('text-anchor', 'middle').style('fill', d == null ? 'var(--ht0)' : hmInk(d)).style('font-size', '10px').style('font-variant-numeric', 'tabular-nums').text(f1(v));
        lines = row('', bench, `${f1(v)}${s[2] ? ' (collapsed, 200 problems)' : ''}`) + (d == null ? row('', 'SFT baseline', 'not measured') : row('', 'SFT baseline', f1(base)) + row('', 'Change', signed(d)));
      }
      g.on('pointermove', e => showTip(`<b>${title}</b>${lines}`, e)).on('pointerleave', hideTip);
    };
    const head = (x, b0, name, sub, subX, color, dash) => {
      let tx = x;
      if (color) {
        svg.append('line').attr('x1', x + 2).attr('x2', x + 20).attr('y1', b0 + 34).attr('y2', b0 + 34).style('stroke', color).style('stroke-width', 2.2).style('stroke-dasharray', dash).style('stroke-linecap', 'round');
        tx = x + 26;
      }
      svg.append('text').attr('x', tx).attr('y', b0 + 38).attr('class', 'ink').style('font-size', '12px').style('font-weight', 500).text(name);
      svg.append('text').attr('x', subX).attr('y', b0 + 52).attr('text-anchor', 'middle').attr('class', 'lbl').text(sub);
    };
    ['GSM8K', 'MATH-500'].forEach((bench, b) => {
      const b0 = b * blockH;
      svg.append('text').attr('x', 0).attr('y', b0 + 15).attr('class', 'ttl').style('font-size', '13px').text(bench);
      svg.append('text').attr('transform', `translate(8,${cy(b0, 2) + chh + cg / 2}) rotate(-90)`).attr('text-anchor', 'middle').attr('class', 'lbl').text('Rollout prefill');
      for (let r = 1; r <= 4; r++) svg.append('text').attr('x', sx - 8).attr('y', cy(b0, r) + chh / 2 + 4).attr('text-anchor', 'end').attr('class', 'lbl').text(r);
      // SFT baseline column
      svg.append('text').attr('x', sx + 18).attr('y', b0 + 38).attr('text-anchor', 'middle').attr('class', 'ink').style('font-size', '12px').style('font-weight', 500).text('SFT');
      svg.append('text').attr('x', sx + 18).attr('y', b0 + 52).attr('text-anchor', 'middle').attr('class', 'lbl').text('no RL');
      for (let r = 1; r <= 4; r++) {
        const y = cy(b0, r);
        svg.append('rect').attr('x', sx).attr('y', y).attr('width', 36).attr('height', chh).attr('rx', 3).style('fill', 'var(--hm0)');
        svg.append('text').attr('x', sx + 18).attr('y', y + chh / 2 + 4).attr('text-anchor', 'middle').style('fill', 'var(--ht0)').style('font-size', '11px').style('font-variant-numeric', 'tabular-nums').text(f1(starts[r][b]));
      }
      // one grid per method
      SYNC_M.forEach((m, mi) => {
        const ox = gx0 + mi * stride;
        head(ox, b0, MN[m], 'Training passes', ox + 2 * (cw + cg), mcol(m), mdash(m));
        for (let k = 1; k <= 4; k++) svg.append('text').attr('x', ox + (k - 1) * (cw + cg) + cw / 2).attr('y', b0 + 66).attr('text-anchor', 'middle').attr('class', 'lbl').text(k);
        for (let r = 1; r <= 4; r++) for (let k = 1; k <= 4; k++)
          cell(ox + (k - 1) * (cw + cg), cy(b0, r), cw, runs[`${r}${k}${m}`], b, starts[r][b], `${MN[m]} · prefill ${r} · trainer ${k}`, bench);
      });
      // replay: the trainer replays the rollout's token-by-token computation; no correction, trainer 3
      head(rx, b0, 'Replay', 'no correction', rx + 18);
      svg.append('text').attr('x', rx + 18).attr('y', b0 + 66).attr('text-anchor', 'middle').attr('class', 'lbl').text('trainer 3');
      for (let r = 1; r <= 4; r++) cell(rx, cy(b0, r), 36, refs.replay[r], b, starts[r][b], `Replay (no correction) · prefill ${r} · trainer 3`, bench);
      // exact rollout: no prefill shortcut at rollout, trainer 3; compared with the SFT checkpoint evaluated the same way
      const base0 = refs.start0 ? refs.start0[b] : null;
      head(ex, b0, 'Exact rollout', 'trainer 3', ex + 74);
      svg.append('text').attr('x', ex + 74).attr('y', b0 + 66).attr('text-anchor', 'middle').attr('class', 'lbl').text(base0 == null ? 'SFT n/a' : `SFT ${f1(base0)}`);
      [['none', 'No corr.'], ['sc', 'SC']].forEach(([m, lab], i) => {
        const y = cy(b0, i + 1);
        svg.append('text').attr('x', ex + 50).attr('y', y + chh / 2 + 4).attr('text-anchor', 'end').attr('class', 'lbl').text(lab);
        cell(ex + 56, y, 36, refs.exact[m], b, base0, `Exact rollout · ${MN[m]} · trainer 3`, bench);
      });
    });
    $('#scores-note').textContent = own
      ? 'Each model evaluated with the rollout prefill it was trained with, so each row has its own SFT baseline; the exact-rollout runs are compared with the SFT checkpoint evaluated with an exact prompt read. Runs that collapsed are scored on 200 problems.'
      : 'Every model evaluated again with prefill 3, whatever prefill it was trained with, so all rows share one baseline. ✕: collapsed in training and not evaluated with prefill 3. The two collapsed prefill-3 runs were evaluated, on 200 problems.';
  }
  function bindScores() {
    seg($('#sc-eval'), [['pf3', 'Prefill 3'], ['own', 'Its own prefill']], 'pf3', v => { scState.ev = v; renderScores(); });
  }
  renders.push(renderScores);


  /* =========================================================
     8. Async scores: heatmap of score by refresh interval, colored by the change from the synchronous run
     ========================================================= */
  function renderLagKey() {
    $('#lag-key').innerHTML = '<span>Change from the SFT checkpoint, in points:</span>' + [[-8, '≤ −7'], [-6, '−7 to −5'], [-4, '−5 to −3'], [-2, '−3 to −1'], [0, '±1'], [2, '+1 to +3'], [4, '+3 to +5'], [6, '+5 to +7'], [8, '≥ +7']]
      .map(([d, t]) => `<span><i style="background:${hmFill(d)}"></i>${t}</span>`).join('');
  }
  function renderLag() {
    renderLagKey();
    const el = $('#c-lag'), W = Math.max(660, Math.round(el.clientWidth || 680));
    const S = D.scores;
    const settings = [[3, 'Standard: prefill 3, trainer 3', S.start_pf3[3]], [1, 'Stress: prefill 1, trainer 3', S.start_own[1]]];
    const gapX = 28, bw = (W - gapX) / 2, lw = 100, chh = 24, cg = 2, cw = Math.floor((bw - lw) / 5) - cg;
    const blockH = 18 + 34 + 5 * (chh + cg) + 22, H = 2 * blockH;
    const svg = svgIn(el, W, H, 'Heatmaps of GSM8K and MATH-500 after one epoch by rollout refresh interval, for each method, in the standard and stress settings');
    // score of a run: [value, collapsed]; the synchronous MATH-500 score comes from the sync grid
    const score = (pf, m, l, b) => {
      const s = D.ascores[`${pf}-${m}-${l}`];
      if (!s) return null;
      if (b === 0) return [s[0], s[1]];
      let v = s[2];
      if (v == null && l === 0 && m !== 'sc_klm') { const sy = (pf === 3 ? S.pf3 : S.own)[`${pf}3${m}`]; v = sy ? sy[1] : null; }
      return v == null ? null : [v, s[1]];
    };
    ['GSM8K', 'MATH-500'].forEach((bench, b) => {
      settings.forEach(([pf, title, start], si) => {
        const ox = si * (bw + gapX), oy = b * blockH;
        const tt = svg.append('text').attr('x', ox).attr('y', oy + 14);
        tt.append('tspan').attr('class', 'ttl').style('font-size', '13px').text(bench);
        tt.append('tspan').attr('class', 'lbl').attr('dx', 8).style('font-size', '11.5px').text(`${title} · SFT ${f1(start[b])}`);
        const cx = l => ox + lw + LAGS.indexOf(l) * (cw + cg);
        svg.append('text').attr('x', cx(2) + 2 * (cw + cg) - cg / 2).attr('y', oy + 34).attr('text-anchor', 'middle').attr('class', 'lbl').text('Refreshed every N updates');
        LAGS.forEach(l => svg.append('text').attr('x', cx(l) + cw / 2).attr('y', oy + 48).attr('text-anchor', 'middle').attr('class', 'lbl').text(l === 0 ? 'sync' : l));
        ASYNC_M.forEach((m, mi) => {
          const y = oy + 54 + mi * (chh + cg);
          svg.append('line').attr('x1', ox + 2).attr('x2', ox + 18).attr('y1', y + chh / 2).attr('y2', y + chh / 2).style('stroke', mcol(m)).style('stroke-width', 2.2).style('stroke-dasharray', mdash(m)).style('stroke-linecap', 'round');
          svg.append('text').attr('x', ox + 24).attr('y', y + chh / 2 + 4).attr('class', 'ink').style('font-size', '11.5px').text(MN[m]);
          const sync = score(pf, m, 0, b);
          LAGS.forEach(l => {
            const s = score(pf, m, l, b), x = cx(l), g = svg.append('g').style('cursor', 'default');
            const head = `<b>${MN[m]} · ${LAGN(l)}</b>${row('', 'Setting', title.split(':')[0])}`;
            if (!s) {
              g.append('rect').attr('x', x + 0.5).attr('y', y + 0.5).attr('width', cw - 1).attr('height', chh - 1).attr('rx', 3).style('fill', 'none').style('stroke', 'var(--axis)').style('stroke-dasharray', '3 2');
              g.append('text').attr('x', x + cw / 2).attr('y', y + chh / 2 + 4).attr('text-anchor', 'middle').attr('class', 'lbl').text('–');
              g.on('pointermove', e => showTip(`${head}${row('', bench, 'not evaluated')}`, e)).on('pointerleave', hideTip);
              return;
            }
            // colour: change from the SFT checkpoint evaluated the same way (a collapsed synchronous run would be a misleading baseline)
            const d = s[0] - start[b];
            g.append('rect').attr('x', x).attr('y', y).attr('width', cw).attr('height', chh).attr('rx', 3).style('fill', hmFill(d));
            g.append('text').attr('x', x + cw / 2).attr('y', y + chh / 2 + 3.5).attr('text-anchor', 'middle').style('fill', hmInk(d)).style('font-size', '10.5px').style('font-variant-numeric', 'tabular-nums').text(f1(s[0]));
            if (s[1]) g.append('text').attr('x', x + cw - 3).attr('y', y + 8).attr('text-anchor', 'end').style('fill', hmInk(d)).style('font-size', '8.5px').style('font-weight', 700).text('×');
            g.on('pointermove', e => showTip(`${head}${row('', bench, f1(s[0]))}${row('', 'SFT checkpoint', f1(start[b]))}${row('', 'Change', signed(d))}${l && sync ? row('', 'Synchronous run', f1(sync[0])) : ''}${row('', 'Training', s[1] === 2 ? 'collapsed (scored on the full test set)' : s[1] ? 'collapsed (scored on 200 problems)' : 'stable')}`, e)).on('pointerleave', hideTip);
          });
        });
      });
    });
  }
  renders.push(renderLag);

  /* =========================================================
     9. Async training curves: one panel per method, one line per lag
     ========================================================= */
  const asState = { pf: 3, metric: 'acc', show: {}, zoom: null };
  const AS_NOTES = {
    acc: 'Share of correct rollouts at each update, in % (16-update moving average); below 40% the axis is squeezed into the grey band. The dashed grey line is the SFT checkpoint itself: the mean over the first 64 updates of the runs refreshed every 64, whose rollouts all come from the SFT weights.',
    fin: 'Share of rollouts that finish within 768 tokens, in %; below 90% the axis is squeezed into the grey band. The dashed grey line is the SFT checkpoint itself, measured the same way.',
    gap: 'Per-token gap (log scale): stale weights add to the gap the pass counts already set. The red band is 0.011–0.019.',
  };
  function renderAsync() {
    const el = $('#c-async'), zoom = asState.zoom;
    // zoomed: the single panel fits the screen instead of scrolling sideways
    el.classList.toggle('fit', !!zoom);
    const W = Math.max(zoom ? 320 : 700, Math.round(el.clientWidth || 700));
    const { pf, metric } = asState, M = MET[metric];
    const x0 = 34, gx = 8, top = 26, pw = Math.floor((W - x0 - 4 * gx - 6) / 5), ph = Math.round(Math.min(170, pw * 0.85));
    const zw = W - x0 - 6, zh = Math.round(Math.max(240, Math.min(zw * 0.5, 520)));
    const H = top + (zoom ? zh : ph) + 34;
    const svg = svgIn(el, W, H, zoom ? `One chart of ${metric} for ${MN[zoom]}, one line per refresh interval` : `Five small charts of ${metric} for each method, one line per refresh interval`);
    const lags = LAGS.filter(l => asState.show[l] !== false);
    const bv = baseOf(metric, pf, 3);
    function panel(m, px, w, h, yTicks, first, last, big) {
      const g = svg.append('g');
      g.append('line').attr('x1', px + 2).attr('x2', px + 20).attr('y1', 11).attr('y2', 11).style('stroke', mcol(m)).style('stroke-width', 2.2).style('stroke-dasharray', mdash(m)).style('stroke-linecap', 'round');
      g.append('text').attr('x', px + 26).attr('y', 15).attr('class', 'ink').style('font-size', big ? '12.5px' : '12px').style('font-weight', 500).text(MN[m]);
      panelFrame(g, M, px, top, w, h, yTicks);
      if (metric === 'gap') { const yt = yOf(M, D.band[1], top, h), yb = yOf(M, D.band[0], top, h); g.append('rect').attr('x', px + 0.5).attr('y', yt).attr('width', w - 1).attr('height', yb - yt).style('fill', 'var(--band)'); }
      xTicks(g, px, top, w, h, true, first, last);
      baseLine(g, M, bv, px, top, w, h);
      const S = {};
      lags.forEach(l => { const r = D.async[`${pf}-${m}-${l}`]; S[l] = r ? (metric === 'gap' ? smooth(r.gap, 8) : smooth(pct(r[metric]), 8)) : null; });
      lags.forEach(l => {
        if (!S[l]) return;
        g.append('path').attr('d', seriesPath(S[l], M, px, top, w, h)).style('fill', 'none').style('stroke', `var(--lag${l})`).style('stroke-width', big ? 2.1 : 1.7).style('stroke-linejoin', 'round');
      });
      hoverLayer(g, {
        x0: px, top, w, h, n: 152,
        series: lags.map(l => ({ name: LAGN(l), color: `var(--lag${l})`, sw: swLine(`var(--lag${l})`), vals: S[l], fmt: M.fmt, y: v => yOf(M, v, top, h) })),
        title: s => `${MN[m]} · update ${s}`,
        cursor: big ? 'zoom-out' : 'zoom-in',
        onClick: () => { asState.zoom = big ? null : m; renderAsync(); },
      });
    }
    if (zoom) panel(zoom, x0, zw, zh, true, true, true, true);
    else ASYNC_M.forEach((m, mi) => panel(m, x0 + mi * (pw + gx), pw, ph, mi === 0, mi === 0, mi === ASYNC_M.length - 1, false));
    svg.append('text').attr('x', zoom ? x0 + zw / 2 : x0 + 2.5 * (pw + gx)).attr('y', H - 4).attr('text-anchor', 'middle').attr('class', 'lbl').text('Update');
    $('#as-back').hidden = !zoom;
    $('#as-note').textContent = AS_NOTES[metric];
  }
  function bindAsync() {
    seg($('#as-setting'), [['3', 'Standard (prefill 3)'], ['1', 'Stress (prefill 1)']], '3', v => { asState.pf = +v; renderAsync(); });
    seg($('#as-metric'), [['acc', 'Training accuracy'], ['fin', 'Finished responses'], ['gap', 'Rollout–trainer gap']], 'acc', v => { asState.metric = v; renderAsync(); });
    chips($('#as-legend'), LAGS.map(l => [l, l === 0 ? 'Synchronous' : `Refresh every ${l}`, `var(--lag${l})`, null]), asState.show, renderAsync);
    $('#as-back').addEventListener('click', () => { asState.zoom = null; renderAsync(); });
    document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && asState.zoom) { asState.zoom = null; renderAsync(); } });
  }
  renders.push(renderAsync);


  /* =========================================================
     10. pass@8 vs avg@8
     ========================================================= */
  function renderPassk() {
    const el = $('#c-passk'), W = 680, H = 218;
    const svg = svgIn(el, W, H, 'For GSM8K and MATH-500 on a 0 to 100% axis: RL moves the average accuracy of one sample up by 13.3 and 10.5 points, and the share of problems solved at least once in 8 samples by only 2.2 and 1.6 points; after RL the average sample is still 20.3 and 23.1 points below pass@8');
    const P = D.passk;
    const x0 = 92, x1 = 668, xs = d3.scaleLinear().domain([0, 100]).range([x0, x1]);
    const METRICS = [
      ['avg8', 'avg@8', 'average accuracy of one sample', 'var(--m-sc)'],
      ['pass8', 'pass@8', 'solved at least once in 8 samples', 'var(--ink2)'],
    ];
    // legend: colour = metric, open/filled = before/after
    const lg = svg.append('g').attr('transform', `translate(${x0},14)`);
    let lx = 0;
    const legendItem = (draw, text) => { draw(lx); const t = lg.append('text').attr('x', lx + 22).attr('y', 4).attr('class', 'ink2').style('font-size', '12px').text(text); lx += 22 + t.node().getComputedTextLength() + 20; };
    METRICS.forEach(([, name, desc, c]) => legendItem(x => lg.append('line').attr('x1', x).attr('x2', x + 16).attr('y1', 0).attr('y2', 0).style('stroke', c).style('stroke-width', 2.5).style('stroke-linecap', 'round'), `${name}: ${desc}`));
    const lg2 = svg.append('g').attr('transform', `translate(${x0},34)`);
    lg2.append('circle').attr('cx', 5).attr('cy', 0).attr('r', 4.5).style('fill', 'var(--bg)').style('stroke', 'var(--muted)').style('stroke-width', 1.8);
    lg2.append('text').attr('x', 15).attr('y', 4).attr('class', 'ink2').style('font-size', '12px').text('SFT start');
    lg2.append('circle').attr('cx', 90).attr('cy', 0).attr('r', 4.5).style('fill', 'var(--muted)');
    lg2.append('text').attr('x', 100).attr('y', 4).attr('class', 'ink2').style('font-size', '12px').text('after one epoch of RL (SC, standard setting)');
    // axis
    const top = 54, bot = 196;
    [0, 20, 40, 60, 80, 100].forEach(t => {
      svg.append('line').attr('x1', xs(t)).attr('x2', xs(t)).attr('y1', top).attr('y2', bot).style('stroke', t ? 'var(--grid)' : 'var(--axis)');
      svg.append('text').attr('x', xs(t)).attr('y', bot + 14).attr('text-anchor', 'middle').attr('class', 'lbl').text(`${t}%`);
    });
    [['GSM8K', P.gsm8k], ['MATH-500', P.math500]].forEach(([bench, B], i) => {
      const y = top + 42 + i * 72;
      svg.append('text').attr('x', 0).attr('y', y + 4).attr('class', 'ink').style('font-size', '13px').style('font-weight', 600).text(bench);
      // the gap RL leaves: from avg@8 after RL up to pass@8 after RL, i.e. problems solved in some samples but not by the average one
      const ga = B.avg8[1], gb = B.pass8[1], gap = gb - ga, gg = svg.append('g');
      gg.append('rect').attr('x', xs(ga)).attr('y', y - 7).attr('width', xs(gb) - xs(ga)).attr('height', 14).attr('rx', 3).style('fill', 'var(--m-sc)').style('fill-opacity', 0.13);
      gg.append('text').attr('x', (xs(ga) + xs(gb)) / 2).attr('y', y - 24).attr('text-anchor', 'middle').attr('class', 'ink2').style('font-size', '11.5px').style('font-variant-numeric', 'tabular-nums').text(`${f1(gap)} points below pass@8`);
      gg.append('rect').attr('x', xs(ga)).attr('y', y - 36).attr('width', xs(gb) - xs(ga)).attr('height', 50).style('fill', 'transparent')
        .on('mousemove', ev => showTip(`<b>${bench} · gap after RL</b><div class="row" style="color:var(--muted)">solved in some of the 8 samples, but not by the average one</div>${row('', 'avg@8 after RL', `${f1(ga)}%`)}${row('', 'pass@8 after RL', `${f1(gb)}%`)}${row('', 'Gap', `${f1(gap)} points`)}`, ev)).on('mouseleave', hideTip);
      METRICS.forEach(([k, name, desc, c]) => {
        const [a, b] = B[k], g = svg.append('g');
        g.append('line').attr('x1', xs(a)).attr('x2', xs(b)).attr('y1', y).attr('y2', y).style('stroke', c).style('stroke-width', 2.5).style('stroke-linecap', 'round');
        g.append('circle').attr('cx', xs(a)).attr('cy', y).attr('r', 4.5).style('fill', 'var(--bg)').style('stroke', c).style('stroke-width', 1.8);
        g.append('circle').attr('cx', xs(b)).attr('cy', y).attr('r', 5).style('fill', c).style('stroke', 'var(--bg)').style('stroke-width', 1.5);
        // change above, start and end values below (start to the left, end to the right so they never collide)
        // pass@8 barely moves, so its change sits to the right of the dot, leaving the space above for the gap label
        const side = k === 'pass8';
        g.append('text').attr('x', side ? xs(b) + 10 : (xs(a) + xs(b)) / 2).attr('y', side ? y + 4 : y - 10).attr('text-anchor', side ? 'start' : 'middle').style('fill', c).style('font-size', '12px').style('font-weight', 600).style('font-variant-numeric', 'tabular-nums').text(`+${f1(b - a)}`);
        g.append('text').attr('x', xs(a) + 3).attr('y', y + 18).attr('text-anchor', 'end').attr('class', 'lbl').style('font-variant-numeric', 'tabular-nums').text(f1(a));
        g.append('text').attr('x', xs(b) - 3).attr('y', y + 18).attr('text-anchor', 'start').attr('class', 'lbl').style('font-variant-numeric', 'tabular-nums').text(f1(b));
        g.append('rect').attr('x', xs(a) - 14).attr('y', y - 24).attr('width', xs(b) - xs(a) + 28).attr('height', 48).style('fill', 'transparent')
          .on('mousemove', ev => showTip(`<b>${bench} · ${name}</b><div class="row" style="color:var(--muted)">${desc}</div>${row('', 'SFT start', `${f1(a)}%`)}${row('', 'After RL (SC)', `${f1(b)}%`)}${row('', 'Change', `+${f1(b - a)} points`)}`, ev)).on('mouseleave', hideTip);
      });
    });
  }
  renders.push(renderPassk);

  /* ---------- boot ---------- */
  fetch('data.json').then(r => r.json()).then(data => {
    D = data;
    bindRefine(); bindGrid(); bindScores(); bindAsync();
    renderAll();
  }).catch(err => {
    console.error(err);
    document.querySelectorAll('.chart').forEach(c => { c.innerHTML = '<p class="hint">The figure data could not be loaded.</p>'; });
  });
  void NS;
})();
