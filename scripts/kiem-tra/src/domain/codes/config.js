/** Nạp và kiểm tra cấu hình mã (JSON, có phiên bản). Kết quả bị đóng băng. */

const PLACEHOLDER = /\{([^{}]*)\}/g;
const VALID_PLACEHOLDER = /^[a-z_]+(?::0\d+d)?$/;
const REQUIRED_TYPES = ['nhiem_vu', 'cong_viec', 'vtvl', 'san_pham', 'nguon_luc', 'tam'];
const MAX_EXCEL_LENGTH = 255; // COUNTIF lỗi khi tiêu chí dài quá 255 ký tự
const FORBIDDEN_MIN = ['*', '?', '~'];

const fail = (message) => Object.assign(new Error(message), { code: 'BAD_CONFIG' });

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}

function checkTemplate(template, where) {
  if (typeof template !== 'string' || template === '') throw fail(`${where}: mau phải là chuỗi không rỗng`);
  for (const m of template.matchAll(PLACEHOLDER)) {
    if (!VALID_PLACEHOLDER.test(m[1])) throw fail(`${where}: mau "${template}" có biến không hợp lệ {${m[1]}}`);
  }
}

/** Thay `{tên}` và `{tên:03d}` bằng giá trị trong `ctx`; thiếu biến thì báo lỗi. */
export function renderTemplate(template, ctx) {
  return template.replace(PLACEHOLDER, (_, spec) => {
    const [name, fmt] = spec.split(':');
    if (!(name in ctx) || ctx[name] === undefined || ctx[name] === null || ctx[name] === '') throw fail(`Thiếu biến ${name} để sinh mã`);
    const value = ctx[name];
    const width = fmt ? Number(/0(\d+)d/.exec(fmt)[1]) : 0;
    return width ? String(value).padStart(width, '0') : String(value);
  });
}

/** @param {unknown} input nội dung tệp cấu hình đã parse */
export function loadCodeConfig(input) {
  if (!input || typeof input !== 'object') throw fail('Thiếu cấu hình mã');
  const cfg = structuredClone(input);
  if (typeof cfg.phien_ban !== 'string' || cfg.phien_ban === '') throw fail('Thiếu phien_ban');
  const ex = cfg.rang_buoc_excel;
  if (!ex || typeof ex !== 'object') throw fail('Thiếu rang_buoc_excel');
  if (!Array.isArray(ex.cam_ky_tu) || !FORBIDDEN_MIN.every((c) => ex.cam_ky_tu.includes(c))) throw fail('rang_buoc_excel.cam_ky_tu phải gồm * ? ~');
  if (!Number.isInteger(ex.do_dai_toi_da) || ex.do_dai_toi_da < 1 || ex.do_dai_toi_da > MAX_EXCEL_LENGTH) throw fail(`rang_buoc_excel.do_dai_toi_da phải từ 1 đến ${MAX_EXCEL_LENGTH}`);
  if (!cfg.loai_ma || typeof cfg.loai_ma !== 'object') throw fail('Thiếu loai_ma');
  for (const t of REQUIRED_TYPES) if (!cfg.loai_ma[t]) throw fail(`loai_ma thiếu loại "${t}"`);
  for (const [name, t] of Object.entries(cfg.loai_ma)) {
    if (t.mau !== undefined) checkTemplate(t.mau, `loai_ma.${name}.mau`);
    if (t.mau_ke_thua !== undefined) checkTemplate(t.mau_ke_thua, `loai_ma.${name}.mau_ke_thua`);
    if (t.phan_viec?.mau !== undefined) checkTemplate(t.phan_viec.mau, `loai_ma.${name}.phan_viec.mau`);
  }
  return deepFreeze(cfg);
}
