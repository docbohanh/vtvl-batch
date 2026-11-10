import fs from 'node:fs/promises';
import { kiemTraLocal } from './kiem-tra-local.js';

/**
 * Lệnh `kiem-tra-local`: kiểm tra một tệp .xlsx trên máy theo bộ quy tắc của cổng và in MỘT đối tượng JSON ra stdout
 * (cho công cụ khác như vtvl-batch gọi như tiến trình phụ). Lỗi in ra stderr, mã thoát 2 (tham số/tệp) hoặc 1 (kiểm tra thất bại).
 *   node src/cli.js kiem-tra-local <vao.xlsx> [--kieu=full|single] [--form=<khóa biểu>] [--ky="dd/mm/yyyy – dd/mm/yyyy"]
 *                                  [--danh-muc=<tệp JSON {products:[mã], sanPham:[{ma_sp, phut_chuan, trang_thai}]}>] [--co-dong] [--bo-tieu-de]
 * Mã thoát 0 dù tệp còn lỗi dữ liệu (lỗi nằm trong JSON); chỉ không đọc được tệp mới thoát khác 0.
 */

const flagValue = (flags, name) => flags.find((f) => f.startsWith(`--${name}=`))?.slice(name.length + 3);

export async function kiemTraLocalCmd(file, flags, io) {
  const kieu = flagValue(flags, 'kieu') === 'single' ? 'single' : 'full';
  const formKey = flagValue(flags, 'form');
  if (kieu === 'single' && !formKey) throw Object.assign(new Error('Kiểu single cần --form=<khóa biểu>'), { exit: 2 });
  let buffer;
  try { buffer = await fs.readFile(file); } catch (e) { throw Object.assign(new Error(`Không đọc được ${file}: ${e.code ?? e.message}`), { exit: 2 }); }
  const dm = flagValue(flags, 'danh-muc');
  let catalogs = {};
  if (dm) {
    try { const j = JSON.parse(await fs.readFile(dm, 'utf8')); catalogs = { products: new Set(j.products ?? []), sanPham: j.sanPham ?? [] }; } catch { throw Object.assign(new Error(`Danh mục ${dm} không đọc được hoặc không phải JSON`), { exit: 2 }); }
  }
  const ket = await kiemTraLocal(buffer, catalogs, { kieu, formKey, ky: flagValue(flags, 'ky') ?? null, kiemTieuDe: !flags.includes('--bo-tieu-de'), coDong: flags.includes('--co-dong') });
  io.out(JSON.stringify(ket));
  return 0;
}
