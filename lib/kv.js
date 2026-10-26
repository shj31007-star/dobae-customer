'use strict';
// 작은 저장소(Upstash Redis). 버셀의 Storage 에서 만들어 프로젝트에 연결하면 아래 환경변수가 자동으로 생깁니다.
// 별도 라이브러리 없이 REST 주소로 직접 부릅니다.
function conf() {
  return {
    url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
  };
}

async function cmd(args) {
  const { url, token } = conf();
  if (!url || !token) throw new Error('저장소가 연결되지 않았습니다 (버셀 Storage 연결 필요)');
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  let j = {};
  try { j = await r.json(); } catch (e) { /* 아래에서 처리 */ }
  if (!r.ok || j.error) throw new Error(String(j.error || ('저장소 응답 ' + r.status)));
  return j.result;
}

const get = async key => { const v = await cmd(['GET', key]); return v == null ? null : v; };
const set = (key, value) => cmd(['SET', key, value]);
const incr = key => cmd(['INCR', key]);
const expire = (key, sec) => cmd(['EXPIRE', key, String(sec)]);

module.exports = { get, set, incr, expire, configured: () => !!(conf().url && conf().token) };
