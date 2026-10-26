'use strict';
// 고객용 견적 계산 (서버에서만 실행됩니다. 단가·일당은 고객에게 내려가지 않고, 금액 범위만 돌려줍니다)
// 계산 방식은 사장님 프로그램의 "빠른 견적"과 같습니다. (평형 x 시공면적 배수 = 시공 면적)
const PY = 3.3058;
const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
const halfUp = x => Math.ceil(x * 2 - 1e-9) / 2;

function groupOf(name) {
  const s = String(name || '');
  if (/작은방/.test(s)) return 'small';
  if (/안방/.test(s)) return 'master';
  if (/드레스/.test(s)) return 'dress';
  if (/현관|복도/.test(s)) return 'entry';
  return 'living';   // 거실, 주방, 거실·주방, 주방·식당
}

function parts(cfg, r) {   // 방 하나의 벽 면적과 천장 면적 (㎡)
  const w = num(r.w), d = num(r.d), h = num(r.h);
  const wall = Math.max(0, 2 * (w + d) * h - num(r.doors) * num(cfg.doorArea) - num(r.windows) * num(cfg.windowArea));
  return { wall, ceil: w * d };
}

function nearestPreset(cfg, py) {
  const list = (cfg.presets || []).filter(p => p && p.py > 0 && Array.isArray(p.rooms) && p.rooms.length);
  if (!list.length) return null;
  return list.slice().sort((a, b) => Math.abs(a.py - py) - Math.abs(b.py - py))[0];
}

function groups(cfg, preset) {   // 기본 평형의 방들을 종류별로 묶음
  const g = {};
  preset.rooms.forEach(r => {
    const k = groupOf(r.name), p = parts(cfg, r);
    const o = g[k] || (g[k] = { wall: 0, ceil: 0, n: 0 });
    o.wall += p.wall; o.ceil += p.ceil; o.n += 1;
  });
  return g;
}

// 고객 화면이 처음에 채울 값(그 평형에 작은방이 몇 개인지 등). 단가는 들어 있지 않음
function layouts(cfg) {
  return (cfg.presets || []).map(p => {
    const g = groups(cfg, p);
    return { py: p.py, small: g.small ? g.small.n : 0, dress: !!g.dress, entry: !!g.entry };
  });
}

const FALLBACK = {   // 기본 평형에 없는 공간을 고객이 고르면 쓰는 일반적인 크기
  small: { w: 3, d: 3, h: 2.3, doors: 1, windows: 1 },
  dress: { w: 2.4, d: 1.8, h: 2.3, doors: 1, windows: 0 },
  entry: { w: 3, d: 1.2, h: 2.3, doors: 2, windows: 0 },
  master: { w: 4, d: 3.5, h: 2.3, doors: 2, windows: 1 },
};

function laborOf(cfg, pyeong, paper) {
  if (cfg.laborMode !== 'gongsu') return pyeong * num(paper.laborPerPy);
  const perDay = num(cfg.pyPerDay);
  const techDays = perDay > 0 ? halfUp(pyeong / perDay) : 0;
  const helperDays = halfUp(techDays * num(cfg.helperRatio));
  return techDays * num(cfg.techDay) + helperDays * num(cfg.helperDay);
}

// 입력 검사 + 계산. 잘못된 값이면 { error } 를 돌려줌
function estimate(cfg, input) {
  if (!cfg || !Array.isArray(cfg.materials) || !cfg.materials.length) return { error: '아직 견적 준비 중입니다.' };
  const py = num(input && input.py);
  if (!(py >= 10 && py <= 120)) return { error: '평수는 10 ~ 120 사이로 입력해 주세요.' };
  const sp = (input && input.spaces) || {};
  const small = Math.floor(num(sp.small));
  if (small < 0 || small > 6) return { error: '작은방은 0 ~ 6개까지 고를 수 있어요.' };
  const want = { living: !!sp.living, master: !!sp.master, dress: !!sp.dress, entry: !!sp.entry };
  if (!want.living && !want.master && !want.dress && !want.entry && small === 0) return { error: '도배할 공간을 하나 이상 골라 주세요.' };
  const paper = cfg.materials.find(m => m.id === (input && input.paper));
  if (!paper) return { error: '벽지 종류를 골라 주세요.' };
  const preset = nearestPreset(cfg, py);
  if (!preset) return { error: '아직 견적 준비 중입니다.' };

  const g = groups(cfg, preset);
  let fullTotal = 0;
  Object.keys(g).forEach(k => { fullTotal += g[k].wall + g[k].ceil; });
  const baseM2 = py * num(cfg.quickFactor) * PY;       // 모든 공간·천장 포함했을 때의 시공 면적
  const scale = fullTotal > 0 ? baseM2 / fullTotal : 1;  // 고른 평수에 맞게 기본 평형의 방을 키우거나 줄임

  const one = (k, count) => {   // 종류 k 의 방 count 개 면적
    if (g[k]) { const per = { wall: g[k].wall / g[k].n, ceil: g[k].ceil / g[k].n }; return { wall: per.wall * count, ceil: per.ceil * count }; }
    const p = parts(cfg, FALLBACK[k]);
    return { wall: p.wall * count * scale, ceil: p.ceil * count * scale };
  };
  let wall = 0, ceil = 0;
  const add = (o) => { wall += o.wall; ceil += o.ceil; };
  if (want.living && g.living) add({ wall: g.living.wall, ceil: g.living.ceil });
  if (want.master) add(one('master', 1));
  if (small > 0) add(one('small', small));
  if (want.dress) add(one('dress', 1));
  if (want.entry) add(one('entry', 1));
  const withCeiling = input.ceiling !== false;
  const totalM2 = scale * (wall + (withCeiling ? ceil : 0));

  const pyeong = Math.ceil((totalM2 / PY) * 10) / 10;
  const rollM2 = num(paper.rollWidth) * num(paper.rollLength);
  const rolls = rollM2 > 0 ? Math.ceil(totalM2 * (1 + num(paper.lossRate) / 100) / rollM2) : 0;
  const material = rolls * num(paper.rollPrice);
  const labor = laborOf(cfg, pyeong, paper);
  const supplies = pyeong * num(cfg.suppliesPerPy);
  const demo = input.demolition ? pyeong * num(cfg.demoPerPy) : 0;
  const subtotal = Math.max(0, material + labor + supplies + demo);
  const vat = cfg.vat ? Math.round(subtotal * 0.1) : 0;
  const total = subtotal + vat;
  const round = n => Math.round(n / 10000) * 10000;
  return {
    ok: true, total,   // total 은 서버 안에서만 쓰고 고객에게는 돌려주지 않음 (api/estimate.js 참고)
    low: round(total * (1 - num(cfg.rangeLow) / 100)),
    high: round(total * (1 + num(cfg.rangeHigh) / 100)),
    pyeong, vat: !!cfg.vat,
  };
}

module.exports = { estimate, layouts, groupOf, PY };
