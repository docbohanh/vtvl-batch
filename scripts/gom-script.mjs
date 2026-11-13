// Gom tập lệnh Node (kèm exceljs, jszip) thành từng tệp đơn và chép mẫu B30K vào src-tauri/resources/ để đóng gói kèm ứng dụng.
// Máy người dùng chỉ cần có Node, không cần node_modules hay thư mục scripts/.
import { build } from 'esbuild';
import { copyFileSync, mkdirSync } from 'node:fs';

const BANNER = "import{createRequire as __cr}from'node:module';const require=__cr(import.meta.url);";
for (const ten of ['kiem-tra', 'xuat-b30k']) {
  await build({
    entryPoints: [`scripts/${ten}/cli.mjs`], bundle: true, platform: 'node', format: 'esm', target: 'node18',
    banner: { js: BANNER }, outfile: `src-tauri/resources/scripts/${ten}/cli.mjs`, logLevel: 'warning',
  });
}
mkdirSync('src-tauri/resources/templates', { recursive: true });
copyFileSync('templates/03_Bo_bieu_VTVL_30000.xlsx', 'src-tauri/resources/templates/03_Bo_bieu_VTVL_30000.xlsx');
console.log('Đã gom tập lệnh vào src-tauri/resources/');
