import { codeKey, nameKey, normalizeCode, parseVtvlCode } from './normalize.js';

/**
 * Kiểm tra mã nguồn khi nhập danh mục (MA-01…MA-11). Hàm thuần: không sửa dữ liệu, không sửa mã (R20).
 * Mỗi kiểm tra trả về danh sách phát hiện `{code, severity, rows, message, ...}`.
 * `rows` của danh mục: `{id, rawCode, name, unit}`; `unit` là mã cơ quan (khóa gộp là cặp cơ quan + mã).
 */

const SEVERITY_RANK = Object.freeze({ block: 0, warn: 1, info: 2 });
const finding = (code, severity, rows, message, extra = {}) => Object.freeze({ code, severity, rows: Object.freeze(rows), message, ...extra });
const unitOf = (row) => String(row.unit ?? '');
const groupBy = (items, keyFn) => {
  const map = new Map();
  for (const it of items) {
    const k = keyFn(it);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(it);
  }
  return map;
};

/** MA-01 trùng mã (chặn) · MA-07 cùng mã khác tên (chặn) · MA-08 cùng mã, một bên tên rỗng (cảnh báo). */
export function checkDuplicates(rows) {
  const out = [];
  const groups = groupBy(rows.filter((r) => codeKey(r.rawCode) !== ''), (r) => `${codeKey(unitOf(r))}|${codeKey(r.rawCode)}`);
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const ids = group.map((r) => r.id);
    const names = group.map((r) => nameKey(r.name));
    const filled = new Set(names.filter((n) => n !== ''));
    const label = normalizeCode(group[0].rawCode);
    if (filled.size > 1) out.push(finding('MA-07', 'block', ids, `Mã ${label} xuất hiện ${group.length} lần với tên khác nhau`, { key: codeKey(label) }));
    else if (filled.size === 1 && names.includes('')) out.push(finding('MA-08', 'warn', ids, `Mã ${label} lặp lại, có dòng không có tên`, { key: codeKey(label) }));
    else out.push(finding('MA-01', 'block', ids, `Mã ${label} bị trùng ${group.length} lần`, { key: codeKey(label) }));
  }
  return out;
}

/** MA-02: thiếu số trong dãy theo (cơ quan, tiền tố, nhóm). Đã bỏ theo yêu cầu: VTVL theo từng phòng không bắt buộc phải liên tiếp. */
export function checkGaps(_rows) {
  return [];
}

/** MA-03 (thông tin): chuỗi mã phải chuẩn hóa; giữ cả chuỗi gốc và chuỗi chuẩn hóa. */
export function checkNormalization(rows) {
  const out = [];
  for (const r of rows) {
    const raw = String(r.rawCode ?? '');
    const normalized = parseVtvlCode(raw)?.canonical ?? normalizeCode(raw);
    if (raw !== normalized && raw !== '') out.push(finding('MA-03', 'info', [r.id], `Mã "${raw.replace(/\n/g, '\\n')}" được chuẩn hóa thành "${normalized}"`, { raw, normalized }));
  }
  return out;
}

/** MA-04: mã không theo mẫu, thiếu dấu phân cách, hoặc nhóm ngoài danh sách của cấu hình. */
export function checkPattern(rows, config) {
  const known = new Set(Object.keys(config.loai_ma.vtvl.nhom ?? {}));
  const out = [];
  for (const r of rows) {
    if (normalizeCode(r.rawCode) === '') continue;
    const p = parseVtvlCode(r.rawCode);
    if (!p) out.push(finding('MA-04', 'warn', [r.id], `Mã "${normalizeCode(r.rawCode)}" không theo mẫu <tiền tố>-<nhóm>-<số>`));
    else if (!known.has(p.group)) out.push(finding('MA-04', 'warn', [r.id], `Nhóm "${p.group}" không có trong cấu hình (${[...known].join(', ')})`, { group: p.group }));
    else if (p.issues.includes('thieu_dau_phan_cach')) out.push(finding('MA-04', 'warn', [r.id], `Mã "${normalizeCode(r.rawCode)}" thiếu dấu "-" trước số`));
  }
  return out;
}

/** MA-05: cơ quan không dùng tiền tố, hoặc dùng nhiều tiền tố khác nhau. */
export function checkPrefixes(rows) {
  const out = [];
  const byUnit = groupBy(rows.map((r) => ({ r, p: parseVtvlCode(r.rawCode) })).filter((x) => x.p), ({ r }) => codeKey(unitOf(r)));
  for (const group of byUnit.values()) {
    const none = group.filter(({ p }) => p.prefix === '');
    const prefixes = new Set(group.filter(({ p }) => p.prefix !== '').map(({ p }) => p.prefix.toLowerCase()));
    if (none.length > 0) out.push(finding('MA-05', 'warn', none.map(({ r }) => r.id), 'Mã không có tiền tố cơ quan; khi gộp nhiều đơn vị sẽ lặp mã', { kind: 'khong_tien_to' }));
    if (prefixes.size > 1) out.push(finding('MA-05', 'warn', group.map(({ r }) => r.id), `Một cơ quan dùng nhiều tiền tố: ${[...prefixes].join(', ')}`, { kind: 'nhieu_tien_to' }));
  }
  return out;
}

/** MA-06: số mã theo nhóm lệch bảng thống kê. Khớp số lượng KHÔNG chứng minh mã đúng. */
export function compareStats(rows, stats, config) {
  const alias = config.loai_ma.vtvl.nhom_tuong_duong ?? {};
  const counted = new Map();
  for (const r of rows) {
    const p = parseVtvlCode(r.rawCode);
    if (!p) continue;
    const key = `${unitOf(r)}|${alias[p.group] ?? p.group}`;
    counted.set(key, (counted.get(key) ?? 0) + 1);
  }
  const out = [];
  for (const [unit, groups] of Object.entries(stats)) {
    for (const [group, expected] of Object.entries(groups)) {
      const n = counted.get(`${unit}|${group}`) ?? 0;
      if (n !== expected) out.push(finding('MA-06', 'warn', [], `${unit}: nhóm ${group} đếm được ${n}, bảng thống kê ghi ${expected}`, { unit, group, counted: n, expected }));
    }
  }
  return out;
}

/** MA-09 (chặn): ký tự cấm, toàn chữ số, quá dài, rỗng. */
export function checkForbidden(rows, config) {
  const { cam_ky_tu: forbidden, cam_toan_chu_so: noDigitsOnly, do_dai_toi_da: maxLen } = config.rang_buoc_excel;
  const out = [];
  for (const r of rows) {
    const code = normalizeCode(r.rawCode);
    const reasons = [];
    if (code === '') reasons.push('rong');
    for (const c of forbidden) if (code.includes(c)) reasons.push(`ky_tu_cam:${c}`);
    if (noDigitsOnly && /^\d+$/.test(code)) reasons.push('toan_chu_so');
    if (code.length > maxLen) reasons.push('qua_dai');
    if (reasons.length) out.push(finding('MA-09', 'block', [r.id], `Mã "${code}" vi phạm ràng buộc của Excel: ${reasons.join(', ')}`, { reasons }));
  }
  return out;
}

/** MA-10: tên công việc trùng giữa các nhiệm vụ ("một việc ghi ở hai nơi"). */
export function checkDuplicateJobNames(jobs) {
  const out = [];
  for (const group of groupBy(jobs.filter((j) => nameKey(j.name) !== ''), (j) => nameKey(j.name)).values()) {
    const tasks = new Set(group.map((j) => codeKey(j.nvCode)));
    if (tasks.size > 1) out.push(finding('MA-10', 'warn', group.map((j) => j.id), `Tên công việc "${group[0].name}" xuất hiện ở ${tasks.size} nhiệm vụ`));
  }
  return out;
}

/** MA-11 (R4, chặn): công việc không có VTVL, hoặc cùng mã công việc gắn nhiều VTVL. */
export function checkJobLinks(jobs) {
  const out = [];
  for (const j of jobs) if (normalizeCode(j.vtvl) === '') out.push(finding('MA-11', 'block', [j.id], `Công việc ${normalizeCode(j.code)} chưa gắn VTVL`, { kind: 'thieu_vtvl' }));
  for (const group of groupBy(jobs.filter((j) => codeKey(j.code) !== ''), (j) => codeKey(j.code)).values()) {
    const vtvls = new Set(group.map((j) => codeKey(j.vtvl)).filter((v) => v !== ''));
    if (vtvls.size > 1) out.push(finding('MA-11', 'block', group.map((j) => j.id), `Công việc ${normalizeCode(group[0].code)} gắn ${vtvls.size} VTVL; cần tách mã phần việc`, { kind: 'nhieu_vtvl' }));
  }
  return out;
}

/**
 * Chạy toàn bộ kiểm tra; lỗi chặn đứng trước, rồi cảnh báo, rồi thông tin.
 * @param {readonly object[]} rows danh mục VTVL
 * @param {{config?: object, stats?: Record<string, Record<string, number>>, jobs?: readonly object[]}} [options]
 */
export function runCatalogChecks(rows, { config, stats, jobs } = {}) {
  const all = [
    ...checkDuplicates(rows), ...checkGaps(rows), ...checkNormalization(rows), ...checkPrefixes(rows),
    ...(config ? [...checkPattern(rows, config), ...checkForbidden(rows, config)] : []),
    ...(config && stats ? compareStats(rows, stats, config) : []),
    ...(jobs ? [...checkDuplicateJobNames(jobs), ...checkJobLinks(jobs)] : []),
  ];
  return all.map((f, i) => ({ f, i })).sort((a, b) => SEVERITY_RANK[a.f.severity] - SEVERITY_RANK[b.f.severity] || a.i - b.i).map(({ f }) => f);
}
