import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { kiemTraLocal, SHEET_MAP, PHIEN_BAN_QUY_TAC } from '../src/cong/kiem-tra-local.js';
import { parseNumber, normalizeCell, codeKey } from '../src/cong/local/chuan-hoa.js';
import { colToNum, FORM_KEYS, SHEET_NAME, COLS } from '../src/cong/local/cot.js';
import { TIEU_DE_MAU } from '../src/cong/local/tieu-de.js';
import { kiemGioiHanZip, GIOI_HAN } from '../src/cong/local/zip-gioi-han.js';

/** Quy tắc đối chiếu bản web 1.2.8 của cổng (TapHuan_HDSD/1.2.8/assets); test viết sẵn, chạy khi người dùng yêu cầu. */

/** Dòng dữ liệu theo chữ cột: { A: 'x', L: 'y' } → mảng đúng vị trí cho ExcelJS (chỉ số 0 là cột A). */
// Mảng đặc (điền null): ExcelJS coi mảng có lỗ ở chỉ số 0 là đánh số từ 1 và sẽ lệch cột.
const rowOf = (map) => { const r = Array(Math.max(...Object.keys(map).map(colToNum))).fill(null); for (const [k, v] of Object.entries(map)) r[colToNum(k) - 1] = v; return r; };

/** Dựng tệp .xlsx nhỏ: mỗi sheet có 2 dòng tiêu đề rồi các dòng dữ liệu (đối tượng chữ cột → giá trị, hoặc mảng thô). */
async function book(sheets) {
  const wb = new ExcelJS.Workbook();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = wb.addWorksheet(name);
    ws.getRow(1).values = ['Tiêu đề'];
    const form = FORM_KEYS.find((k) => SHEET_NAME[k] === name.trim().replace(/\.\s+/, '. '));
    // Dòng 2: tiêu đề đúng mẫu v2 ("A • Tên cột") cho sheet biểu; sheet khác để tiêu đề tùy ý
    ws.getRow(2).values = form ? COLS[form].map((c) => `${c.letter} • ${TIEU_DE_MAU[form][c.letter]}`) : ['Cột'];
    rows.forEach((r, i) => { ws.getRow(3 + i).values = Array.isArray(r) ? r : rowOf(r); });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
const A1_OK = { A: 'NV-1', B: 'Tên', C: 'Cơ quan', D: 'Căn cứ', E: 'Kỳ', F: 'Tiếp tục thực hiện', G: 'Nguồn' };
const codesOf = (r) => r.loi.map((e) => e.ma);
const cells = (r) => r.loi.map((e) => [e.o, e.ma, e.muc]);

test('đọc tệp: nhận sheet theo tên (thừa khoảng trắng), bỏ sheet tự tổng hợp và sheet lạ, đọc từ dòng 3', async () => {
  const buf = await book({ ' 1. A1_NhiemVu': [A1_OK], '15. S_NhatKy': [['x']], 'Sheet lạ': [['y']], '11. DM_SAN_PHAM': [['SP']] });
  const r = await kiemTraLocal(buf, {});
  assert.deepEqual(r.sheets.map((s) => [s.ten, s.so_dong, s.dat]), [[' 1. A1_NhiemVu', 1, true]]);
  assert.ok(r.canh_bao.some((t) => /Bỏ qua sheet tự tổng hợp: 15\. S_NhatKy/.test(t)));
  assert.equal(r.tai_may, true);
  assert.equal(r.phien_ban_quy_tac, PHIEN_BAN_QUY_TAC);
  assert.equal(SHEET_MAP['3. B1_KhoiLuong'], 'b1');
  assert.equal(SHEET_MAP['11. DM_SAN_PHAM'], undefined); // cổng không đọc sheet danh mục sản phẩm
});

test('đọc tệp: tệp hỏng, có macro, hoặc không có sheet nào đúng mẫu thì báo lỗi rõ', async () => {
  await assert.rejects(() => kiemTraLocal(Buffer.from('không phải xlsx'), {}), /không phải tệp \.xlsx/);
  const macro = await new JSZip().file('xl/vbaProject.bin', 'x').generateAsync({ type: 'nodebuffer' });
  await assert.rejects(() => kiemTraLocal(macro, {}), /macro/);
  const khac = await book({ Khác: [['x']] });
  await assert.rejects(() => kiemTraLocal(khac, {}), /không có sheet nào đúng mẫu/);
  const buf = await book({ '1. A1_NhiemVu': [A1_OK] });
  await assert.rejects(() => kiemTraLocal(buf, {}, { kieu: 'single', formKey: 'd2' }), /không có sheet của biểu "d2"/);
});

test('đọc tệp: dòng chỉ có công thức bị bỏ qua (IMP-BO-DONG), dòng mẫu chỉ có số bị bỏ qua (IMP-SAMPLE-ROW), công thức đọc kết quả đã lưu', async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('3. B1_KhoiLuong');
  ws.getRow(3).values = rowOf({ A: 'CV-1', C: 5 });
  ws.getRow(4).values = rowOf({ B: { formula: 'A3', result: 'V-1' } }); // chỉ ô tính, không có mã
  ws.getRow(5).values = rowOf({ C: 7 }); // không mã, chỉ có số
  const r = await kiemTraLocal(Buffer.from(await wb.xlsx.writeBuffer()), { products: new Set(['x']) }, { kieu: 'single', formKey: 'b1', kiemTieuDe: false }); // sheet tự dựng, không có dòng tiêu đề
  assert.equal(r.sheets[0].so_dong, 1);
  assert.deepEqual(codesOf(r).sort(), ['IMP-BO-DONG', 'IMP-SAMPLE-ROW']);
  assert.ok(r.loi.every((e) => e.muc === 'xem_lai'));
});

test('VAL-005: giá trị gõ vào ô tự tính bị bỏ qua và chỉ cảnh báo, không tính là lỗi', async () => {
  const buf = await book({ '3. B1_KhoiLuong': [{ A: 'CV-1', R: 'ĐẠT', G: 12 }] });
  const r = await kiemTraLocal(buf, { products: new Set(['x']) }, { kieu: 'single', formKey: 'b1' });
  assert.deepEqual(codesOf(r), ['VAL-005', 'VAL-005']);
  assert.ok(r.loi.every((e) => e.muc === 'xem_lai'));
  assert.equal(r.dong_loi, 0);
});

test('L1: thiếu mã VAL-001 và số không hợp lệ VAL-002 báo đúng ô; dòng lỗi đếm một lần dù nhiều ô', async () => {
  const buf = await book({ '3. B1_KhoiLuong': [{ A: null, C: 'abc', D: -3 }, { A: 'CV-2', C: '1.234,5', D: '2' }] });
  const r = await kiemTraLocal(buf, { products: new Set(['x']) }, { kieu: 'single', formKey: 'b1' });
  assert.deepEqual(cells(r), [['A3', 'VAL-001', 'loi'], ['C3', 'VAL-002', 'loi'], ['D3', 'VAL-002', 'loi']]);
  assert.deepEqual([r.tong_dong, r.dong_loi, r.dong_hop_le], [2, 1, 1]);
  assert.equal(r.sheets[0].so_loi, 3);
});

test('L1: giá trị chọn khác hoa/thường được chấp nhận; trạng thái A1 bắt buộc dùng mã VAL-008; ngoài danh mục là lỗi', async () => {
  const buf = await book({ '1. A1_NhiemVu': [{ ...A1_OK, F: 'tiếp tục THỰC HIỆN' }, { ...A1_OK, A: 'NV-2', F: null }, { ...A1_OK, A: 'NV-3', F: 'Sai' }] });
  const r = await kiemTraLocal(buf, {}, { kieu: 'single', formKey: 'a1' });
  assert.deepEqual(cells(r), [['F4', 'VAL-008', 'loi'], ['F5', 'VAL-008', 'loi']]);
});

test('L1: A1 thiếu căn cứ/nguồn là "chờ bổ sung" (VAL-007), không phải lỗi phải sửa', async () => {
  const buf = await book({ '1. A1_NhiemVu': [{ A: 'NV-1', F: 'Mới tiếp nhận' }] });
  const r = await kiemTraLocal(buf, {}, { kieu: 'single', formKey: 'a1' });
  assert.deepEqual(cells(r), [['D3', 'VAL-007', 'xem_lai'], ['G3', 'VAL-007', 'xem_lai']]);
  assert.equal(r.dong_loi, 0);
  assert.equal(r.sheets[0].so_xem_lai, 2);
});

test('L1: kỳ không khớp kỳ hồ sơ VAL-004 chỉ kiểm khi biết kỳ; viết khác khoảng trắng và gạch ngang vẫn khớp', async () => {
  const buf = await book({ '1. A1_NhiemVu': [{ ...A1_OK, E: '1/10/2025 - 30/9/2026' }, { ...A1_OK, A: 'NV-2', E: '2024' }] });
  const A1 = { kieu: 'single', formKey: 'a1' };
  assert.equal((await kiemTraLocal(buf, {}, A1)).loi.filter((e) => e.ma === 'VAL-004').length, 0);
  const r = await kiemTraLocal(buf, {}, { ...A1, ky: '01/10/2025 – 30/09/2026' });
  assert.deepEqual(cells(r), [['E4', 'VAL-004', 'loi']]);
});

test('L1: trạng thái D2 "Đã thẩm định"/"Đã được quyết định" chỉ cấp có thẩm quyền ghi (VAL-003)', async () => {
  const buf = await book({ '10. D2_PhuongAn': [{ A: 'V-1', B: '2027', I: 'Đã thẩm định' }, { A: 'V-2', B: '2027', I: ' đã được quyết định ' }, { A: 'V-3', B: '2027', I: 'Đã hoàn thành ở đơn vị' }] });
  const r = await kiemTraLocal(buf, {}, { kieu: 'single', formKey: 'd2' });
  assert.deepEqual(cells(r), [['I3', 'VAL-003', 'loi'], ['I4', 'VAL-003', 'loi']]);
});

test('L2: trùng mã nhiệm vụ A1 (VAL-006) báo cả hai dòng, mỗi dòng nêu dòng còn lại', async () => {
  const buf = await book({ '1. A1_NhiemVu': [A1_OK, { ...A1_OK }] });
  const r = await kiemTraLocal(buf, {}, { kieu: 'single', formKey: 'a1' });
  assert.deepEqual(cells(r), [['A3', 'VAL-006', 'loi'], ['A4', 'VAL-006', 'loi']]);
  assert.match(r.loi[0].noi_dung, /trùng với dòng 4/);
  assert.match(r.loi[1].noi_dung, /trùng với dòng 3/);
});

test('L2: khóa ngoại A2→A1 (VAL-009), A2→C1 (VAL-010), B1→A2 (VAL-012), D1→C1 (VAL-010)', async () => {
  const buf = await book({
    '1. A1_NhiemVu': [A1_OK],
    '6. C1_VTVL': [{ A: 'V-1', B: 'Tên' }],
    '2. A2_CongViec': [{ A: 'CV-1', B: 'NV-1', C: 'V-1', E: 'SP' }, { A: 'CV-2', B: 'NV-X', C: 'V-X', E: 'SP khác' }],
    '3. B1_KhoiLuong': [{ A: 'CV-1' }, { A: 'CV-9' }],
    '9. D1_NhanLuc': [{ A: 'NL-1', B: 'V-1' }, { A: 'NL-2', B: 'V-Z' }],
  });
  const r = await kiemTraLocal(buf, { products: new Set(['x']) });
  const hit = (sheet) => r.loi.filter((e) => e.sheet === sheet && e.muc === 'loi').map((e) => [e.o, e.ma]);
  assert.deepEqual(hit('2. A2_CongViec'), [['B4', 'VAL-009'], ['C4', 'VAL-010']]);
  assert.deepEqual(hit('3. B1_KhoiLuong'), [['A4', 'VAL-012']]);
  assert.deepEqual(hit('9. D1_NhanLuc'), [['B4', 'VAL-010']]);
});

test('L2: sản phẩm A2 trùng trong cùng nhiệm vụ là cảnh báo VAL-011; C2 thiếu mô tả là cảnh báo; C1 chưa có C2 là thông tin', async () => {
  const buf = await book({
    '1. A1_NhiemVu': [A1_OK],
    '6. C1_VTVL': [{ A: 'V-1', B: 'T' }, { A: 'V-2', B: 'T' }],
    '2. A2_CongViec': [{ A: 'CV-1', B: 'NV-1', C: 'V-1', E: 'Báo  cáo' }, { A: 'CV-2', B: 'NV-1', C: 'V-1', E: 'báo cáo' }],
    '7. C2_NangLuc': [{ A: 'V-1', B: 'Trách nhiệm', C: 'NL chung', D: 'CM', F: 'CC', G: 'Nguồn' }, { A: 'V-1', B: 'x' }],
  });
  const r = await kiemTraLocal(buf, {});
  const a2 = r.loi.filter((e) => e.sheet === '2. A2_CongViec');
  assert.deepEqual(a2.map((e) => [e.o, e.ma, e.muc]), [['E3', 'VAL-011', 'xem_lai'], ['E4', 'VAL-011', 'xem_lai']]);
  const c2 = r.loi.filter((e) => e.sheet === '7. C2_NangLuc');
  assert.ok(c2.some((e) => e.ma === 'VAL-011' && e.muc === 'loi')); // trùng mã VTVL ở C2
  assert.ok(c2.some((e) => e.ma === 'VAL-007' && e.o === 'C4'));
  assert.ok(c2.some((e) => e.ma === 'VAL-010' && e.dong === null && /V-2/.test(e.noi_dung))); // V-2 ở C1 chưa có C2
});

test('L2: mã SP cột L của B1 phải có trong danh mục chuẩn (đúng nguyên văn, kể cả hoa/thường); chưa tải danh mục thì bỏ qua và cảnh báo', async () => {
  const sheets = { '3. B1_KhoiLuong': [{ A: 'CV-1', L: 'CV.SNV.CCHC.01.01' }, { A: 'CV-2', L: 'SP-LAM' }, { A: 'CV-3', L: 'cv.snv.cchc.01.01' }, { A: 'CV-4' }] };
  const buf = await book(sheets);
  const r = await kiemTraLocal(buf, { products: new Set(['CV.SNV.CCHC.01.01']) }, { kieu: 'single', formKey: 'b1' });
  assert.deepEqual(r.loi.map((e) => [e.o, e.gia_tri, e.ma]), [['L4', 'SP-LAM', 'VAL-003'], ['L5', 'cv.snv.cchc.01.01', 'VAL-003']]);
  const none = await kiemTraLocal(buf, { products: new Set() }, { kieu: 'single', formKey: 'b1' });
  assert.equal(none.loi.length, 0);
  assert.ok(none.canh_bao.some((t) => /Chưa tải danh mục sản phẩm chuẩn/.test(t)));
});

test('L2: B1 trùng mã công việc so khớp không phân biệt hoa/thường và khoảng trắng quanh gạch ngang', async () => {
  const buf = await book({ '3. B1_KhoiLuong': [{ A: 'CV - 1' }, { A: 'cv-1' }] });
  const r = await kiemTraLocal(buf, { products: new Set(['x']) }, { kieu: 'single', formKey: 'b1' });
  assert.deepEqual(cells(r), [['A3', 'VAL-011', 'loi'], ['A4', 'VAL-011', 'loi']]);
});

test('kiểu một biểu: chỉ kiểm biểu được chọn, quy tắc cần biểu khác được bỏ qua và có cảnh báo; chọn nhầm biểu báo IMP-SHEET', async () => {
  const buf = await book({ '2. A2_CongViec': [{ A: 'CV-1', B: 'NV-X', C: 'V-X', E: 'SP' }], '6. C1_VTVL': [{ A: 'V-1', B: 'T' }] });
  const one = await kiemTraLocal(buf, {}, { kieu: 'single', formKey: 'a2' });
  assert.deepEqual(one.sheets.map((s) => s.ten), ['2. A2_CongViec']);
  assert.equal(one.dong_loi, 0); // B, C không đối chiếu được vì A1, C1 không nằm trong lần kiểm tra
  assert.ok(one.canh_bao.some((t) => /Chỉ kiểm tra một biểu/.test(t)));
  const khac = await book({ '2. A2_CongViec': [], '6. C1_VTVL': [{ A: 'V-1', B: 'T' }] });
  const wrong = await kiemTraLocal(khac, {}, { kieu: 'single', formKey: 'a2' });
  assert.ok(wrong.loi.some((e) => e.ma === 'IMP-SHEET' && /không có dòng; tệp có dòng ở: 6\. C1_VTVL/.test(e.noi_dung)));
});

test('kiểu cả bộ biểu: thiếu sheet là lỗi IMP-SHEET (cổng từ chối tệp không đúng mẫu)', async () => {
  const r = await kiemTraLocal(await book({ '1. A1_NhiemVu': [A1_OK] }), {});
  const thieu = r.loi.filter((e) => e.ma === 'IMP-SHEET');
  assert.equal(thieu.length, 9);
  assert.ok(thieu.every((e) => e.muc === 'loi'));
});

test('chuẩn hóa: số kiểu Việt Nam, năm, kỳ, mã nhiều dòng và khóa so khớp mã', () => {
  assert.deepEqual(parseNumber('1.234,5'), { ok: true, value: '1234.5' });
  assert.deepEqual(parseNumber('1.234'), { ok: true, value: '1234' });
  assert.deepEqual(parseNumber('1,5'), { ok: true, value: '1.5' });
  assert.equal(parseNumber('N/A').ok, false);
  assert.equal(normalizeCell('d2', 'B', { value: '2027.0' }), '2027');
  assert.equal(normalizeCell('a1', 'E', { value: '1/10/2025 - 30/9/2026' }), '01/10/2025–30/09/2026');
  assert.equal(normalizeCell('a1', 'A', { value: 'NV-1\n  tiếp' }), 'NV-1 tiếp'); // cột mã gộp xuống dòng
  assert.equal(normalizeCell('a1', 'B', { value: 'dòng 1\ndòng 2' }), 'dòng 1\ndòng 2'); // cột văn bản giữ xuống dòng
  assert.equal(codeKey(' CV – 1 '), 'cv-1');
});

test('IMP-HEADER: tiêu đề cột sai mẫu thì không đọc sheet đó; tiêu đề thiếu tiền tố "A •" hoặc khác hoa/thường vẫn khớp', async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('1. A1_NhiemVu');
  ws.getRow(2).values = COLS.a1.map((c) => TIEU_DE_MAU.a1[c.letter].toUpperCase()); // không tiền tố, viết hoa
  ws.getRow(3).values = rowOf(A1_OK);
  const ok = await kiemTraLocal(Buffer.from(await wb.xlsx.writeBuffer()), {}, { kieu: 'single', formKey: 'a1' });
  assert.equal(ok.sheets[0].so_dong, 1);
  ws.getCell('D2').value = 'Cột bị sửa tên';
  const sai = await kiemTraLocal(Buffer.from(await wb.xlsx.writeBuffer()), {}, { kieu: 'single', formKey: 'a1' });
  assert.deepEqual(sai.loi.map((e) => [e.o, e.ma, e.muc]), [['D2', 'IMP-HEADER', 'loi']]);
  assert.equal(sai.sheets.length, 0);
  const bo = await kiemTraLocal(Buffer.from(await wb.xlsx.writeBuffer()), {}, { kieu: 'single', formKey: 'a1', kiemTieuDe: false });
  assert.equal(bo.sheets[0].so_dong, 1);
});

/** Dựng thư mục trung tâm ZIP giả: `entries` mục, mỗi mục có dung lượng giải nén `raw`. */
function fakeZip(entries, raw) {
  const rec = Buffer.alloc(46); rec.writeUInt32LE(0x02014b50, 0); rec.writeUInt32LE(raw, 24);
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries, 10); eocd.writeUInt32LE(0, 16);
  return Buffer.concat([...Array(entries).fill(rec), eocd]);
}

test('giới hạn ZIP: vượt số mục hoặc tổng dung lượng giải nén thì báo; tệp bình thường và tệp không đọc được thư mục thì bỏ qua', () => {
  assert.equal(kiemGioiHanZip(fakeZip(3, 100)), null);
  assert.deepEqual(kiemGioiHanZip(fakeZip(GIOI_HAN.mucZip + 1, 1)), { vuot: 'mucZip', gia_tri: GIOI_HAN.mucZip + 1 });
  assert.equal(kiemGioiHanZip(fakeZip(2, 300 * 1024 * 1024)).vuot, 'byteGiaiNen'); // 2 × 300 MB > 500 MB
  assert.equal(kiemGioiHanZip(Buffer.from('không phải zip')), null);
});

/** Bộ biểu đủ 10 sheet, dữ liệu tối thiểu nhất quán để L3 chạy được. */
const FULL = () => ({
  '1. A1_NhiemVu': [A1_OK],
  '2. A2_CongViec': [{ A: 'CV-1', B: 'NV-1', C: 'V-1', E: 'SP' }],
  '3. B1_KhoiLuong': [{ A: 'CV-1', C: 10, D: 30, H: 'Sổ theo dõi', I: 'Định mức', J: 'Có định mức', K: '01/10/2025 – 30/09/2026', L: null }],
  '4. B2_CT_TacDong': [],
  '6. C1_VTVL': [{ A: 'V-1', B: 'Chuyên viên', J: 'Phổ biến (40 giờ/tuần)' }],
  '7. C2_NangLuc': [{ A: 'V-1', B: 'a', C: 'b', D: 'c', F: 'd', G: 'e' }],
  '8. C3_NhuCau': [],
  '9. D1_NhanLuc': [],
  'DU_BAO_5_NAM': [],
  '10. D2_PhuongAn': [],
});

test('L3: đủ cả bộ biểu thì lõi tính trạng thái và đổi sang mã của cổng; dòng B1 đạt không có lỗi L3', async () => {
  const r = await kiemTraLocal(await book(FULL()), { products: new Set(['x']) });
  assert.equal(r.loi.filter((e) => ['VAL-013', 'VAL-014', 'VAL-016'].includes(e.ma)).length, 0);
  assert.ok(!r.canh_bao.some((t) => /Chưa kiểm tra kết quả tính/.test(t)));
});

test('L3: B1 thiếu nguồn thời gian là chờ bổ sung (VAL-013) kèm VAL-016 "chưa tính vào nhu cầu"; thiếu sản lượng là VAL-014', async () => {
  const sheets = FULL();
  sheets['3. B1_KhoiLuong'] = [{ A: 'CV-1', C: 10, D: 30, H: 'Sổ', J: 'Có định mức', K: '01/10/2025 – 30/09/2026' }, { A: 'CV-1x', D: 30, H: 'Sổ', I: 'Đo', J: 'Kiểm đếm, ước lượng thực tế', K: 'k' }];
  const r = await kiemTraLocal(await book(sheets), { products: new Set(['x']) });
  const b1 = r.loi.filter((e) => e.sheet === '3. B1_KhoiLuong' && /^VAL-01[3-6]$/.test(e.ma)).map((e) => [e.o, e.ma, e.muc]);
  assert.ok(b1.some((x) => x[0] === 'I3' && x[1] === 'VAL-013' && x[2] === 'xem_lai'));
  assert.ok(b1.some((x) => x[0] === 'R3' && x[1] === 'VAL-016' && x[2] === 'loi'));
});

test('L3: C1 chế độ đặc thù thiếu giờ riêng báo VAL-024 đúng ô; không đủ cả bộ biểu thì bỏ L3 và cảnh báo', async () => {
  const sheets = FULL();
  sheets['6. C1_VTVL'] = [{ A: 'V-1', B: 'T', J: 'Đặc thù' }];
  const r = await kiemTraLocal(await book(sheets), { products: new Set(['x']) });
  assert.ok(r.loi.some((e) => e.sheet === '6. C1_VTVL' && e.ma === 'VAL-024' && e.muc === 'loi'));
  const mot = await kiemTraLocal(await book({ '6. C1_VTVL': sheets['6. C1_VTVL'] }), {}, { kieu: 'single', formKey: 'c1' });
  assert.ok(!mot.loi.some((e) => e.ma === 'VAL-024'));
  assert.ok(mot.canh_bao.some((t) => /Chưa kiểm tra kết quả tính/.test(t)));
});
