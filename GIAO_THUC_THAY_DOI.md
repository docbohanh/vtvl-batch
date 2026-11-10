# Giao thức gói thay đổi (đường B) – kết quả khảo sát

**Nguồn:** đọc mã `TapHuan_HDSD/1.2.8/assets/runtime-*.js` (lớp đồng bộ của ứng dụng) và **gọi thật các API chỉ đọc** bằng tài khoản thử (`/sync/bootstrap`, `/files/{id}`, `/submissions/{id}/progress`, `/client/config`).
**Chưa gửi gói thật lần nào.** ✅ = thấy trong mã hoặc đã gọi thật; ⚠️ = suy ra, chưa xác minh bằng gửi thật.

## 0. Đăng nhập kênh Desktop (✅ gọi thật)

`POST /api/v1/auth/desktop/login` thân `{username, password, deviceId, deviceName, appVersion, platform}` (kèm tiêu đề `X-Device-Id`, `X-Device-Name`, `X-App-Version`, `X-Platform`) → `{accessToken, refreshToken, expiresIn, refreshExpiresIn}`; sai mật khẩu → 401 `INVALID_CREDENTIALS`. Mọi gọi sau gửi `Authorization: Bearer <accessToken>` (không cần cookie, XSRF). Làm mới: `POST /api/v1/auth/desktop/refresh` `{refreshToken}` (⚠️ định dạng chưa xác minh bằng gọi thật; ứng dụng dự phòng bằng đăng nhập lại khi lỗi hoặc gặp 401). Không bị tầng WAF chặn (khác trang đăng nhập web). `X-App-Version` tối thiểu 1.1.1 (`/client/config`); ứng dụng gửi 1.2.8 (phiên bản giao thức tuân theo). Điểm vào được tìm thấy trong tệp thực thi Desktop (chuỗi `/auth/desktop/login`, `/auth/desktop/refresh`).

## 1. Đọc hồ sơ (✅ gọi thật, chỉ đọc)

1. `GET /sync/bootstrap?periodId=<kỳ>&submissionIds=<hồ sơ>` → `{cursor, user, assignments, period, catalogs[], enumerations[], ruleVersion, submissions:[{submission{id,status,version,forms[],allowedActions,…}, rowsFileId}]}`. `ruleVersion` của hồ sơ thử là `2026.1` (khác `2026.10.31-v2` là phiên bản bộ quy tắc kiểm tra tệp).
2. `GET /files/{rowsFileId}` (302 sang kho lưu trữ, nội dung gzip) → `{formKey: [ {id, formKey, version, rowNo, deleted, inherited, source, validation, updatedAt, updatedBy, auditRef, data{A,B,…}} ]}`. **`data` khóa theo chữ cột** (A…N), giá trị chữ hoặc số.
3. `GET /submissions/{id}/progress` → `forms[{formKey, assigned, canView, canEdit, rowCount, counts…}]`. **Quyền sửa phụ thuộc KÊNH đăng nhập, không chỉ tài khoản (✅ kiểm chứng 10/11/2026):** với phiên web (cookie) cùng một tài khoản có `canEdit = 0/11`, `allowedActions: ["EXPORT"]`, `/auth/me.actions` không có `import`; gửi gói bằng phiên này bị từ chối từng thay đổi (`REJECTED`: "Dữ liệu của đơn vị khác chỉ được xem, không sửa được."), xóa REST bị 403 "chỉ sửa/xóa trên ứng dụng máy tính". Với **kênh Desktop** (`POST /api/v1/auth/desktop/login` → token Bearer) cùng tài khoản có `canEdit = 10/11`, `allowedActions: ["EDIT","IMPORT","VALIDATE","EXPORT"]`, `assignments…edit = 10`, `actions` có `import`. Ứng dụng đăng nhập kênh Desktop (cần `password` trong cấu hình đơn vị).
4. `GET /client/config` → `{changesetReceipts: true, legacyChangesets: true, syncIntervalSeconds, …}`: cổng hỗ trợ cả đường biên nhận mới và đường gói thay đổi cũ.

## 2. Gói thay đổi (✅ theo mã Desktop)

`POST /submissions/{submissionId}/changesets`
- Tiêu đề: `Idempotency-Key: <changesetId>`, `Prefer: respond-async`, `Content-Encoding: gzip` (nếu nén), `X-XSRF-TOKEN`, và định danh thiết bị `X-Device-Id`, `X-Device-Name`, `X-App-Version`, `X-Platform`. Thiết bị đăng ký ngầm qua tiêu đề (không thấy lời gọi `POST /devices`); ⚠️ chưa xác minh với phiên cookie.
- Thân: `{changesetId, deviceId, ruleVersion, hasMore?: true, changes: [...]}`; tối đa 1.000 `change` mỗi gói (`hasMore: true` ở mọi gói trừ gói cuối).
- Mỗi `change`: `{changeId, formKey, rowId, clientRowId, op, baseVersion, fields, changedAt, source}`.
  - `op`: `CREATE` | `UPDATE` | `DELETE`.
  - `CREATE`: `rowId = clientRowId = UUID v7` mới, `baseVersion = null`, `fields` = các ô nhập (chữ cột → chữ|null).
  - `UPDATE`: `rowId` = id dòng máy chủ, `clientRowId = null`, `baseVersion` = `version` dòng, `fields` = chỉ các ô đổi.
  - `DELETE`: như UPDATE, `fields = {}`.
  - `source`: `{kind: "IMPORT", importId}` khi nhập từ Excel; `changedAt`: ISO-8601 UTC.
- Thứ tự: tạo/sửa theo thứ tự biểu nhập (C1, A1, A2, B1, B2, C2, C3, D1, dự báo, D2); xóa xếp sau cùng, biểu con trước (B1… hạng 1, A2 hạng 2, A1 và C1 hạng 3).
- Phản hồi: `202 {taskId, status: QUEUED|RUNNING|SUCCEEDED|FAILED, receivedChanges, retryAfterSeconds?}` (phải khớp số `change` đã gửi), rồi theo dõi `GET /submissions/{id}/changeset-tasks/{taskId}` → `{status, taskId, receivedChanges, result:{results[]}, errorCode, userMessage, supportCode, nextAction, resultExpired}`; hoặc `200 {results[]}`.
- Mã lỗi nghiệp vụ (`problem+json`, trường `code`): `IDEMPOTENCY_KEY_REUSED` (đổi khóa, gửi gói mới), `SUBMISSION_LOCKED`, `PERIOD_CLOSED` (dừng), `SYNC_QUEUE_FULL` (chờ rồi thử lại), `DEVICE_REVOKED`.
- ✅ Phần tử `results[]` (gặp thật): `{changeId, rowId, clientRowId, version, status, userMessage, errors[], conflicts[], rowDeleted}`; `status: "REJECTED"` kèm `userMessage` là lý do để hiện cho người dùng. Giá trị `status` khi thành công chưa gặp (ứng dụng đếm theo từ khóa `CONFLICT`/`REJECT`/`FAIL`/`ERROR`, lưu bản gốc, và đối chiếu bằng tải lại ảnh chụp). Phản hồi gói cũng có `cursor`.
- ⚠️ Chưa biết: đường biên nhận (`POST /submissions/{id}/changeset-receipts`, `GET /sync/changeset-receipts`) mà Desktop ưu tiên; ứng dụng dùng đường cũ (`changesets`) vì `legacyChangesets: true`.

## 2b. Xóa dữ liệu (✅ gọi thật phần đọc; ⚠️ phần gửi chưa thử)

`POST …/rows/bulk-delete` và `DELETE …/rows/{id}` bị cổng chặn với phiên web (403 "chỉ sửa/xóa trên ứng dụng máy tính", gặp thật ngày 10/11/2026), trong khi `GET …/forms/{form}` (đếm dòng) vẫn chạy. Desktop xóa bằng thay đổi `op: DELETE` (`fields: {}`, `baseVersion` = version dòng, `source: null`) trong gói thay đổi. Ứng dụng làm giống: dựng gói `DELETE` từ ảnh chụp hồ sơ (biểu sau trước), gửi, tải lại ảnh chụp để đối chiếu số dòng còn lại.

## 3. Cách ứng dụng kiểm chứng kết quả

Không phụ thuộc định dạng `results[]`: sau khi gửi, ứng dụng **tải lại ảnh chụp hồ sơ** và tính lại thay đổi từ cùng dữ liệu Excel; còn 0 thay đổi nghĩa là hồ sơ trên cổng khớp tệp (`ket-qua/doi-chieu.json`).

## 4. Cài đặt trong mã

| Việc | Tệp |
|---|---|
| Tải ảnh chụp, chuẩn hóa, biểu được sửa | `may_chu.rs`, `ket_noi.rs` (`phan_cong`) |
| Tính thay đổi (lọc biểu không được sửa) | `thay_doi.rs` |
| Dựng gói, gửi, theo dõi tác vụ, đổi khóa | `goi.rs` (test bằng máy chủ giả `thu_gia.rs`) |
| Thiết bị | `lo.rs` (`thiet_bi`), `portal.rs` (`ThietBi`) |
| Đường A (kết chuyển qua `/imports/{id}/commit`) | `ket_chuyen.rs`, `imports.rs`, nhánh `chuan_bi_a`/`gui_a` ở `main.rs` |

**Gửi thật bị khóa mặc định** (`settings.choPhepGuiThat = false`): ở chế độ khô ứng dụng dựng và lưu gói nhưng không gọi cổng. Chỉ bật sau khi thử trên đơn vị thử.

## 5. Điều kiện trước khi bật gửi thật

1. Tài khoản thử có `canEdit = true` ở ít nhất một biểu (quản trị đơn vị phân công quyền Sửa). Với `edit = false` đã xác nhận: máy chủ từ chối mọi thay đổi.
2. So gói ứng dụng dựng với gói do chính Desktop/web sinh ra cho cùng một thao tác (quan sát lưu lượng khi sửa một dòng trên đơn vị thử).
3. Gửi một gói một thay đổi, xem `results[]` và `doi-chieu.json`; cập nhật `dem_ket_qua` theo giá trị thật.
