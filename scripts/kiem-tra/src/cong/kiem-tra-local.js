import { SHEET_ORDER } from './kiem-tra.js';
import { COLS, FORM_KEYS, LAST_COL, SHEET_NAME, SKIP_SHEETS } from './local/cot.js';
import { docTep } from './local/doc-tep.js';
import { sortIssues, toKetQuaLoi } from './local/loi.js';
import { kiemTraO } from './local/quy-tac-o.js';
import { kiemTraKetQua } from './local/quy-tac-ket-qua.js';
import { kiemTraA1, kiemTraA2, kiemTraB1, kiemTraC1, kiemTraC2, kiemTraD1 } from './local/quy-tac-bang.js';

/**
 * Kiểm tra tệp Excel NGAY TRÊN MÁY (không cần mạng, không gửi gì lên cổng), theo bộ quy tắc của cổng chính thức bản web 1.2.8
 * (ruleVersion `2026.10.31-v2`; mã nguồn đối chiếu ở TapHuan_HDSD/1.2.8/assets, so sánh ở TapHuan_HDSD/1.2.8/SO_SANH_KIEM_TRA_LOCAL.md):
 *  - đọc tệp (`local/doc-tep.js`): định dạng, macro, kích thước giải nén, tiêu đề cột, nhận sheet theo tên, bỏ dòng chỉ có công thức, bỏ ô tự tính;
 *  - mức ô L1 (`local/quy-tac-o.js`): VAL-001…004, VAL-003 (cấp có thẩm quyền);
 *  - mức bảng L2 (`local/quy-tac-bang.js`): VAL-006…012.
 *  - mức kết quả L3 (`local/quy-tac-ket-qua.js`): trạng thái do lõi `src/domain/rules` tính, đổi sang VAL-013…039 (chỉ khi đủ cả bộ biểu).
 * Chưa có: phân quyền theo vai trò (người nhập luôn là đơn vị). Kết quả cùng dạng kết quả của cổng
 * ({tong_dong, dong_loi, dong_hop_le, sheets, loi}) để dùng chung giao diện xem kết quả.
 */

export const PHIEN_BAN_QUY_TAC = '2026.10.31-v2';
/** Tên sheet → khóa biểu. */
export const SHEET_MAP = Object.freeze(Object.fromEntries(FORM_KEYS.map((k) => [SHEET_NAME[k], k])));
export const COLUMN_RANGE = LAST_COL;
export { SKIP_SHEETS };

const fail = (status, message) => Object.assign(new Error(message), { status });
const titleOf = (form, col) => COLS[form].find((c) => c.letter === col)?.title;
const orderOf = (ten) => SHEET_ORDER.indexOf(ten) + 1 || 99;

function ruleIssues(form, rows, ctx, catalogs, period) {
  const own = kiemTraO(form, rows, period);
  const f = (k) => ctx.get(k) ?? null;
  switch (form) {
    case 'a1': return [...own, ...kiemTraA1(rows, f('a2'))];
    case 'a2': return [...own, ...kiemTraA2(rows, f('a1'), f('c1'))];
    case 'b1': return [...own, ...kiemTraB1(rows, f('a2'), catalogs.products)];
    case 'c1': return [...own, ...kiemTraC1(rows)];
    case 'c2': return [...own, ...kiemTraC2(rows, f('c1'))];
    case 'd1': return [...own, ...kiemTraD1(rows, f('c1'))];
    default: return own;
  }
}

function summarize(sheet, issues) {
  const block = issues.filter((i) => i.severity === 'BLOCK');
  return { ten: sheet.ten, so_dong: sheet.rows.length, so_dong_loi: new Set(block.filter((i) => i.row !== null).map((i) => i.row)).size, so_loi: block.length, so_xem_lai: issues.length - block.length, dat: block.length === 0 };
}

/**
 * @param {Buffer} buffer nội dung .xlsx
 * @param {{products?: Set<string>, sanPham?: {ma_sp: string, phut_chuan: number|string|null, trang_thai: string}[]}} [catalogs] `sanPham`: phút chuẩn của sản phẩm chuẩn (L3 của B1); danh mục mã SP chuẩn (đúng chữ hoa/thường như cổng); rỗng hoặc chưa tải thì bỏ qua quy tắc danh mục
 * @param {{kieu?: 'full'|'single', formKey?: string, ky?: string, kiemTieuDe?: boolean, coDong?: boolean}} [opts] `coDong`: trả thêm `dong` (các dòng đã chuẩn hóa theo khóa biểu) và `cot_nhap` (cột nhập từng biểu) cho công cụ tính thay đổi; `kiemTieuDe` (mặc định true): so tiêu đề dòng 2 với mẫu v2 (IMP-HEADER); `single`: chỉ biểu `formKey` (quy tắc cần biểu khác thì bỏ qua); `ky`: nhãn kỳ hồ sơ, có thì kiểm cột Kỳ (VAL-004)
 */
export async function kiemTraLocal(buffer, catalogs = {}, { kieu = 'full', formKey, ky = null, kiemTieuDe = true, coDong = false } = {}) {
  const doc = await docTep(buffer, { kieu, formKey, kiemTieuDeCot: kiemTieuDe });
  if (!doc.nhanDuoc) throw fail(422, 'Tệp không có sheet nào đúng mẫu Bộ biểu VTVL v2 (kiểm tra tên sheet, ví dụ "3. B1_KhoiLuong")');
  const saiTieuDe = doc.issues.some((i) => i.code === 'IMP-HEADER');
  if (kieu === 'single' && !doc.sheets.length && !saiTieuDe) throw fail(422, `Tệp không có sheet của biểu "${formKey}"`);

  const ctx = new Map(doc.sheets.map((s) => [s.form, s.rows]));
  // L3 cần đủ cả bộ biểu vì các biểu tra cứu lẫn nhau; thiếu biểu thì trạng thái tính ra không đáng tin
  const duBo = kieu === 'full' && FORM_KEYS.every((k) => ctx.has(k));
  const l3 = duBo ? kiemTraKetQua(Object.fromEntries(ctx), { sanPham: catalogs.sanPham ?? [], ky }) : [];
  const perSheet = doc.sheets.map((s) => ({ s, issues: sortIssues([...ruleIssues(s.form, s.rows, ctx, catalogs, ky), ...s.issues, ...l3.filter((i) => i.form === s.form)]) }));
  perSheet.sort((a, b) => orderOf(a.s.ten) - orderOf(b.s.ten));

  const canhBao = [];
  const wholeFile = doc.issues.filter((i) => i.row === null && i.severity !== 'BLOCK' && !i.form).map((i) => i.message);
  canhBao.push(...wholeFile);
  if (!catalogs.products?.size && doc.sheets.some((s) => s.form === 'b1')) canhBao.push('Chưa tải danh mục sản phẩm chuẩn về máy nên chưa kiểm tra được mã SP ở cột L của B1 (tab Danh mục đã tải → Tải danh mục từ cổng về máy).');
  if (doc.sheets.length && !duBo) canhBao.push('Chưa kiểm tra kết quả tính (cảnh báo B1, B2, C3, D1, dự báo, D2): cần đủ cả bộ biểu.');
  if (kieu === 'single' && doc.sheets.length) canhBao.push('Chỉ kiểm tra một biểu: các quy tắc đối chiếu với biểu khác (mã nhiệm vụ, mã VTVL, mã công việc) được bỏ qua vì dữ liệu biểu đó nằm trên cổng.');
  const tuTongHop = doc.ignored.filter((x) => x.ly_do.startsWith('Tự tổng hợp')).map((x) => x.ten);
  if (tuTongHop.length) canhBao.push(`Bỏ qua sheet tự tổng hợp: ${tuTongHop.join(', ')}.`);

  const blockFile = doc.issues.filter((i) => i.severity === 'BLOCK');
  const loi = [...blockFile.map((i) => toKetQuaLoi(i, titleOf)), ...perSheet.flatMap(({ issues }) => issues.map((i) => toKetQuaLoi(i, titleOf)))];
  const sheets = perSheet.map(({ s, issues }) => summarize(s, issues));
  const tong = sheets.reduce((n, s) => n + s.so_dong, 0);
  const dong = sheets.reduce((n, s) => n + s.so_dong_loi, 0);
  const ketQua = { tong_dong: tong, dong_loi: dong, dong_hop_le: Math.max(0, tong - dong), sheets, loi, canh_bao: canhBao, tai_may: true, phien_ban_quy_tac: PHIEN_BAN_QUY_TAC };
  if (!coDong) return ketQua;
  const cotNhap = Object.fromEntries(doc.sheets.map((s) => [s.form, COLS[s.form].filter((c) => c.kind !== 'COMPUTED').map((c) => c.letter)]));
  // `cot`: định nghĩa đủ cột (chữ, tiêu đề, loại, kiểu) của các biểu có trong tệp, để giao diện dựng bảng xem
  const cot = Object.fromEntries(doc.sheets.map((s) => [s.form, COLS[s.form].map((c) => ({ letter: c.letter, title: c.title, kind: c.kind, type: c.type }))]));
  return { ...ketQua, dong: Object.fromEntries(doc.sheets.map((s) => [s.form, s.rows])), cot_nhap: cotNhap, cot };
}

