// Xuất bộ biểu theo mẫu B30K: node cli.mjs <vao.json> <mau.xlsx> <ra.xlsx>. In MỘT dòng JSON {ok, soDong} (hoặc {ok:false, loi}).
// Mã thoát: 0 thành công; 2 sai tham số; 1 lỗi khi xuất.
import fs from 'node:fs/promises';
import { xuatB30K } from './xuat.js';

const [vao, mau, ra] = process.argv.slice(2);
if (!vao || !mau || !ra) {
  console.error('Cách dùng: node cli.mjs <vao.json> <mau.xlsx> <ra.xlsx>');
  process.exitCode = 2;
} else {
  try {
    const { bieu } = JSON.parse(await fs.readFile(vao, 'utf8'));
    const { buf, soDong } = await xuatB30K(await fs.readFile(mau), bieu ?? {});
    await fs.writeFile(ra, buf);
    console.log(JSON.stringify({ ok: true, soDong }));
  } catch (e) {
    console.log(JSON.stringify({ ok: false, loi: e.message }));
    process.exitCode = 1;
  }
}
