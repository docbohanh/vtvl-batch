# Kiểm tra tệp Excel cục bộ (bản chép, tự đủ)

Thư mục này là bản chép phần kiểm tra tệp của `vtvl_app` để vtvl-batch **không phụ thuộc vtvl_app** khi chạy. Chỉ cần `exceljs` (đã khai trong `package.json`).

- Điểm vào: `cli.mjs kiem-tra-local <tệp.xlsx> [--kieu=full|single] [--form=…] [--ky=…] [--danh-muc=…] [--co-dong]`; in một dòng JSON.
- Nguồn (đường dẫn trong `vtvl_app/`): `src/cong/kiem-tra-local*.js`, `src/cong/local/*`, `src/domain/**`, `src/services/resolve.js`; kèm hai tệp test ở `tests/`.
- **Khác bản gốc đúng một chỗ:** `src/cong/kiem-tra.js` ở đây chỉ còn `SHEET_ORDER` (bản gốc kéo theo đăng nhập, gửi cổng, danh mục). Khi chép lại từ vtvl_app, **giữ tệp này**, đừng ghi đè.
- Bộ quy tắc theo cổng bản web 1.2.8 (`ruleVersion 2026.10.31-v2`). Quy tắc đổi thì sửa ở vtvl_app rồi chép lại các tệp trên (không sửa riêng ở đây để hai bên không lệch nhau).
- Test: `npm run test:kiem-tra` (24 test).
