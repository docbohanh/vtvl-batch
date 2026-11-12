# Xuất bộ biểu theo mẫu B30K

Tiến trình phụ Node cho nút "Xuất Excel" của trang Quản trị: ghi dữ liệu các biểu đọc từ cổng vào bản sao mẫu `templates/03_Bo_bieu_VTVL_30000.xlsx` (chỉ ghi ô NHẬP, giữ công thức, khóa, danh sách chọn).

- `xlsx-patch.js` là bản chép nguyên văn của `vtvl_app/src/io/xlsx-patch.js` (vá XML, không dùng exceljs để ghi). Đổi ở vtvl_app thì chép lại, đừng sửa riêng ở đây.
- Ánh xạ cột → trường lấy từ `../kiem-tra/src/domain/forms.js` (cùng chữ cột với cổng).
- `cli.mjs <vao.json> <mau.xlsx> <ra.xlsx>`: `vao.json` = `{ "bieu": { "<khóa biểu>": { "kieu": {"A": "TEXT"...}, "dong": [ {"A": ...} ] } } }`; in một dòng JSON `{ok, soDong}`.
- Dòng dữ liệu bắt đầu từ dòng 3, sức chứa 30.000 dòng/biểu (profile B30K). Cột kiểu DECIMAL/INTEGER được đổi sang số.
