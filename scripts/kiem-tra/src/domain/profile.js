import fs from 'node:fs/promises';
import path from 'node:path';
import { CONFIG_DIR } from '../config.js';

/**
 * Profile mô tả một bản bộ biểu (sheet, cột nhập/tự động, sức chứa, phương pháp, thứ tự cảnh báo).
 * Chỉ profile có vai_tro "phat_hanh" (B30K) dùng được trong ứng dụng; "kiem_thu" (HP) chỉ cho `tests/`.
 */

const ROLES = ['phat_hanh', 'kiem_thu'];
const fail = (message) => Object.assign(new Error(message), { code: 'BAD_PROFILE' });

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

/** @param {unknown} input nội dung profile đã parse */
export function loadProfile(input) {
  if (!input || typeof input !== 'object') throw fail('Thiếu profile');
  const p = structuredClone(input);
  if (typeof p.id !== 'string' || p.id === '') throw fail('Thiếu id profile');
  if (!ROLES.includes(p.vai_tro)) throw fail(`vai_tro phải là một trong ${ROLES.join(', ')}`);
  if (!Number.isInteger(p.dong_dau) || !Number.isInteger(p.dong_cuoi) || p.dong_cuoi < p.dong_dau) throw fail('dong_dau/dong_cuoi không hợp lệ');
  if (p.suc_chua_dong !== p.dong_cuoi - p.dong_dau + 1) throw fail('suc_chua_dong không khớp dong_dau/dong_cuoi');
  if (!Array.isArray(p.sheets) || p.sheets.length !== p.so_sheet) throw fail('so_sheet không khớp danh sách sheet');
  const names = new Set();
  for (const s of p.sheets) {
    if (names.has(s.ten)) throw fail(`Sheet trùng tên: ${s.ten}`);
    names.add(s.ten);
  }
  if (!Array.isArray(p.tap_phuong_phap) || p.tap_phuong_phap.length === 0) throw fail('Thiếu tap_phuong_phap');
  return deepFreeze(p);
}

/** @param {string} id ví dụ "B30K" @param {{allowTest?: boolean}} [options] */
export async function loadProfileFile(id, { allowTest = false } = {}) {
  const raw = JSON.parse(await fs.readFile(path.join(CONFIG_DIR, 'profiles', `${id}.json`), 'utf8'));
  const profile = loadProfile(raw);
  if (profile.vai_tro === 'kiem_thu' && !allowTest) {
    throw fail(`Profile ${id} có vai_tro kiem_thu (kiểm thử): không dùng trong ứng dụng`);
  }
  return profile;
}

/** Profile duy nhất được xuất ra: B30K. */
export const releaseProfile = () => loadProfileFile('B30K');
