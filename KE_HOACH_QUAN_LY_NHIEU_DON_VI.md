# Kế hoạch: quản lý nhiều đơn vị song song (đăng nhập → tải Excel → kiểm tra → kết chuyển → đồng bộ)

**Phạm vi:** `vtvl-batch/src-tauri` (Tauri 2, Rust) và `src/App.tsx`.
**Cơ sở nghiệp vụ:** `TapHuan_HDSD/1.2.8` (mã nguồn web bản 1.2.8, `SO_SANH_KIEM_TRA_LOCAL.md`), `vtvl_desktop_analyze.md`, `vtvl_app/src/cong` và `vtvl_app/src/cong/local`.
**Ngày:** 09/11/2026. **Trạng thái:** đã nhận quyết định Q1–Q4 (09/11/2026), xem mục 3A; cấu trúc dữ liệu ở `DE_XUAT_JSON.md`; chưa có mã mới.

Quy ước: ✅ đã đọc thấy trong mã 1.2.8 hoặc đã gọi thật; ⚠️ suy ra, chưa xác minh; ❓ cần người dùng quyết định.

---

## 1. Mục tiêu và nguyên tắc

Một người vận hành (đầu mối) xử lý bộ biểu của nhiều đơn vị cùng lúc: mỗi đơn vị có tài khoản và một tệp Excel; ứng dụng chạy tuần tự từng bước cho từng đơn vị, các đơn vị chạy song song, thấy rõ đơn vị nào dừng ở đâu và vì sao.

Nguyên tắc (kế thừa từ `vtvl_app`):
1. **Mặc định chỉ đọc và chỉ kiểm tra.** Ghi vào hồ sơ trên cổng (kết chuyển, gửi) chỉ khi người dùng bấm xác nhận cho từng lô, có xem trước số liệu.
2. **Không báo "xong" khi chưa kiểm chứng thật.** "ĐẠT" của cổng/lõi chỉ là kiểm tra kỹ thuật, xác nhận nghiệp vụ là việc của con người.
3. **Không vượt tầng chống tự động (WAF).** Dùng cookie người dùng tự đăng nhập; không có cơ chế né WAF.
4. **Bí mật chỉ nằm trong bộ nhớ hoặc kho khóa của hệ điều hành**, không ghi vào log, không commit.
5. **Lỗi từng đơn vị không làm hỏng lô.** Mỗi bước có thể chạy lại, có khóa chống ghi trùng (Idempotency-Key).

## 2. Phát hiện nghiệp vụ từ bản 1.2.8 quyết định thiết kế

### 2.1. Có hai đường đưa dữ liệu vào hồ sơ

| | Đường A: nhập tệp qua cổng (server) | Đường B: máy tính (local-first + đồng bộ) |
|---|---|---|
| Kiểm tra | `POST /imports` → cổng kiểm tra (`CHECKING → VALIDATING → VALIDATED/FAILED`) ✅ | kiểm tra ngay trên máy bằng bộ quy tắc cục bộ ✅ (đã chuyển sang `vtvl_app/src/cong/local`) |
| Kết chuyển | `POST /imports/{id}/commit`, header `If-Match "{version}"`, body `{duplicatePolicy:"skip"}`; có thể trả `202` rồi đọc `commitResult` từ `GET /imports/{id}` ✅ | ghi vào kho cục bộ (outbox), chưa lên máy chủ ✅ |
| Đồng bộ | không cần (đã ghi lên máy chủ) | gửi gói thay đổi `POST /submissions/{id}/changesets` (header `Idempotency-Key`, `Prefer: respond-async`, gzip), nhận biên nhận `changeset-receipts`, kéo về `/sync/bootstrap` + `/sync/delta` ✅ (định dạng chi tiết gói thay đổi ⚠️ chưa đọc hết) |
| Quyền cần | `import` (xem `/auth/me.actions`) ✅ | `create`, `update`, `submit`… ✅ |
| Gửi lên cấp trên | `POST /submissions/{id}/submit` (body `{expectedVersion, comments}`, `Idempotency-Key`) ✅ | như trái |

**Hệ quả:** tài khoản `kekhai_nb_dulich` có `read, create, update, validate, submit, product_propose`, **không có `import`**. Vì vậy đường A bị 403 (đúng lỗi trong ảnh) và đường duy nhất khả thi cho tài khoản này là **đường B**. Tài khoản `thu.kekhai.xa` có `import`, đi được đường A. Ứng dụng phải hỗ trợ cả hai, chọn theo quyền thực của từng tài khoản (đọc từ `/auth/me`), không theo cấu hình tay.

### 2.2. Các điều kiện ràng buộc khác (✅ trừ khi ghi khác)

- Đăng nhập Keycloak (realm `vtvl`, client `vtvl-web`) qua WAF Cloudrity: cần cookie `D1N` + `SESSION` + `XSRF-TOKEN`; đăng nhập mật khẩu tự động bị WAF chặn (chưa thử lại bằng trình duyệt thật nhúng trong ứng dụng).
- Mọi yêu cầu ghi gửi `X-XSRF-TOKEN`; hồ sơ có `version` tăng dần (`If-Match`, `expectedVersion`) nên hai người cùng sửa sẽ xung đột (409/412).
- Ngữ cảnh gửi: `orgId`, `periodId`, `submissionId`, `templateVersion=v2` (`/auth/me`, `/periods`, `/submissions`) ✅.
- Trạng thái hồ sơ (`DRAFT`, …) và hạn nộp (`dueDate` 15/11/2026) ✅; hồ sơ bị khóa (`locked`) thì không gửi thay đổi ✅.
- Tệp kết quả (`result-file`) là tác vụ bất đồng bộ: `jobId → /jobs/{id} → /files/{fileId}` (302 sang kho lưu trữ) ✅.
- Danh mục sản phẩm chuẩn (`/catalogs/products`, phân trang) cần cho kiểm tra mã SP ở B1 ✅.
- Quy tắc kiểm tra có phiên bản (`ruleVersion 2026.10.31-v2`, `/sync/rule-packages/{ruleVersion}`) ✅; bản local đã đối chiếu tới L3, còn thiếu phân quyền theo vai trò và vài giới hạn kích thước.

## 3. Quyết định cần chốt trước khi viết mã (❓)

| # | Câu hỏi | Khuyến nghị |
|---|---|---|
| Q1 | Hỗ trợ đường nào? | **Cả hai, đường B làm sau đường A.** A nhanh, ít rủi ro (chỉ gọi API đã đọc rõ). B cần tài khoản không có `import` nhưng phải đảo ngược giao thức gói thay đổi, rủi ro cao. Nếu hầu hết đơn vị là loại như `kekhai_nb_dulich`, đổi thứ tự: B làm trước. |
| Q2 | "Đồng bộ" nghĩa là gì? | Đường A: **kéo** (`/sync/delta`) để xác nhận hồ sơ đã khớp và đọc kết quả tính lại. Đường B: **đẩy** gói thay đổi rồi kéo. Cần xác nhận đúng ý. |
| Q3 | Có tự động bấm Gửi/Nộp (`submit`) không? | **Không** trong lần đầu. Nộp là việc có hệ quả nghiệp vụ (khóa hồ sơ, báo cấp trên): làm thành bước riêng, mặc định tắt, mỗi lô một xác nhận. |
| Q4 | Kiểm tra cục bộ chạy bằng gì? | **Tiến trình phụ Node chạy lại lõi `vtvl_app`** (một nguồn sự thật, không port sang Rust). Gói Windows của `vtvl_app` đã kèm Node. |
| Q5 | Lấy cookie bằng cách nào? | Giai đoạn đầu **dán tay** (đã làm). Sau đó **cửa sổ đăng nhập nhúng (webview của Tauri)** để người dùng tự đăng nhập, ứng dụng đọc cookie; không đọc kho cookie của Chrome. |
| Q6 | Thử nghiệm ở đâu? | Cần **tài khoản/đơn vị thử** do đầu mối cấp (file "Tài khoản để các đơn vị không làm điểm thao tác thử.xlsx" gợi ý có). Không chạy ghi trên đơn vị thật khi chưa xong G5. |

## 3A. Quyết định đã nhận (09/11/2026)

- Q1: **đường B** là đường chính (phần lớn đơn vị có quyền như `kekhai_nb_dulich`); đường A xuống thứ yếu, chỉ giữ cho tài khoản có `import`.
- Q2: **đồng bộ = đẩy gói thay đổi lên**; mỗi tài khoản có một thư mục local theo username lưu nguồn, kết quả kiểm tra, các thay đổi, gói, biên nhận, nhật ký.
- Q3: **không tự gửi/nộp.** Kiểm tra kết nối tất cả trước; nút **Gửi tất cả** ở trên cùng; **Gửi / Gửi lại** trong từng đơn vị. Nộp hồ sơ (`submit`) không nằm trong lần làm này.
- Q6: người dùng cấp tài khoản và đơn vị thử.
- **Hệ quả cho thứ tự giai đoạn:** G5 (đường B) lên trước G4 (đường A). Làm G1–G3, rồi khảo sát giao thức (G5.1) ngay khi có tài khoản thử; G4 đưa xuống cuối, G6 bỏ khỏi phạm vi.

## 4. Mô hình trạng thái mỗi đơn vị

```
PENDING → CONNECTING → CONTEXT → CHECK_LOCAL → (UPLOAD_CHECK ← chỉ đường A) → REVIEW
        → [chờ xác nhận người dùng] → COMMIT → SYNC → [tùy chọn: chờ xác nhận] → SUBMIT → DONE
        bất kỳ bước → FAILED(lý do, bước) | BLOCKED(thiếu quyền/cookie hết hạn/hồ sơ khóa) | CANCELLED
```

- **REVIEW** là điểm dừng bắt buộc: hiển thị tổng dòng, số dòng lỗi phải sửa, cảnh báo, theo biểu; nếu còn lỗi chặn thì không cho kết chuyển (có tùy chọn "kết chuyển phần hợp lệ" như giao diện cổng, mặc định tắt).
- Mỗi chuyển trạng thái ghi một dòng nhật ký (thời điểm, đơn vị, bước, kết quả), **không ghi dữ liệu cán bộ, không ghi cookie/mật khẩu**.
- Lưu trạng thái ra đĩa (`logs/<lô>/<đơn vị>.json`) để mở lại ứng dụng vẫn thấy lô đang dở và chạy tiếp được (bước đã xong không chạy lại, nhờ `importId`/`changesetId`).

## 5. Kiến trúc kỹ thuật

```
src-tauri/src/
  main.rs                  # lệnh Tauri, trạng thái chung, điều phối lô
  portal.rs                # phiên (cookie, XSRF), gọi API, phân loại lỗi, thử lại   (có)
  imports.rs               # đường A: /imports, theo dõi, tải kết quả                 (có, thiếu commit)
  ngu_canh.rs              # (tách từ imports.rs) /auth/me, /periods, /submissions, kiểm quyền
  kiem_tra_local.rs        # chạy tiến trình phụ Node, đọc JSON kết quả kiểm tra cục bộ
  ket_chuyen.rs            # đường A: commit, 202→commitResult, duplicatePolicy, If-Match
  dong_bo.rs               # kéo: /sync/bootstrap, /sync/delta, đối chiếu sau kết chuyển
  thay_doi.rs              # đường B: dựng gói thay đổi, gửi, biên nhận   (giai đoạn sau)
  lo.rs                    # lô: danh sách đơn vị, trạng thái, lưu/khôi phục, nhật ký
src/ (React)               # bảng lô, màn xem xét, hộp xác nhận, nhập cookie
```

- **Song song:** `Semaphore` (mặc định 3, tối đa 5) và **giới hạn tốc độ theo máy chủ** (tối thiểu 300 ms giữa hai yêu cầu cùng một phiên) để không kích hoạt WAF; một phiên cho mỗi đơn vị, không dùng chung cookie giữa đơn vị.
- **Thử lại:** chỉ cho yêu cầu đọc và yêu cầu có `Idempotency-Key`; **commit/submit/changeset dùng khóa ổn định theo `(đơn vị, importId|changesetId)`** nên thử lại an toàn; không có khóa thì không thử lại.
- **Xung đột phiên bản:** 409/412 → đọc lại `version`, báo người dùng, không tự ghi đè.
- **Tiến trình phụ:** thêm lệnh `node src/cli.js kiem-tra-local <xlsx> --kieu=full|single --form=<khóa> --ky=<nhãn> --danh-muc=<tệp JSON> --json` (vtvl_app); Tauri gọi qua `Command::sidecar`, hết giờ 120 s, đọc JSON `{tong_dong, dong_loi, sheets, loi, canh_bao}`.
- **Cấu hình:** `config/units.json` chỉ còn khai báo đơn vị, tệp, chế độ; **cookie không ghi vào tệp**, dán khi chạy (bộ nhớ) hoặc lưu vào kho khóa hệ điều hành (Keychain/Credential Manager) nếu người dùng chọn.
- **Giao diện:** bảng lô (đơn vị, quyền, bước, tiến độ, kết quả), nút hành động theo trạng thái (Chạy kiểm tra / Xem xét / Kết chuyển / Đồng bộ / Nộp), ngăn chi tiết lỗi theo biểu (đọc `Danh sách lỗi`), cột "quyền" hiện `import`/không để người dùng biết trước đường nào áp dụng.

## 6. Các giai đoạn

Kích thước: S ≤ 1 ngày, M 2–3 ngày, L ≥ 4 ngày (ước lượng thô).

### G0. Chốt Q1–Q6 và dựng môi trường thử (S)
- Người dùng trả lời Q1–Q6; xin tài khoản/đơn vị thử có hồ sơ riêng.
- Kết quả: biên bản quyết định; một tài khoản ghi được mà không ảnh hưởng số liệu thật.

### G1. Nền tảng lô và trạng thái bền (M)
- `lo.rs`: nạp danh sách đơn vị, trạng thái theo mô hình mục 4, lưu/khôi phục, nhật ký không dữ liệu nhạy cảm.
- Lệnh Tauri: `lo_nap`, `lo_trang_thai`, `lo_chay_buoc(đơn vị, bước)`, `lo_huy`.
- Giao diện: bảng lô, trạng thái theo bước, xem lỗi từng đơn vị.
- **Nghiệm thu:** đóng mở ứng dụng giữa chừng, lô tiếp tục từ bước dở; test đơn vị cho chuyển trạng thái và khôi phục.

### G2. Kết nối, ngữ cảnh, quyền (M)
- Tách `ngu_canh.rs`: đọc `/auth/me` (quyền `actions`, `roles`, `orgUnits`, `defaultPeriodId`), `/periods`, `/submissions` (trạng thái, `version`, `locked`, hạn nộp).
- Quyết định **đường** theo quyền: có `import` → A; không có nhưng có `create`+`update` → B; còn lại → BLOCKED kèm lý do rõ.
- Cửa sổ đăng nhập nhúng lấy cookie (Q5), hoặc dán tay; kiểm tra cookie còn hạn trước khi chạy cả lô, cảnh báo tập trung khi cookie sắp hết hạn.
- **Nghiệm thu:** với hai tài khoản đã có (`thu.kekhai.xa`, `kekhai_nb_dulich`) hiện đúng quyền và đường; mô phỏng cookie hết hạn → BLOCKED, không thử lại vô hạn.

### G3. Kiểm tra (M)
- Thêm lệnh `kiem-tra-local` vào `vtvl_app/src/cli.js`; `kiem_tra_local.rs` gọi tiến trình phụ; đóng gói Node kèm theo.
- Tải và lưu **danh mục sản phẩm chuẩn** một lần cho cả lô (cache theo ngày) để kiểm tra mã SP (VAL-003) và phút chuẩn (L3 của B1); truyền nhãn kỳ để kiểm VAL-004.
- Đường A bổ sung: `POST /imports` (đã có) → theo dõi → tải `result-file`; **so kết quả cổng với kết quả cục bộ** và ghi chênh lệch (đây cũng là phép thử độ chính xác của bộ quy tắc cục bộ, nguồn dữ liệu để vá lỗ hổng).
- Màn REVIEW: tổng dòng, dòng lỗi phải sửa, hợp lệ, theo biểu; nút xuất báo cáo lỗi.
- **Nghiệm thu:** cùng một tệp, kết quả cục bộ và của cổng trùng ở số dòng lỗi phải sửa cho tập tệp mẫu; mọi khác biệt được liệt kê, không ẩn.

### G4. Kết chuyển và đồng bộ, đường A (M)
- `ket_chuyen.rs`: `GET /imports/{id}` lấy `version` → `POST .../commit` với `If-Match`, `duplicatePolicy: skip` (mặc định; chọn khác phải xác nhận) → xử lý `202` bằng cách chờ rồi đọc `commitResult` (`added, updated, skippedDuplicate, rejected, remaining`).
- Trước khi kết chuyển: **sao lưu hiện trạng** (`GET /submissions/{id}/forms/{formKey}` theo biểu bị ảnh hưởng) vào `logs/<lô>/<đơn vị>/truoc/`.
- `dong_bo.rs`: sau kết chuyển gọi `/submissions/{id}/recalculate` (có `Idempotency-Key`) rồi `/sync/delta`/`GET /submissions/{id}` để đối chiếu `version`, `counts`, tiến độ.
- Hộp xác nhận hiển thị số liệu sắp ghi; chỉ chạy sau khi người dùng gõ xác nhận (nhật ký ghi người, giờ).
- **Nghiệm thu (trên đơn vị thử):** kết chuyển một tệp nhỏ, số `added` khớp, `version` tăng 1; chạy lại cùng tệp thì `skippedDuplicate` đúng, không ghi trùng; ngắt mạng giữa chừng rồi chạy lại không nhân đôi.

### G5. Đường B: gói thay đổi và đồng bộ (L, rủi ro cao)
Trình tự: **khảo sát giao thức trước, viết mã sau.**
1. **Khảo sát (M):** đọc đủ mã `runtime-*.js` (hàm `gopThayDoi`, `Ce`, `takeBatch`, `submitChangeset`, `guiBienNhan`, `layKetQuaBienNhan`, trạng thái biên nhận `tt`), `/sync/rule-packages`, `/sync/bootstrap`; ghi cấu trúc `change`, `entryIds`, `ruleVersion`, `baseVersion`, kích thước lô (`Te`), mã lỗi; **quan sát lưu lượng thật** của ứng dụng Desktop trên đơn vị thử (Playwright/DevTools). Kết quả là tài liệu `GIAO_THUC_THAY_DOI.md`.
2. **Dựng gói (M):** từ kết quả kiểm tra cục bộ và tệp Excel dựng gói thay đổi đúng cấu trúc; chạy **chế độ khô** (in gói, không gửi) so với gói do chính ứng dụng Desktop sinh ra cho cùng dữ liệu.
3. **Gửi (M):** `POST /submissions/{id}/changesets` (gzip, `Idempotency-Key`, `Prefer: respond-async`) → `202` biên nhận → theo dõi `changeset-receipts` / `changeset-tasks` tới trạng thái cuối → kéo `/sync/delta` xác nhận.
4. Mọi sai khác với Desktop → dừng, không gửi lên đơn vị thật.
- **Điều kiện vào G5:** đã có đơn vị thử và đã xong G4. **Nếu khảo sát cho thấy giao thức cần ký/khóa riêng của Desktop hoặc phụ thuộc kho cục bộ mã hóa (SQLCipher) thì dừng, báo lại, không cố vượt.**

### G6. Nộp hồ sơ (tùy chọn, S–M)
- `POST /submissions/{id}/submit` với `expectedVersion`, ghi chú; chỉ khi `readiness` (`GET /submissions/{id}/readiness`) báo đủ điều kiện, mặc định tắt, xác nhận riêng cho từng đơn vị.
- **Nghiệm thu:** chỉ trên đơn vị thử.

### G7. Hoàn thiện (M)
- Báo cáo tổng hợp lô (xuất Excel: đơn vị, đường, bước dừng, lý do, số liệu), thông báo khi xong, lịch chạy lại các đơn vị lỗi.
- Đóng gói Windows (kèm Node), hướng dẫn sử dụng, kiểm thử trên Windows sạch.

## 7. Kiểm thử

- **Rust (`cargo test`, đã có 22 test):** thêm test cho máy trạng thái, khôi phục lô, kết chuyển với máy chủ giả (hyper hoặc `wiremock`) gồm: 202→poll, 409/412, thử lại có khóa, hết cookie giữa lô, thiếu quyền.
- **Hợp đồng API:** bộ phản hồi mẫu đã ẩn dữ liệu (từ `/auth/me`, `/imports/{id}`, `commitResult`) để test không gọi cổng thật.
- **Cục bộ:** `tests/kiem-tra-local.test.js` (đã có, 22 test) + thêm test cho lệnh CLI.
- **Thật (thủ công, đơn vị thử):** danh sách kiểm G2–G6 ở trên; Playwright cho luồng đăng nhập nhúng nếu làm Q5.
- Quy ước dự án vtvl_app: test viết sẵn, chạy tệp hẹp khi cần; riêng vtvl-batch chạy `cargo test` được vì nhanh.

## 8. Rủi ro và cách giảm

| Rủi ro | Mức | Giảm |
|---|---|---|
| Ghi nhầm hoặc ghi trùng vào hồ sơ thật | Cao | Điểm dừng REVIEW, xác nhận từng lô, sao lưu trước, khóa `Idempotency-Key`, thử trên đơn vị thử trước |
| WAF chặn hoặc khóa IP vì nhiều phiên song song | Trung bình | Giới hạn song song và tốc độ, một phiên/đơn vị, dùng cookie từ trình duyệt thật, dừng cả lô khi gặp trang thử thách |
| Cookie hết hạn giữa lô | Trung bình | Kiểm trước khi chạy, BLOCKED rõ ràng, nhập lại cookie rồi chạy tiếp từ bước dở |
| Giao thức gói thay đổi không khảo sát hết được | Cao | G5 tách thành khảo sát trước; điều kiện dừng; không phát hành đường B nếu không khớp với Desktop |
| Quy tắc kiểm tra cục bộ lệch cổng (thiếu phân quyền, giới hạn ô/dòng, gợi ý rút gọn) | Trung bình | So kết quả cổng với cục bộ ở G3 và ghi chênh lệch; cổng là nguồn quyết định khi có |
| Quy tắc đổi theo phiên bản (`ruleVersion`) | Trung bình | Đọc `/sync/rule-packages`, cảnh báo khi phiên bản cổng khác `2026.10.31-v2` |
| Rò rỉ bí mật (cookie, mật khẩu) | Cao | Chỉ trong bộ nhớ/kho khóa, không log, `units.json` không chứa bí mật, `.gitignore` |
| Dữ liệu cán bộ trong tệp và log | Trung bình | Log chỉ ghi mã đơn vị, số dòng, mã lỗi; tệp kết quả lưu cục bộ, không gửi dịch vụ ngoài |

## 9. Câu hỏi mở

1. Q1–Q6 ở mục 3.
2. Số đơn vị thường dùng một lô và tần suất (ảnh hưởng giới hạn song song)?
3. Một đầu mối có nhiều tài khoản hay mỗi đơn vị một tài khoản riêng (tên đăng nhập/mật khẩu do ai giữ)?
4. Quy tắc "kết chuyển phần hợp lệ" khi còn dòng lỗi: cho phép hay chỉ kết chuyển khi sạch lỗi?
5. Cần giữ lại tệp kết quả/báo cáo bao lâu, lưu ở đâu?
6. Mâu thuẫn quyền: `kekhai_nb_dulich` không có `import` nhưng thấy nút Kết chuyển trên Desktop. Giả thuyết ở mục 2.1 (đường B) **chưa xác minh**; kiểm chứng ở G2/G5 bằng cách quan sát lưu lượng khi bấm Kết chuyển trên Desktop.
