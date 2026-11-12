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
