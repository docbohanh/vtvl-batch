import { FORMS } from '../../domain/forms.js';
import { evaluateModel } from '../../services/resolve.js';
import { COLS } from './cot.js';
import { parseNumber } from './chuan-hoa.js';
import { issue } from './loi.js';

/**
 * Quy tắc mức kết quả (L3) của cổng, bản 1.2.8 (`Br`, `Lr` trong `src-*.js`): lõi tính trạng thái từng dòng (cảnh báo B1, kiểm tra B2/C1/dự báo,
 * cảnh báo C3/D1/D2), cổng đổi mỗi trạng thái "chưa đạt" thành mã VAL-013…039, mức nghiêm trọng và ô cần sửa.
 * Trạng thái lấy từ lõi `src/domain/rules` của ứng dụng (chuỗi trùng khớp với cổng, đã đối chiếu), không viết lại công thức.
 * Chỉ chạy khi tệp có đủ cả bộ biểu (các biểu tra cứu lẫn nhau); thiếu biểu nào thì trạng thái không đáng tin.
 */

const blank = (v) => v === null || v === undefined || String(v).trim() === '';
const FIRST_BLANK = (cols) => (row) => [cols.find((c) => blank(row.data[c])) ?? cols[cols.length - 1]];
const FORM_TO_MODEL = Object.freeze({ du_bao_5_nam: 'dubao' });

/** Cột (và tiêu chí đạt) của từng bảng kết quả: [biểu, cột trạng thái, hàm đạt, mã dự phòng, khóa kết quả của lõi, trường thông báo]. */
const SOURCES = Object.freeze([
  { form: 'c1', col: 'K', key: 'c1', field: 'kiem_tra', ok: (s) => s === 'ĐẠT', fallback: 'VAL-024' },
  { form: 'b1', col: 'R', key: 'b1', field: 'canh_bao', ok: (s) => s === 'ĐẠT', fallback: 'VAL-016', extra: true },
  { form: 'b2_ct', col: 'P', key: 'b2', field: 'kiem_tra', ok: (s) => s === 'ĐẠT', fallback: 'VAL-018' },
  { form: 'c3', col: 'M', key: 'c3', field: 'canh_bao', ok: (s) => s === 'ĐẠT', fallback: 'VAL-030' },
  { form: 'd1', col: 'J', key: 'd1', field: 'canh_bao', ok: (s) => s === 'Đạt', fallback: 'VAL-033' },
  { form: 'du_bao_5_nam', col: 'I', key: 'forecast', field: 'kiem_tra', ok: (s) => s === 'ĐẠT', fallback: 'VAL-035' },
  { form: 'd2', col: 'J', key: 'd2', field: 'canh_bao', ok: (s) => ['SẴN SÀNG THẨM ĐỊNH', 'ĐÃ THẨM ĐỊNH', 'ĐÃ QUYẾT ĐỊNH'].includes(s), fallback: 'VAL-038' },
]);

const r = (code, severity, cols, suggestion, first = false) => ({ code, severity, cols, suggestion, first });
const BLOCK = 'BLOCK';
const PEND = 'PENDING';

/** Bảng đổi trạng thái → mã, mức, cột, gợi ý (theo `Sr`, `Er`, `Ar`, `jr`, `Mr`, `Nr`, `Fr`). Gợi ý có số liệu từ biểu khác được rút gọn không kèm số. */
const RULES = Object.freeze({
  c1: {
    'CHƯA CHỌN CHẾ ĐỘ LÀM VIỆC': r('VAL-024', BLOCK, ['J'], 'Chọn chế độ làm việc: Phổ biến (40 giờ/tuần) hoặc Đặc thù.'),
    'CHẾ ĐỘ KHÔNG HỢP LỆ': r('VAL-024', BLOCK, ['J'], 'Chọn lại chế độ làm việc trong danh mục.'),
    'THIẾU GIỜ ĐẶC THÙ': r('VAL-024', BLOCK, (row) => specialCols(row, ['H', 'F', 'I']), 'Chế độ đặc thù cần giờ riêng lớn hơn 0, căn cứ xác định quỹ giờ và xác nhận Đã kiểm chứng.'),
    'GIỜ CHƯA XÁC NHẬN': r('VAL-024', BLOCK, (row) => specialCols(row, ['I', 'F']), 'Giờ riêng chỉ được dùng khi có căn cứ và đã kiểm chứng.'),
    'THIẾU MẪU SỐ': r('VAL-024', BLOCK, ['J'], 'Chưa xác định được quỹ giờ. Kiểm tra chế độ làm việc và tham số quỹ giờ.'),
  },
  b1: {
    'THIẾU MÃ VTVL': r('VAL-012', BLOCK, (row, ctx) => (!blank(row.data.A) && !ctx.a2Codes.has(row.data.A.trim()) ? [] : ['A']), 'Công việc chưa gắn VTVL. Kiểm tra cột C của công việc ở A2.'),
    'THIẾU NGUỒN SẢN LƯỢNG/CÔNG VIỆC': r('VAL-013', PEND, ['H'], 'Ghi nguồn số liệu sản lượng.'),
    'THIẾU KỲ': r('VAL-013', PEND, ['K'], (row, ctx) => `Ghi kỳ ${ctx.ky ?? '01/10/2025 – 30/09/2026'}.`),
    'THIẾU SẢN LƯỢNG': r('VAL-014', PEND, ['C'], 'Nhập số sản phẩm thực hiện trong kỳ 12 tháng; ghi 0 nếu đã xác nhận không phát sinh.'),
    'CHƯA CHỌN TRẠNG THÁI': r('VAL-014', PEND, ['J'], 'Chọn trạng thái căn cứ thời gian: Có định mức hoặc Kiểm đếm, ước lượng thực tế.'),
    'CHỜ XÁC NHẬN KHÁC CHUẨN': r('VAL-015', PEND, ['S'], 'Thời gian khác định mức chuẩn đang chờ xác nhận. Người kiểm chứng xác nhận giải trình để dòng được tính.'),
    'THIẾU NGUỒN THỜI GIAN': r('VAL-013', PEND, ['I'], 'Nhập nguồn thời gian tại cột I hoặc chọn định mức chuẩn đã xác nhận ở cột L.'),
    'THIẾU THỜI GIAN': r('VAL-014', PEND, ['D'], 'Nhập phút/sản phẩm đo thực tế, hoặc chọn sản phẩm có định mức đã xác nhận.'),
  },
  b2_ct: {
    'THAM KHẢO – KHÔNG TÍNH': r('VAL-023', 'INFO', ['M'], 'Dòng ước lượng tham khảo, không được tính vào nhu cầu.'),
    'CHƯA ĐỦ CĂN CỨ': r('VAL-018', PEND, (row) => (row.data.M !== 'Đã kiểm chứng' && ['B', 'D', 'J', 'K', 'L'].every((c) => !blank(row.data[c])) ? ['M'] : ['B', 'D', 'J', 'K', 'L', 'M']), 'Bổ sung công đoạn, nguồn/bằng chứng, kỳ, cơ sở B1 và trạng thái Đã kiểm chứng.', true),
    'LOẠI TÁC ĐỘNG KHÔNG HỢP LỆ': r('VAL-017', BLOCK, ['C'], 'Chọn loại tác động trong 6 loại của danh mục.'),
    'CHỜ SOÁT TRÙNG': r('VAL-018', PEND, ['S'], 'Đối chiếu trùng và phạm vi, chọn Đã đối chiếu.'),
    'TRÙNG CÔNG ĐOẠN': r('VAL-019', BLOCK, ['D'], 'Công đoạn trùng với dòng khác của cùng công việc và kỳ.'),
    'THIẾU GIỜ TÁC ĐỘNG': r('VAL-021', PEND, ['F', 'G', 'I'], 'Nhập phút trước/sau hoặc giờ việc mới.', true),
    'THIẾU SẢN PHẨM ÁP DỤNG': r('VAL-020', PEND, ['E'], 'Nhập số sản phẩm áp dụng lớn hơn 0.'),
    'SẢN PHẨM ÁP DỤNG VƯỢT B1': r('VAL-020', BLOCK, ['E'], 'Số sản phẩm áp dụng vượt tổng sản phẩm của công việc ở B1.'),
    'THỜI GIAN TĂNG CHƯA GHI GIỜ MỚI': r('VAL-021', PEND, ['I'], 'Phút sau lớn hơn phút trước. Ghi giờ việc mới phát sinh.'),
    'GIỜ GIẢM VƯỢT GIỜ B1': r('VAL-022', BLOCK, ['F', 'G'], 'Tổng giờ giảm của công việc vượt giờ ở B1.'),
  },
  c3: {
    'PHƯƠNG PHÁP KHÔNG HỢP LỆ': r('VAL-025', BLOCK, ['B'], 'Chọn phương pháp PP1, PP2, PP3 hoặc tổ hợp trong danh mục.'),
    'TRÙNG MÃ VTVL Ở C1': r('VAL-024', BLOCK, ['A'], 'Mã VTVL bị trùng ở C1. Sửa tại C1.'),
    'PP2: C1 CHƯA ĐỦ CĂN CỨ': r('VAL-024', BLOCK, ['F'], 'Quỹ giờ của VTVL ở C1 chưa ĐẠT.'),
    'MÃ VTVL CHƯA CÓ Ở C1': r('VAL-010', BLOCK, ['A'], 'Mã VTVL chưa có ở C1.'),
    'TRÙNG MÃ VTVL': r('VAL-025', BLOCK, ['A'], 'VTVL đã có dòng khác trong C3.'),
    'CHƯA CHỌN PHƯƠNG PHÁP': r('VAL-025', BLOCK, ['B'], 'Chọn phương pháp xác định nhu cầu.'),
    'GIỜ RÒNG ÂM – KIỂM TRA B2': r('VAL-026', BLOCK, ['D'], 'Giờ tác động B2 làm giờ ròng âm. Kiểm tra B2 của các công việc thuộc VTVL.'),
    'PP2: THIẾU GIỜ B1 HOẶC QUỸ GIỜ': r('VAL-026', BLOCK, (row) => (blank(row.data.C) ? ['C'] : ['F']), 'Chưa có giờ B1 đủ căn cứ hoặc quỹ giờ của VTVL.'),
    'PP2: CÒN DÒNG B1 CHƯA ĐẠT': r('VAL-027', BLOCK, ['N'], (row) => `Còn ${row.data.N ?? '0'} dòng B1 chưa ĐẠT của VTVL.`),
    'PP2: B2 CHƯA ĐỦ CĂN CỨ': r('VAL-028', BLOCK, ['D'], 'Còn dòng tác động B2 chưa ĐẠT của VTVL.'),
    'PP1: THIẾU SỐ NGƯỜI': r('VAL-029', PEND, ['H'], 'Nhập số người theo cơ cấu/vị trí thường trực có căn cứ.'),
    'PP3: THIẾU SỐ NGƯỜI': r('VAL-029', PEND, ['I'], 'Nhập số người theo yêu cầu đặc thù và giải trình.'),
    'THIẾU NGUỒN/GIẢI TRÌNH': r('VAL-030', PEND, ['K'], 'Ghi nguồn hoặc giải trình.'),
    'CHƯA KẾT LUẬN NGƯỜI CẦN BỐ TRÍ': r('VAL-030', PEND, ['J'], 'Kết luận số người cần bố trí.'),
    'CHỜ XÁC NHẬN NGHIỆP VỤ': r('VAL-030', PEND, ['L'], 'Chờ đầu mối kiểm chứng xác nhận.'),
  },
  d1: {
    'TRÙNG MÃ NGUỒN LỰC': r('VAL-031', BLOCK, ['A'], 'Mã nguồn lực trùng. Người kiêm nhiệm chỉ ghi một dòng; giờ ở vị trí khác ghi vào cột F.'),
    'THIẾU NƠI TÍNH BIÊN CHẾ': r('VAL-033', PEND, ['G'], 'Ghi nơi tính biên chế theo thẩm quyền.'),
    'Chưa đủ căn cứ': r('VAL-033', PEND, (row, ctx) => d1Cols(row, ctx), 'Bổ sung giờ dành cho VTVL, giờ việc khác, nguồn và xác nhận Đã kiểm chứng.'),
    'Vượt quỹ giờ': r('VAL-032', BLOCK, ['E', 'F'], 'Tổng giờ phân bổ vượt quỹ giờ. Xem lại phân bổ vị trí, công việc khác.'),
  },
  du_bao_5_nam: {
    'NĂM KHÔNG HỢP LỆ': r('VAL-034', BLOCK, ['B'], 'Chọn năm từ 2027 đến 2031.'),
    'TRÙNG MÃ VTVL – NĂM': r('VAL-034', BLOCK, ['A', 'B'], 'VTVL đã có dự báo cho năm này ở dòng khác.'),
    'C3 CHƯA ĐƯỢC XÁC NHẬN': r('VAL-035', BLOCK, ['G'], 'C3 của VTVL chưa được xác nhận.'),
    'THIẾU BIẾN ĐỘNG (NHẬP 0 NẾU KHÔNG ĐỔI)': r('VAL-035', BLOCK, ['C'], 'Nhập số người tăng/giảm so với C3; nhập 0 nếu đã xác nhận không đổi.'),
    'NHU CẦU ÂM': r('VAL-035', BLOCK, ['C'], 'Biến động làm nhu cầu năm âm.'),
    'THIẾU GIẢI TRÌNH/NGUỒN': r('VAL-035', PEND, ['D', 'E'], 'Ghi nội dung thay đổi và căn cứ nguồn, thời điểm.', true),
    'CHƯA KIỂM CHỨNG DỰ BÁO': r('VAL-035', PEND, ['F'], 'Chờ xác nhận dự báo.'),
  },
  d2: {
    'NĂM KHÔNG HỢP LỆ': r('VAL-036', BLOCK, ['B'], 'Chọn năm từ 2027 đến 2031.'),
    'TRÙNG MÃ VTVL – NĂM': r('VAL-036', BLOCK, ['A', 'B'], 'VTVL đã có phương án năm này ở dòng khác.'),
    'CHƯA CHỌN TRẠNG THÁI': r('VAL-036', BLOCK, ['I'], 'Chọn trạng thái phương án.'),
    'TRẠNG THÁI KHÔNG HỢP LỆ': r('VAL-036', BLOCK, ['I'], 'Chọn trạng thái trong danh mục 4 mức.'),
    'C3 CHƯA ĐƯỢC XÁC NHẬN': r('VAL-037', BLOCK, ['L'], 'C3 của VTVL chưa được xác nhận.'),
    'CHƯA CÓ DỰ BÁO NĂM ĐÃ KIỂM CHỨNG': r('VAL-037', BLOCK, ['C'], 'Chưa có dự báo năm này đã ĐẠT cho VTVL.'),
    'THIẾU PHƯƠNG ÁN': r('VAL-038', PEND, (row) => (blank(row.data.C) && !['D', 'G', 'H'].some((c) => blank(row.data[c])) ? ['C'] : ['D', 'G', 'H']), 'Nhập số người có thể bố trí, đề nghị điều chỉnh và giải trình.', true),
    'CHƯA ĐỦ CĂN CỨ': r('VAL-038', PEND, (row, ctx, extra) => D2_BASIS[extra.m]?.cols ?? ['M'], (row, ctx, extra) => D2_BASIS[extra.m]?.text ?? 'Bổ sung căn cứ phương án.'),
    'ĐANG XÂY DỰNG': r('VAL-038', PEND, ['I'], 'Phương án đang xây dựng. Chọn Đã hoàn thành ở đơn vị khi xong.'),
    'THIẾU VĂN BẢN THẨM ĐỊNH/QUYẾT ĐỊNH': r('VAL-039', BLOCK, ['N'], 'Ghi số, ngày, cơ quan ban hành văn bản thẩm định/quyết định.'),
  },
});

const D2_BASIS = Object.freeze({
  'THIẾU GIẢI TRÌNH': { cols: ['H'], text: 'Ghi nguồn hoặc giải trình phương án.' },
  'CHƯA CÓ DỰ BÁO NĂM': { cols: ['C'], text: 'Chưa có số người cần bố trí từ dự báo năm.' },
  'THIẾU NGƯỜI CÙNG ĐƠN VỊ TÍNH': { cols: ['D'], text: 'Nhập số người có thể bố trí (đơn vị tính: người).' },
  'C/D PHẢI TÍNH THEO NGƯỜI': { cols: ['C', 'D'], text: 'Số người cần bố trí và có thể bố trí phải tính theo người.' },
  'SỐ NGƯỜI ÂM': { cols: ['C', 'D'], text: 'Số người không được âm.' },
});

function specialCols(row, cols) {
  const bad = cols.filter((c) => (c === 'H' ? !(Number(row.data.H) > 0) : c === 'F' ? blank(row.data.F) : (row.data.I ?? '').trim() !== 'Đã kiểm chứng'));
  return bad.length ? bad : [cols[0]];
}

function d1Cols(row, ctx) {
  if (blank(row.data.D)) { const b = (row.data.B ?? '').trim(); return b && !ctx.c1Codes.has(b) ? [] : ['B']; }
  const missing = ['E', 'F', 'H'].find((c) => blank(row.data[c]));
  if (missing) return [missing];
  return row.data.I === 'Đã kiểm chứng' ? [] : ['I'];
}

/** Dòng của tệp → mô hình của lõi (tên trường nghiệp vụ; số thành số, chữ thành chuỗi, trống thành ''/null). */
export function toDomainModel(rowsByForm, sanPham = []) {
  const model = { dm_sp: sanPham };
  for (const [form, rows] of Object.entries(rowsByForm)) {
    const key = FORM_TO_MODEL[form] ?? form;
    const map = FORMS[key]?.cols;
    if (!map) continue;
    model[key] = rows.map((row) => Object.fromEntries(Object.entries(map).map(([letter, field]) => {
      const col = COLS[form].find((c) => c.letter === letter);
      const v = row.data[letter];
      if (col.type === 'number' || col.type === 'year') { const n = v === null || v === undefined ? null : parseNumber(v); return [field, n?.ok && n.value !== null ? Number(n.value) : null]; }
      return [field, v ?? ''];
    })));
  }
  return model;
}

/** @param {Record<string, {rowNo: number, data: object}[]>} rowsByForm đủ 10 biểu @param {{sanPham?: object[], ky?: string|null}} [opts] @returns {object[]} phát hiện L3 */
export function kiemTraKetQua(rowsByForm, { sanPham = [], ky = null } = {}) {
  let results;
  try { results = evaluateModel(toDomainModel(rowsByForm, sanPham)); } catch { return []; } // dữ liệu hỏng đến mức lõi không tính được: lỗi L1/L2 đã nêu
  const ctx = {
    ky,
    a2Codes: new Set((rowsByForm.a2 ?? []).map((x) => x.data.A?.trim()).filter(Boolean)),
    c1Codes: new Set((rowsByForm.c1 ?? []).map((x) => x.data.A?.trim()).filter(Boolean)),
  };
  const out = [];
  for (const src of SOURCES) {
    const rows = rowsByForm[src.form] ?? [];
    const res = results[src.key] ?? [];
    rows.forEach((row, i) => {
      const status = res[i]?.[src.field];
      if (!status || src.ok(status)) {
        if (src.form === 'd2' && res[i]?.kiem_soat === 'THAY ĐỔI SO VỚI NĂM CƠ SỞ – CÓ DỰ BÁO') out.push(issue({ form: 'd2', row: row.rowNo, col: 'M', code: 'VAL-038', severity: 'INFO', message: res[i].kiem_soat, suggestion: 'Nhu cầu năm khác năm cơ sở do có dự báo.' }));
        return;
      }
      const rule = RULES[src.form]?.[status];
      const base = { form: src.form, row: row.rowNo, message: status };
      if (!rule) { out.push(issue({ ...base, col: src.col, code: src.fallback, severity: BLOCK, suggestion: 'Kiểm tra lại dữ liệu của dòng.' })); return; }
      const extra = { m: res[i]?.kiem_soat };
      const raw = typeof rule.cols === 'function' ? rule.cols(row, ctx, extra) : rule.cols;
      const cols = rule.first ? FIRST_BLANK(raw)(row) : raw;
      const sug = typeof rule.suggestion === 'function' ? rule.suggestion(row, ctx, extra) : rule.suggestion;
      for (const col of cols) out.push(issue({ ...base, col, value: row.data[col] ?? '', code: rule.code, severity: rule.severity, suggestion: sug }));
    });
    if (src.extra) rows.forEach((row, i) => { const s = res[i]?.[src.field]; if (s && !src.ok(s)) out.push(issue({ form: src.form, row: row.rowNo, col: 'R', code: 'VAL-016', severity: BLOCK, message: s, suggestion: 'Dòng chưa đạt nên chưa được tính vào nhu cầu.' })); });
  }
  return out;
}

