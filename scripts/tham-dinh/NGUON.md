# Nguồn của `tham_dinh.mjs`

Bản chép nguyên văn từ skill `vtvl-tham-dinh` (`.claude/skills/vtvl-tham-dinh/scripts/tham_dinh.mjs`). Chạy lõi thẩm định (TD) của công cụ web `ThamDinh_BoBieu_VTVL.html` ngay trên máy bằng Node, ra kết luận A/B/C/D, phiếu 12 nội dung, 18 chỉ số và danh sách mã lỗi kèm biểu/cột/dòng.

- Lần đầu chạy, script tải `ThamDinh_BoBieu_VTVL.html` (không kèm dữ liệu đơn vị) về `~/.cache/vtvl-tham-dinh/`; các lần sau dùng bản đã tải, không cần mạng.
- Ứng dụng gọi: `node tham_dinh.mjs <tệp.xlsx> --don-vi <tên> [--xac-nhan] --json <ra.json>` rồi đọc tệp JSON.
- Khi skill đổi, chép lại tệp này để hai bên khớp.
