// Điểm vào kiểm tra tệp Excel cục bộ cho VTVL Batch (chạy bằng Node, in MỘT dòng JSON ra stdout):
//   node cli.mjs kiem-tra-local <vao.xlsx> [--kieu=full|single] [--form=<khóa biểu>] [--ky="dd/mm/yyyy – dd/mm/yyyy"] [--danh-muc=<json>] [--co-dong] [--bo-tieu-de]
// Mã thoát: 0 khi đọc được tệp (lỗi dữ liệu nằm trong JSON); 2 khi tham số/tệp sai; 1 khi kiểm tra thất bại.
// Thư mục này tự đủ (chép từ vtvl_app/src), chỉ cần `exceljs` trong node_modules của vtvl-batch.
import { kiemTraLocalCmd } from './src/cong/kiem-tra-local-cli.js';

const [cmd, ...rest] = process.argv.slice(2);
const flags = rest.filter((a) => a.startsWith('--'));
const args = rest.filter((a) => !a.startsWith('--'));
const io = { out: (s) => console.log(s), err: (s) => console.error(s) };

if (cmd !== 'kiem-tra-local' || args.length !== 1) {
  io.err('Cách dùng: node cli.mjs kiem-tra-local <vao.xlsx> [--kieu=full|single] [--form=<khóa>] [--ky=<nhãn>] [--danh-muc=<json>] [--co-dong] [--bo-tieu-de]');
  process.exitCode = 2;
} else {
  try {
    process.exitCode = await kiemTraLocalCmd(args[0], flags, io);
  } catch (e) {
    io.err(`Lỗi: ${e.message}`);
    process.exitCode = e.exit ?? 1;
  }
}
