import test from 'node:test';
import assert from 'node:assert/strict';
import { locHoSo, sapTab, nhanBieu, mauO, locDong, boDau } from '../../src/quanTri.ts';

const hs = (ten, ma, tk, dat, chua) => ({ id: ten, orgId: ten, ma, ten, cap: 'XA', trangThai: 'DRAFT', tienDo: 0, capNhat: '', dongDat: dat, dongChuaDat: chua, canhBao: 0, taiKhoan: tk });
const bieu = (khoa, ma, buoc, tieuDe = '') => ({ khoa, ma, tieuDe, buoc, soDong: 0, trangThai: '', dongChuaDat: 0 });

test('tìm hồ sơ không phân biệt dấu, khớp cả tên đăng nhập và mã đơn vị', () => {
  const ds = [hs('Trường THCS Lương Thế Vinh', 'M1', ['kekhai_nb_x'], 5, 0), hs('Sở Nội vụ', 'M2', [], 0, 0)];
  assert.equal(locHoSo(ds, 'luong the', 'tat_ca').length, 1);
  assert.equal(locHoSo(ds, 'KEKHAI_NB_X', 'tat_ca')[0].ma, 'M1');
  assert.equal(locHoSo(ds, 'm2', 'tat_ca')[0].ten, 'Sở Nội vụ');
  assert.equal(locHoSo(ds, '', 'tat_ca').length, 2);
});

test('chế độ lọc: có dòng chưa đạt, chưa có dữ liệu', () => {
  const ds = [hs('a', 'a', [], 5, 2), hs('b', 'b', [], 5, 0), hs('c', 'c', [], 0, 0)];
  assert.deepEqual(locHoSo(ds, '', 'chua_dat').map((h) => h.ten), ['a']);
  assert.deepEqual(locHoSo(ds, '', 'chua_co_du_lieu').map((h) => h.ten), ['c']);
});

test('tab ưu tiên B1, C3, D2 đứng đầu theo đúng thứ tự, biểu khác theo bước', () => {
  const ds = [bieu('a1', 'A1', 1), bieu('d2', 'D2', 7), bieu('b2_ct', 'B2', 4), bieu('b1', 'B1', 3), bieu('c3', 'C3', 6)];
  const { uuTien, khac } = sapTab(ds);
  assert.deepEqual(uuTien.map((b) => b.khoa), ['b1', 'c3', 'd2']);
  assert.deepEqual(khac.map((b) => b.khoa), ['a1', 'b2_ct']);
});

test('thiếu biểu ưu tiên thì bỏ qua, không lỗi', () => {
  assert.deepEqual(sapTab([bieu('a1', 'A1', 1)]).uuTien, []);
});

test('hai biểu trùng mã B2 thì nhãn kèm tên, biểu khác chỉ mã', () => {
  const ds = [bieu('b2_ct', 'B2', 4, 'Chi tiết'), bieu('b2_thaydoi', 'B2', 4, 'Thay đổi'), bieu('b1', 'B1', 3, 'Đo')];
  assert.equal(nhanBieu(ds[0], ds), 'B2 · Chi tiết');
  assert.equal(nhanBieu(ds[2], ds), 'B1');
});

test('màu ô trạng thái: "không đạt" xấu, "tham khảo" chú ý, "đạt" tốt, ô thường không tô', () => {
  assert.equal(mauO('ĐẠT'), 'tot');
  assert.equal(mauO('Đã kiểm chứng'), 'tot');
  assert.equal(mauO('SẴN SÀNG THẨM ĐỊNH'), 'tot');
  assert.equal(mauO('KHÔNG ĐẠT'), 'xau');
  assert.equal(mauO('THAM KHẢO – KHÔNG TÍNH'), 'xau');
  assert.equal(mauO('Chưa kiểm chứng'), 'chu-y');
  assert.equal(mauO('Ước lượng tham khảo'), 'chu-y');
  assert.equal(mauO('Soạn thảo báo cáo'), null);
  assert.equal(mauO(48), null);
  assert.equal(mauO(null), null);
});

test('lọc dòng: chỉ dòng lỗi và tìm trong mọi ô', () => {
  const d = (so, duLieu, trangThai = 'OK', loi = []) => ({ so, duLieu, trangThai, loi, capNhat: '' });
  const dong = [d(1, { A: 'Báo cáo tháng' }), d(2, { A: 'Công văn' }, 'BLOCK', ['Thiếu mã']), d(3, { A: 'Tờ trình' }, 'WARNING')];
  assert.deepEqual(locDong(dong, '', true).map((x) => x.so), [2, 3]);
  assert.deepEqual(locDong(dong, 'cong van', false).map((x) => x.so), [2]);
  assert.equal(locDong(dong, '', false).length, 3);
  assert.equal(boDau('Đà Nẵng'), 'da nang');
});

import { soTuO, locTuMuc, sapXepCot, tongCot, cacNam, locNam, gioSangNguoi, CAU_HINH_BIEU, GIO_MOT_NGUOI_NAM } from '../../src/quanTri.ts';

const dg = (so, duLieu) => ({ so, duLieu, trangThai: 'OK', loi: [], capNhat: '' });

test('đọc số từ ô: số, chuỗi kiểu Việt/Anh, ô trống hoặc chữ là null', () => {
  assert.equal(soTuO(48), 48);
  assert.equal(soTuO('48'), 48);
  assert.equal(soTuO('1.234,5'), 1234.5);
  assert.equal(soTuO('1234.5'), 1234.5);
  assert.equal(soTuO('0,5'), 0.5);
  assert.equal(soTuO(' 12 '), 12);
  for (const v of [null, undefined, '', 'abc', '12 giờ', true, NaN]) assert.equal(soTuO(v), null, String(v));
});

test('lọc ≥: ví dụ ≥ 1000 chỉ giữ dòng từ 1000 trở lên, ô trống bị loại, đúng ngưỡng vẫn giữ', () => {
  const d = [dg(1, { D: '999' }), dg(2, { D: '1000' }), dg(3, { D: 1500 }), dg(4, { D: null }), dg(5, { D: 'x' })];
  assert.deepEqual(locTuMuc(d, 'D', 1000).map((x) => x.so), [2, 3]);
  assert.deepEqual(locTuMuc(d, 'D', 0).map((x) => x.so), [1, 2, 3]);
});

test('sắp xếp cao→thấp và thấp→cao; ô trống luôn cuối; ổn định khi bằng nhau', () => {
  const d = [dg(1, { D: '10' }), dg(2, { D: null }), dg(3, { D: '30' }), dg(4, { D: '10' }), dg(5, { D: '20' })];
  assert.deepEqual(sapXepCot(d, 'D', 'giam').map((x) => x.so), [3, 5, 1, 4, 2]);
  assert.deepEqual(sapXepCot(d, 'D', 'tang').map((x) => x.so), [1, 4, 5, 3, 2]);
  assert.deepEqual(d.map((x) => x.so), [1, 2, 3, 4, 5], 'không làm đổi mảng gốc');
});

test('tổng cột bỏ ô trống; ước tính số người = tổng giờ / 1904', () => {
  const d = [dg(1, { G: '952' }), dg(2, { G: 952 }), dg(3, { G: null }), dg(4, { G: 'abc' })];
  assert.equal(tongCot(d, 'G'), 1904);
  assert.equal(GIO_MOT_NGUOI_NAM, 1904);
  assert.equal(gioSangNguoi(1904), 1);
  assert.equal(gioSangNguoi(952), 0.5);
  assert.equal(gioSangNguoi(0), 0);
});

test('lọc năm: liệt kê năm tăng dần, chọn năm thì chỉ giữ dòng năm đó, null là tất cả', () => {
  const d = [dg(1, { B: 2028, C: '2' }), dg(2, { B: '2027', C: '1' }), dg(3, { B: 2027, C: '3' }), dg(4, { B: null, C: '9' })];
  assert.deepEqual(cacNam(d, 'B'), [2027, 2028]);
  assert.deepEqual(locNam(d, 'B', 2027).map((x) => x.so), [2, 3]);
  assert.equal(locNam(d, 'B', null).length, 4);
  assert.equal(tongCot(locNam(d, 'B', 2027), 'C'), 4, 'tổng theo bộ lọc năm');
});

test('cấu hình thẩm định: B1 sắp xếp/lọc cột D và ước tính theo cột G; C3 có tổng; D2 có tổng không cộng năm và lọc năm', () => {
  assert.equal(CAU_HINH_BIEU.b1.sapXepLoc.cot, 'D');
  assert.equal(CAU_HINH_BIEU.b1.soNguoi.cotGio, 'G');
  assert.ok(CAU_HINH_BIEU.c3.tong);
  assert.deepEqual(CAU_HINH_BIEU.d2.tong.loaiTru, ['B']);
  assert.equal(CAU_HINH_BIEU.d2.locNam.cot, 'B');
});
