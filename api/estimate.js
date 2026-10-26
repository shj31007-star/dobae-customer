'use strict';
// 고객이 고른 조건으로 예상 금액 "범위"를 계산해서 돌려줌. 계산에 쓴 단가·합계 금액은 돌려주지 않음
const kv = require('../lib/kv');
const { estimate } = require('../lib/estimate');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, msg: 'POST 만 가능합니다.' });
  try {
    const raw = kv.configured() ? await kv.get('dobae:config') : null;
    if (!raw) return res.status(200).json({ ok: false, msg: '아직 견적 준비 중입니다. 잠시 후 다시 시도해 주세요.' });
    const input = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const r = estimate(JSON.parse(raw), input);
    if (r.error) return res.status(200).json({ ok: false, msg: r.error });
    return res.status(200).json({ ok: true, low: r.low, high: r.high, pyeong: r.pyeong, vat: r.vat });
  } catch (e) {
    return res.status(200).json({ ok: false, msg: '계산하지 못했습니다. 잠시 후 다시 시도해 주세요.' });
  }
};
