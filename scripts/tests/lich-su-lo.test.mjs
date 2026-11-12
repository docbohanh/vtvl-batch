import test from 'node:test';
import assert from 'node:assert/strict';
import { themLichSu, xoaMucLichSu, lamSachLichSu } from '../../src/lichSuLo.ts';

const m = (p, so = 1, luc = '2026-11-11T00:00:00Z') => ({ duongDan: p, luc, soDonVi: so });

test('mục mới nạp đứng đầu danh sách', () => {
  assert.deepEqual(themLichSu([m('/a')], m('/b')).map((x) => x.duongDan), ['/b', '/a']);
});

test('nạp lại cùng tệp thì chuyển lên đầu và thay mục cũ, không trùng', () => {
  const kq = themLichSu([m('/a', 1), m('/b', 2)], m('/b', 5, '2026-11-12T00:00:00Z'));
  assert.deepEqual(kq.map((x) => x.duongDan), ['/b', '/a']);
  assert.equal(kq[0].soDonVi, 5);
});

test('giữ tối đa số mục cho phép, bỏ mục cũ nhất', () => {
  const kq = themLichSu([m('/1'), m('/2'), m('/3')], m('/4'), 3);
  assert.deepEqual(kq.map((x) => x.duongDan), ['/4', '/1', '/2']);
});

test('không sửa danh sách gốc (bất biến)', () => {
  const goc = Object.freeze([m('/a')]);
  themLichSu(goc, m('/b'));
  xoaMucLichSu(goc, '/a');
  assert.equal(goc.length, 1);
});

test('xóa một mục theo đường dẫn', () => {
  assert.deepEqual(xoaMucLichSu([m('/a'), m('/b')], '/a').map((x) => x.duongDan), ['/b']);
});

test('lọc bỏ bản ghi hỏng từ bộ nhớ', () => {
  assert.deepEqual(lamSachLichSu([m('/a'), null, { duongDan: 5 }, { duongDan: '', luc: 'x', soDonVi: 1 }, { duongDan: '/b', luc: 'x', soDonVi: 'n' }]).map((x) => x.duongDan), ['/a']);
  assert.deepEqual(lamSachLichSu('không phải mảng'), []);
});
