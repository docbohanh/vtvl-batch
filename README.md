# VTVL Batch – Tauri 2.x

Quản lý nhiều đơn vị song song, **đường B** (gói thay đổi): kiểm tra kết nối tất cả → chuẩn bị (kiểm tra Excel, tính thay đổi) → **Gửi tất cả** / **Gửi** / **Gửi lại**. Không tự gửi, không nộp hồ sơ.

Kế hoạch: `KE_HOACH_QUAN_LY_NHIEU_DON_VI.md`. Cấu trúc dữ liệu: `DE_XUAT_JSON.md`.

## Trạng thái

| Phần | Tình trạng |
|---|---|
| Lô, thư mục `data/<username>/`, trạng thái bền, nhật ký, mã thiết bị | xong, có test |
| Kiểm tra kết nối (cookie, quyền, hồ sơ, kỳ, **biểu được phân công sửa**) | xong, có test; chưa chạy với cổng thật |
| Kiểm tra Excel (tiến trình phụ Node, lõi `vtvl_app`, danh mục SP dùng chung) | xong, có test |
| Ảnh chụp hồ sơ (`/sync/bootstrap` + tệp dòng) và tính thay đổi (tạo/sửa/xóa) | xong, định dạng đã khảo sát bằng gọi thật chỉ đọc |
| Gói thay đổi: dựng, gửi, theo dõi tác vụ, đổi khóa, đối chiếu sau gửi | xong theo mã Desktop, test bằng máy chủ giả; **chưa gửi thật** |
| Đường A (kiểm tra qua `/imports`, kết chuyển qua `commit`) | viết sẵn, test bằng máy chủ giả; dùng khi tài khoản có quyền `import` |
| Giao diện | xong, `tsc` và `vite build` chạy được; chưa thử trên cửa sổ Tauri thật |

**Gửi thật tắt mặc định** (`choPhepGuiThat: false`): chạy chế độ khô, chỉ dựng và lưu gói. Xem `GIAO_THUC_THAY_DOI.md` (mục 5) trước khi bật.

## Chạy

```bash
npm install
cp config/lo.example.json config/lo.json   # sửa tài khoản, tệp Excel
npm run tauri dev
```
Đặt tệp Excel vào `data/<username>/nguon/`. Cookie dán trên giao diện (chỉ giữ trong bộ nhớ). Cần Node (`node` trong cấu hình) và thư mục `vtvl_app` (`vtvlApp`, mặc định `../vtvl_app`).

Cách 2:

Chỉ cho terminal hiện tại:
```bash
source "$HOME/.cargo/env"
```

Vĩnh viễn: thêm cùng dòng đó vào ~/.zshenv (nên dùng tệp này để cả npm run tauri dev do IDE hoặc terminal khác mở cũng thấy):

```bash
echo '. "$HOME/.cargo/env"' >> ~/.zshenv
```

Sau đó mở terminal mới.
Rồi chạy lại:

```bash
cd ~/Documents/VTVL/vtvl-batch
npm run tauri dev
```


## Kiểm thử

```bash
cd src-tauri && cargo test          # 61 test
cd ../../vtvl_app && node --test tests/kiem-tra-local.test.js tests/kiem-tra-local-cli.test.js
```
