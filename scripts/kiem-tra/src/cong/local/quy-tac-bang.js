import { issue } from './loi.js';
import { codeKey } from './chuan-hoa.js';

/**
 * Quy tắc giữa các dòng và giữa các biểu (L2) của cổng, bản 1.2.8: trùng mã, khóa ngoại (A2→A1/C1, B1→A2, C2/D1→C1), căn cứ A1,
 * mô tả C2, mã sản phẩm B1 theo danh mục. Mỗi biểu cần đối chiếu là `null` khi tệp không có sheet đó thì bỏ qua quy tắc tương ứng.
 * (Quy tắc L3: trạng thái do lõi tính, ví dụ cảnh báo B1/B2/C3/D1/D2, nằm ở lõi `src/domain`, chưa đưa vào đây.)
 */

const val = (row, col) => row.data[col]?.trim() || null;
const codes = (rows, col = 'A') => new Set(rows.map((r) => val(r, col)).filter(Boolean));
const MAX_LISTED = 20;

/** "12, 15 và 3 dòng khác" (`kn` của cổng). */
function listText(items, total, noun) {
  const shown = items.slice(0, MAX_LISTED).join(', ');
  const rest = total - Math.min(items.length, MAX_LISTED);
  return rest > 0 ? `${shown} và ${rest.toLocaleString('vi-VN')} ${noun} khác` : shown;
}

function groupBy(rows, keyOf) {
  const map = new Map();
  rows.forEach((r, i) => { const k = keyOf(r); if (!k) return; const g = map.get(k); if (g) g.push(i); else map.set(k, [i]); });
  return map;
}

function duplicates(form, rows, groups, { label, code, suggestion }) {
  const out = [];
  for (const [display, idxs] of groups) {
    if (idxs.length < 2) continue;
    for (const i of idxs) {
      const others = idxs.filter((x) => x !== i).slice(0, MAX_LISTED).map((x) => rows[x].rowNo);
      const where = listText(others, idxs.length - 1, 'dòng');
      out.push(issue({ form, row: rows[i].rowNo, col: 'A', value: rows[i].data.A ?? '', code, severity: 'BLOCK', message: `${label} ${display} trùng với dòng ${where}.`, suggestion: suggestion(where) }));
    }
  }
  return out;
}
const byCode = (rows) => groupBy(rows, (r) => val(r, 'A'));

export function kiemTraA1(a1, a2) {
  const out = duplicates('a1', a1, byCode(a1), { label: 'Mã nhiệm vụ', code: 'VAL-006', suggestion: (w) => `Mã nhiệm vụ trùng với dòng ${w}. Đối chiếu mã nguồn và phạm vi.` });
  for (const r of a1) {
    const ma = val(r, 'A');
    const who = ma ?? `tại dòng ${r.rowNo}`;
    if (!val(r, 'D')) out.push(issue({ form: 'a1', row: r.rowNo, col: 'D', code: 'VAL-007', severity: 'PENDING', message: `Nhiệm vụ ${who} chưa có căn cứ.`, suggestion: 'Bổ sung căn cứ văn bản hoặc địa chỉ nguồn để kiểm chứng.' }));
    if (!val(r, 'G')) out.push(issue({ form: 'a1', row: r.rowNo, col: 'G', code: 'VAL-007', severity: 'PENDING', message: `Nhiệm vụ ${who} chưa có nguồn.`, suggestion: 'Bổ sung căn cứ văn bản hoặc địa chỉ nguồn để kiểm chứng.' }));
  }
  if (a2) {
    const count = new Map();
    for (const r of a2) { const b = val(r, 'B'); if (b) count.set(b, (count.get(b) ?? 0) + 1); }
    for (const r of a1) {
      const ma = val(r, 'A');
      if (ma && val(r, 'F') === 'Không còn thực hiện' && count.has(ma)) out.push(issue({ form: 'a1', row: r.rowNo, col: 'F', value: r.data.F ?? '', code: 'VAL-008', severity: 'WARNING', message: `Nhiệm vụ ${ma} còn ${count.get(ma)} công việc ở A2.`, suggestion: `Nhiệm vụ ${ma} còn ${count.get(ma)} công việc ở A2. Rà soát các công việc này.` }));
    }
  }
  return out;
}

export function kiemTraA2(a2, a1, c1) {
  const out = duplicates('a2', a2, byCode(a2), { label: 'Mã công việc', code: 'VAL-011', suggestion: () => 'Mã công việc phải duy nhất trong phạm vi và liên kết nhiệm vụ.' });
  const nv = a1 ? codes(a1) : null;
  const vt = c1 ? codes(c1) : null;
  for (const r of a2) {
    const b = val(r, 'B');
    const c = val(r, 'C');
    if (nv && !(b && nv.has(b))) out.push(issue({ form: 'a2', row: r.rowNo, col: 'B', value: r.data.B ?? '', code: 'VAL-009', severity: 'BLOCK', message: b ? `Mã nhiệm vụ ${b} chưa có ở biểu A1.` : 'Chưa có nhiệm vụ nguồn ở biểu A1.', suggestion: 'Chọn nhiệm vụ trong danh sách hoặc bổ sung ở A1.' }));
    if (vt && !(c && vt.has(c))) out.push(issue({ form: 'a2', row: r.rowNo, col: 'C', value: r.data.C ?? '', code: 'VAL-010', severity: 'BLOCK', message: c ? `Mã VTVL ${c} chưa có ở biểu C1.` : 'Chưa có mã VTVL nền ở biểu C1.', suggestion: 'Chọn VTVL trong danh sách hoặc bổ sung ở C1.' }));
  }
  const norm = (s) => s.replace(/\s+/g, ' ').toLowerCase();
  const prod = groupBy(a2, (r) => { const b = val(r, 'B'); const e = val(r, 'E'); return b && e ? `${b.toUpperCase()}\u0000${norm(e)}` : null; });
  for (const idxs of prod.values()) {
    if (idxs.length < 2) continue;
    for (const i of idxs) {
      const others = idxs.filter((x) => x !== i).slice(0, MAX_LISTED).map((x) => val(a2[x], 'A') ?? `dòng ${a2[x].rowNo}`);
      out.push(issue({ form: 'a2', row: a2[i].rowNo, col: 'E', value: a2[i].data.E ?? '', code: 'VAL-011', severity: 'WARNING', message: `Sản phẩm trùng với công việc ${listText(others, idxs.length - 1, 'công việc')}.`, suggestion: 'Kiểm tra để không thống kê trùng sản phẩm.' }));
    }
  }
  return out;
}

export const kiemTraC1 = (c1) => duplicates('c1', c1, byCode(c1), { label: 'Mã VTVL', code: 'VAL-011', suggestion: (w) => `Mã VTVL trùng với dòng ${w}. Mỗi mã VTVL chỉ một dòng ở C1: sửa mã hoặc xóa dòng trùng.` });

const C2_FIELDS = Object.freeze([['B', 'Trách nhiệm'], ['C', 'Năng lực chung'], ['D', 'Chuyên môn'], ['F', 'Căn cứ'], ['G', 'Nguồn bản mô tả']]);

export function kiemTraC2(c2, c1) {
  const out = duplicates('c2', c2, byCode(c2), { label: 'Mã VTVL', code: 'VAL-011', suggestion: () => 'Mỗi vị trí việc làm chỉ giữ một dòng mô tả, khung năng lực. Xóa hoặc gộp các dòng trùng.' });
  const base = c1 ? codes(c1) : null;
  if (base) {
    for (const r of c2) { const a = val(r, 'A'); if (a && !base.has(a)) out.push(issue({ form: 'c2', row: r.rowNo, col: 'A', value: r.data.A ?? '', code: 'VAL-010', severity: 'BLOCK', message: `Mã VTVL ${a} chưa có ở biểu C1.`, suggestion: 'Chọn mã VTVL trong danh sách hoặc bổ sung ở C1.' })); }
  }
  for (const r of c2) {
    for (const [col, title] of C2_FIELDS) {
      if (!val(r, col)) out.push(issue({ form: 'c2', row: r.rowNo, col, code: 'VAL-007', severity: 'WARNING', message: `VTVL ${val(r, 'A') ?? `tại dòng ${r.rowNo}`} chưa có ${title.toLowerCase()}.`, suggestion: 'Bổ sung để VTVL đủ khung năng lực.' }));
    }
  }
  if (base) {
    const have = codes(c2);
    for (const a of base) if (!have.has(a)) out.push(issue({ form: 'c2', code: 'VAL-010', severity: 'INFO', message: `VTVL ${a} chưa có bản mô tả, khung năng lực.`, suggestion: `VTVL ${a} chưa có bản mô tả, khung năng lực.` }));
  }
  return out;
}

/** B1: mã công việc có ở A2, không trùng (so khớp theo `codeKey`), mã SP có trong danh mục (khi đã tải). */
export function kiemTraB1(b1, a2, products) {
  const out = [];
  if (a2) {
    const have = codes(a2);
    for (const r of b1) { const a = val(r, 'A'); if (a && !have.has(a)) out.push(issue({ form: 'b1', row: r.rowNo, col: 'A', value: r.data.A ?? '', code: 'VAL-012', severity: 'BLOCK', message: `Mã công việc ${a} chưa có ở biểu A2.`, suggestion: 'Chọn công việc trong danh sách hoặc bổ sung ở A2.' })); }
  }
  const groups = new Map();
  b1.forEach((r, i) => { const a = val(r, 'A'); const k = codeKey(a); if (!a || !k) return; const g = groups.get(k); if (g) g.idxs.push(i); else groups.set(k, { ma: a, idxs: [i] }); });
  out.push(...duplicates('b1', b1, new Map([...groups.values()].map((g) => [g.ma, g.idxs])), { label: 'Mã công việc', code: 'VAL-011', suggestion: (w) => `Mỗi công việc chỉ có một sản phẩm, một dòng ở B1. Mã công việc trùng với dòng ${w}: sửa mã hoặc xóa dòng trùng.` }));
  if (products?.size) {
    for (const r of b1) {
      const l = val(r, 'L');
      if (l && !products.has(l)) out.push(issue({ form: 'b1', row: r.rowNo, col: 'L', value: r.data.L ?? '', code: 'VAL-003', severity: 'BLOCK', message: `Mã sản phẩm ${l} không có trong danh mục hoặc đã ngừng hiệu lực.`, suggestion: 'Chọn mã sản phẩm còn hiệu lực trong danh mục, hoặc để trống và ghi phút đo thực tế.' }));
    }
  }
  return out;
}

export function kiemTraD1(d1, c1) {
  if (!c1) return [];
  const have = codes(c1);
  return d1.flatMap((r) => { const b = val(r, 'B'); return b && !have.has(b) ? [issue({ form: 'd1', row: r.rowNo, col: 'B', value: r.data.B ?? '', code: 'VAL-010', severity: 'BLOCK', message: `Mã VTVL ${b} chưa có ở biểu C1.`, suggestion: 'Chọn mã VTVL trong danh sách hoặc bổ sung ở C1.' })] : []; });
}
