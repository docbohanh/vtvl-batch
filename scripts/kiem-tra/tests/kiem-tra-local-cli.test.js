import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';
import { COLS } from '../src/cong/local/cot.js';
import { TIEU_DE_MAU } from '../src/cong/local/tieu-de.js';

/** Điểm vào `cli.mjs` chạy như tiến trình thật (đúng cách vtvl-batch gọi): in một JSON ra stdout. */
const CLI = fileURLToPath(new URL('../cli.mjs', import.meta.url));

async function tepA1() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('1. A1_NhiemVu');
  ws.getRow(2).values = COLS.a1.map((c) => `${c.letter} • ${TIEU_DE_MAU.a1[c.letter]}`);
  ws.getRow(3).values = ['NV-1', 'Tên', 'CQ', 'Căn cứ', null, 'Tiếp tục thực hiện', 'Nguồn'];
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kt-local-'));
  const file = path.join(dir, 'a.xlsx');
  await fs.writeFile(file, Buffer.from(await wb.xlsx.writeBuffer()));
  return file;
}

const chay = (args) => new Promise((resolve) => {
  execFile(process.execPath, [CLI, ...args], { maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr }));
});

test('cli.mjs: in đúng một dòng JSON có dòng đã chuẩn hóa, cột nhập và khóa biểu của từng lỗi', async () => {
  const { code, stdout } = await chay(['kiem-tra-local', await tepA1(), '--kieu=single', '--form=a1', '--co-dong']);
  assert.equal(code, 0);
  const dong = stdout.trim().split('\n');
  assert.equal(dong.length, 1);
  const r = JSON.parse(dong[0]);
  assert.equal(r.tong_dong, 1);
  assert.equal(r.dong.a1[0].data.A, 'NV-1');
  assert.ok(r.cot_nhap.a1.includes('A') && !r.cot_nhap.a1.includes('Z'));
  assert.ok(r.loi.every((e) => e.bieu === 'a1'));
});

test('cli.mjs: không có --co-dong thì không trả dòng; tệp không tồn tại, thiếu --form hoặc sai lệnh thoát mã 2', async () => {
  const file = await tepA1();
  assert.equal(JSON.parse((await chay(['kiem-tra-local', file, '--kieu=single', '--form=a1'])).stdout).dong, undefined);
  assert.equal((await chay(['kiem-tra-local', '/khong/co.xlsx'])).code, 2);
  assert.equal((await chay(['kiem-tra-local', file, '--kieu=single'])).code, 2);
  assert.equal((await chay(['lenh-la', file])).code, 2);
});
