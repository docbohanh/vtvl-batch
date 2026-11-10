//! Cổng mật khẩu khi khởi động, cùng logic với `vtvl_app/src/services/pass-phase.js`:
//! lấy `pass_start` (mã băm bcrypt) trên GitLab, lưu bản sao cục bộ làm dự phòng khi mất mạng, tối đa 3 lần nhập.
//! Chỉ giữ mã băm, không bao giờ giữ mật khẩu. Đây là chốt chặn cho người dùng thường, không phải xác thực mạnh.

use std::path::{Path, PathBuf};
use std::time::Duration;

pub const PASS_PHASE_URL: &str = "https://gitlab.com/thanhladev/vtvl_config/-/raw/main/pass_phase";
pub const SO_LAN_TOI_DA: u32 = 3;
const TIMEOUT: Duration = Duration::from_secs(10);
const TEP_BAN_SAO: &str = "pass_config.json";
const TEP_BAN_SAO_CU: &str = "pass_phase.bcrypt";

/// `$2[abxy]$NN$` + 53 ký tự `[./A-Za-z0-9]`.
fn dung_dang_bcrypt(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 60
        && b[0] == b'$' && b[1] == b'2' && matches!(b[2], b'a' | b'b' | b'x' | b'y') && b[3] == b'$'
        && b[4].is_ascii_digit() && b[5].is_ascii_digit() && b[6] == b'$'
        && b[7..].iter().all(|c| c.is_ascii_alphanumeric() || matches!(c, b'.' | b'/'))
}

/// Đọc cấu hình mật khẩu: JSON `{"pass_start": "<bcrypt>"}` hoặc tệp cũ một dòng bcrypt. Trả mã băm `pass_start`.
pub fn doc_cau_hinh(text: &str) -> Result<String, String> {
    let raw = text.trim().trim_start_matches('\u{feff}').trim();
    let hash = if raw.starts_with('{') {
        let v: serde_json::Value = serde_json::from_str(raw).map_err(|_| "Cấu hình mật khẩu không phải JSON hợp lệ".to_string())?;
        v["pass_start"].as_str().unwrap_or("").trim().to_string()
    } else {
        raw.lines().map(str::trim).find(|l| !l.is_empty()).unwrap_or("").to_string()
    };
    if dung_dang_bcrypt(&hash) { Ok(hash) } else { Err("Cấu hình mật khẩu không có mã băm bcrypt hợp lệ".into()) }
}

async fn tai_tren_mang(url: &str) -> Result<String, String> {
    let c = reqwest::Client::builder().timeout(TIMEOUT).build().map_err(|e| e.to_string())?;
    let r = c.get(url).header("Cache-Control", "no-cache").send().await.map_err(|e| format!("Không kết nối được máy chủ lưu mật khẩu: {e}"))?;
    if !r.status().is_success() {
        return Err(format!("Máy chủ trả về HTTP {}", r.status().as_u16()));
    }
    doc_cau_hinh(&r.text().await.map_err(|e| e.to_string())?)
}

fn ghi_ban_sao(dir: &Path, hash: &str) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let tep: PathBuf = dir.join(TEP_BAN_SAO);
    std::fs::write(&tep, format!("{}\n", serde_json::json!({"pass_start": hash}))).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&tep, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

fn doc_ban_sao(dir: &Path) -> Option<String> {
    [TEP_BAN_SAO, TEP_BAN_SAO_CU].iter().find_map(|t| std::fs::read_to_string(dir.join(t)).ok().and_then(|s| doc_cau_hinh(&s).ok()))
}

/// Kết quả nạp mã băm: `tu_ban_sao` đúng khi phải dùng bản lưu lần trước vì không lấy được trên mạng.
pub struct MaBam {
    pub hash: String,
    pub tu_ban_sao: bool,
    pub loi_mang: Option<String>,
}

/// Ưu tiên bản mới trên mạng (và lưu lại); lỗi mạng thì dùng bản đã lưu; không có cả hai thì lỗi.
pub async fn nap_ma_bam(dir: &Path, url: &str) -> Result<MaBam, String> {
    match tai_tren_mang(url).await {
        Ok(hash) => {
            let _ = ghi_ban_sao(dir, &hash);
            Ok(MaBam { hash, tu_ban_sao: false, loi_mang: None })
        }
        Err(e) => match doc_ban_sao(dir) {
            Some(hash) => Ok(MaBam { hash, tu_ban_sao: true, loi_mang: Some(e) }),
            None => Err(format!("Không lấy được mật khẩu ({e}) và máy chưa có bản đã lưu. Kiểm tra kết nối mạng rồi thử lại.")),
        },
    }
}

/// So khớp mật khẩu với mã băm. Mã băm hỏng thì coi như sai.
pub fn kiem_tra(pass: &str, hash: &str) -> bool {
    bcrypt::verify(pass, hash).unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bam(p: &str) -> String { bcrypt::hash(p, 4).unwrap() }

    #[test]
    fn doc_cau_hinh_nhan_json_va_tep_cu_mot_dong() {
        let h = bam("123456");
        assert_eq!(doc_cau_hinh(&format!("\u{feff}{{\"pass_start\": \"{h}\"}}")).unwrap(), h);
        assert_eq!(doc_cau_hinh(&format!("\n{h}\n")).unwrap(), h);
        assert!(doc_cau_hinh("{\"pass_start\": \"xyz\"}").is_err());
        assert!(doc_cau_hinh("{hong").is_err());
        assert!(doc_cau_hinh("").is_err());
    }

    #[test]
    fn kiem_tra_dung_sai_va_ma_bam_hong() {
        let h = bam("246810");
        assert!(kiem_tra("246810", &h));
        assert!(!kiem_tra("246811", &h));
        assert!(!kiem_tra("246810", "khong-phai-bcrypt"));
    }

    #[tokio::test]
    async fn mat_mang_dung_ban_sao_va_khong_co_ban_sao_thi_loi() {
        let dir = tempfile::tempdir().unwrap();
        let loi = nap_ma_bam(dir.path(), "http://127.0.0.1:9/pass").await;
        assert!(loi.is_err() || loi.as_ref().is_ok_and(|m| m.tu_ban_sao));
        assert!(matches!(&loi, Err(m) if m.contains("chưa có bản đã lưu")));
        let h = bam("111111");
        ghi_ban_sao(dir.path(), &h).unwrap();
        let m = nap_ma_bam(dir.path(), "http://127.0.0.1:9/pass").await.unwrap();
        assert_eq!((m.hash, m.tu_ban_sao, m.loi_mang.is_some()), (h, true, true));
    }
}
