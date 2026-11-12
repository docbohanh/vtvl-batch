import test from 'node:test';
import assert from 'node:assert/strict';
import { laLanBamThuHai, CHO_BAM_LAI_MS, HET_HAN_MS } from '../../src/haiBuoc.ts';

test('chưa bấm lần đầu thì lần bấm hiện tại chưa phải lần hai', () => {
  assert.equal(laLanBamThuHai(null, 1000), false);
});

test('bấm đúp quá nhanh không tính là lần hai', () => {
  assert.equal(laLanBamThuHai(1000, 1000), false);
  assert.equal(laLanBamThuHai(1000, 1000 + CHO_BAM_LAI_MS - 1), false);
});

test('bấm lại trong khoảng cho phép thì tính là lần hai', () => {
  assert.equal(laLanBamThuHai(1000, 1000 + CHO_BAM_LAI_MS), true);
  assert.equal(laLanBamThuHai(1000, 1000 + HET_HAN_MS), true);
});

test('để quá hạn thì không còn tính', () => {
  assert.equal(laLanBamThuHai(1000, 1000 + HET_HAN_MS + 1), false);
});
