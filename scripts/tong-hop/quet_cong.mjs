// Quét CHỈ ĐỌC (GET) B1, C3, D2 của mọi hồ sơ trong cache quản trị; ghi kết quả tóm tắt theo hồ sơ (có thể chạy tiếp).
// Ra tệp cùng định dạng `data/_chung/so-lieu-bao-cao.json` của ứng dụng (KhoSoLieu).
// Dùng: node quet_cong.mjs <lo.json> <quan-tri.json> <ra.json> [giới_hạn_hồ_sơ]
import fs from 'node:fs';
import crypto from 'node:crypto';
const [loPath, cachePath, raPath, gioiHan] = process.argv.slice(2);
const lo = JSON.parse(fs.readFileSync(loPath, 'utf8'));
const qt = lo.settings.taiKhoanQuanTri;
const BASE = lo.baseUrl.replace(/\/$/, '') + '/api/v1';
const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
const deviceId = JSON.parse(fs.readFileSync(new URL('../../data/_chung/thiet-bi.json', import.meta.url), 'utf8')).deviceId;
const TB = { 'x-device-id': deviceId, 'x-device-name': 'VTVL Batch', 'x-app-version': '1.2.8', 'x-platform': 'macos' };
const ngu = (ms) => new Promise((r) => setTimeout(r, ms));
let access = '', hetHan = 0;
async function dangNhap() {
  const r = await fetch(`${BASE}/auth/desktop/login`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json', ...TB }, body: JSON.stringify({ username: qt.username, password: qt.password, deviceId, deviceName: 'VTVL Batch', appVersion: '1.2.8', platform: 'macos' }) });
  if (!r.ok) throw new Error(`Đăng nhập thất bại: HTTP ${r.status}`);
  const j = await r.json(); access = j.accessToken; hetHan = Date.now() + (j.expiresIn ?? 600) * 1000 - 60000;
}
async function get(path, q = {}, lan = 0) {
  if (Date.now() > hetHan) await dangNhap();
  const u = new URL(BASE + path); Object.entries(q).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u, { headers: { accept: 'application/json', authorization: `Bearer ${access}`, ...TB } });
  if (r.status === 429 && lan < 6) { await ngu(Number(r.headers.get('retry-after') || 2) * 1000 * (lan + 1)); return get(path, q, lan + 1); }
  if (r.status === 401 && lan < 2) { hetHan = 0; return get(path, q, lan + 1); }
  if (!r.ok) throw new Error(`HTTP ${r.status} ${path}`);
  return r.json();
}
async function dong(id, khoa) {
  const ra = []; let tong = Infinity;
  for (let p = 1; ra.length < tong && p <= 50; p++) {
    const j = await get(`/submissions/${id}/forms/${khoa}`, { page: p, size: 500 });
    tong = j.total ?? 0; const it = (j.items ?? []).filter((d) => d.deleted !== true); if (!(j.items ?? []).length) break; ra.push(...it);
  }
  return ra;
}
const so = (v) => { if (typeof v === 'number') return Number.isFinite(v) ? v : 0; if (typeof v !== 'string') return 0; let t = v.trim().replace(/\s/g, ''); if (!/^[-+]?[\d.,]+$/.test(t)) return 0; if (t.includes(',') && t.includes('.')) t = t.replace(/\./g, '').replace(',', '.'); else if (t.includes(',')) t = t.replace(',', '.'); const n = Number(t); return Number.isFinite(n) ? n : 0; };
const NHU_CAU = { PP1: 'H', PP2: 'G', PP3: 'I' }; // cột người theo phương pháp của từng dòng C3
async function tomTat(h) {
  const L = {};
  for (const k of ['b1', 'c3', 'd2', 'a1', 'a2', 'c1']) L[k] = await dong(h.id, k);
  const d2Nam = {};
  for (const d of L.d2) { const n = so(d.data?.B); if (n) d2Nam[n] = (d2Nam[n] ?? 0) + so(d.data?.C); }
  return {
    id: h.id, pb: 2,
    gioB1: L.b1.reduce((t, d) => t + so(d.data?.G), 0),
    c3: L.c3.reduce((t, d) => t + so(d.data?.J), 0),
    d2: d2Nam,
    nhiemVu: L.a1.length, congViec: L.a2.length,
    sanPham: L.a2.filter((d) => String(d.data?.E ?? '').trim() !== '').length,
    vtvl: L.c1.length,
    nhuCau: L.c3.reduce((t, d) => t + so(d.data?.[NHU_CAU[String(d.data?.B ?? '').trim().toUpperCase()]]), 0),
  };
}
const kho = fs.existsSync(raPath) ? JSON.parse(fs.readFileSync(raPath, 'utf8')) : { quetLuc: '', kyId: cache.ky.id, ds: [] };
const kq = Object.fromEntries(kho.ds.filter((x) => x.pb === 2).map((x) => [x.id, x]));
const ds = cache.hoSo.filter((h) => !kq[h.id]).slice(0, gioiHan ? Number(gioiHan) : undefined);
console.log(`Cần quét ${ds.length} hồ sơ (đã có ${Object.keys(kq).length}).`);
const luu = () => fs.writeFileSync(raPath, JSON.stringify({ quetLuc: new Date().toISOString().replace(/\.\d+Z$/, 'Z'), kyId: cache.ky.id, ds: Object.values(kq) }));
await dangNhap();
let i = 0, loi = 0;
async function cong() {
  while (i < ds.length) {
    const h = ds[i++];
    try { kq[h.id] = await tomTat(h); } catch (e) { loi++; console.log(`LỖI ${h.ma}: ${e.message}`); }
    if ((i % 25) === 0) { luu(); console.log(`${i}/${ds.length}`); }
    await ngu(150);
  }
}
await Promise.all([cong(), cong(), cong()]);
luu();
console.log(`Xong. Có ${Object.keys(kq).length} hồ sơ, lỗi ${loi}.`);
