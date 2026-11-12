//! Kiểm tra bản mới: hỏi GitHub Releases của kho `docbohanh/vtvl-batch`. Chỉ thông báo và mở trang tải, không tự cài.

use serde::Serialize;
use serde_json::Value;
use std::time::Duration;

const API_BAN_MOI: &str = "https://api.github.com/repos/docbohanh/vtvl-batch/releases/latest";
const TIEN_TO_TRANG_TAI: &str = "https://github.com/docbohanh/vtvl-batch/";
const TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug, Serialize, PartialEq)]
pub struct KetQuaCapNhat {
    #[serde(rename = "hienTai")]
    pub hien_tai: String,
    pub moi: String,
    #[serde(rename = "coBanMoi")]
    pub co_ban_moi: bool,
    pub url: String,
    #[serde(rename = "ghiChu")]
    pub ghi_chu: String,
}

/// Tách "v1.0.6", "1.0.6-admin" thành (1, 0, 6); phần hậu tố sau `-` bị bỏ. None nếu không phải số phiên bản.
pub fn doc_phien_ban(s: &str) -> Option<(u64, u64, u64)> {
    let loi = s.trim().trim_start_matches(['v', 'V']);
    let loi = loi.split(['-', '+']).next()?;
    let mut p = loi.split('.');
    let a = p.next()?.parse().ok()?;
    let b = p.next().map_or(Some(0), |x| x.parse().ok())?;
    let c = p.next().map_or(Some(0), |x| x.parse().ok())?;
    if p.next().is_some() { return None; }
    Some((a, b, c))
}

/// Đọc phản hồi `releases/latest` và so với bản đang chạy. Thuần.
pub fn danh_gia(phan_hoi: &Value, hien_tai: &str) -> Result<KetQuaCapNhat, String> {
    let nhan = phan_hoi["tag_name"].as_str().ok_or("Phản hồi của GitHub không có số phiên bản")?;
    let moi = doc_phien_ban(nhan).ok_or_else(|| format!("Không đọc được số phiên bản \"{nhan}\""))?;
    let nay = doc_phien_ban(hien_tai).ok_or_else(|| format!("Không đọc được phiên bản đang chạy \"{hien_tai}\""))?;
    let url = phan_hoi["html_url"].as_str().filter(|u| u.starts_with(TIEN_TO_TRANG_TAI)).unwrap_or(TIEN_TO_TRANG_TAI);
    Ok(KetQuaCapNhat {
        hien_tai: hien_tai.to_string(), moi: nhan.trim_start_matches(['v', 'V']).to_string(), co_ban_moi: moi > nay,
        url: url.to_string(), ghi_chu: phan_hoi["body"].as_str().unwrap_or("").chars().take(1500).collect(),
    })
}

/// Chỉ mở trang thuộc kho phát hành, tránh mở địa chỉ tùy ý do giao diện gửi lên.
pub fn url_hop_le(url: &str) -> bool {
    url.starts_with(TIEN_TO_TRANG_TAI) && !url.chars().any(|c| c.is_whitespace() || c == '"' || c == '&' || c == '|' || c == '^')
}

#[tauri::command]
pub async fn kiem_tra_cap_nhat() -> Result<KetQuaCapNhat, String> {
    let c = reqwest::Client::builder().timeout(TIMEOUT).user_agent("vtvl-batch").build().map_err(|e| e.to_string())?;
    let r = c.get(API_BAN_MOI).header("Accept", "application/vnd.github+json").send().await
        .map_err(|_| "Không kết nối được tới GitHub để kiểm tra bản mới (kiểm tra mạng)".to_string())?;
    if !r.status().is_success() { return Err(format!("GitHub trả về lỗi {} khi kiểm tra bản mới", r.status().as_u16())); }
    let v: Value = r.json().await.map_err(|_| "Phản hồi kiểm tra bản mới không đọc được".to_string())?;
    danh_gia(&v, env!("CARGO_PKG_VERSION"))
}

#[tauri::command]
pub fn mo_trang_tai(url: String) -> Result<(), String> {
    if !url_hop_le(&url) { return Err("Địa chỉ trang tải không hợp lệ".into()); }
    #[cfg(target_os = "macos")]
    let mut lenh = std::process::Command::new("open");
    #[cfg(target_os = "windows")]
    let mut lenh = { let mut l = std::process::Command::new("rundll32"); l.arg("url.dll,FileProtocolHandler"); l };
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut lenh = std::process::Command::new("xdg-open");
    lenh.arg(&url).spawn().map(|_| ()).map_err(|e| format!("Không mở được trình duyệt: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn doc_phien_ban_bo_tien_to_v_va_hau_to() {
        assert_eq!(doc_phien_ban("v1.0.6"), Some((1, 0, 6)));
        assert_eq!(doc_phien_ban("1.0.4-admin"), Some((1, 0, 4)));
        assert_eq!(doc_phien_ban("v2.1"), Some((2, 1, 0)));
        assert_eq!(doc_phien_ban("abc"), None);
        assert_eq!(doc_phien_ban("1.2.3.4"), None);
    }

    #[test]
    fn so_sanh_theo_so_chu_khong_theo_chuoi() {
        let pr = |t: &str| json!({"tag_name": t, "html_url": "https://github.com/docbohanh/vtvl-batch/releases/tag/x", "body": "ghi chú"});
        assert!(danh_gia(&pr("v1.0.10"), "1.0.9").unwrap().co_ban_moi);
        assert!(!danh_gia(&pr("v1.0.6"), "1.0.6").unwrap().co_ban_moi);
        assert!(!danh_gia(&pr("v1.0.5"), "1.0.6").unwrap().co_ban_moi);
        assert_eq!(danh_gia(&pr("v1.1.0"), "1.0.6").unwrap().moi, "1.1.0");
        assert!(danh_gia(&json!({}), "1.0.6").is_err());
    }

    #[test]
    fn url_la_ngoai_kho_thi_bi_thay_bang_trang_goc_va_khong_duoc_mo() {
        let r = danh_gia(&json!({"tag_name": "v9.0.0", "html_url": "https://evil.example/x"}), "1.0.0").unwrap();
        assert_eq!(r.url, TIEN_TO_TRANG_TAI);
        assert!(!url_hop_le("https://evil.example/x"));
        assert!(!url_hop_le("https://github.com/docbohanh/vtvl-batch/ && calc"));
        assert!(url_hop_le("https://github.com/docbohanh/vtvl-batch/releases/tag/v1.0.7"));
    }
}
