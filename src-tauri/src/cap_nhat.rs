//! Kiểm tra bản mới trên GitHub Releases của kho `docbohanh/vtvl-batch`, tải tệp cài đặt đúng hệ điều hành và cài đè (Windows: trình cài NSIS chế độ passive; macOS: chép .app từ .dmg rồi mở lại).
//! Tải chỉ từ kho phát hành, kiểm tra SHA-256 khi GitHub cung cấp; cài chỉ khi người dùng bấm.

use serde::Serialize;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use tauri::Emitter;
use tokio::io::AsyncWriteExt;
use serde_json::Value;
use std::time::Duration;

const API_BAN_MOI: &str = "https://api.github.com/repos/docbohanh/vtvl-batch/releases/latest";
const TIEN_TO_TRANG_TAI: &str = "https://github.com/docbohanh/vtvl-batch/";
const TIMEOUT: Duration = Duration::from_secs(10);
const TIEN_TO_TAI_TEP: &str = "https://github.com/docbohanh/vtvl-batch/releases/download/";
const TIMEOUT_TAI: Duration = Duration::from_secs(900);
const TOI_DA_TEP: u64 = 500 * 1024 * 1024;
const SU_KIEN_TIEN_DO: &str = "cap-nhat-tien-do";

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
    /// Tệp cài đặt hợp với máy này; None nếu bản phát hành không có (khi đó chỉ mở trang tải).
    #[serde(rename = "coTepCaiDat")]
    pub co_tep_cai_dat: bool,
}

/// Tệp cài đặt chọn từ danh sách đính kèm của bản phát hành.
#[derive(Debug, Clone, PartialEq)]
pub struct TepCaiDat { pub ten: String, pub url: String, pub kich_thuoc: u64, pub sha256: Option<String> }

/// Chọn tệp cài đặt theo hệ điều hành và kiến trúc: Windows lấy `*-setup.exe`; macOS lấy `.dmg` đúng kiến trúc. Chỉ nhận địa chỉ trong kho phát hành.
pub fn chon_tep(tep_dinh_kem: &Value, he_dieu_hanh: &str, kien_truc: &str) -> Option<TepCaiDat> {
    tep_dinh_kem.as_array()?.iter().find_map(|a| {
        let ten = a["name"].as_str()?;
        let url = a["browser_download_url"].as_str()?;
        let t = ten.to_lowercase();
        let hop = match he_dieu_hanh {
            "windows" => t.ends_with("-setup.exe"),
            "macos" => t.ends_with(".dmg") && if kien_truc == "aarch64" { t.contains("aarch64") || t.contains("arm64") } else { t.contains("x64") || t.contains("x86_64") },
            _ => false,
        };
        if !hop || !url.starts_with(TIEN_TO_TAI_TEP) || ten.contains(['/', '\\']) { return None; }
        Some(TepCaiDat {
            ten: ten.to_string(), url: url.to_string(), kich_thuoc: a["size"].as_u64().unwrap_or(0),
            sha256: a["digest"].as_str().and_then(|d| d.strip_prefix("sha256:")).map(|h| h.to_lowercase()),
        })
    })
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
        co_tep_cai_dat: chon_tep(&phan_hoi["assets"], std::env::consts::OS, std::env::consts::ARCH).is_some(),
    })
}

/// Chỉ mở trang thuộc kho phát hành, tránh mở địa chỉ tùy ý do giao diện gửi lên.
pub fn url_hop_le(url: &str) -> bool {
    url.starts_with(TIEN_TO_TRANG_TAI) && !url.chars().any(|c| c.is_whitespace() || c == '"' || c == '&' || c == '|' || c == '^')
}

async fn lay_ban_moi() -> Result<Value, String> {
    let c = reqwest::Client::builder().timeout(TIMEOUT).user_agent("vtvl-batch").build().map_err(|e| e.to_string())?;
    let r = c.get(API_BAN_MOI).header("Accept", "application/vnd.github+json").send().await
        .map_err(|_| "Không kết nối được tới GitHub để kiểm tra bản mới (kiểm tra mạng)".to_string())?;
    if !r.status().is_success() { return Err(format!("GitHub trả về lỗi {} khi kiểm tra bản mới", r.status().as_u16())); }
    r.json().await.map_err(|_| "Phản hồi kiểm tra bản mới không đọc được".to_string())
}

#[tauri::command]
pub async fn kiem_tra_cap_nhat() -> Result<KetQuaCapNhat, String> {
    danh_gia(&lay_ban_moi().await?, env!("CARGO_PKG_VERSION"))
}

/// Thư mục tạm chứa tệp cài đặt đã tải.
fn thu_muc_tai() -> PathBuf { std::env::temp_dir().join("vtvl-batch-cap-nhat") }

/// Đường dẫn tệp cài đặt do giao diện gửi lên phải nằm đúng trong thư mục tải và có đuôi hợp lệ.
pub fn duong_cai_hop_le(duong: &Path, thu_muc: &Path) -> bool {
    let ten = duong.file_name().and_then(|n| n.to_str()).unwrap_or("").to_lowercase();
    duong.parent() == Some(thu_muc) && (ten.ends_with("-setup.exe") || ten.ends_with(".dmg")) && !ten.contains("..")
}

#[derive(Debug, Serialize)]
pub struct KetQuaTaiBan {
    pub duong: String,
    #[serde(rename = "phienBan")]
    pub phien_ban: String,
}

/// Tải tệp cài đặt của bản mới nhất (phát sự kiện `cap-nhat-tien-do` {da, tong}); kiểm tra SHA-256 khi GitHub cho biết.
#[tauri::command]
pub async fn tai_ban_cap_nhat(app: tauri::AppHandle) -> Result<KetQuaTaiBan, String> {
    let phan_hoi = lay_ban_moi().await?;
    let kq = danh_gia(&phan_hoi, env!("CARGO_PKG_VERSION"))?;
    if !kq.co_ban_moi { return Err("Đang dùng bản mới nhất".into()); }
    let tep = chon_tep(&phan_hoi["assets"], std::env::consts::OS, std::env::consts::ARCH)
        .ok_or("Bản phát hành chưa có tệp cài đặt cho máy này; hãy tải thủ công từ trang phát hành")?;
    if tep.kich_thuoc > TOI_DA_TEP { return Err("Tệp cài đặt lớn bất thường, đã dừng tải".into()); }

    let thu_muc = thu_muc_tai();
    let _ = std::fs::remove_dir_all(&thu_muc);
    std::fs::create_dir_all(&thu_muc).map_err(|e| format!("Không tạo được thư mục tải: {e}"))?;
    let dich = thu_muc.join(&tep.ten);
    let tam = thu_muc.join(format!("{}.part", tep.ten));

    let c = reqwest::Client::builder().timeout(TIMEOUT_TAI).user_agent("vtvl-batch").build().map_err(|e| e.to_string())?;
    let mut r = c.get(&tep.url).send().await.map_err(|_| "Không kết nối được tới GitHub để tải bản mới".to_string())?;
    if !r.status().is_success() { return Err(format!("GitHub trả về lỗi {} khi tải bản mới", r.status().as_u16())); }
    let tong = r.content_length().unwrap_or(tep.kich_thuoc);
    let mut f = tokio::fs::File::create(&tam).await.map_err(|e| format!("Không ghi được tệp tải: {e}"))?;
    let mut bam = Sha256::new();
    let (mut da, mut da_bao) = (0u64, 0u64);
    while let Some(khoi) = r.chunk().await.map_err(|_| "Đứt kết nối khi đang tải bản mới".to_string())? {
        da += khoi.len() as u64;
        if da > TOI_DA_TEP { return Err("Tệp tải về lớn bất thường, đã dừng".into()); }
        bam.update(&khoi);
        f.write_all(&khoi).await.map_err(|e| format!("Không ghi được tệp tải: {e}"))?;
        if da - da_bao >= 256 * 1024 { da_bao = da; let _ = app.emit(SU_KIEN_TIEN_DO, serde_json::json!({ "da": da, "tong": tong })); }
    }
    f.flush().await.map_err(|e| format!("Không ghi được tệp tải: {e}"))?;
    drop(f);
    let _ = app.emit(SU_KIEN_TIEN_DO, serde_json::json!({ "da": da, "tong": tong.max(da) }));
    if let Some(mong) = &tep.sha256 {
        let thuc = format!("{:x}", bam.finalize());
        if &thuc != mong { let _ = std::fs::remove_file(&tam); return Err("Tệp tải về không khớp mã SHA-256 do GitHub công bố, đã hủy".into()); }
    }
    std::fs::rename(&tam, &dich).map_err(|e| format!("Không lưu được tệp tải: {e}"))?;
    Ok(KetQuaTaiBan { duong: dich.to_string_lossy().into_owned(), phien_ban: kq.moi })
}

/// Tập lệnh macOS: đợi ứng dụng thoát, gắn .dmg, chép .app đè lên bản cũ (giữ bản cũ đến khi chép xong), mở lại. Lỗi thì mở .dmg cho người dùng tự kéo thả.
#[cfg(target_os = "macos")]
const TAP_LENH_MACOS: &str = r#"
PID="$1"; DMG="$2"; DICH="$3"
while kill -0 "$PID" 2>/dev/null; do sleep 0.5; done
PT=$(mktemp -d /tmp/vtvl-cap-nhat.XXXXXX)
hdiutil attach -nobrowse -noautoopen -readonly -mountpoint "$PT" "$DMG" >/dev/null 2>&1 || { open "$DMG"; exit 1; }
APP=$(ls -d "$PT"/*.app 2>/dev/null | head -1)
if [ -z "$APP" ] || ! ditto "$APP" "$DICH.moi"; then
  hdiutil detach "$PT" -force >/dev/null 2>&1; rm -rf "$DICH.moi"; open "$DMG"; exit 1
fi
hdiutil detach "$PT" -force >/dev/null 2>&1
rm -rf "$DICH.cu"
if mv "$DICH" "$DICH.cu" && mv "$DICH.moi" "$DICH"; then rm -rf "$DICH.cu"; else rm -rf "$DICH.moi"; [ -e "$DICH.cu" ] && [ ! -e "$DICH" ] && mv "$DICH.cu" "$DICH"; open "$DMG"; exit 1; fi
xattr -dr com.apple.quarantine "$DICH" 2>/dev/null
open "$DICH"
"#;

#[cfg(target_os = "windows")]
fn chay_cai_dat(tep: &Path) -> Result<(), String> {
    // NSIS của Tauri: /P = chế độ passive (có thanh tiến trình, không hỏi), /R = mở lại ứng dụng sau khi cài.
    std::process::Command::new(tep).args(["/P", "/R"]).spawn().map(|_| ()).map_err(|e| format!("Không chạy được trình cài đặt: {e}"))
}

#[cfg(target_os = "macos")]
fn chay_cai_dat(tep: &Path) -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let goi = exe.ancestors().find(|p| p.extension().is_some_and(|e| e == "app")).map(Path::to_path_buf);
    let Some(goi) = goi else {
        let _ = std::process::Command::new("open").arg(tep).spawn();
        return Err("Ứng dụng không chạy từ gói .app (bản phát triển); đã mở tệp .dmg để bạn tự cài".into());
    };
    std::process::Command::new("sh").arg("-c").arg(TAP_LENH_MACOS).arg("sh").arg(std::process::id().to_string()).arg(tep).arg(goi)
        .stdin(std::process::Stdio::null()).stdout(std::process::Stdio::null()).stderr(std::process::Stdio::null())
        .spawn().map(|_| ()).map_err(|e| format!("Không chạy được tập lệnh cài đặt: {e}"))
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn chay_cai_dat(_tep: &Path) -> Result<(), String> { Err("Hệ điều hành này chưa hỗ trợ tự cài đặt".into()) }

/// Chạy trình cài đặt đã tải rồi thoát ứng dụng để cài đè. Chỉ nhận tệp trong thư mục tải của ứng dụng.
#[tauri::command]
pub fn cai_ban_cap_nhat(app: tauri::AppHandle, duong: String) -> Result<(), String> {
    let tep = PathBuf::from(&duong);
    if !duong_cai_hop_le(&tep, &thu_muc_tai()) || !tep.is_file() { return Err("Tệp cài đặt không hợp lệ hoặc đã bị xóa; hãy tải lại".into()); }
    chay_cai_dat(&tep)?;
    std::thread::spawn(move || { std::thread::sleep(Duration::from_millis(800)); app.exit(0); });
    Ok(())
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

    fn dinh_kem() -> Value {
        let u = |t: &str| format!("https://github.com/docbohanh/vtvl-batch/releases/download/v1.0.17/{t}");
        json!([
            {"name": "VTVL Batch_1.0.17_x64_en-US.msi", "browser_download_url": u("a.msi"), "size": 10},
            {"name": "VTVL Batch_1.0.17_x64-setup.exe", "browser_download_url": u("b.exe"), "size": 20, "digest": "sha256:ABCDEF"},
            {"name": "VTVL Batch_1.0.17_aarch64.dmg", "browser_download_url": u("c.dmg"), "size": 30},
            {"name": "VTVL Batch_1.0.17_x64.dmg", "browser_download_url": u("d.dmg"), "size": 40},
            {"name": "vtvl-batch-di-kem.zip", "browser_download_url": u("e.zip"), "size": 50}
        ])
    }

    #[test]
    fn chon_tep_theo_he_dieu_hanh_va_kien_truc() {
        let w = chon_tep(&dinh_kem(), "windows", "x86_64").unwrap();
        assert_eq!(w.ten, "VTVL Batch_1.0.17_x64-setup.exe");
        assert_eq!(w.sha256.as_deref(), Some("abcdef"));
        assert_eq!(chon_tep(&dinh_kem(), "macos", "aarch64").unwrap().ten, "VTVL Batch_1.0.17_aarch64.dmg");
        assert_eq!(chon_tep(&dinh_kem(), "macos", "x86_64").unwrap().ten, "VTVL Batch_1.0.17_x64.dmg");
        assert!(chon_tep(&dinh_kem(), "linux", "x86_64").is_none());
    }

    #[test]
    fn chon_tep_bo_qua_dia_chi_ngoai_kho() {
        let ngoai = json!([{"name": "x-setup.exe", "browser_download_url": "https://evil.example/x-setup.exe", "size": 1}]);
        assert!(chon_tep(&ngoai, "windows", "x86_64").is_none());
        assert!(chon_tep(&json!(null), "windows", "x86_64").is_none());
    }

    #[test]
    fn duong_cai_chi_nhan_tep_trong_thu_muc_tai() {
        let dir = Path::new("/tmp/vtvl-batch-cap-nhat");
        assert!(duong_cai_hop_le(&dir.join("VTVL Batch_1.0.17_x64-setup.exe"), dir));
        assert!(duong_cai_hop_le(&dir.join("a.dmg"), dir));
        assert!(!duong_cai_hop_le(&dir.join("a.sh"), dir));
        assert!(!duong_cai_hop_le(Path::new("/tmp/khac/a.dmg"), dir));
        assert!(!duong_cai_hop_le(&dir.join("con").join("a.dmg"), dir));
    }
}
