import test from 'node:test';
import assert from 'node:assert/strict';
import { dinhDangSo, mauKpi, tienDoBuoc, buocHienTai, dinhDangCapNhat } from '../../src/tongQuan.ts';

const b = (xong, dangLam, chuaBatDau) => ({ buoc: 1, tieuDe: 'x', xong, dangLam, chuaBatDau });

test('số định dạng kiểu Việt Nam, giá trị lạ giữ nguyên', () => {
  assert.equal(dinhDangSo(1613), (1613).toLocaleString('vi-VN'));
  assert.equal(dinhDangSo(0), '0');
  assert.equal(dinhDangSo('abc'), 'abc');
  assert.equal(dinhDangSo(null), '');
  assert.equal(dinhDangSo(''), '');
});

test('"chưa đạt" được kiểm trước "đạt" nên ra màu cam, không ra xanh', () => {
  assert.equal(mauKpi('B1_NOT_PASSED'), 'cho');
  assert.equal(mauKpi('B2_UNCONFIRMED'), 'cho');
  assert.equal(mauKpi('RETURNED'), 'cho');
  assert.equal(mauKpi('B1_PASSED'), 'tot');
  assert.equal(mauKpi('COVERAGE_VERIFIED'), 'tot');
  assert.equal(mauKpi('TASKS'), 'thuong');
});

test('tiến độ bước: hoàn thành, đang làm theo tỷ lệ, chưa bắt đầu', () => {
  assert.deepEqual(tienDoBuoc(b(5, 0, 0)), { tt: 'xong', nhan: '✓ Hoàn thành', phanTram: 100 });
  assert.deepEqual(tienDoBuoc(b(1, 1, 2)), { tt: 'dang', nhan: '◔ Đang làm', phanTram: 25 });
  assert.equal(tienDoBuoc(b(0, 3, 0)).phanTram, 0);
  assert.equal(tienDoBuoc(b(0, 3, 0)).tt, 'dang');
  assert.equal(tienDoBuoc(b(0, 0, 4)).tt, 'chua');
  assert.equal(tienDoBuoc(b(0, 0, 0)).tt, 'chua', 'không có việc nào thì chưa bắt đầu');
});

test('bước hiện tại là bước đầu tiên chưa xong, -1 nếu xong hết', () => {
  assert.equal(buocHienTai([b(2, 0, 0), b(1, 1, 0), b(0, 0, 3)]), 1);
  assert.equal(buocHienTai([b(2, 0, 0)]), -1);
  assert.equal(buocHienTai([]), -1);
});

test('thời điểm cập nhật: ISO hợp lệ được định dạng, không đọc được thì giữ chuỗi gốc', () => {
  assert.match(dinhDangCapNhat('2026-11-11T12:06:00'), /^12:06, 11\/11\/2026$/);
  assert.equal(dinhDangCapNhat('không rõ'), 'không rõ');
  assert.equal(dinhDangCapNhat(''), '');
});
