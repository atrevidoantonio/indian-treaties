const $ = id => document.getElementById(id)
const esc = s =>
  String(s ?? '').replace(
    /[&<>"]/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])
  )
const T = window.TREATIES,
  C = window.CESSIONS,
  GEO = window.GEO,
  TEXT_INDEX = window.TEXT_INDEX
T.forEach(t => {
  t.y = +t.d.slice(0, 4)
})
const byId = new Map(T.map(t => [t.id, t]))

const KIND = {
  V: 'Ratified treaty',
  A: 'Ratified agreement',
  R: 'Treaty rejected by Congress',
  U: 'Unratified treaty'
}


const THEME = Object.freeze({
  paper: '#F7F7F4',
  ink: '#2F3534',
  line: '#65716D',
  rule: '#D4D9D4',

  unceded: '#E8CC81',
  land: '#E7ECE8',
  context: '#F0F2EE',
  sea: '#F5F7F6',
  water: '#C9DCE3',
  river: '#8FB6C6',

  treaty: '#E9C2B7',
  agreement: '#E0B1A5',
  statute: '#F58F00',
  executive: '#D35F4A',
  unratified: '#9895B2',
  noBasis: '#B57370',
  outside: '#A66B6A',

  reservations: '#A2B9A9',

  chart: '#B57370',
  timeline: '#B57370'
})

const ACCENTS = Object.freeze({
  T: ['#A66E65', '#F8EAE6'],
  A: ['#A0645C', '#F6E6E1'],
  S: ['#995B54', '#F4E2DD'],
  E: ['#92534E', '#F1DEDA'],
  U: ['#894D4A', '#EFDAD7'],
  N: ['#804543', '#ECD6D4'],
  OUT: ['#784341', '#EAD4D2']
})


// Scoped CSS is injected by app.js: no additional stylesheet required.
const atlasStyles = document.createElement('style')
atlasStyles.id = 'royce-chromatic-modernism-theme'
atlasStyles.textContent = `
:root {
  --paper: ${THEME.paper};
  --ink: ${THEME.ink};
  --muted: ${THEME.line};
  --rule: ${THEME.rule};
  --accent: ${ACCENTS.T[0]};
  --accent-soft: ${ACCENTS.T[1]};
}

html, body {
  background-color: ${THEME.paper};
  color: ${THEME.ink};
}

#map .sea,
#map .nb,
#map .land,
#map .lake {
  stroke: none;
}

#map .sea { fill: ${THEME.sea}; }
#map .nb { fill: ${THEME.context}; }
#map .land { fill: ${THEME.land}; }
#map.year-on .land { fill: ${THEME.unceded}; }
#map .lake { fill: ${THEME.water}; }

#map .river {
  pointer-events: none;
  fill: none;
  stroke: ${THEME.river};
  stroke-width: .7px;
  stroke-linecap: round;
  stroke-linejoin: round;
  vector-effect: non-scaling-stroke;
}

#map .river.r1 { stroke-width: 1.5px; }

#map .cess,
#map .out {
  stroke: rgba(32, 44, 48, .42);
  stroke-width: .4px;
  vector-effect: non-scaling-stroke;
}

#map .out {
  fill: ${THEME.outside};
}

#map .res {
  pointer-events: none;
  fill: ${THEME.reservations};
  fill-opacity: 1;
  opacity: 1;
  stroke: #194936;
  stroke-width: .45px;
  vector-effect: non-scaling-stroke;
}

#map.year-on.before-end .res {
  display: none;
}

#map .sb {
  fill: none;
  stroke: rgba(32, 44, 48, .32);
  stroke-width: .65px;
  vector-effect: non-scaling-stroke;
}

#map .nation {
  fill: none;
  stroke: ${THEME.line};
  stroke-width: .9px;
  vector-effect: non-scaling-stroke;
}

#map .selo {
  pointer-events: none;
  fill: none;
  stroke: ${THEME.ink};
  stroke-width: 2px;
  vector-effect: non-scaling-stroke;
}

#legend .unc i {
  background-color: ${THEME.unceded};
}
`
document.head.appendChild(atlasStyles)

const CLS = [
  ['T', 'Ratified treaty', THEME.treaty],
  ['A', 'Ratified agreement', THEME.agreement],
  ['S', 'Act of Congress', THEME.statute],
  ['E', 'Executive order', THEME.executive],
  ['U', 'Unratified treaty', THEME.unratified],
  ['N', 'No treaty, statute or order', THEME.noBasis]
]
const clsColour = Object.fromEntries(CLS.map(c => [c[0], c[2]]))
const clsName = Object.fromEntries(CLS.map(c => [c[0], c[1]]))
const BASIS = {
  T: 'a ratified treaty',
  A: 'a ratified agreement',
  S: 'an act of Congress',
  E: 'an executive order',
  U: 'a treaty that was never ratified',
  N: 'no treaty, statute or order that he names'
}
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
]
const fmtDate = d => {
  const [y, m, day] = d.split('-').map(Number)
  return `${MONTHS[m - 1]} ${day}, ${y}`
}
const fmtInt = n => Math.round(n).toLocaleString('en-US')
const fmtAcres = a =>
  a >= 1e9
    ? (a / 1e9).toFixed(2) + ' billion'
    : a >= 1e6
    ? (a / 1e6).toFixed(a >= 1e7 ? 1 : 2) + ' million'
    : fmtInt(a)
const fmtMoney = n => '$' + fmtInt(n)
const fmtPerAcre = v =>
  v >= 1
    ? '$' + v.toFixed(2)
    : v >= 0.1
    ? Math.round(v * 100) + ' cents'
    : v >= 0.001
    ? (v * 100).toFixed(v >= 0.01 ? 1 : 2).replace(/\.0+$/, '') + ' cents'
    : 'under a tenth of a cent'
const pct = v =>
  v < 0.0005
    ? 'none'
    : v < 0.01
    ? 'under 1 percent'
    : (v * 100).toFixed(v < 0.1 ? 1 : 0) + ' percent'
const listOf = a =>
  a.length < 2
    ? a.join('')
    : a.length === 2
    ? a.join(' and ')
    : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`
const link = (url, label) =>
  `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>`

const featByKey = Object.fromEntries(FEATURED.map(f => [f.key, f]))
const featById = new Map(FEATURED.filter(f => f.id).map(f => [f.id, f]))
FEATURED.forEach(f => {
  if (f.id) f.t = byId.get(f.id)
  // Reconcile featured-record cards and detail-panel accents with map classes.
  const group = f.zone
    ? 'OUT'
    : f.t?.k === 'A'
    ? 'A'
    : f.t?.k === 'R' || f.t?.k === 'U'
    ? 'U'
    : 'T'
  ;[f.accent, f.soft] = ACCENTS[group]
})

const nationsPhrase = n =>
  !n.length
    ? 'unnamed nations'
    : n.length <= 3
    ? listOf(n)
    : `${n[0]}, ${n[1]} and ${n.length - 2} other nations`
const titleOf = t =>
  featById.has(t.id)
    ? featById.get(t.id).title
    : `${t.k === 'A' ? 'Agreement' : 'Treaty'} with the ${nationsPhrase(
        t.n
      )}, ${t.y}`
const audited = t => t.sc !== undefined
const fixedPrice = t => audited(t) && !t.pk
const cessionSort = (a, b) => parseInt(a) - parseInt(b) || a.localeCompare(b)

/* ---------- aggregates ---------- */
const mapped = T.filter(
  t => t.c && t.ac && (t.k === 'V' || t.k === 'A') && fixedPrice(t)
)
const FROM_SALES = T.filter(
  t => t.c && (t.k === 'V' || t.k === 'A') && t.pk === 'P'
).length
const perAcre = mapped.map(t => t.sc / t.ac).sort((a, b) => a - b)
const MEDIAN = perAcre[Math.floor(perAcre.length / 2)]
const NO_SUM = mapped.filter(t => !t.sc && !t.pp).length
const cessionList = Object.entries(C).map(([n, c]) => ({
  n,
  ...c,
  y: c.d.length ? +c.d[0].slice(0, 4) : null
}))
const TOTAL = d3.sum(cessionList, c => c.fa || 0)
const BY_CLASS = Object.fromEntries(
  CLS.map(([k]) => [
    k,
    d3.sum(
      cessionList.filter(c => c.k === k),
      c => c.fa || 0
    )
  ])
)
const CLASS_COUNT = Object.fromEntries(
  CLS.map(([k]) => [k, cessionList.filter(c => c.k === k).length])
)
const RES_TOTAL = 72366000,
  FOREST_TOTAL = 197366313
const Y0 = 1784,
  Y1 = 1911,
  YR_END = 1894
const SIGNED = d3
  .range(Y0, Y1 + 1)
  .map(y => ({ y, n: T.filter(t => t.y === y).length }))
const PEAK = SIGNED.reduce((a, b) => (b.n > a.n ? b : a))
let running = 0
const CUM = d3.range(Y0, YR_END + 1).map(y => {
  running += d3.sum(
    cessionList.filter(c => c.y === y),
    c => c.fa || 0
  )
  return { y, a: running }
})
const cumAt = y => CUM[Math.max(0, Math.min(CUM.length - 1, y - Y0))].a

/* ---------- geometry ---------- */
const rewind = fc => {
  fc.features.forEach(f => {
    if (f.geometry && d3.geoArea(f) > 2 * Math.PI) {
      const g = f.geometry
      ;(g.type === 'Polygon' ? [g.coordinates] : g.coordinates).forEach(poly =>
        poly.forEach(r => r.reverse())
      )
    }
  })
  return fc
}
const stateObj = GEO.states.objects.states
const lower48 = rewind({
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {},
      geometry: topojson.merge(GEO.states, stateObj.geometries)
    }
  ]
})
const stateBorders = topojson.mesh(GEO.states, stateObj, (a, b) => a !== b)
const neighbors = rewind(
  topojson.feature(GEO.neighbors, GEO.neighbors.objects.countries)
)
const cess = rewind(topojson.feature(GEO.ceded, GEO.ceded.objects.cessions))
cess.features = cess.features
  .filter(f => f.geometry && C[f.properties.n])
  .sort((a, b) => (C[b.properties.n].ac || 0) - (C[a.properties.n].ac || 0))
const cessByN = new Map(cess.features.map(f => [f.properties.n, f]))
const outside = rewind(topojson.feature(GEO.ceded, GEO.ceded.objects.outside))
// Every area with the same legal basis gets the same fill.
// Polygon boundaries, not artificial lightness shifts, distinguish adjacent cessions.
const cessionFill = n => clsColour[C[n].k]

const lakes = rewind(topojson.feature(GEO.states, GEO.states.objects.lakes))
const rivers = topojson.feature(GEO.states, GEO.states.objects.rivers)
const res = rewind(topojson.feature(GEO.res, GEO.res.objects.reservations))
const zoneFeatures = z => outside.features.filter(f => f.properties.z === z)

const mapEl = $('map'),
  stageEl = document.querySelector('.stage')
const projection = d3.geoAlbers()
const path = d3.geoPath(projection)
const svg = d3
  .select(mapEl)
  .append('svg')
  .attr('role', 'img')
  .attr(
    'aria-label',
    'Map of the lower 48 states showing 718 land cession areas from Royce’s schedule'
  )
const coast = svg.append('clipPath').attr('id', 'coast').append('path')
const g = svg.append('g')
const gSea = g.append('g'),
  gNb = g.append('g'),
  gLand = g.append('g'),
  gOut = g.append('g').attr('clip-path', 'url(#coast)'),
  gCess = g.append('g').attr('clip-path', 'url(#coast)'),
  gRes = g.append('g').attr('clip-path', 'url(#coast)'),
  gLakes = g.append('g'),
  gLines = g.append('g'),
  gRivers = g.append('g'),
  gSel = g.append('g').attr('clip-path', 'url(#coast)')
let W = 0,
  H = 0,
  K = 1,
  Tf = d3.zoomIdentity
const zoom = d3
  .zoom()
  .scaleExtent([1, 18])
  .filter(
    e =>
      (e.type === 'mousedown' && !e.button) ||
      (e.type === 'touchstart' && e.touches.length > 1) ||
      e.type === 'dblclick'
  )
  .on('zoom', e => {
    Tf = e.transform
    K = Tf.k
    g.attr('transform', Tf)
    syncSlider()
    placeCalls()
    hideTip()
  })
svg.call(zoom).on('dblclick.zoom', null)
mapEl.style.touchAction = 'pan-y'
svg.style('touch-action', 'pan-y')

function draw () {
  W = mapEl.clientWidth
  H = Math.round(W * 0.66)
  stageEl.style.paddingTop = $('legend').offsetHeight + 12 + 'px'
  mapEl.style.height = H + 'px'
  projection.fitExtent(
    [
      [W * 0.035, H * 0.075],
      [W * 0.965, H * 0.9]
    ],
    lower48
  )
  svg.attr('viewBox', `0 0 ${W} ${H}`)
  coast.attr('d', path(lower48))
  gSea
    .selectAll('rect')
    .data([0])
    .join('rect')
    .attr('class', 'sea')
    .attr('x', -W)
    .attr('y', -H)
    .attr('width', W * 3)
    .attr('height', H * 3)
  gLakes
    .selectAll('path')
    .data(lakes.features)
    .join('path')
    .attr('class', 'lake')
    .attr('d', path)
  gRivers
    .selectAll('path')
    .data(rivers.features)
    .join('path')
    .attr('class', d => 'river r' + d.properties.rank)
    .attr('d', path)
  gNb
    .selectAll('path')
    .data(neighbors.features)
    .join('path')
    .attr('class', 'nb')
    .attr('d', path)
  gLand
    .selectAll('path')
    .data(lower48.features)
    .join('path')
    .attr('class', 'land')
    .attr('d', path)
  gOut
    .selectAll('path')
    .data(outside.features)
    .join('path')
    .attr('class', 'out')
    .attr('d', path)
    .attr('fill', THEME.outside)
    .on('pointerenter pointermove', (e, d) =>
      showTip(
        e,
        `<b>${esc(
          ZONES[d.properties.z].title
        )}</b><small>Taken without a federal treaty<br>${fmtAcres(
          d.properties.a
        )} acres</small>`
      )
    )
    .on('pointerleave', hideTip)
    .on('click', (e, d) => {
      e.stopPropagation()
      selectZone(d.properties.z)
    })
  gCess
    .selectAll('path')
    .data(cess.features, d => d.properties.n)
    .join('path')
    .attr('class', 'cess')
    .attr('d', path)
    .attr('fill', d => cessionFill(d.properties.n))
    .on('pointerenter pointermove', (e, d) =>
      showTip(e, tipCession(d.properties.n))
    )
    .on('pointerleave', hideTip)
    .on('click', (e, d) => {
      e.stopPropagation()
      pickCession(d.properties.n)
    })
  gRes
    .selectAll('path')
    .data(res.features)
    .join('path')
    .attr('class', 'res')
    .attr('d', path)
  gLines
    .selectAll('path')
    .data([stateBorders, lower48.features[0]])
    .join('path')
    .attr('class', (d, i) => (i ? 'nation' : 'sb'))
    .attr('d', path)
  FEATURED.forEach(f => {
    if (f.zone) {
      f.p = path.centroid({
        type: 'FeatureCollection',
        features: zoneFeatures(f.zone)
      })
    } else if (f.t && f.t.c) {
      const big = f.t.c
        .map(n => cessByN.get(n))
        .filter(Boolean)
        .sort((a, b) => C[b.properties.n].ac - C[a.properties.n].ac)[0]
      f.p = big ? path.centroid(big) : null
    }
  })
  applyFilter()
  zoom
    .extent([
      [0, 0],
      [W, H]
    ])
    .translateExtent([
      [-W * 0.15, -H * 0.15],
      [W * 1.15, H * 1.15]
    ])
  thumbs()
  drawTimeline()
}

/* ---------- filters and year mode ---------- */
const shown = new Set(CLS.map(c => c[0]))
let yearMode = false,
  year = 1868,
  playing = null,
  selSet = null,
  selZone = null
$('legend').innerHTML =
  CLS.map(
    ([k, n, c]) =>
      `<button data-c="${k}" aria-pressed="true"><i style="background:${c}"></i>${n}<span>${CLASS_COUNT[k]}</span></button>`
  ).join('') +
  `<button data-out aria-pressed="true"><i style="background:${THEME.outside}"></i>Taken without a federal treaty</button><button class="resk" data-res aria-pressed="true"><i style="background:${THEME.reservations}"></i>Reservations today</button><span class="unc"><i></i>Indigenous land, not yet ceded</span><div class="yearbox" id="yearbox" hidden aria-live="polite"><b id="yrBig"></b><span id="yrN"></span></div>`
$('legend')
  .querySelectorAll('[data-c]')
  .forEach(
    b =>
      (b.onclick = () => {
        const k = b.dataset.c
        shown.has(k) ? shown.delete(k) : shown.add(k)
        b.setAttribute('aria-pressed', shown.has(k))
        applyFilter()
      })
  )
$('legend').querySelector('[data-out]').onclick = e => {
  const b = e.currentTarget,
    on = b.getAttribute('aria-pressed') !== 'true'
  b.setAttribute('aria-pressed', on)
  mapEl.classList.toggle('out-off', !on)
}
$('legend').querySelector('[data-res]').onclick = e => {
  const b = e.currentTarget,
    on = b.getAttribute('aria-pressed') !== 'true'
  b.setAttribute('aria-pressed', on)
  mapEl.classList.toggle('res-off', !on)
}
const visible = n => {
  const c = C[n]
  return (
    shown.has(c.k) && (!yearMode || (c.d.length && +c.d[0].slice(0, 4) <= year))
  )
}
function applyFilter () {
  gCess
    .selectAll('path')
    .attr('display', d => (visible(d.properties.n) ? null : 'none'))
    .classed('dim', d => !!selZone || (!!selSet && !selSet.has(d.properties.n)))
  gOut
    .selectAll('path')
    .attr('display', d => (!yearMode || d.properties.y <= year ? null : 'none'))
  gSel
    .selectAll('path')
    .data(
      selZone
        ? outside.features.filter(f => f.properties.z === selZone)
        : selSet
        ? [...selSet].map(n => cessByN.get(n)).filter(Boolean)
        : []
    )
    .join('path')
    .attr('class', 'selo')
    .attr('d', path)
  if (yearMode) {
    const n = SIGNED.find(s => s.y === year)?.n || 0
    $('yrBig').textContent = year
    $('yrN').textContent = `${fmtAcres(cumAt(year))} acres ceded · ${
      n === 1 ? '1 treaty' : n + ' treaties'
    } signed`
  }
  placeCalls()
}
function setYearMode (on) {
  yearMode = on
  $('mAll').setAttribute('aria-pressed', !on)
  $('mYear').setAttribute('aria-pressed', on)
  $('yearbox').hidden = !on
  mapEl.classList.toggle('year-on', on)
  mapEl.classList.toggle('before-end', year < YR_END)
  $('legend').classList.toggle('year-legend', on)
  drawNow()
  if (!on) stopPlay()
  applyFilter()
  const pt = $('legend').offsetHeight + 12 + 'px'
  if (stageEl.style.paddingTop !== pt) {
    stageEl.style.paddingTop = pt
    placeCalls()
  }
}
function setYear (y) {
  year = Math.max(Y0, Math.min(Y1, Math.round(y)))
  mapEl.classList.toggle('before-end', year < YR_END)
  applyFilter()
  drawNow()
}
$('mAll').onclick = () => setYearMode(false)
$('mYear').onclick = () => setYearMode(true)
const playIcon =
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l13-8z"/></svg>',
  pauseIcon =
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>'
function stopPlay () {
  if (playing) {
    clearInterval(playing)
    playing = null
    $('play').innerHTML = playIcon
    $('play').setAttribute('aria-label', 'Play years')
  }
}
$('play').onclick = () => {
  if (playing) return stopPlay()
  if (!yearMode) setYearMode(true)
  if (year >= YR_END) setYear(Y0)
  $('play').innerHTML = pauseIcon
  $('play').setAttribute('aria-label', 'Pause')
  playing = setInterval(
    () => {
      if (year >= YR_END) return stopPlay()
      setYear(year + 1)
    },
    matchMedia('(prefers-reduced-motion: reduce)').matches ? 400 : 130
  )
}

/* ---------- timeline strip under the map ---------- */
const EVENTS = [
  [1784, 'Fort Stanwix'],
  [1795, 'Greenville'],
  [1830, 'Removal Act'],
  [1851, 'Fort Laramie'],
  [1868, 'Fort Laramie'],
  [1871, 'Treaty making ends'],
  [1887, 'Allotment Act'],
  [1903, 'Lone Wolf']
]
const tl = d3.select('#tlsvg')
let tlx = null
function drawTimeline () {
  const w = $('tline').clientWidth,
    narrow = w < 520,
    h = 110,
    base = h - 34
  tl.attr('viewBox', `0 0 ${w} ${h}`).selectAll('*').remove()
  tlx = d3.scaleLinear([Y0, Y1], [12, w - 12])
  const sy = d3.scaleLinear([0, PEAK.n], [base, base - 24]),
    bw = Math.max(1, (w - 24) / (Y1 - Y0) - 1)
  tl.append('g')
    .selectAll('rect')
    .data(SIGNED.filter(d => d.n))
    .join('rect')
    .attr('x', d => tlx(d.y) - bw / 2)
    .attr('width', bw)
    .attr('y', d => sy(d.n))
    .attr('height', d => base - sy(d.n))
    .attr('fill', THEME.timeline)
    .attr('fill-opacity', 0.32)
  tl.append('line')
    .attr('x1', tlx(Y0))
    .attr('x2', tlx(Y1))
    .attr('y1', base)
    .attr('y2', base)
    .attr('stroke', THEME.ink)
    .attr('stroke-width', 0.7)
  d3.range(1785, Y1 + 1, 5).forEach(y =>
    tl
      .append('line')
      .attr('x1', tlx(y))
      .attr('x2', tlx(y))
      .attr('y1', base)
      .attr('y2', base + (y % 25 ? 3 : 6))
      .attr('stroke', THEME.ink)
      .attr('stroke-width', 0.6)
  )
  d3.range(1800, Y1 + 1, 25).forEach(y =>
    tl
      .append('text')
      .attr('x', tlx(y))
      .attr('y', base + 18)
      .attr('text-anchor', 'middle')
      .text(y)
  )
  const rows = [12, 26, 40],
    used = rows.map(() => [])
  EVENTS.forEach(([y, label], i) => {
    const x = tlx(y),
      anchor = i === 0 ? 'start' : i === EVENTS.length - 1 ? 'end' : 'middle'
    const eg = tl
      .append('g')
      .style('cursor', 'pointer')
      .on('pointerdown', e => {
        e.stopPropagation()
        stopPlay()
        setYearMode(true)
        setYear(y)
      })
    const txt = eg
      .append('text')
      .attr('class', 'ev')
      .attr('x', x)
      .attr('text-anchor', anchor)
      .style('font-size', narrow ? '10px' : null)
      .text(narrow ? y : `${y} ${label}`)
    const tw = txt.node().getComputedTextLength(),
      l = anchor === 'start' ? x : anchor === 'end' ? x - tw : x - tw / 2,
      r = l + tw
    let row = rows.findIndex((_, k) =>
      used[k].every(([a, b]) => r + 8 < a || l - 8 > b)
    )
    if (row < 0) row = rows.length - 1
    used[row].push([l, r])
    txt.attr('y', rows[row])
    eg.insert('line', 'text')
      .attr('x1', x)
      .attr('x2', x)
      .attr('y1', rows[row] + 4)
      .attr('y2', base - 9)
      .attr('stroke', THEME.rule)
      .attr('stroke-width', 0.6)
    eg.insert('line', 'text')
      .attr('x1', x)
      .attr('x2', x)
      .attr('y1', base - 9)
      .attr('y2', base)
      .attr('stroke', THEME.outside)
      .attr('stroke-width', 1.6)
    eg.append('title').text(`${y}: ${label}`)
  })
  tl.append('g').attr('class', 'now')
  drawNow()
}
function drawNow () {
  if (!tlx) return
  const ng = tl.select('g.now'),
    h = +tl.attr('viewBox').split(' ')[3],
    base = h - 34
  ng.selectAll('*').remove()
  tl.attr('aria-valuenow', yearMode ? year : null).attr(
    'aria-valuetext',
    yearMode ? `${year}` : 'All years'
  )
  if (!yearMode) return
  ng.append('line')
    .attr('x1', tlx(year))
    .attr('x2', tlx(year))
    .attr('y1', 4)
    .attr('y2', base)
    .attr('stroke', THEME.ink)
    .attr('stroke-width', 1)
  ng.append('circle')
    .attr('cx', tlx(year))
    .attr('cy', base)
    .attr('r', 4)
    .attr('fill', THEME.ink)
}
function yearAt (e) {
  const r = tl.node().getBoundingClientRect()
  return tlx.invert(
    ((e.clientX - r.left) * +tl.attr('viewBox').split(' ')[2]) / r.width
  )
}
let dragging = false
tl.on('pointerdown', e => {
  dragging = true
  tl.node().setPointerCapture(e.pointerId)
  stopPlay()
  setYearMode(true)
  setYear(yearAt(e))
})
  .on('pointermove', e => {
    if (dragging) setYear(yearAt(e))
  })
  .on('pointerup pointercancel', () => {
    dragging = false
  })
tl.on('keydown', e => {
  const step = e.shiftKey ? 10 : 1
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    e.preventDefault()
    stopPlay()
    if (!yearMode) setYearMode(true)
    setYear(year + (e.key === 'ArrowRight' ? step : -step))
  }
})

/* ---------- zoom controls; wheel hands back to the page at the limits ---------- */
const zMax = 18,
  kToSlider = k => Math.round((Math.log(k) / Math.log(zMax)) * 100),
  sliderToK = v => Math.pow(zMax, v / 100)
function syncSlider () {
  $('zr').value = kToSlider(K)
}
function zoomTo (k, center, dur = 0) {
  const c = center || [W / 2, H / 2]
  ;(dur ? svg.transition().duration(dur) : svg).call(
    zoom.scaleTo,
    Math.max(1, Math.min(zMax, k)),
    c
  )
}
$('zr').oninput = e => zoomTo(sliderToK(+e.target.value))
$('zin').onclick = () => zoomTo(K * 1.5, null, 250)
$('zout').onclick = () => zoomTo(K / 1.5, null, 250)
$('recenter').onclick = () => recenter()
function recenter (dur = 450) {
  svg.transition().duration(dur).call(zoom.transform, d3.zoomIdentity)
}
svg.node().addEventListener(
  'wheel',
  e => {
    if (e.ctrlKey && Math.abs(e.deltaY) < 1) return
    const next = Math.max(1, Math.min(zMax, K * Math.exp(-e.deltaY * 0.0016)))
    if (Math.abs(next - K) < 1e-3) return
    e.preventDefault()
    const r = svg.node().getBoundingClientRect()
    svg.call(zoom.scaleTo, next, [
      ((e.clientX - r.left) * W) / r.width,
      ((e.clientY - r.top) * H) / r.height
    ])
  },
  { passive: false }
)
function flyToCessions (numbers) {
  const feats = numbers.map(n => cessByN.get(n)).filter(Boolean)
  if (!feats.length) return recenter()
  const [[x0, y0], [x1, y1]] = path.bounds({
    type: 'FeatureCollection',
    features: feats
  })
  const k = Math.max(
    1,
    Math.min(zMax, 0.7 / Math.max((x1 - x0) / W, (y1 - y0) / H))
  )
  const t = d3.zoomIdentity
    .translate(W / 2, H / 2)
    .scale(k)
    .translate(-(x0 + x1) / 2, -(y0 + y1) / 2)
  svg
    .transition()
    .duration(matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 750)
    .call(zoom.transform, t)
}
$('fs').onclick = async () => {
  try {
    document.fullscreenElement
      ? await document.exitFullscreen()
      : await stageEl.requestFullscreen()
  } catch {}
}

/* ---------- tooltip ---------- */
const tip = $('tip')
const firstTreaty = n => {
  const ids = C[n].t[0] || []
  return ids.length ? byId.get(ids[0]) : null
}
function tipCession (n) {
  const c = C[n],
    t = firstTreaty(n)
  return `<b>${esc(t ? titleOf(t) : clsName[c.k])}</b><small>Royce area ${esc(
    n
  )} · ${esc(c.nat)}<br>${
    c.d.length ? fmtDate(c.d[0]) : 'Undated'
  } · ${fmtAcres(c.ac)} acres${
    c.d.length > 1
      ? `<br>${plural(c.d.length - 1, 'later schedule entry').replace(
          'entrys',
          'entries'
        )}`
      : ''
  }</small>`
}
function showTip (e, html) {
  const r = stageEl.getBoundingClientRect()
  tip.innerHTML = html
  let x = e.clientX - r.left + 14,
    y = e.clientY - r.top + 14
  if (x + 310 > r.width)
    x = Math.max(4, e.clientX - r.left - 14 - tip.offsetWidth)
  tip.style.transform = `translate(${x}px,${y}px)`
  tip.classList.add('on')
}
function hideTip () {
  tip.classList.remove('on')
}

/* ---------- callouts on the stage ---------- */
const calls = FEATURED.filter(f => f.id || f.zone).map(f => {
  const lead = Object.assign(document.createElement('span'), {
    className: 'lead off'
  })
  const lab = Object.assign(document.createElement('button'), {
    className: 'call off',
    textContent: f.name
  })
  lab.onclick = () => select(f.key)
  $('calls').append(lead, lab)
  return { f, lead, lab }
})
function placeCalls () {
  const ox = mapEl.offsetLeft,
    oy = mapEl.offsetTop,
    sw = stageEl.clientWidth,
    small = sw < 600
  const placed = []
  calls.forEach(c => {
    const p = c.f.p,
      shownNow =
        p &&
        (c.f.zone
          ? !yearMode || zoneFeatures(c.f.zone)[0].properties.y <= year
          : c.f.t.c.some(visible))
    const hide =
      !shownNow ||
      (K > 3.2 && current !== c.f) ||
      (small &&
        current !== c.f &&
        K < 1.01 &&
        ![
          'laramie',
          'newechota',
          'california',
          'greenville',
          'horsecreek'
        ].includes(c.f.key))
    const x = p ? Tf.applyX(p[0]) + ox : 0,
      y = p ? Tf.applyY(p[1]) + oy : 0
    const out = x < ox - 4 || x > ox + W + 4 || y < oy - 4 || y > oy + H + 4
    ;[c.lab, c.lead].forEach(el => el.classList.toggle('off', hide || out))
    c.lab.classList.toggle('on', current === c.f)
    if (hide || out) return
    const [dx, dy] = c.f.dir,
      reach = small ? 34 : 54,
      lw = c.lab.offsetWidth,
      lh = c.lab.offsetHeight
    let lx = x + dx * reach,
      ly = y + dy * reach * 0.8
    let left = dx < 0 ? lx - lw : lx
    left = Math.max(4, Math.min(sw - lw - 4, left))
    ly = Math.max(oy + 10, Math.min(oy + H - 10, ly))
    for (const q of placed)
      if (left < q.r + 4 && left + lw > q.l - 4 && Math.abs(ly - q.y) < lh + 2)
        ly = q.y + (ly >= q.y ? lh + 2 : -(lh + 2))
    placed.push({ l: left, r: left + lw, y: ly })
    c.lab.style.transform = `translate(${left}px,${ly - lh / 2}px)`
    const ex = dx < 0 ? left + lw - 2 : left + 2,
      ey = ly,
      L = Math.hypot(x - ex, y - ey)
    c.lead.style.width = Math.max(0, L - 3) + 'px'
    c.lead.style.transform = `translate(${ex}px,${ey}px) rotate(${Math.atan2(
      y - ey,
      x - ex
    )}rad)`
  })
}

/* ---------- cards ---------- */
$('list').innerHTML = FEATURED.map(
  f =>
    `<button class="card" data-k="${
      f.key
    }" aria-pressed="false" style="--accent:${
      f.accent
    }"><svg class="loc" viewBox="0 0 144 100" aria-hidden="true"></svg><span><b>${esc(
      f.name
    )}</b><small>${f.card
      .split(' · ')
      .map(esc)
      .join('<br>')}</small></span></button>`
).join('')
document
  .querySelectorAll('.card')
  .forEach(b => (b.onclick = () => select(b.dataset.k)))
$(
  'count'
).textContent = `${T.length} treaties and agreements · ${cess.features.length} mapped areas`
function thumbs () {
  const pj = d3.geoAlbers().fitExtent(
      [
        [6, 6],
        [138, 94]
      ],
      lower48
    ),
    pa = d3.geoPath(pj)
  const base = `<path d="${pa(
    lower48
  )}" fill="${THEME.unceded}" stroke="${THEME.line}" stroke-width=".9"/>`
  FEATURED.forEach(f => {
    const el = document.querySelector(`.card[data-k="${f.key}"] svg`)
    if (f.zone)
      el.innerHTML =
        base +
        zoneFeatures(f.zone)
          .map(
            ft =>
              `<path d="${pa(ft)}" fill="${f.accent}" stroke="${
                f.accent
              }" stroke-width="2.4"/>`
          )
          .join('')
    else if (f.t)
      el.innerHTML =
        base +
        (f.t.c || [])
          .map(n => cessByN.get(n))
          .filter(Boolean)
          .map(
            ft =>
              `<path d="${pa(ft)}" fill="${f.accent}" stroke="${
                f.accent
              }" stroke-width="1.6"/>`
          )
          .join('')
    else
      el.innerHTML =
        base +
        `<path d="${pa({
          type: 'FeatureCollection',
          features: cess.features.slice(0, 160)
        })}" fill="${THEME.treaty}" fill-opacity=".7"/>`
  })
}

/* ---------- treaty texts, loaded by chunk ---------- */
const textCache = {},
  pending = {}
window.TEXT_CHUNK = (n, obj) => {
  Object.assign(textCache, obj)
  ;(pending[n] || []).forEach(r => r())
  delete pending[n]
}
function loadText (id) {
  if (textCache[id]) return Promise.resolve(textCache[id])
  const n = TEXT_INDEX[id]
  return new Promise((resolve, reject) => {
    if (!pending[n]) {
      pending[n] = []
      const s = document.createElement('script')
      s.src = `data/text/${String(n).padStart(2, '0')}.js`
      s.onerror = () => reject(new Error('text'))
      document.head.append(s)
    }
    pending[n].push(() => resolve(textCache[id]))
  })
}

/* ---------- panel ---------- */
let current = null,
  currentTreaty = null
const TABS = ['record', 'text', 'timeline', 'sources']
function tab (name) {
  TABS.forEach(t => {
    $('t-' + t).setAttribute('aria-selected', t === name)
    $('p-' + t).hidden = t !== name
  })
  if (name === 'text' && currentTreaty) fillText(currentTreaty)
}
TABS.forEach(t => ($('t-' + t).onclick = () => tab(t)))
document.querySelectorAll('nav a[data-tab]').forEach(
  a =>
    (a.onclick = () => {
      tab(a.dataset.tab)
      if (innerWidth <= 1240)
        $('panel').scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
)
document.querySelector('nav a[data-go=treaties]').onclick = () => {
  select('overview')
  const el = document.querySelector('[data-browse]')
  ;(innerWidth <= 1240 && el ? el : $('treaties')).scrollIntoView({
    behavior: 'smooth',
    block: 'nearest'
  })
}
document.querySelector('nav a[data-go=overview]').onclick = e => {
  e.preventDefault()
  select('overview')
}
const srcItem = x => {
  const [label, url] = typeof x === 'string' ? SRC[x] : x
  return url
    ? `<li><a href="${esc(url)}" target="_blank" rel="noopener">${esc(
        label
      )}</a><small>${esc(
        new URL(url).hostname.replace('www.', '')
      )}</small></li>`
    : `<li>${esc(label)}</li>`
}
function setAccent (a, s) {
  const r = document.documentElement.style
  r.setProperty('--accent', a)
  r.setProperty('--accent-soft', s)
}
function kv (rows) {
  $('kv').innerHTML = rows
    .map(([a, b]) => `<div><dt>${esc(a)}</dt><dd>${esc(b)}</dd></div>`)
    .join('')
}
function header (kick, num, title, lede) {
  $('kName').textContent = kick
  $('kNum').textContent = num
  $('title').textContent = title
  $('title').classList.toggle('long', title.length > 30)
  $('lede').textContent = lede
}
const card = ([name, sub, long], i) =>
  `<div class="st" data-i="${i}"><button aria-expanded="false"><span><b>${esc(
    name
  )}</b><span class="s">${esc(
    sub
  )}</span></span><i class="pm" aria-hidden="true">+</i></button><div class="more">${long}</div></div>`
function wireCards (root) {
  root.querySelectorAll('.st').forEach(el => {
    const b = el.querySelector(':scope > button')
    b.onclick = () => {
      const open = !el.classList.contains('open')
      el.classList.toggle('open', open)
      b.setAttribute('aria-expanded', open)
      el.querySelector('.pm').textContent = open ? '−' : '+'
      if (open && el.querySelector('[data-clauses]'))
        fillClauses(el.querySelector('[data-clauses]'))
    }
  })
  root
    .querySelectorAll('[data-t]')
    .forEach(b => (b.onclick = () => selectTreaty(byId.get(b.dataset.t))))
  root.querySelectorAll('[data-fly]').forEach(
    b =>
      (b.onclick = () => {
        flyToCessions(b.dataset.fly.split('|'))
        stageEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
      })
  )
  root
    .querySelectorAll('[data-cn]')
    .forEach(b => (b.onclick = () => selectCession(b.dataset.cn)))
}
const para = s => `<p>${esc(s)}</p>`

function landToday (ac, ra, nf, lg, forestNames) {
  if (!ac) return null
  const parts = [
    `${pct(ra / ac).replace(
      /^none$/,
      'None'
    )} of the mapped land is reservation or off-reservation trust land today, and ${pct(
      nf / ac
    )} lies inside National Forest boundaries.`
  ]
  if (forestNames && forestNames.length)
    parts.push(
      `The largest overlaps are with the ${listOf(forestNames.slice(0, 4))}.`
    )
  let html = para(parts.join(' '))
  if (lg)
    html += para(
      `${fmtInt(
        lg[0]
      )} acres of it were granted to land-grant universities under the Morrill Act of 1862. High Country News puts what the United States paid the nations for those parcels at ${fmtMoney(
        lg[1]
      )} and what the universities raised from them at ${fmtMoney(lg[2])}.`
    )
  return [
    'The Land Today',
    `${pct(ra / ac).replace(/^none$/, 'No')} reservation or trust land; ${pct(
      nf / ac
    )} National Forest.`,
    html
  ]
}

function treatyCards (t) {
  const f = featById.get(t.id),
    cards = f ? f.record.map(([a, b, c]) => [a, b, para(c)]) : []
  const areas = (t.c || []).slice().sort(cessionSort)
  // payment
  const passages = `<div data-clauses="${t.id}"></div>`
  if (audited(t)) {
    const bits = []
    if (t.pl) bits.push(`${fmtMoney(t.pl)} in one-time payments and goods`)
    t.pa.forEach(([amount, years]) =>
      bits.push(`${fmtMoney(amount)} a year for ${years} years`)
    )
    let html = ''
    if (bits.length)
      html += para(
        `The treaty promises ${listOf(bits)}${
          t.pa.length ? `, ${fmtMoney(t.sc)} in all` : ''
        }.${
          t.ac && t.sc
            ? ` That comes to ${fmtPerAcre(
                t.sc / t.ac
              )} an acre for the ${fmtAcres(t.ac)} acres Royce maps under it.`
            : ''
        }`
      )
    if (t.pp)
      html += para(
        `${bits.length ? 'It also promises' : 'The treaty promises'} ${fmtMoney(
          t.pp
        )} a year with no end date${
          bits.length ? ', which the total leaves out' : ''
        }.`
      )
    if (t.pn) html += para(t.pn)
    if (!bits.length && !t.pp && !t.pn)
      html += para(
        `The treaty names no sum of money${
          t.ac ? ` for the ${fmtAcres(t.ac)} acres Royce maps under it` : ''
        }.`
      )
    const researched = areas.filter(n => C[n].hp)
    if (researched.length)
      html += `<ul class="rows">${researched
        .map(
          n =>
            `<li><b>Royce area ${esc(n)}</b>: ${fmtMoney(
              C[n].hp[0]
            )} paid by the United States<small>${esc(
              C[n].hp[1]
            )} · High Country News</small></li>`
        )
        .join('')}</ul>`
    const sub = t.sc
      ? `${fmtMoney(t.sc)}${
          t.ac ? `, ${fmtPerAcre(t.sc / t.ac)} an acre` : ''
        }${t.pp ? `, and ${fmtMoney(t.pp)} a year without end` : ''}.`
      : t.pp
      ? `${fmtMoney(t.pp)} a year with no end date.`
      : t.pk === 'P'
      ? 'From the proceeds of the land’s sale.'
      : t.pk === 'S'
      ? 'Left for the Senate to fix.'
      : t.pn
      ? 'No total named.'
      : 'No sum of money named.'
    cards.push(['Payment', sub, html + passages])
  } else
    cards.push([
      'Payment',
      t.np
        ? `${plural(t.np, 'passage')} in the text ${
            t.np === 1 ? 'names' : 'name'
          } a sum of money.`
        : 'The text names no sum of money.',
      t.np ? passages : para('The treaty promises no payment in dollars.')
    ])
  // cessions
  if (areas.length) {
    cards.push([
      'Land',
      `${plural(areas.length, 'Royce area')}, ${fmtAcres(t.ac)} acres.`,
      `<ul class="rows">${areas
        .map(n => {
          const c = C[n],
            i = c.t.findIndex(ids => ids.includes(t.id))
          return `<li><button data-fly="${esc(n)}">Royce area ${esc(
            n
          )}</button> · ${fmtAcres(c.ac)} acres<small>${esc(c.nat)}${
            c.st ? ' · ' + esc(c.st) : ''
          }${
            i > 0 ? ` · first entered ${fmtDate(c.d[0])}` : ''
          }</small><small>${[
            c.rs && c.rs[i] ? link(c.rs[i], 'Royce’s schedule') : '',
            c.kp && c.kp[i] ? link(c.kp[i], 'Kappler') : '',
            c.mp ? link(c.mp, `Royce map${c.mn ? ', ' + c.mn : ''}`) : ''
          ]
            .filter(Boolean)
            .join(' · ')}</small></li>`
        })
        .join(
          ''
        )}</ul><p class="note">Royce’s areas overlap. Acreage here is the full extent of each area.</p>`
    ])
  } else
    cards.push([
      'Land',
      'No area mapped by Royce.',
      para(
        t.k === 'R' || t.k === 'U'
          ? 'The treaty never took legal effect, and Royce’s schedule enters no cession under its date.'
          : 'Royce’s schedule enters no mapped cession under this date. Treaties of peace, boundary and right-of-way agreements, and treaties on allotment or annuities often have none.'
      )
    ])
  // other schedule entries on the same land
  const later = [],
    earlier = []
  areas.forEach(n => {
    const c = C[n],
      i = c.t.findIndex(ids => ids.includes(t.id))
    c.d.forEach((d, j) => {
      if (j !== i)
        (j > i ? later : earlier).push({
          n,
          d,
          ids: c.t[j].filter(x => x !== t.id),
          rs: c.rs && c.rs[j]
        })
    })
  })
  const entryRows = rows =>
    `<ul class="rows">${rows
      .sort((a, b) => a.d.localeCompare(b.d) || cessionSort(a.n, b.n))
      .map(
        r =>
          `<li><b>${fmtDate(r.d)}</b> · Royce area ${esc(r.n)}<small>${
            r.ids.length
              ? r.ids
                  .map(
                    id =>
                      `<button data-t="${id}">${esc(
                        titleOf(byId.get(id))
                      )}</button>`
                  )
                  .join(' · ')
              : 'By act of Congress, executive order or other measure.'
          }${r.rs ? ' · ' + link(r.rs, 'schedule entry') : ''}</small></li>`
      )
      .join('')}</ul>`
  if (later.length)
    cards.push([
      'What Followed',
      `${plural(later.length, 'later entry').replace(
        'entrys',
        'entries'
      )} in Royce’s schedule for the same land.`,
      para(
        'Royce enters the same ground again under these dates. A later entry on land a treaty reserved or guaranteed is that land being ceded, reduced or taken.'
      ) + entryRows(later)
    ])
  if (earlier.length)
    cards.push([
      'What Came Before',
      `${plural(earlier.length, 'earlier entry').replace(
        'entrys',
        'entries'
      )} for the same land.`,
      entryRows(earlier)
    ])
  // land today
  const forestNames = [...new Set(areas.flatMap(n => C[n].fn || []))]
  const lt = landToday(t.ac, t.ra, t.nf, t.lg, forestNames)
  if (lt) cards.push(lt)
  if (t.w)
    cards.push([
      'War',
      `${t.w[0]}, ${t.w[1] === t.w[2] ? t.w[1] : t.w[1] + '–' + t.w[2]}.`,
      para('The treaty is among those that closed this war.')
    ])
  const now = [...new Set(areas.flatMap(n => C[n].now || []))].sort()
  if (now.length)
    cards.push([
      'Nations Today',
      `${plural(
        now.length,
        'federally recognized nation'
      )} linked to this land.`,
      `<p>${now
        .map(esc)
        .join(
          '; '
        )}.</p><p class="note">As identified by the U.S. Forest Service for each Royce area.</p>`
    ])
  return cards
}
async function fillClauses (el) {
  if (el.dataset.done) return
  el.dataset.done = 1
  try {
    const rec = await loadText(el.dataset.clauses)
    if (!rec.pc.length) return
    el.innerHTML =
      '<p class="note">Passages in the treaty that name a sum:</p>' +
      rec.pc.map(p => `<p class="clause">${esc(p)}</p>`).join('')
  } catch {
    el.innerHTML = ''
  }
}
async function fillText (t) {
  const pane = $('p-text')
  if (pane.dataset.id === t.id) return
  pane.dataset.id = t.id
  const scan = t.naid
    ? `<a class="scan" href="https://catalog.archives.gov/id/${
        t.naid
      }" target="_blank" rel="noopener"><img loading="lazy" src="${esc(
        t.img
      )}" alt="First page of Ratified Indian Treaty ${
        t.rit
      } in the National Archives"></a><p class="note">Ratified Indian Treaty ${
        t.rit
      }, National Archives. ${link(
        `https://catalog.archives.gov/id/${t.naid}`,
        'All pages in the National Archives catalog'
      )} · ${link(
        `https://digitreaties.org/treaties/treaty/${t.naid}/`,
        'Treaties Explorer viewer'
      )}</p>`
    : ''
  pane.innerHTML =
    scan + '<div class="ttext" id="ttext"><p>Loading the text…</p></div>'
  try {
    const rec = await loadText(t.id)
    if (pane.dataset.id !== t.id) return
    $('ttext').innerHTML =
      rec.t
        .split(/\n+/)
        .filter(s => s.trim())
        .map(s =>
          /^(ARTICLE|ART\.|Article)\s+[\dIVXLC]+\.?\s*$/.test(s.trim()) ||
          /^(ARTICLE|ART\.)\s+\S+\.?$/.test(s.trim())
            ? `<p class="art">${esc(s.trim())}</p>`
            : `<p>${esc(s)}</p>`
        )
        .join('') +
      '<p class="note">Text as printed in Kappler, Indian Affairs: Laws and Treaties, and in Deloria and DeMallie, Documents of American Indian Diplomacy.</p>'
  } catch {
    if (pane.dataset.id === t.id)
      $('ttext').innerHTML = '<p class="note">The text could not be loaded.</p>'
  }
}

function select (k) {
  const f = featByKey[k]
  if (f.zone) return selectZone(f.zone)
  if (f.t) return selectTreaty(f.t)
  current = f
  currentTreaty = null
  selSet = null
  selZone = null
  setAccent(f.accent, f.soft)
  document
    .querySelectorAll('.card')
    .forEach(b => b.setAttribute('aria-pressed', b.dataset.k === k))
  header('Overview', '', f.title, f.lede)
  kv([
    ['Treaties and agreements', String(T.length)],
    ['Ratified treaties', String(T.filter(t => t.k === 'V').length)],
    ['Acres in Royce’s schedule', fmtAcres(TOTAL)],
    ['Median price promised', fmtPerAcre(MEDIAN) + ' an acre']
  ])
  $('t-text').hidden = true
  const noTreaty = TOTAL - BY_CLASS.T - BY_CLASS.A
  const overviewCards = [
    [
      'The Treaties',
      `${T.length} signed between 1784 and 1911.`,
      para(
        `${
          T.filter(t => t.k === 'V').length
        } are treaties that were ratified and took effect, ${
          T.filter(t => t.k === 'A').length
        } are agreements ratified by statute after treaty making ended, ${
          T.filter(t => t.k === 'R').length
        } are treaties Congress rejected and ${
          T.filter(t => t.k === 'U').length
        } were never ratified. ${
          T.filter(t => t.c).length
        } of them cover land on Royce’s maps. The rest are treaties of peace, treaties over annuities and allotment, and treaties that never took effect.`
      )
    ],
    [
      'Payment',
      `The median treaty promises ${fmtPerAcre(MEDIAN)} an acre.`,
      para(
        `Among the ${
          mapped.length
        } ratified treaties and agreements that ceded mapped land for a fixed sum, the median promise is ${fmtPerAcre(
          MEDIAN
        )} an acre, counting one-time payments and annuities over their full terms. ${NO_SUM} name no sum of money at all. Another ${FROM_SALES} left the nation to be paid from the proceeds of the land’s sale. The United States set the minimum price of the same land, once surveyed, at $2 an acre in 1796 and $1.25 in 1820.`
      )
    ],
    [
      'Without a Ratified Treaty',
      `${fmtAcres(noTreaty)} acres.`,
      para(
        `Royce’s first entry is an act of Congress for ${fmtAcres(
          BY_CLASS.S
        )} acres and an executive order for ${fmtAcres(
          BY_CLASS.E
        )}, many of them reservations set apart and later cut down. ${fmtAcres(
          BY_CLASS.U
        )} acres, most of them in California, fall under treaties the Senate never ratified, and ${fmtAcres(
          BY_CLASS.N
        )} under no treaty, statute or order at all.`
      )
    ],
    [
      'After 1871',
      'Congress ended treaty making on March 3, 1871.',
      para(
        `A rider to the Indian appropriations act declared that no Indian nation would again be recognized as a power with whom the United States may contract by treaty, while leaving ratified treaties in force. From then on the government made agreements, ratified by both chambers as statutes; ${
          T.filter(t => t.k === 'A').length
        } are recorded here, the last in ${d3.max(
          T.filter(t => t.k === 'A'),
          t => t.y
        )}.`
      )
    ],
    [
      'Abrogation',
      'Lone Wolf v. Hitchcock, 1903.',
      para(
        'The Supreme Court held that Congress could abrogate the terms of an Indian treaty by statute and that the courts would not review its judgment. Treaties stayed law unless Congress said otherwise, and Congress often did. See Medicine Lodge and Fort Laramie in the list of treaties.'
      )
    ],
    [
      'Allotment and After',
      'From 138 million acres in 1887 to 48 million in 1934.',
      para(
        'Royce’s schedule ends in 1894. The largest losses after it came under the General Allotment Act of 1887 and the surplus-land acts that followed, which divided reservations into individual holdings and opened the remainder. By the Bureau of Indian Affairs’ figures, Indian landholdings fell from 138 million acres in 1887 to 48 million in 1934. Dams, termination and other twentieth-century takings came later still. None of that is mapped here.'
      )
    ],
    [
      'The Land Today',
      `${pct(RES_TOTAL / TOTAL)} is reservation or trust land.`,
      para(
        `Of the ${fmtAcres(TOTAL)} acres in Royce’s schedule, ${fmtAcres(
          RES_TOTAL
        )} are reservation or off-reservation trust land in the Census Bureau’s 2023 boundaries. ${fmtAcres(
          FOREST_TOTAL
        )} acres, ${pct(
          FOREST_TOTAL / TOTAL
        )}, lie inside National Forest boundaries. High Country News traced 10.7 million acres granted to universities under the Morrill Act to 162 of these cessions.`
      )
    ],
    [
      'Taken without a Federal Treaty',
      `${fmtAcres(d3.sum(outside.features, f => f.properties.a))} acres.`,
      para(
        'Royce mapped federal cessions. The original states, Kentucky, Tennessee, most of Texas and the Gulf coast were taken by colonies, states, Spain, France or the Republic of Texas. Southeastern California, most of northern Dakota and the James River valley passed to the United States with no treaty at all. Select any of these areas on the map for its record.'
      )
    ]
  ]
  const decades = d3
    .groups(T, t => Math.floor(t.y / 10) * 10)
    .sort((a, b) => a[0] - b[0])
  $('p-record').innerHTML =
    chartHTML() +
    topHTML() +
    opsHTML() +
    overviewCards.map(card).join('') +
    `<div class="ops" data-browse style="margin-top:22px"><h3>All Treaties by Decade</h3><p>Open a decade to list every treaty and agreement signed in it.</p></div>` +
    decades
      .map(([dec, list], i) =>
        card(
          [
            `${dec}s`,
            `${list.length === 1 ? '1 treaty' : list.length + ' treaties'}.`,
            `<ul class="rows">${list
              .map(
                t =>
                  `<li><button data-t="${t.id}">${esc(
                    titleOf(t)
                  )}</button><small>${fmtDate(t.d)}${
                    t.p ? ' · ' + esc(t.p) : ''
                  } · ${KIND[t.k]}${
                    t.ac ? ' · ' + fmtAcres(t.ac) + ' acres' : ''
                  }</small></li>`
              )
              .join('')}</ul>`
          ],
          100 + i
        )
      )
      .join('')
  wireCards($('p-record'))
  wireChart()
  $('p-record')
    .querySelectorAll('.top button')
    .forEach(b => (b.onclick = () => selectTreaty(byId.get(b.dataset.id))))
  $('p-timeline').innerHTML = `<ul class="tl">${f.timeline
    .map(
      ([y, s]) =>
        `<li class="${
          y >= Y0 && y <= Y1 ? 'yr' : ''
        }" data-y="${y}"><b>${y}</b><span>${esc(s)}</span></li>`
    )
    .join(
      ''
    )}</ul><p class="note">Select a year from 1784 to 1911 to show the land ceded by then.</p>`
  $('p-timeline')
    .querySelectorAll('li.yr')
    .forEach(
      li =>
        (li.onclick = () => {
          setYearMode(true)
          setYear(+li.dataset.y)
        })
    )
  $('p-sources').innerHTML = `<p class="know">${esc(
    f.know
  )}</p><div class="chips">${f.chips
    .map(x => `<span>${esc(x)}</span>`)
    .join('')}</div><ul class="src">${f.sources
    .map(srcItem)
    .join(
      ''
    )}</ul><p class="note">The cession boundaries follow Claudio Saunt’s digitization of Royce’s maps for The Invasion of America.</p>`
  if ($('t-text').getAttribute('aria-selected') === 'true') tab('record')
  recenter()
  applyFilter()
  try {
    history.replaceState(null, '', '#overview')
  } catch {}
}

function selectTreaty (t, opts = {}) {
  const f = featById.get(t.id) || null
  current = f
  currentTreaty = t
  selSet = new Set(t.c || [])
  selZone = null
  f
    ? setAccent(f.accent, f.soft)
    : setAccent(...ACCENTS[t.k === 'V' ? 'T' : t.k === 'A' ? 'A' : 'U'])
  document
    .querySelectorAll('.card')
    .forEach(b => b.setAttribute('aria-pressed', !!f && b.dataset.k === f.key))
  const where = t.p ? `at ${t.p}` : 'at an unrecorded place'
  const lede = f
    ? f.lede
    : `Signed ${where} on ${fmtDate(t.d)} with the ${
        listOf(t.n) || 'nations named in the text'
      }. ${
        t.c
          ? `Royce maps ${plural(t.c.length, 'area')} under it, ${fmtAcres(
              t.ac
            )} acres.`
          : 'Royce maps no cession under it.'
      }`
  header(
    `${KIND[t.k]}${t.rit ? ` · National Archives no. ${t.rit}` : ''}`,
    '',
    titleOf(t),
    lede
  )
  kv([
    ['Signed', fmtDate(t.d)],
    ['Place', t.p || 'Not recorded'],
    ['Acres in mapped areas', t.ac ? fmtAcres(t.ac) : 'None mapped'],
    audited(t)
      ? [
          'Payment promised',
          t.sc
            ? fmtMoney(t.sc)
            : t.pp
            ? fmtMoney(t.pp) + ' a year'
            : t.pk === 'P'
            ? 'From land sales'
            : 'None named'
        ]
      : [
          'Status',
          t.k === 'V'
            ? 'Ratified'
            : t.k === 'A'
            ? 'Ratified by statute'
            : t.k === 'R'
            ? 'Rejected'
            : 'Unratified'
        ]
  ])
  $('t-text').hidden = false
  $('p-record').innerHTML = treatyCards(t).map(card).join('')
  wireCards($('p-record'))
  const areas = t.c || []
  const laterDates = [
    ...new Set(
      areas.flatMap(n => {
        const c = C[n],
          i = c.t.findIndex(ids => ids.includes(t.id))
        return c.d.filter((d, j) => j > i)
      })
    )
  ].sort()
  const auto = [
    [t.y, `Signed ${where}, ${fmtDate(t.d)}.`],
    ...laterDates.map(d => [
      +d.slice(0, 4),
      `Royce’s schedule enters the same land again on ${fmtDate(d)}.`
    ])
  ]
  const rows = f ? f.timeline : auto
  $('p-timeline').innerHTML = `<ul class="tl">${rows
    .map(
      ([y, s]) =>
        `<li class="${
          y >= Y0 && y <= Y1 ? 'yr' : ''
        }" data-y="${y}"><b>${y}</b><span>${esc(s)}</span></li>`
    )
    .join(
      ''
    )}</ul><p class="note">Select a year to show the land ceded by then.</p>`
  $('p-timeline')
    .querySelectorAll('li.yr')
    .forEach(
      li =>
        (li.onclick = () => {
          setYearMode(true)
          setYear(+li.dataset.y)
        })
    )
  const own = []
  if (t.naid)
    own.push(
      [
        `Ratified Indian Treaty ${t.rit}, National Archives catalog`,
        `https://catalog.archives.gov/id/${t.naid}`
      ],
      [
        'Treaties Explorer record and page viewer',
        `https://digitreaties.org/treaties/treaty/${t.naid}/`
      ]
    )
  const seen = new Set()
  areas.forEach(n => {
    const c = C[n],
      i = c.t.findIndex(ids => ids.includes(t.id))
    ;[
      [
        c.kp && c.kp[i],
        'Kappler, Indian Affairs: Laws and Treaties, vol. 2 (HathiTrust page)'
      ],
      [c.rs && c.rs[i], `Royce’s schedule entry for area ${n}`],
      [c.mp, `Royce map: ${c.mn || 'area ' + n} (Library of Congress)`]
    ].forEach(([url, label]) => {
      if (url && !seen.has(url)) {
        seen.add(url)
        own.push([label, url])
      }
    })
  })
  $('p-sources').innerHTML =
    (f
      ? `<p class="know">${esc(f.know)}</p><div class="chips">${f.chips
          .map(x => `<span>${esc(x)}</span>`)
          .join('')}</div>`
      : '') +
    `<ul class="src">${(f
      ? f.sources.filter(s => s !== 'nara' && s !== 'royce')
      : []
    )
      .map(srcItem)
      .join('')}${own.slice(0, 14).map(srcItem).join('')}${[
      'spirling',
      'usfs',
      'lgu'
    ]
      .map(srcItem)
      .join('')}</ul>`
  $('p-text').dataset.id = ''
  if ($('t-text').getAttribute('aria-selected') === 'true') fillText(t)
  if (yearMode && t.y > year) setYear(t.y)
  areas.length ? flyToCessions(opts.focus ? [opts.focus] : areas) : recenter()
  applyFilter()
  try {
    history.replaceState(null, '', '#' + (f ? f.key : t.id))
  } catch {}
  if (innerWidth <= 1240 && !opts.quiet)
    $('panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

function selectCession (n) {
  const c = C[n]
  current = null
  currentTreaty = null
  selSet = new Set([n])
  selZone = null
  setAccent(...ACCENTS[c.k])
  document
    .querySelectorAll('.card')
    .forEach(b => b.setAttribute('aria-pressed', false))
  header(
    clsName[c.k],
    '',
    `Royce Area ${n}`,
    `${
      c.nat || 'Nations not named in the schedule'
    }. Royce first enters this area ${
      c.d.length ? 'on ' + fmtDate(c.d[0]) : 'without a date'
    }, under ${BASIS[c.k]}.`
  )
  kv([
    ['First entry', c.d.length ? fmtDate(c.d[0]) : 'Undated'],
    ['Basis', clsName[c.k]],
    ['Acres', fmtAcres(c.ac)],
    ['States', c.st || 'Not recorded']
  ])
  $('t-text').hidden = true
  const entries = c.d
    .map(
      (d, j) =>
        `<li><b>${fmtDate(d)}</b><small>${
          c.t[j].length
            ? c.t[j]
                .map(
                  id =>
                    `<button data-t="${id}">${esc(
                      titleOf(byId.get(id))
                    )}</button>`
                )
                .join(' · ')
            : 'By act of Congress, executive order or other measure.'
        }${
          c.rs && c.rs[j] ? ' · ' + link(c.rs[j], 'schedule entry') : ''
        }</small></li>`
    )
    .join('')
  const docs = [
    c.fs ? link(c.fs, 'Statutes at Large volume (Library of Congress)') : '',
    c.eo
      ? link(c.eo, 'Executive order text (eHistory, University of Georgia)')
      : '',
    c.mp ? link(c.mp, `Royce map${c.mn ? ', ' + c.mn : ''}`) : ''
  ].filter(Boolean)
  const cards = [
    [
      'Schedule Entries',
      `${plural(c.d.length, 'date')} in Royce’s schedule.`,
      `<ul class="rows">${entries}</ul>`
    ]
  ]
  if (docs.length)
    cards.push([
      'Documents',
      'The statutes, orders and maps for this area.',
      `<ul class="rows">${docs.map(d => `<li>${d}</li>`).join('')}</ul>`
    ])
  const lt = landToday(c.ac, c.ra, c.nf, c.lg ? c.lg.slice(0, 3) : null, c.fn)
  if (lt) cards.push(lt)
  if (c.now && c.now.length)
    cards.push([
      'Nations Today',
      `${plural(
        c.now.length,
        'federally recognized nation'
      )} linked to this land.`,
      `<p>${c.now.map(esc).join('; ')}.</p>`
    ])
  $('p-record').innerHTML = cards.map(card).join('')
  wireCards($('p-record'))
  $('p-record').querySelector('.st button').click()
  $('p-timeline').innerHTML = `<ul class="tl">${c.d
    .map(
      d =>
        `<li class="yr" data-y="${d.slice(0, 4)}"><b>${d.slice(
          0,
          4
        )}</b><span>Schedule entry dated ${fmtDate(d)}.</span></li>`
    )
    .join('')}</ul>`
  $('p-timeline')
    .querySelectorAll('li.yr')
    .forEach(
      li =>
        (li.onclick = () => {
          setYearMode(true)
          setYear(+li.dataset.y)
        })
    )
  $('p-sources').innerHTML = `<ul class="src">${[
    c.rs && c.rs[0]
      ? srcItem([`Royce’s schedule entry for area ${n}`, c.rs[0]])
      : '',
    ...['usfs', 'saunt', 'royce'].map(srcItem)
  ].join('')}</ul>`
  if ($('t-text').getAttribute('aria-selected') === 'true') tab('record')
  flyToCessions([n])
  applyFilter()
  try {
    history.replaceState(null, '', '#area-' + n)
  } catch {}
  if (innerWidth <= 1240)
    $('panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}
function selectZone (z) {
  const zone = ZONES[z],
    f = FEATURED.find(x => x.zone === z) || null,
    feats = zoneFeatures(z)
  current = f
  currentTreaty = null
  selSet = null
  selZone = z
  setAccent(...ACCENTS.OUT)
  document
    .querySelectorAll('.card')
    .forEach(b => b.setAttribute('aria-pressed', !!f && b.dataset.k === f.key))
  header('Taken without a federal treaty', '', zone.title, zone.lede)
  kv([
    ['Acres', fmtAcres(d3.sum(feats, x => x.properties.a))],
    ['Basis', zone.basis],
    [
      'Nations',
      zone.nations.length > 3
        ? `${zone.nations.length} named`
        : zone.nations.join(', ') || 'Many'
    ],
    ['Dated', zone.dated]
  ])
  $('t-text').hidden = true
  const cards = zone.record.map(([a, b, c]) => [a, b, para(c)])
  if (zone.area)
    cards.push([
      'Royce’s Record',
      `Area ${zone.area}.`,
      `<ul class="rows"><li><button data-cn="${zone.area}">Royce area ${
        zone.area
      }</button><small>${esc(C[zone.area].nat)} · ${C[zone.area].d
        .map(fmtDate)
        .join(' and ')}</small></li></ul>`
    ])
  if (zone.nations.length)
    cards.push([
      'Nations',
      `${plural(zone.nations.length, 'nation')} whose land this was.`,
      `<p>${zone.nations.map(esc).join('; ')}.</p>`
    ])
  $('p-record').innerHTML = cards.map(card).join('')
  wireCards($('p-record'))
  $('p-timeline').innerHTML = `<ul class="tl">${zone.timeline
    .map(
      ([y, s]) =>
        `<li class="${
          y >= Y0 && y <= Y1 ? 'yr' : ''
        }" data-y="${y}"><b>${y}</b><span>${esc(s)}</span></li>`
    )
    .join('')}</ul>`
  $('p-timeline')
    .querySelectorAll('li.yr')
    .forEach(
      li =>
        (li.onclick = () => {
          setYearMode(true)
          setYear(+li.dataset.y)
        })
    )
  $('p-sources').innerHTML = `<ul class="src">${zone.sources
    .map(srcItem)
    .join('')}${['royce', 'usfs'].map(srcItem).join('')}</ul>`
  if ($('t-text').getAttribute('aria-selected') === 'true') tab('record')
  const [[x0, y0], [x1, y1]] = path.bounds({
    type: 'FeatureCollection',
    features: feats
  })
  const k = Math.max(
    1,
    Math.min(zMax, 0.6 / Math.max((x1 - x0) / W, (y1 - y0) / H))
  )
  svg
    .transition()
    .duration(matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 750)
    .call(
      zoom.transform,
      d3.zoomIdentity
        .translate(W / 2, H / 2)
        .scale(k)
        .translate(-(x0 + x1) / 2, -(y0 + y1) / 2)
    )
  applyFilter()
  try {
    history.replaceState(null, '', '#' + (f ? f.key : 'land-' + z))
  } catch {}
  if (innerWidth <= 1240)
    $('panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}
function pickCession (n) {
  const t = firstTreaty(n)
  t ? selectTreaty(t, { focus: n }) : selectCession(n)
}

/* ---------- overview charts ---------- */
function chartHTML () {
  return `<div class="chart"><h3>Land Ceded, 1784 to 1894</h3><p>Cumulative acres in Royce’s schedule, by date of first entry. Select a year to show it on the map.</p><svg id="chart" viewBox="0 0 340 170" aria-label="Line chart of cumulative acres ceded, reaching ${fmtAcres(
    TOTAL
  )} by 1894"></svg></div>`
}
function topHTML () {
  const top = T.filter(t => t.fa)
      .sort((a, b) => b.fa - a.fa)
      .slice(0, 12),
    max = top[0].fa
  return `<div class="ops top"><h3>Largest Cessions by Treaty</h3><p>Million acres first entered in Royce’s schedule under each treaty.</p>${top
    .map(
      t =>
        `<button data-id="${t.id}"><span>${esc(
          featById.has(t.id)
            ? featById.get(t.id).name + ', ' + t.y
            : t.n.slice(0, 2).join(', ') +
                (t.n.length > 2 ? ' and others' : '') +
                ', ' +
                t.y
        )}</span><i style="width:${
          (t.fa / max) * 100
        }%;background:${THEME.treaty}"></i><em>${(t.fa / 1e6).toFixed(1)}</em></button>`
    )
    .join('')}</div>`
}
function opsHTML () {
  const max = Math.max(...Object.values(BY_CLASS))
  return `<div class="ops" aria-label="Acres by legal basis"><h3>Acres by Legal Basis</h3><p>Million acres, by the earliest treaty, statute or order Royce records for each area.</p>${CLS.map(
    ([k, n, c]) =>
      `<div><span>${n}</span><i style="width:${Math.max(
        0.5,
        (BY_CLASS[k] / max) * 100
      )}%;background:${c}"></i><em>${(BY_CLASS[k] / 1e6).toFixed(1)}</em></div>`
  ).join('')}</div>`
}
function wireChart () {
  const el = d3.select('#chart'),
    m = { l: 34, r: 12, t: 10, b: 24 },
    w = 340,
    h = 170
  const x = d3.scaleLinear([Y0, YR_END], [m.l, w - m.r]),
    y = d3.scaleLinear([0, 1.8e9], [h - m.b, m.t])
  el.append('path')
    .datum(CUM)
    .attr('fill', THEME.chart)
    .attr('fill-opacity', 0.16)
    .attr(
      'd',
      d3
        .area()
        .x(d => x(d.y))
        .y0(y(0))
        .y1(d => y(d.a))
    )
  el.append('path')
    .datum(CUM)
    .attr('fill', 'none')
    .attr('stroke', THEME.chart)
    .attr('stroke-width', 0.7)
    .attr(
      'd',
      d3
        .line()
        .x(d => x(d.y))
        .y(d => y(d.a))
    )
  const ax = el.append('g').attr('transform', `translate(0,${h - m.b})`)
  ax.append('line')
    .attr('x1', m.l)
    .attr('x2', w - m.r)
    .attr('stroke', THEME.ink)
    .attr('stroke-width', 0.6)
  d3.range(1785, YR_END + 1, 5).forEach(v =>
    ax
      .append('line')
      .attr('x1', x(v))
      .attr('x2', x(v))
      .attr('y2', v % 25 ? 2 : 4)
      .attr('stroke', THEME.ink)
      .attr('stroke-width', 0.6)
  )
  ;[1800, 1825, 1850, 1875].forEach(v =>
    ax
      .append('text')
      .attr('x', x(v))
      .attr('y', 15)
      .attr('text-anchor', 'middle')
      .text(v)
  )
  const ay = el.append('g')
  ay.append('line')
    .attr('x1', m.l)
    .attr('x2', m.l)
    .attr('y1', m.t)
    .attr('y2', h - m.b)
    .attr('stroke', THEME.ink)
    .attr('stroke-width', 0.6)
  d3.range(0, 1.8e9 + 1, 2e8).forEach(v =>
    ay
      .append('line')
      .attr('x1', m.l)
      .attr('x2', m.l - (v % 6e8 ? 2 : 4))
      .attr('y1', y(v))
      .attr('y2', y(v))
      .attr('stroke', THEME.ink)
      .attr('stroke-width', 0.6)
  )
  ;[0, 6e8, 1.2e9, 1.8e9].forEach(v =>
    ay
      .append('text')
      .attr('x', m.l - 7)
      .attr('y', y(v) + 3.5)
      .attr('text-anchor', 'end')
      .text(v ? (v / 1e9).toFixed(1) + 'B' : '0')
  )
  const cur = el.append('g').style('display', 'none')
  cur
    .append('line')
    .attr('y1', m.t)
    .attr('y2', h - m.b)
    .attr('stroke', THEME.ink)
    .attr('stroke-width', 0.5)
  const ct = cur.append('text').attr('y', m.t + 8)
  el.on('pointermove', e => {
    const [px] = d3.pointer(e),
      yy = Math.round(Math.max(Y0, Math.min(YR_END, x.invert(px))))
    cur.style('display', null).attr('transform', `translate(${x(yy)},0)`)
    ct.attr('x', yy > 1840 ? -4 : 4)
      .attr('text-anchor', yy > 1840 ? 'end' : 'start')
      .text(`${yy}: ${fmtAcres(cumAt(yy))}`)
  })
    .on('pointerleave', () => cur.style('display', 'none'))
    .on('click', e => {
      const [px] = d3.pointer(e)
      setYearMode(true)
      setYear(Math.round(x.invert(px)))
      stageEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
}

/* ---------- search across all treaties and areas ---------- */
const INDEX = [
  ...T.map(t => ({
    t,
    s: `${titleOf(t)} ${t.n.join(' ')} ${t.p} ${t.s} ${t.y} ${KIND[t.k]} ${
      t.rit ? 'rit ' + t.rit : ''
    } ${t.id}`.toLowerCase()
  })),
  ...cessionList.map(c => ({
    c,
    s: `royce area ${c.n} ${c.nat} ${c.st} ${(c.now || []).join(
      ' '
    )}`.toLowerCase()
  }))
]
let hits = [],
  hi = -1
$('q').oninput = e => {
  const q = e.target.value.trim().toLowerCase(),
    box = $('results')
  const words = q.split(/\s+/).filter(Boolean)
  hits = words.length
    ? INDEX.filter(x => words.every(w => x.s.includes(w)))
        .sort(
          (a, b) =>
            !!b.t - !!a.t ||
            (a.t && b.t
              ? featById.has(b.t.id) - featById.has(a.t.id) ||
                !!b.t.c - !!a.t.c ||
                a.t.d.localeCompare(b.t.d)
              : cessionSort(a.c.n, b.c.n))
        )
        .slice(0, 12)
    : []
  hi = -1
  box.innerHTML = hits.length
    ? hits
        .map((x, i) =>
          x.t
            ? `<button role="option" data-i="${i}">${esc(
                titleOf(x.t)
              )}<small>${fmtDate(x.t.d)}${x.t.p ? ' · ' + esc(x.t.p) : ''} · ${
                KIND[x.t.k]
              }</small></button>`
            : `<button role="option" data-i="${i}">Royce area ${esc(
                x.c.n
              )}<small>${esc(x.c.nat)} · ${
                x.c.d.length ? x.c.d[0].slice(0, 4) : 'undated'
              } · ${fmtAcres(x.c.ac)} acres</small></button>`
        )
        .join('')
    : q
    ? '<button disabled>No matching treaties or areas</button>'
    : ''
  box.classList.toggle('on', !!q)
  box
    .querySelectorAll('[data-i]')
    .forEach(b => (b.onclick = () => pick(hits[b.dataset.i])))
}
function pick (x) {
  $('results').classList.remove('on')
  $('q').value = ''
  $('q').blur()
  x.t ? selectTreaty(x.t) : pickCession(x.c.n)
}
$('q').onkeydown = e => {
  const btns = [...$('results').querySelectorAll('[data-i]')]
  if (e.key === 'Escape') {
    e.target.value = ''
    $('results').classList.remove('on')
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault()
    if (!btns.length) return
    hi = (hi + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length
    btns.forEach((b, i) => b.classList.toggle('hi', i === hi))
    btns[hi].scrollIntoView({ block: 'nearest' })
  } else if (e.key === 'Enter' && hits.length) pick(hits[Math.max(0, hi)])
}
document.addEventListener('pointerdown', e => {
  if (!e.target.closest('.search')) $('results').classList.remove('on')
})

/* ---------- start ---------- */
let lastW = 0
new ResizeObserver(() => {
  if (mapEl.clientWidth === lastW) return
  lastW = mapEl.clientWidth
  draw()
  svg.call(zoom.transform, d3.zoomIdentity)
  if (selZone) selectZone(selZone)
  else if (selSet && selSet.size) flyToCessions([...selSet])
}).observe(mapEl)
draw()
function route (quiet) {
  const k = decodeURIComponent(location.hash.slice(1))
  if (featByKey[k])
    return featByKey[k].t && !featByKey[k].zone
      ? selectTreaty(featByKey[k].t, { quiet })
      : select(k)
  if (byId.has(k)) return selectTreaty(byId.get(k), { quiet })
  if (k.startsWith('area-') && C[k.slice(5)]) return selectCession(k.slice(5))
  if (k.startsWith('land-') && ZONES[k.slice(5)]) return selectZone(k.slice(5))
  select('overview')
}
route(true)
addEventListener('hashchange', () => {
  const k = decodeURIComponent(location.hash.slice(1))
  const now = current ? current.key : currentTreaty ? currentTreaty.id : ''
  if (k && k !== now) route(false)
})
