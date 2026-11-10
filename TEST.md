# Test plan – VTVL Batch

## Unit tests (Rust)

Chạy:
```bash
cd src-tauri
cargo test
```

| Test | Mô tả |
|------|-------|
| `test_extract_form_action` | Parse form action từ HTML Keycloak |
| `test_extract_form_action_full_url` | Parse action là URL đầy đủ |
| `test_unit_config_parse` | Parse JSON config đơn vị |
| `test_keycloak_login_invalid` | Đăng nhập sai phải lỗi |

## Integration test (thủ công)

1. Sửa `config/units.json` với tài khoản thật
2. Đặt file Excel đúng đường dẫn
3. Chạy `npm run tauri dev`
4. Bấm "Tải cấu hình" → "Chạy tất cả"
5. Quan sát thanh tiến độ từng đơn vị

## Checklist

- [ ] Đăng nhập Keycloak thành công
- [ ] Upload Excel trả về importId
- [ ] Poll đến trạng thái VALIDATED
- [ ] Commit thành công
- [ ] Nhiều đơn vị chạy không xung đột
- [ ] Lỗi hiển thị đúng trên UI
