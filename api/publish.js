'use strict';
// 사장님 프로그램 -> 서버: 단가 저장. 관리 열쇠(ADMIN_KEY)가 맞아야만 저장됩니다.
const crypto = require('crypto');
const kv = require('../lib/kv');

const MAX_BODY = 200 * 1024;
const FAIL_LIMIT = 10;      // 열쇠를 이만큼 틀리면
const FAIL_WINDOW = 900;    // 15분 동안 잠금

function cors(res) {   // 사장님 프로그램(다른 주소)에서 부르기 때문에 필요. 열쇠 없이는 아무것도 못 함
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

const sameKey = (a, b) => {
  const h = s => crypto.createHash('sha256').update(String(s)).digest();
  return crypto.timingSafeEqual(h(a), h(b));
};

const text = (v, n = 60) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const nn = (v, max = 1e9) => { const n = parseFloat(v); return isFinite(n) && n >= 0 ? Math.min(n, max) : 0; };

// 받은 값을 걸러서 필요한 것만 저장 (이상한 값이 들어와도 그대로 저장하지 않음)
function clean(c) {
  const mats = (Array.isArray(c.materials) ? c.materials : []).slice(0, 30).map(m => ({
    id: text(m.id, 40), name: text(m.name, 40),
    rollWidth: nn(m.rollWidth, 5), rollLength: nn(m.rollLength, 100), rollPrice: nn(m.rollPrice, 1e7),
    lossRate: nn(m.lossRate, 100), laborPerPy: nn(m.laborPerPy, 1e7),
  })).filter(m => m.id && m.name);
  const presets = (Array.isArray(c.presets) ? c.presets : []).slice(0, 12).map(p => ({
    py: nn(p.py, 200),
    rooms: (Array.isArray(p.rooms) ? p.rooms : []).slice(0, 20).map(r => ({
      name: text(r.name, 30), w: nn(r.w, 30), d: nn(r.d, 30), h: nn(r.h, 6), doors: nn(r.doors, 10), windows: nn(r.windows, 10),
    })),
  })).filter(p => p.py > 0 && p.rooms.length);
  return {
    company: text(c.company), phone: text(c.phone, 30), vat: !!c.vat,
    materials: mats, presets,
    laborMode: c.laborMode === 'perPy' ? 'perPy' : 'gongsu',
    techDay: nn(c.techDay, 1e7), helperDay: nn(c.helperDay, 1e7), helperRatio: nn(c.helperRatio, 10), pyPerDay: nn(c.pyPerDay, 1000),
    suppliesPerPy: nn(c.suppliesPerPy, 1e6), demoPerPy: nn(c.demoPerPy, 1e6),
    doorArea: nn(c.doorArea, 20), windowArea: nn(c.windowArea, 20),
    quickFactor: nn(c.quickFactor, 10), rangeLow: nn(c.rangeLow, 100), rangeHigh: nn(c.rangeHigh, 300),
    updated: new Date().toISOString(),
  };
}

module.exports = async (req, res) => {
  cors(res);
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, msg: 'POST 만 가능합니다.' });
  try {
    const adminKey = process.env.ADMIN_KEY;
    if (!adminKey || adminKey.length < 8) return res.status(500).json({ ok: false, msg: '서버에 관리 열쇠(ADMIN_KEY)가 설정되지 않았습니다. 버셀 환경변수에 8글자 이상으로 넣어 주세요.' });
    if (!kv.configured()) return res.status(500).json({ ok: false, msg: '저장소가 연결되지 않았습니다. 버셀 Storage 에서 Redis 를 만들어 이 프로젝트에 연결해 주세요.' });
    const failKey = 'dobae:fails';
    const fails = Number(await kv.get(failKey)) || 0;
    if (fails >= FAIL_LIMIT) return res.status(429).json({ ok: false, msg: '열쇠를 여러 번 틀려서 잠시 잠겼습니다. 15분 뒤에 다시 시도해 주세요.' });
    const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    if (raw.length > MAX_BODY) return res.status(413).json({ ok: false, msg: '보내는 내용이 너무 큽니다.' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    if (!sameKey(body.key || '', adminKey)) {
      const n = await kv.incr(failKey);
      if (n === 1) await kv.expire(failKey, FAIL_WINDOW);
      return res.status(401).json({ ok: false, msg: '관리 열쇠가 맞지 않습니다.' });
    }
    const cfg = clean(body.config || {});
    if (!cfg.materials.length) return res.status(400).json({ ok: false, msg: '고객에게 보여 줄 벽지가 없습니다. 자재 · 단가에서 "고객 링크에 표시"를 체크해 주세요.' });
    if (!cfg.presets.length) return res.status(400).json({ ok: false, msg: '평형 정보가 없습니다.' });
    await kv.set('dobae:config', JSON.stringify(cfg));
    return res.status(200).json({ ok: true, materials: cfg.materials.length, updated: cfg.updated });
  } catch (e) {
    return res.status(500).json({ ok: false, msg: '저장하지 못했습니다: ' + String(e.message || e).slice(0, 120) });
  }
};
