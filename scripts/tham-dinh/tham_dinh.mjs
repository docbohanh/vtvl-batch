#!/usr/bin/env node
// Chạy lõi thẩm định (TD) của công cụ web ThamDinh_BoBieu_VTVL.html trên một tệp bộ biểu .xlsx, ngay trên máy (Node).
// Dùng: node tham_dinh.mjs <tep.xlsx> [--don-vi "Tên"] [--xac-nhan] [--so-van-ban "12/BC ngày 01/11/2026"]
//        [--khoi "Cấp xã"] [--tool <ThamDinh_BoBieu_VTVL.html>] [--json ra.json] [--chi-tiet 5] [--duyet-giai-trinh]
// Không gửi dữ liệu ra ngoài; chỉ tải tệp công cụ (không kèm dữ liệu đơn vị) về bộ nhớ đệm lần đầu.
import fs from 'fs'; import os from 'os'; import path from 'path'; import vm from 'vm'; import https from 'https';

const TOOL_URL = 'https://vbai.tracuu.lamdong.vn/vtvl/ThamDinh_BoBieu_VTVL.html';
const args = process.argv.slice(2);
const flag = n => args.includes(n);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && i + 1 < args.length ? args[i + 1] : d; };
const file = args.find(a => !a.startsWith('--') && /\.xlsx?m?$/i.test(a));
if (!file) { console.error('Thiếu tệp .xlsx. Xem đầu tệp script để biết cách dùng.'); process.exit(2); }

function download(url) {
  return new Promise((res, rej) => https.get(url, r => {
    if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) return res(download(r.headers.location));
    if (r.statusCode !== 200) return rej(new Error('HTTP ' + r.statusCode));
    const b = []; r.on('data', c => b.push(c)); r.on('end', () => res(Buffer.concat(b)));
  }).on('error', rej));
}
async function loadTool() {
  const given = opt('--tool');
  if (given) return fs.readFileSync(given, 'utf8');
  const cache = path.join(os.homedir(), '.cache', 'vtvl-tham-dinh', 'ThamDinh_BoBieu_VTVL.html');
  if (fs.existsSync(cache)) return fs.readFileSync(cache, 'utf8');
  const buf = await download(TOOL_URL);
  fs.mkdirSync(path.dirname(cache), { recursive: true }); fs.writeFileSync(cache, buf);
  return buf.toString('utf8');
}

const html = await loadTool();
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const win = {}; const ctx = { window: win, self: win, console: { log() {}, warn() {}, error() {} }, TextEncoder, TextDecoder, setTimeout, Uint8Array, ArrayBuffer };
ctx.globalThis = ctx; vm.createContext(ctx);
// Chỉ nạp các khối lõi (thư viện + engine), bỏ khối giao diện dùng document.
scripts.forEach((s, i) => { if (s.length < 50 || s.includes('document.getElementById') || s.includes("$('#")) return; try { vm.runInContext(s, ctx, { filename: 'khoi' + i }); } catch (e) { process.stderr.write('Bỏ qua khối ' + i + ': ' + String(e).slice(0, 80) + '\n'); } });
const XLSX = ctx.XLSX || win.XLSX, TD = win.TD;
if (!TD || !XLSX) { console.error('Không nạp được lõi TD – công cụ có thể đã đổi cấu trúc.'); process.exit(3); }

const wb = XLSX.read(new Uint8Array(fs.readFileSync(file)), { type: 'array', cellFormula: true, bookFiles: true });
const unit = { ten: opt('--don-vi', path.basename(file)), khoi: opt('--khoi', ''), xacNhan: flag('--xac-nhan'), soVanBan: opt('--so-van-ban', '') };
const res = TD.run(XLSX, wb, { fileName: path.basename(file), unit, specHeaders: win.TD_SPEC, lists: win.TD_LISTS });
// --duyet-giai-trinh: coi mọi nhóm CB là "đã giải trình" để thấy lỗi BB còn lại (chỉ để phân loại, không phải kết luận thật)
const review = {};
if (flag('--duyet-giai-trinh')) TD.conclude(res).groups.filter(g => g.muc === 'CB').forEach(g => { review[g.id] = 'giaitrinh'; });
const c = TD.conclude(res, review);

const nChiTiet = Number(opt('--chi-tiet', 3));
const L = [];
L.push(`# Thẩm định: ${unit.ten}`, `Công cụ: TD ${TD.VERSION}`, `Tệp: ${file}`, '');
L.push(`## Kết luận: ${c.ten}`, ...c.reasons.map(r => '- ' + r), '');
if (!unit.xacNhan) L.push('> Chưa truyền `--xac-nhan` nên HS02 (thiếu xác nhận người đứng đầu) có thể làm kết luận thành D; đó là do tham số, không phải lỗi bộ biểu.', '');
L.push('## Phiếu 12 nội dung', '| TT | Nội dung | Kết quả | BB | CB |', '|---|---|---|---|---|');
c.phieu.forEach(p => L.push(`| ${p.tt} | ${p.nd} | ${p.kq} | ${p.bb ?? ''} | ${p.cb ?? ''} |`));
L.push('', '## 18 chỉ số', '| TT | Chỉ số | Giá trị | Đánh giá |', '|---|---|---|---|');
res.indicators.forEach((x, i) => L.push(`| ${i + 1} | ${x.ten || x.name || ''} | ${x.gt} | ${x.danhgia} |`));
L.push('', '## Nhóm phát hiện (BB trước, rồi CB, TK)');
const order = { BB: 0, CB: 1, TK: 2 };
[...c.groups].sort((a, b) => order[a.muc] - order[b.muc]).forEach(g => {
  L.push(`### ${g.id} [${g.muc}] ×${g.n} – ${g.ten}`);
  g.items.slice(0, nChiTiet).forEach(f => L.push(`- ${f.bieu || ''}${f.cot ? '!' + f.cot : ''} dòng ${f.dong || '-'} ${f.ma ? '(' + f.ma + ')' : ''}: ${String(f.mota || '').slice(0, 160)}${f.giatri ? ' | ' + String(f.giatri).slice(0, 120) : ''}`));
});
console.log(L.join('\n'));
const jsonOut = opt('--json');
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ version: TD.VERSION, level: c.level, reasons: c.reasons, phieu: c.phieu, indicators: res.indicators, groups: c.groups.map(g => ({ id: g.id, muc: g.muc, n: g.n, ten: g.ten, items: g.items })) }, null, 1));
