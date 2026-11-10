# Đề xuất cấu trúc JSON và thư mục local (đường B: gói thay đổi)

**Căn cứ:** quyết định ngày 09/11/2026 (xem mục 0) và `KE_HOACH_QUAN_LY_NHIEU_DON_VI.md`.
**Quy ước:** ✅ lấy từ mã 1.2.8; ⚠️ chưa biết, sẽ chốt ở bước khảo sát giao thức (G5.1); mọi tệp có `schema` để nâng cấp sau này.

## 0. Quyết định đã chốt

1. **Đường B** cho hầu hết đơn vị (tài khoản không có quyền `import`).
2. **Gửi đồng bộ = đẩy gói thay đổi lên.** Mỗi tài khoản có **một thư mục local theo username** chứa nguồn, kết quả kiểm tra, các thay đổi và nhật ký.
3. **Không tự gửi/nộp.** Luồng: *Kiểm tra kết nối tất cả* → hiển thị → người dùng bấm **Gửi tất cả** (trên cùng) hoặc **Gửi** / **Gửi lại** từng đơn vị.
4. Người dùng cấp tài khoản/đơn vị thử; chưa có thì chưa chạy bước ghi.

## 1. Luồng thao tác (để các cấu trúc dưới đây khớp)

```
[Kiểm tra kết nối]  (tất cả đơn vị, chỉ đọc)  → ket-noi.json mỗi đơn vị
        ↓ người dùng xem bảng (xanh/đỏ)
[Chuẩn bị]  Excel → kiểm tra cục bộ → thay đổi (so với ảnh chụp máy chủ) → thay-doi/  (chưa gửi gì)
        ↓
[Gửi tất cả]  hoặc  [Gửi] / [Gửi lại] từng đơn vị  → gói → biên nhận → kéo về đối chiếu
```
- Nút **Gửi tất cả** bị khóa cho tới khi bước kiểm tra kết nối chạy xong và không có đơn vị nào ở trạng thái chặn (hoặc người dùng loại đơn vị đó khỏi lần gửi).
- **Gửi lại** dùng lại đúng `changesetId` của gói đang dở (cùng `Idempotency-Key`) nên không ghi trùng; chỉ tạo gói mới khi người dùng bấm "Dựng lại gói".

## 2. `config/lo.json` (khai báo lô, không chứa bí mật)

```json
{
  "schema": 1,
  "baseUrl": "https://kekhaivtvl.dcs.vn",
  "dataRoot": "data",
  "settings": {
    "concurrency": 3,
    "requestIntervalMs": 300,
    "timeoutSec": 120,
    "retryCount": 2,
    "pollIntervalMs": 2000,
    "changesetMaxChanges": 500
  },
  "units": [
    {
      "username": "kekhai_nb_dulich",
      "label": "Sở Du lịch",
      "excelFile": "nguon/Bo_bieu_VTVL_SDL_47.xlsx",
      "mode": "workbook",
      "formKey": null,
      "orgId": null,
      "periodId": null,
      "submissionId": null,
      "enabled": true
    }
  ]
}
```
- `excelFile` là đường dẫn **tương đối với thư mục của tài khoản** (`data/<username>/`); ứng dụng sao tệp người dùng chọn vào đó và ghi băm để biết tệp có đổi không.
- `mode`: `workbook` | `single` (`single` bắt buộc `formKey`, ví dụ `b1`).
- `orgId`, `periodId`, `submissionId`: để `null` thì tự xác định từ cổng; khi tự xác định xong, ghi vào `tai-khoan.json`, không sửa `lo.json`.
- **Không có** mật khẩu, cookie. Cookie nhập khi chạy (bộ nhớ) hoặc lấy từ kho khóa hệ điều hành theo khóa `vtvl-batch/<username>`.

## 3. Thư mục mỗi tài khoản `data/<username>/`

`<username>` chỉ nhận `[a-z0-9._-]` (chuẩn hóa chữ thường, từ chối ký tự khác) để chặn lỗi đường dẫn.

```
data/kekhai_nb_dulich/
├── tai-khoan.json            # thông tin tài khoản và ngữ cảnh đã xác định (mục 4)
├── ket-noi.json              # kết quả kiểm tra kết nối lần gần nhất (mục 5)
├── trang-thai.json           # trạng thái hiện tại của đơn vị trong lô (mục 6)
├── nguon/
│   └── Bo_bieu_VTVL_SDL_47.xlsx
├── may-chu/                  # ảnh chụp máy chủ để so sánh (chỉ đọc)
│   ├── bootstrap.json        # dữ liệu hồ sơ lúc tải (mục 7)
│   └── con-tro.json          # cursor của /sync/delta
├── kiem-tra/
│   └── 20261109-2136.json    # kết quả kiểm tra cục bộ (mục 8)
├── thay-doi/
│   ├── thay-doi.json         # danh sách thay đổi đã tính, chưa gửi (mục 9)
│   └── goi/
│       ├── cs-<uuid>.json    # gói thay đổi (mục 10)
│       └── cs-<uuid>.bien-nhan.json   # biên nhận (mục 11)
├── sao-luu/
│   └── truoc-20261109-2140/  # bản chụp các biểu bị ảnh hưởng trước khi gửi
├── ket-qua/
│   └── 20261109-2136.xlsx    # báo cáo lỗi xuất cho người dùng
└── nhat-ky.jsonl             # mỗi dòng một sự kiện (mục 12)
```

Quy tắc ghi tệp: ghi vào tệp tạm cùng thư mục rồi đổi tên (nguyên tử); tệp `goi/` và `bien-nhan/` **không bao giờ sửa sau khi tạo** (chỉ thêm biên nhận), để gửi lại luôn giống hệt.

## 4. `tai-khoan.json`

```json
{
  "schema": 1,
  "username": "kekhai_nb_dulich",
  "nguoiDung": { "hoTen": "Sở Du lịch tỉnh Ninh Bình" },
  "donVi": { "id": "<orgId>", "ten": "Sở Du lịch" },
  "ky": { "id": "0c000000-0000-0000-0000-000000002526", "ten": "Kỳ 01/10/2025 – 30/09/2026" },
  "hoSo": { "id": "<submissionId>", "trangThai": "DRAFT", "phienBan": 3194, "khoa": false, "hanNop": "2026-11-15" },
  "quyen": {
    "vaiTro": ["UNIT_ENTRY"],
    "actions": ["read", "create", "update", "validate", "submit", "product_propose"],
    "duong": "B",
    "lyDo": "Không có quyền import; có create và update"
  },
  "docLuc": "2026-11-09T14:36:12Z"
}
```
- `duong` do ứng dụng suy ra từ `actions` (có `import` → `A`; có `create`+`update` → `B`; còn lại `chan`), người dùng không sửa tay.

## 5. `ket-noi.json` (bước "Kiểm tra kết nối", chỉ đọc)

```json
{
  "schema": 1,
  "luc": "2026-11-09T14:36:12Z",
  "ketQua": "ok",
  "cacBuoc": [
    { "ten": "cookie",        "ok": true,  "chiTiet": "SESSION còn hạn" },
    { "ten": "auth_me",       "ok": true,  "chiTiet": "200" },
    { "ten": "quyen",         "ok": true,  "chiTiet": "duong B" },
    { "ten": "ho_so",         "ok": true,  "chiTiet": "DRAFT, không khóa" },
    { "ten": "ky",            "ok": true,  "chiTiet": "kỳ đang mở" },
    { "ten": "may_chu_dong_bo","ok": true, "chiTiet": "GET /sync/bootstrap 200" },
    { "ten": "phien_ban_quy_tac","ok": true,"chiTiet": "2026.10.31-v2" }
  ],
  "chan": null
}
```
- `ketQua`: `ok` | `canh_bao` | `chan`. Khi `chan`, `chan` ghi `{ "ma": "COOKIE_HET_HAN" | "THIEU_QUYEN" | "HO_SO_KHOA" | "KY_DONG" | "WAF" | "MANG", "thongBao": "…" }` (thông báo tiếng Việt cho người dùng).

## 6. `trang-thai.json` (máy trạng thái đơn vị)

```json
{
  "schema": 1,
  "buoc": "san_sang_gui",
  "tienDo": 60,
  "ketNoi": "ok",
  "kiemTra": { "tongDong": 417, "dongLoi": 85, "canhBao": 38, "ketQuaFile": "kiem-tra/20261109-2136.json" },
  "thayDoi": { "tong": 332, "tao": 120, "sua": 212, "bo": 0, "file": "thay-doi/thay-doi.json" },
  "goiHienTai": { "changesetId": "cs-3f2a…", "trangThai": "chua_gui", "soLanThu": 0 },
  "loi": null,
  "capNhat": "2026-11-09T14:40:01Z"
}
```
- `buoc`: `chua_chay` → `kiem_tra_ket_noi` → `dang_kiem_tra_file` → `can_xem_xet` → `san_sang_gui` → `dang_gui` → `cho_bien_nhan` → `dong_bo_xong`; nhánh `loi` | `chan` | `da_huy`.
- `goiHienTai.trangThai`: `chua_gui` | `da_gui` | `cho_bien_nhan` | `da_nhan` | `tu_choi` | `loi_mang`.
- Nút giao diện suy từ đây: **Gửi** khi `san_sang_gui`; **Gửi lại** khi `loi`/`loi_mang`/`cho_bien_nhan` quá hạn; **Dựng lại gói** khi nguồn Excel đổi.

## 7. `may-chu/bootstrap.json`

Ảnh chụp hồ sơ lúc tải về, dùng để tính thay đổi (tạo hay sửa dòng nào) và để đối chiếu sau gửi. Định dạng đã khảo sát (xem `GIAO_THUC_THAY_DOI.md`): `tho` là phản hồi `/sync/bootstrap`, các dòng nằm ở `may-chu/hang.json` (`{formKey:[{id,version,data{A..}}]}`). Bọc như sau để thay đổi định dạng của cổng không làm vỡ phần còn lại:

```json
{
  "schema": 1,
  "taiLuc": "2026-11-09T14:36:20Z",
  "submissionId": "<id>",
  "phienBanHoSo": 3194,
  "ruleVersion": "2026.10.31-v2",
  "cursor": "<con-tro>",
  "tho": { }
}
```
- `tho` giữ nguyên phản hồi gốc của cổng; phần còn lại là siêu dữ liệu của ứng dụng.

## 8. `kiem-tra/<runId>.json` (kết quả kiểm tra cục bộ)

Dùng nguyên dạng kết quả của `kiemTraLocal` (đã có trong `vtvl_app`) và thêm đầu đề:

```json
{
  "schema": 1,
  "runId": "20261109-2136",
  "tep": { "ten": "Bo_bieu_VTVL_SDL_47.xlsx", "sha256": "<băm>", "kichThuoc": 163840 },
  "quyTac": { "phienBan": "2026.10.31-v2", "nguon": "vtvl_app/src/cong/local" },
  "ketQua": {
    "tong_dong": 417, "dong_loi": 85, "dong_hop_le": 332,
    "sheets": [ { "ten": "3. B1_KhoiLuong", "so_dong": 120, "so_dong_loi": 47, "so_loi": 47, "so_xem_lai": 12, "dat": false } ],
    "loi": [ { "sheet": "3. B1_KhoiLuong", "dong": 14, "cot": "Mã công việc", "o": "A14", "gia_tri": "CV-9", "ma": "VAL-012", "muc": "loi", "noi_dung": "…", "huong_xu_ly": "…" } ],
    "canh_bao": [ "…" ]
  }
}
```
- Tệp có thể lớn: nếu `loi` quá 5.000 dòng thì chỉ giữ 5.000 dòng đầu trong JSON và ghi đủ vào `ket-qua/*.xlsx`; ghi `daCat: true`.

## 9. `thay-doi/thay-doi.json` (các thay đổi đã tính, chưa gửi)

Đây là "các thay đổi lưu ở folder local" mà người dùng nêu. Mỗi mục là một thay đổi đối với **một dòng của một biểu**, tính bằng cách so dòng đạt trong Excel với ảnh chụp máy chủ theo khóa nghiệp vụ.

```json
{
  "schema": 1,
  "tinhLuc": "2026-11-09T14:40:00Z",
  "nguon": { "sha256": "<băm tệp Excel>", "runId": "20261109-2136" },
  "gocMayChu": { "phienBanHoSo": 3194, "cursor": "<con-tro>" },
  "chinhSach": { "dongLoiChan": true, "trungDong": "bo_qua" },
  "thayDoi": [
    {
      "id": "td-000001",
      "bieu": "b1",
      "dongExcel": 14,
      "khoa": "cv-1",
      "loai": "tao",
      "truong": { "ma_cong_viec": "CV-1", "so_sp": 10, "phut_do": 30 },
      "truoc": null,
      "trangThai": "san_sang"
    },
    {
      "id": "td-000002",
      "bieu": "b1",
      "dongExcel": 15,
      "khoa": "cv-2",
      "loai": "sua",
      "rowId": "<id dòng trên máy chủ>",
      "phienBanDong": 3,
      "truong": { "so_sp": 12 },
      "truoc": { "so_sp": 10 },
      "trangThai": "san_sang"
    }
  ],
  "boQua": [ { "bieu": "b1", "dongExcel": 20, "lyDo": "dong_loi", "ma": "VAL-012" } ]
}
```
- `loai`: `tao` | `sua` | `bo` (chỉ khi người dùng bật). `khoa` là khóa nghiệp vụ chuẩn hóa (`codeKey`).
- `truoc` giữ giá trị cũ để người dùng xem xét và để hoàn tác bằng tay; `boQua` liệt kê dòng không đưa vào (lỗi chặn, trùng) kèm lý do, **không im lặng bỏ dòng**.
- Thay đổi chỉ gồm trường **nhập**, không gồm cột tự tính (cổng tự tính lại).

## 10. `thay-doi/goi/cs-<uuid>.json` (gói gửi lên)

Phần ✅ là các trường thấy ở mã 1.2.8: `changesetId`, `submissionId`, `ruleVersion`, `changes[]`, `createdAt`, `attempts`, `hasMore`, `thuTu`, `taskId`. Cấu trúc **bên trong mỗi `changes[i]`** ⚠️ chưa biết: đề xuất giữ hai lớp, lớp ngoài do ứng dụng quản lý, lớp `body` là đúng thứ gửi cho cổng:

```json
{
  "schema": 1,
  "ungDung": {
    "tuThayDoi": ["td-000001", "td-000002"],
    "dungLuc": "2026-11-09T14:41:00Z",
    "saoLuu": "sao-luu/truoc-20261109-2140"
  },
  "body": {
    "changesetId": "cs-3f2a…",
    "submissionId": "<id>",
    "ruleVersion": "2026.10.31-v2",
    "createdAt": "2026-11-09T14:41:00Z",
    "attempts": 1,
    "hasMore": false,
    "thuTu": 0,
    "changes": [ ]
  },
  "gui": {
    "diaChi": "/submissions/<id>/changesets",
    "tieuDe": { "Idempotency-Key": "cs-3f2a…", "Prefer": "respond-async" },
    "gzip": true
  }
}
```
- Khi một lô vượt `changesetMaxChanges`, tạo nhiều gói cùng `submissionId` với `thuTu` tăng dần và `hasMore: true` ở các gói trừ gói cuối (giống Desktop).
- Gửi lại = gửi đúng `body` đã lưu với cùng `Idempotency-Key`. Cần gói mới (khóa mới) chỉ khi máy chủ trả lỗi cho biết khóa không dùng lại được; khi đó ghi `"thayKhoaTu": "cs-…cũ"`.

## 11. `cs-<uuid>.bien-nhan.json` (biên nhận và kết quả)

```json
{
  "schema": 1,
  "changesetId": "cs-3f2a…",
  "guiLuc": "2026-11-09T14:42:10Z",
  "phanHoiGui": { "httpStatus": 202, "receiptId": "cs-3f2a…", "receivedChanges": 332, "status": "RECEIVED" },
  "theoDoi": [
    { "luc": "2026-11-09T14:42:15Z", "status": "PROCESSING" },
    { "luc": "2026-11-09T14:42:40Z", "status": "APPLIED" }
  ],
  "ketQuaTungThayDoi": [ { "tuThayDoi": "td-000001", "ketQua": "applied", "rowId": "<id>" } ],
  "doiChieu": { "phienBanHoSoSau": 3195, "cursorSau": "<con-tro>", "khop": true }
}
```
- Trạng thái nhận từ cổng (`RECEIVED`, …) và danh sách trạng thái cuối ⚠️ chốt ở G5.1; ứng dụng giữ nguyên chuỗi gốc, không tự dịch.
- `doiChieu.khop`: sau khi `/sync/delta` kéo về, số dòng/`version` của hồ sơ khớp với kỳ vọng từ `thay-doi.json`.

## 12. `nhat-ky.jsonl` (mỗi dòng một sự kiện)

```json
{"luc":"2026-11-09T14:42:10Z","su_kien":"gui_goi","changesetId":"cs-3f2a…","soThayDoi":332,"ketQua":"202","nguoi":"van_hanh"}
```
- Chỉ ghi: thời điểm, sự kiện, mã gói, số lượng, mã HTTP, mã lỗi. **Không** ghi cookie, mật khẩu, giá trị ô, tên cán bộ.
- `nguoi`: tên người vận hành nhập một lần khi mở ứng dụng (như `vtvl_app`), dùng cho xác nhận gửi.

## 13. Lệnh Tauri và sự kiện đề xuất

| Lệnh | Việc |
|---|---|
| `lo_nap(duongDan)` | đọc `lo.json`, tạo thư mục tài khoản còn thiếu |
| `kiem_tra_ket_noi_tat_ca()` | chạy song song, ghi `ket-noi.json`, trả bảng tóm tắt; **chỉ đọc** |
| `chuan_bi(username)` | kiểm tra Excel cục bộ + tính `thay-doi.json`; không gửi |
| `gui(username)` / `gui_lai(username)` | dựng (hoặc dùng lại) gói, gửi, theo dõi biên nhận, kéo `/sync/delta`; cần `xacNhan: {nguoi, soThayDoi}` khớp số hiện tại |
| `gui_tat_ca(danhSach)` | gọi `gui` cho các đơn vị đã chọn, tuân theo giới hạn song song |
| `huy(username)` | hủy lần đang chạy, không xóa gói đã gửi |
| `lay_trang_thai()` | trả mảng `trang-thai.json` của cả lô |

Sự kiện đẩy lên giao diện: `don-vi:buoc` `{ username, buoc, tienDo, thongBao }`, `don-vi:loi` `{ username, ma, thongBao }`.

## 14. Điểm cần xác nhận

1. **Chính sách dòng trùng và dòng lỗi:** mặc định đề xuất `dongLoiChan: true` (không đưa dòng còn lỗi phải sửa vào gói) và `trungDong: "bo_qua"` (như `duplicatePolicy: skip` của cổng). Đúng ý chưa?
2. **Xóa dòng (`loai: "bo"`):** mặc định tắt (không xóa dòng có sẵn trên máy chủ nếu Excel không còn dòng đó). Cần bật không?
3. **Thư mục `data/`:** đặt cạnh ứng dụng hay trong thư mục dữ liệu người dùng của hệ điều hành? Đề xuất cạnh ứng dụng (`dataRoot` cấu hình được) để dễ sao lưu thủ công; cần chặn commit (`.gitignore`) vì chứa dữ liệu đơn vị.
4. **Đã chốt sau khảo sát:** mục 7, 9–11 theo `GIAO_THUC_THAY_DOI.md`. Thân gói đúng thứ cổng nhận (`changesetId, deviceId, ruleVersion, hasMore?, changes`); `createdAt`, `attempts` không gửi. Còn ⚠️: cấu trúc phần tử `results[]` và trạng thái biên nhận.
