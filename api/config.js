'use strict';
// 고객 화면이 처음에 받는 정보: 업체 이름, 고를 수 있는 벽지 이름, 평형별 방 구성. 단가·인건비는 들어 있지 않음
const kv = require('../lib/kv');
const { layouts } = require('../lib/estimate');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ ready: false });
  try {
    const raw = kv.configured() ? await kv.get('dobae:config') : null;
    if (!raw) return res.status(200).json({ ready: false });
    const cfg = JSON.parse(raw);
    return res.status(200).json({
      ready: true,
      company: cfg.company, phone: cfg.phone, vat: !!cfg.vat,
      materials: cfg.materials.map(m => ({ id: m.id, name: m.name })),
      layouts: layouts(cfg),
    });
  } catch (e) {
    return res.status(200).json({ ready: false });
  }
};
