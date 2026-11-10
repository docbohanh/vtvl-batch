# VTVL Batch – Tauri 2.x

Quản lý nhiều đơn vị song song, **đường B** (gói thay đổi): kiểm tra kết nối tất cả → chuẩn bị (kiểm tra Excel, tính thay đổi) → **Gửi tất cả** / **Gửi** / **Gửi lại**. Không tự gửi, không nộp hồ sơ.

Kế hoạch: `KE_HOACH_QUAN_LY_NHIEU_DON_VI.md`. Cấu trúc dữ liệu: `DE_XUAT_JSON.md`.

## Trạng thái

| Phần | Tình trạng |
|---|---|
| Lô, thư mục `data/<username>/`, trạng thái bền, nhật ký, mã thiết bị | xong, có test |
| Kiểm tra kết nối (cookie, quyền, hồ sơ, kỳ, **biểu được phân công sửa**) | xong, có test; chưa chạy với cổng thật |
| Kiểm tra Excel (tiến trình phụ Node, `scripts/kiem-tra/` chép từ vtvl_app, danh mục SP dùng chung) | xong, có test |
| Ảnh chụp hồ sơ (`/sync/bootstrap` + tệp dòng) và tính thay đổi (tạo/sửa/xóa) | xong, định dạng đã khảo sát bằng gọi thật chỉ đọc |
| Gói thay đổi: dựng, gửi, theo dõi tác vụ, đổi khóa, đối chiếu sau gửi | xong theo mã Desktop, test bằng máy chủ giả; **chưa gửi thật** |
| Đường A (kiểm tra qua `/imports`, kết chuyển qua `commit`) | viết sẵn, test bằng máy chủ giả; dùng khi tài khoản có quyền `import` |
| Giao diện | xong, `tsc` và `vite build` chạy được; chưa thử trên cửa sổ Tauri thật |

**Gửi thật tắt mặc định** (`choPhepGuiThat: false`): chạy chế độ khô, chỉ dựng và lưu gói. Xem `GIAO_THUC_THAY_DOI.md` (mục 5) trước khi bật.

## Cấu hình lô (`config/lo.json`)

Sao từ `config/lo.example.json` (có mô tả từng trường trong khóa `_huongDan`). Tệp này chứa bí mật, đã nằm trong `.gitignore`.

| Trường (trong `units[]`) | Ý nghĩa |
|---|---|
| `username` | Tên tài khoản cổng; cũng là tên thư mục dữ liệu `data/<username>/` |
| `password` | Mật khẩu cổng (nên điền). Có thì ứng dụng đăng nhập **kênh Desktop** (`/api/v1/auth/desktop/login`, token Bearer tự làm mới): kênh duy nhất có **quyền sửa/nhập** như ứng dụng Desktop. Không có thì chỉ dán được cookie web, **chỉ xem**, cổng từ chối mọi thay đổi |
| `excelFile` | **Tệp Excel của đơn vị, tương đối với thư mục của tài khoản.** Ứng dụng đọc tại `<dataRoot>/<username>/<excelFile>` |
| `mode`, `formKey` | `workbook` (cả bộ biểu) hoặc `single` (một biểu, kèm `formKey` như `b1`) |
| `duong` | Tùy chọn ép đường `A` (quyền import) hoặc `B` (create + update) |

**Tệp Excel nằm ở đâu:** với `"dataRoot": "data"` và `"excelFile": "nguon/Bo_bieu_VTVL_SDL_47.xlsx"` của tài khoản `kekhai_nb_dulich`, hãy chép tệp vào
`<thư mục vtvl-batch>/data/kekhai_nb_dulich/nguon/Bo_bieu_VTVL_SDL_47.xlsx`. Ứng dụng tạo sẵn `data/<username>/nguon/` khi nạp cấu hình, hiện đường dẫn đầy đủ trong thẻ đơn vị và báo "chưa có tệp" nếu thiếu. Không dùng đường dẫn tuyệt đối hay `..`.
`dataRoot` tương đối được tính từ thư mục ứng dụng (cha của `config`); đặt đường dẫn tuyệt đối nếu muốn nơi khác.

## Chạy

```bash
npm install
cp config/lo.example.json config/lo.json # sửa tài khoản, password, tệp Excel
npm run tauri dev
```
Đăng nhập kênh Desktop gọi thẳng API (không cần trình duyệt, Playwright hay cookie). Không có `password` thì cookie dán tay, chỉ giữ trong bộ nhớ và chỉ xem được.

## Kiểm thử

```bash
cd src-tauri && cargo test          # 79 test (+1 thử thật: `VTVL_TEST_USER=… VTVL_TEST_PASS=… cargo test ket_noi_that -- --ignored --nocapture`)
npm run test:kiem-tra               # 24 test của scripts/kiem-tra (không cần vtvl_app)
```
