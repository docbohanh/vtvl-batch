import { renderTemplate } from './config.js';
import { codeKey } from './normalize.js';

/** Sinh mã mới theo cấu hình: bộ đếm theo phạm vi, chỉ tăng, bỏ qua số đã có. Không đổi `counters`. */

const NON_ASCII = /[^\x20-\x7E]/;
const fail = (message) => Object.assign(new Error(message), { code: 'BAD_CODE' });

export const emptyCounters = () => Object.freeze({ max: Object.freeze({}) });

function scopeKey(type, typeCfg, ctx) {
  const scope = (typeCfg.bo_dem?.pham_vi ?? []).map((k) => codeKey(ctx[k] ?? ''));
  return [type, ...scope].join('|');
}

function assertValid(candidate, cfg) {
  const { cam_ky_tu: forbidden, do_dai_toi_da: maxLen, cam_toan_chu_so: noDigitsOnly } = cfg.rang_buoc_excel;
  const bad = forbidden.find((c) => candidate.includes(c));
  if (bad) throw fail(`Mã "${candidate}" chứa ký tự cấm "${bad}"`);
  if (NON_ASCII.test(candidate) && cfg.kiem_tra_cu_phap?.cho_phep_dau_tieng_viet?.mac_dinh === 'ke_thua_only') {
    throw fail(`Mã "${candidate}" do ứng dụng sinh chỉ được dùng ASCII`);
  }
  if (candidate.length > maxLen) throw fail(`Mã "${candidate}" dài quá ${maxLen} ký tự`);
  if (noDigitsOnly && /^\d+$/.test(candidate)) throw fail(`Mã "${candidate}" không được toàn chữ số`);
}

/**
 * @param {object} cfg cấu hình từ loadCodeConfig
 * @param {string} type khóa trong cfg.loai_ma
 * @param {Record<string, string|number>} ctx giá trị cho các biến của mẫu (không gồm `so`)
 * @param {{max: Record<string, number>}} counters
 * @param {{existing?: string[]}} [options] mã đã có (nhập từ tệp) để không trùng
 * @returns {{code: string, counters: {max: Record<string, number>}}}
 */
export function issueCode(cfg, type, ctx, counters, { existing = [] } = {}) {
  const typeCfg = cfg.loai_ma[type];
  if (!typeCfg) throw fail(`Không có loại mã "${type}"`);
  if (!typeCfg.mau) throw fail(`Loại mã "${type}" không sinh được: chỉ chọn từ danh mục`);
  const key = scopeKey(type, typeCfg, ctx);
  const taken = new Set(existing.map(codeKey));
  let n = (counters.max[key] ?? 0) + 1;
  let code = renderTemplate(typeCfg.mau, { ...ctx, so: n });
  while (taken.has(codeKey(code))) {
    n += 1;
    code = renderTemplate(typeCfg.mau, { ...ctx, so: n });
  }
  assertValid(code, cfg);
  return { code, counters: Object.freeze({ max: Object.freeze({ ...counters.max, [key]: n }) }) };
}
