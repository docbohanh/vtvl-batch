//! Lô đơn vị: cấu hình, thư mục local theo username, trạng thái bền và nhật ký.
//! Cấu trúc theo `DE_XUAT_JSON.md`. Không chứa bí mật; cookie chỉ ở bộ nhớ.

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

pub const SCHEMA: u32 = 1;
const MAX_USERNAME_LEN: usize = 64;

fn d_data_root() -> String { "data".into() }
fn d_concurrency() -> usize { 3 }
fn d_interval() -> u64 { 300 }
fn d_timeout() -> u64 { 120 }
fn d_retry() -> u32 { 2 }
fn d_poll() -> u64 { 2000 }
fn d_max_changes() -> usize { 500 }
fn d_true() -> bool { true }
fn d_node() -> String { "node".into() }
static THU_MUC_TAI_NGUYEN: std::sync::OnceLock<PathBuf> = std::sync::OnceLock::new();

/// Ghi thư mục tài nguyên đóng gói kèm ứng dụng (chứa `scripts/` và `templates/`).
pub fn thu_muc_tai_nguyen() -> Option<&'static PathBuf> { THU_MUC_TAI_NGUYEN.get() }

pub fn dat_thu_muc_tai_nguyen(p: PathBuf) { let _ = THU_MUC_TAI_NGUYEN.set(p); }

/// Đường dẫn tập lệnh kiểm tra: tuyệt đối thì giữ nguyên; tương đối thì tìm cạnh tệp lô, rồi trong tài nguyên đóng gói kèm ứng dụng.
pub fn giai_duong_script(goc: &Path, ks: &str) -> PathBuf {
    if Path::new(ks).is_absolute() { return PathBuf::from(ks); }
    let canh_lo = goc.join(ks);
    if canh_lo.is_file() { return canh_lo; }
    match THU_MUC_TAI_NGUYEN.get().map(|t| t.join(ks)) { Some(p) if p.is_file() => p, _ => canh_lo }
}

fn d_kiem_tra() -> String { "scripts/kiem-tra/cli.mjs".into() }
fn d_mode() -> String { "workbook".into() }
fn d_nguoi() -> String { "Lã Hữu Thành".into() }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    #[serde(default = "d_concurrency")]
    pub concurrency: usize,
    #[serde(default = "d_interval", rename = "requestIntervalMs")]
    pub request_interval_ms: u64,
    #[serde(default = "d_timeout", rename = "timeoutSec")]
    pub timeout_sec: u64,
    #[serde(default = "d_retry", rename = "retryCount")]
    pub retry_count: u32,
    #[serde(default = "d_poll", rename = "pollIntervalMs")]
    pub poll_interval_ms: u64,
    #[serde(default = "d_max_changes", rename = "changesetMaxChanges")]
    pub changeset_max_changes: usize,
    /// Cho phép tạo thay đổi xóa dòng có trên máy chủ mà tệp Excel không còn (quyết định 09/11/2026: bật).
    #[serde(default = "d_true", rename = "choPhepXoaDong")]
    pub cho_phep_xoa_dong: bool,
    #[serde(default = "d_node")]
    pub node: String,
    /// Cho phép gửi THẬT lên cổng. Mặc định tắt: chạy chế độ khô (dựng gói, ghi tệp, không gọi cổng). Bật sau khi đã thử trên đơn vị thử.
    #[serde(default, rename = "choPhepGuiThat")]
    pub cho_phep_gui_that: bool,
    /// Tập lệnh kiểm tra tệp Excel cục bộ (đã chép sẵn vào dự án, không phụ thuộc vtvl_app); tương đối tính từ thư mục ứng dụng.
    #[serde(default = "d_kiem_tra", rename = "kiemTraScript")]
    pub kiem_tra_script: String,
    /// Người vận hành mặc định điền sẵn ở đầu trang (xác nhận gửi/xóa); người dùng vẫn sửa được.
    #[serde(default = "d_nguoi", rename = "nguoiVanHanh")]
    pub nguoi_van_hanh: String,
    /// Tài khoản quản trị để tạo đơn vị con + tài khoản trên cổng (tùy chọn). Không ghi lại ra tệp.
    #[serde(default, rename = "taiKhoanQuanTri", skip_serializing)]
    pub tai_khoan_quan_tri: Option<crate::tao_tai_khoan::TaiKhoanQuanTri>,
}

impl Default for Settings {
    fn default() -> Self {
        serde_json::from_str("{}").expect("mặc định hợp lệ")
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnitEntry {
    pub username: String,
    #[serde(default)]
    pub label: String,
    /// Đường dẫn tương đối với thư mục của tài khoản.
    #[serde(rename = "excelFile")]
    pub excel_file: String,
    #[serde(default = "d_mode")]
    pub mode: String,
    /// Mật khẩu cổng của tài khoản (tùy chọn). Có thì ứng dụng đăng nhập **kênh Desktop** (token Bearer, có quyền sửa như ứng dụng Desktop).
    /// Chỉ đọc vào bộ nhớ, không bao giờ ghi lại; tệp cấu hình chứa nó phải được bảo vệ (đã có trong .gitignore).
    #[serde(default, skip_serializing)]
    pub password: Option<String>,
    #[serde(default, rename = "formKey")]
    pub form_key: Option<String>,
    #[serde(default, rename = "orgId")]
    pub org_id: Option<String>,
    #[serde(default, rename = "periodId")]
    pub period_id: Option<String>,
    #[serde(default, rename = "submissionId")]
    pub submission_id: Option<String>,
    /// Ép đường: `A` (nhập tệp qua cổng, cần quyền import) hoặc `B` (gói thay đổi, cần create+update). Bỏ trống: tự chọn theo quyền.
    #[serde(default)]
    pub duong: Option<String>,
    #[serde(default = "d_true")]
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoConfig {
    #[serde(default)]
    pub schema: u32,
    #[serde(rename = "baseUrl")]
    pub base_url: String,
    #[serde(default = "d_data_root", rename = "dataRoot")]
    pub data_root: String,
    #[serde(default)]
    pub settings: Settings,
    pub units: Vec<UnitEntry>,
}

/// Tên thư mục an toàn: chữ thường, chỉ `[a-z0-9._-]`, không bắt đầu bằng dấu chấm.
pub fn safe_username(name: &str) -> Result<String, String> {
    let n = name.trim().to_lowercase();
    let ok = !n.is_empty()
        && n.len() <= MAX_USERNAME_LEN
        && !n.starts_with('.')
        && n.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '.' | '_' | '-'));
    if ok { Ok(n) } else { Err(format!("Tên tài khoản không hợp lệ cho thư mục: \"{name}\"")) }
}

impl LoConfig {
    /// Đọc và kiểm tra: tài khoản hợp lệ, không trùng, `single` phải có `formKey`.
    pub fn nap(path: &Path) -> Result<Self, String> {
        let cfg: LoConfig = doc_json(path)?; // lô trống (chưa có đơn vị) là hợp lệ: đơn vị thêm sau bằng tay
        let mut seen = std::collections::HashSet::new();
        for u in &cfg.units {
            let n = safe_username(&u.username)?;
            if !seen.insert(n.clone()) {
                return Err(format!("Tài khoản trùng trong lô: {n}"));
            }
            if u.mode == "single" && u.form_key.as_deref().unwrap_or("").is_empty() {
                return Err(format!("{n}: chế độ single cần formKey"));
            }
            if u.duong.as_deref().is_some_and(|d| !matches!(d, "A" | "B")) {
                return Err(format!("{n}: duong phải là A hoặc B"));
            }
            if !matches!(u.mode.as_str(), "workbook" | "single") {
                return Err(format!("{n}: mode phải là workbook hoặc single"));
            }
        }
        Ok(cfg)
    }
}

/// Thông tin một đơn vị thêm tay từ giao diện.
#[derive(Debug, Clone, Deserialize)]
pub struct ThemDonVi {
    pub username: String,
    #[serde(default)]
    pub label: String,
    #[serde(default)]
    pub password: String,
    /// Bỏ trống: `nguon/<username>.xlsx`.
    #[serde(default, rename = "excelFile")]
    pub excel_file: String,
    /// "A", "B" hoặc trống (tự chọn theo quyền).
    #[serde(default)]
    pub duong: String,
}

/// Thêm một đơn vị vào cuối `units` của tệp cấu hình lô, giữ nguyên mọi trường khác (kể cả mật khẩu của đơn vị có sẵn,
/// vì `password` không được ghi lại qua `LoConfig`). Kiểm tra trước khi ghi; ghi nguyên tử. Trả tên tài khoản đã chuẩn hóa.
pub fn them_don_vi_vao_tep(path: &Path, d: &ThemDonVi) -> Result<String, String> {
    let ten = safe_username(&d.username)?;
    let duong = d.duong.trim().to_uppercase();
    if !matches!(duong.as_str(), "" | "A" | "B") {
        return Err("Đường phải là A, B hoặc để trống".into());
    }
    let excel = if d.excel_file.trim().is_empty() { format!("nguon/{ten}.xlsx") } else { d.excel_file.trim().replace('\\', "/") };
    duong_excel(Path::new("."), &excel)?;
    let mut goc: serde_json::Value = doc_json(path)?;
    let ds = goc.get_mut("units").and_then(|u| u.as_array_mut()).ok_or("Tệp cấu hình thiếu mảng units")?;
    if ds.iter().any(|u| u["username"].as_str().is_some_and(|n| n.trim().to_lowercase() == ten)) {
        return Err(format!("Tài khoản {ten} đã có trong lô"));
    }
    let mut moi = serde_json::json!({
        "username": ten, "label": d.label.trim(), "excelFile": excel, "mode": "workbook",
        "formKey": null, "orgId": null, "periodId": null, "submissionId": null, "enabled": true,
    });
    if !d.password.is_empty() { moi["password"] = d.password.clone().into(); }
    if !duong.is_empty() { moi["duong"] = duong.into(); }
    ds.push(moi);
    ghi_json(path, &goc)?;
    Ok(ten)
}

/// Sửa thông tin một đơn vị trong tệp JSON của lô (không đổi `username` vì nó là tên thư mục dữ liệu).
#[derive(Debug, Clone, Deserialize)]
pub struct SuaDonVi {
    pub username: String,
    #[serde(default)]
    pub label: String,
    /// Mật khẩu mới; trống = giữ nguyên mật khẩu hiện có.
    #[serde(default)]
    pub password: String,
    #[serde(default, rename = "xoaMatKhau")]
    pub xoa_mat_khau: bool,
    #[serde(default, rename = "excelFile")]
    pub excel_file: String,
    #[serde(default)]
    pub duong: String,
    #[serde(default = "d_true")]
    pub enabled: bool,
}

/// Ghi thay đổi của một đơn vị vào tệp JSON của lô, giữ nguyên các đơn vị và trường khác. Kiểm tra trước khi ghi; ghi nguyên tử.
/// `excelFile` đổi thì xóa lựa chọn tệp ghi riêng (`nguon.json`) để cấu hình mới có hiệu lực.
pub fn sua_don_vi_trong_tep(path: &Path, dir_don_vi: &Path, d: &SuaDonVi) -> Result<(), String> {
    let ten = safe_username(&d.username)?;
    let duong = d.duong.trim().to_uppercase();
    if !matches!(duong.as_str(), "" | "A" | "B") {
        return Err("Đường phải là A, B hoặc để trống".into());
    }
    let excel = d.excel_file.trim().replace('\\', "/");
    duong_excel(Path::new("."), &excel)?;
    let mut goc: serde_json::Value = doc_json(path)?;
    let ds = goc.get_mut("units").and_then(|u| u.as_array_mut()).ok_or("Tệp cấu hình thiếu mảng units")?;
    let u = ds.iter_mut().find(|u| u["username"].as_str().is_some_and(|n| n.trim().to_lowercase() == ten)).ok_or_else(|| format!("Không có tài khoản {ten} trong tệp cấu hình"))?;
    let doi_excel = u["excelFile"].as_str() != Some(excel.as_str());
    u["label"] = d.label.trim().into();
    u["excelFile"] = excel.into();
    u["enabled"] = d.enabled.into();
    match duong.as_str() { "" => { u.as_object_mut().map(|o| o.remove("duong")); } x => u["duong"] = x.into() }
    if d.xoa_mat_khau { u.as_object_mut().map(|o| o.remove("password")); } else if !d.password.is_empty() { u["password"] = d.password.clone().into(); }
    ghi_json(path, &goc)?;
    if doi_excel { let _ = fs::remove_file(dir_don_vi.join("nguon.json")); }
    Ok(())
}

/// Xóa một đơn vị khỏi mảng `units` của tệp JSON của lô. Không xóa thư mục dữ liệu `data/<tài khoản>/` (giữ gói thay đổi, biên nhận, nhật ký).
/// Xóa được cả đơn vị cuối cùng: lô trống vẫn hợp lệ (thêm đơn vị lại bằng tay).
pub fn xoa_don_vi_khoi_tep(path: &Path, username: &str) -> Result<(), String> {
    let ten = safe_username(username)?;
    let mut goc: serde_json::Value = doc_json(path)?;
    let ds = goc.get_mut("units").and_then(|u| u.as_array_mut()).ok_or("Tệp cấu hình thiếu mảng units")?;
    let vi_tri = ds.iter().position(|u| u["username"].as_str().is_some_and(|n| n.trim().to_lowercase() == ten)).ok_or_else(|| format!("Không có tài khoản {ten} trong tệp cấu hình"))?;
    ds.remove(vi_tri);
    ghi_json(path, &goc)
}

/// Thư mục ứng dụng, dùng làm gốc cho đường dẫn tương đối: nếu tệp cấu hình nằm trong thư mục tên `config` thì là thư mục cha của `config`
/// (`config/lo.json` → thư mục ứng dụng); nếu tệp ở nơi khác thì chính thư mục chứa tệp đó.
pub fn goc_ung_dung(config_path: &Path) -> PathBuf {
    let dir = config_path.parent().unwrap_or_else(|| Path::new("."));
    if dir.file_name().is_some_and(|n| n == "config") { dir.parent().unwrap_or(dir).to_path_buf() } else { dir.to_path_buf() }
}

/// Thư mục các tài khoản: `dataRoot` tuyệt đối thì dùng thẳng, tương đối thì tính từ thư mục ứng dụng (`goc_ung_dung`).
pub fn data_root(config_path: &Path, cfg: &LoConfig) -> PathBuf {
    let p = Path::new(&cfg.data_root);
    if p.is_absolute() { p.to_path_buf() } else { goc_ung_dung(config_path).join(p) }
}

pub fn unit_dir(root: &Path, username: &str) -> Result<PathBuf, String> {
    Ok(root.join(safe_username(username)?))
}

const SUBDIRS: [&str; 6] = ["nguon", "may-chu", "kiem-tra", "thay-doi/goi", "sao-luu", "ket-qua"];

pub fn tao_thu_muc(dir: &Path) -> Result<(), String> {
    for s in SUBDIRS {
        fs::create_dir_all(dir.join(s)).map_err(|e| format!("Không tạo được thư mục {}: {e}", dir.join(s).display()))?;
    }
    Ok(())
}

/// Tệp Excel đang dùng của đơn vị: tệp người dùng chọn lại trên giao diện (`nguon.json`) nếu có, không thì `excelFile` trong cấu hình.
pub fn excel_hien_tai(dir: &Path, u: &UnitEntry) -> String {
    doc_json::<serde_json::Value>(&dir.join("nguon.json")).ok().and_then(|v| v["excelFile"].as_str().map(str::to_string)).filter(|s| !s.is_empty()).unwrap_or_else(|| u.excel_file.clone())
}

/// Ghi tệp Excel đã chọn lại (tương đối với thư mục tài khoản). Không sửa tệp cấu hình lô.
pub fn dat_excel(dir: &Path, excel_file: &str) -> Result<(), String> {
    duong_excel(dir, excel_file)?;
    ghi_json(&dir.join("nguon.json"), &serde_json::json!({"schema": SCHEMA, "excelFile": excel_file, "chonLuc": bay_gio()}))
}

/// Hồ sơ người dùng đã chọn cho đơn vị (`ho-so.json`), nếu có.
pub fn ho_so_da_chon(dir: &Path) -> Option<String> {
    doc_json::<serde_json::Value>(&dir.join("ho-so.json")).ok().and_then(|v| v["submissionId"].as_str().map(str::to_string)).filter(|s| !s.is_empty())
}

pub fn dat_ho_so(dir: &Path, submission_id: &str) -> Result<(), String> {
    ghi_json(&dir.join("ho-so.json"), &serde_json::json!({"schema": SCHEMA, "submissionId": submission_id, "chonLuc": bay_gio()}))
}

/// Đường dẫn Excel của đơn vị; không cho thoát ra ngoài thư mục tài khoản.
pub fn duong_excel(dir: &Path, excel_file: &str) -> Result<PathBuf, String> {
    let rel = Path::new(excel_file);
    let bad = rel.is_absolute() || rel.components().any(|c| matches!(c, std::path::Component::ParentDir));
    if bad || excel_file.is_empty() {
        return Err(format!("excelFile phải là đường dẫn tương đối nằm trong thư mục tài khoản: \"{excel_file}\""));
    }
    Ok(dir.join(rel))
}

pub fn bay_gio() -> String {
    chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()
}

pub fn doc_json<T: DeserializeOwned>(path: &Path) -> Result<T, String> {
    let text = fs::read_to_string(path).map_err(|e| format!("Không đọc được {}: {e}", path.display()))?;
    serde_json::from_str(&text).map_err(|e| format!("{} không phải JSON hợp lệ: {e}", path.display()))
}

/// Ghi vào tệp tạm cùng thư mục rồi đổi tên (nguyên tử).
pub fn ghi_json<T: Serialize>(path: &Path, v: &T) -> Result<(), String> {
    let text = serde_json::to_string_pretty(v).map_err(|e| e.to_string())?;
    let tmp = path.with_extension(format!("tmp-{}", std::process::id()));
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&tmp, format!("{text}\n")).map_err(|e| format!("Không ghi được {}: {e}", tmp.display()))?;
    fs::rename(&tmp, path).map_err(|e| format!("Không đổi tên {}: {e}", path.display()))
}

/// Nội dung lô trống ban đầu: chưa có đơn vị, mọi cài đặt mặc định, chế độ khô (`choPhepGuiThat` = false).
/// `kiem_tra_script` (nếu có) là đường dẫn tuyệt đối của tập lệnh kiểm tra tệp Excel tìm thấy trên máy.
pub fn lo_trong_json(kiem_tra_script: Option<&str>) -> serde_json::Value {
    let mut settings = serde_json::json!({
        "concurrency": d_concurrency(), "requestIntervalMs": d_interval(), "timeoutSec": d_timeout(), "retryCount": d_retry(),
        "pollIntervalMs": d_poll(), "changesetMaxChanges": d_max_changes(), "choPhepXoaDong": true, "choPhepGuiThat": false,
        "node": d_node(), "kiemTraScript": d_kiem_tra(), "nguoiVanHanh": d_nguoi(),
        "taiKhoanQuanTri": {"username": "", "password": ""},
    });
    if let Some(s) = kiem_tra_script {
        settings["kiemTraScript"] = s.into();
    }
    serde_json::json!({
        "schema": SCHEMA, "baseUrl": "https://kekhaivtvl.dcs.vn", "dataRoot": "data", "settings": settings, "units": [],
    })
}

/// Tạo tệp lô trống tại `path` nếu chưa có (không bao giờ ghi đè). Trả `true` nếu vừa tạo.
pub fn tao_lo_trong(path: &Path, kiem_tra_script: Option<&str>) -> Result<bool, String> {
    if path.exists() {
        return Ok(false);
    }
    ghi_json_moi(path, &lo_trong_json(kiem_tra_script))?;
    Ok(true)
}

/// Ghi tệp bất biến: lỗi nếu đã tồn tại (gói thay đổi và biên nhận không bao giờ sửa sau khi tạo).
pub fn ghi_json_moi<T: Serialize>(path: &Path, v: &T) -> Result<(), String> {
    if path.exists() {
        return Err(format!("{} đã tồn tại và không được ghi đè", path.display()));
    }
    ghi_json(path, v)
}

#[derive(Debug, Serialize)]
pub struct SuKien<'a> {
    pub luc: String,
    pub su_kien: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub changeset_id: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub so_thay_doi: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ket_qua: Option<&'a str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub nguoi: Option<&'a str>,
    /// Định danh máy (tên máy, MAC, IP) cho thao tác không hoàn tác được; chỉ ghi nhật ký cục bộ.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub may: Option<&'a crate::may::DinhDanhMay>,
}

/// Nhật ký một dòng JSON mỗi sự kiện. Chỉ ghi thời điểm, sự kiện, mã, số lượng: không cookie, không giá trị ô.
pub fn ghi_nhat_ky(dir: &Path, e: &SuKien) -> Result<(), String> {
    let line = serde_json::to_string(e).map_err(|e| e.to_string())?;
    let mut f = fs::OpenOptions::new().create(true).append(true).open(dir.join("nhat-ky.jsonl")).map_err(|e| e.to_string())?;
    writeln!(f, "{line}").map_err(|e| e.to_string())
}

pub fn su_kien<'a>(ten: &'a str) -> SuKien<'a> {
    SuKien { luc: bay_gio(), su_kien: ten, changeset_id: None, so_thay_doi: None, ket_qua: None, nguoi: None, may: None }
}

// ---------------------------------------------------------------------------
// Trạng thái đơn vị (`trang-thai.json`)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Buoc {
    ChuaChay,
    KiemTraKetNoi,
    DangKiemTraFile,
    CanXemXet,
    /// Tệp Excel đã khớp hoàn toàn với máy chủ: không có gì để gửi (không phải lỗi).
    DaKhop,
    SanSangGui,
    DangGui,
    ChoBienNhan,
    DongBoXong,
    Loi,
    Chan,
    DaHuy,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TomTatKiemTra {
    #[serde(rename = "tongDong")]
    pub tong_dong: u64,
    #[serde(rename = "dongLoi")]
    pub dong_loi: u64,
    #[serde(rename = "canhBao")]
    pub canh_bao: u64,
    #[serde(rename = "ketQuaFile")]
    pub ket_qua_file: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TomTatThayDoi {
    pub tong: usize,
    pub tao: usize,
    pub sua: usize,
    pub bo: usize,
    pub file: String,
}

/// Số dòng theo biểu (khóa biểu → số dòng): trên cổng (ảnh chụp hồ sơ) và trong tệp Excel. Hiện ở thẻ đơn vị lúc Chuẩn bị.
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct SoDongTheoBieu {
    #[serde(default)]
    pub cong: std::collections::BTreeMap<String, usize>,
    #[serde(default)]
    pub excel: std::collections::BTreeMap<String, usize>,
    /// Số người biên chế: C3 (Σ "Người cần bố trí", khóa "") và D2 ("Người cần bố trí trong năm", theo năm), trên cổng. Biểu khác không có.
    #[serde(default, rename = "tongCong")]
    pub tong_cong: Tong,
    #[serde(default, rename = "tongExcel")]
    pub tong_excel: Tong,
}

/// Biểu → (nhãn: "" hoặc năm → tổng).
pub type Tong = std::collections::BTreeMap<String, std::collections::BTreeMap<String, f64>>;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GoiHienTai {
    #[serde(rename = "changesetId")]
    pub changeset_id: String,
    #[serde(rename = "trangThai")]
    pub trang_thai: String,
    #[serde(rename = "soLanThu")]
    pub so_lan_thu: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrangThai {
    pub schema: u32,
    pub buoc: Buoc,
    #[serde(rename = "tienDo")]
    pub tien_do: u8,
    #[serde(rename = "ketNoi")]
    pub ket_noi: String,
    #[serde(rename = "kiemTra")]
    pub kiem_tra: Option<TomTatKiemTra>,
    #[serde(rename = "thayDoi")]
    pub thay_doi: Option<TomTatThayDoi>,
    #[serde(rename = "goiHienTai")]
    pub goi_hien_tai: Option<GoiHienTai>,
    #[serde(default, rename = "soDong")]
    pub so_dong: Option<SoDongTheoBieu>,
    pub loi: Option<String>,
    /// Thông báo không phải lỗi (ví dụ chế độ khô).
    #[serde(default, rename = "ghiChu")]
    pub ghi_chu: Option<String>,
    #[serde(rename = "capNhat")]
    pub cap_nhat: String,
}

impl Default for TrangThai {
    fn default() -> Self {
        Self { schema: SCHEMA, buoc: Buoc::ChuaChay, tien_do: 0, ket_noi: "chua_kiem_tra".into(), kiem_tra: None, thay_doi: None, goi_hien_tai: None, so_dong: None, loi: None, ghi_chu: None, cap_nhat: bay_gio() }
    }
}

pub fn doc_trang_thai(dir: &Path) -> TrangThai {
    doc_json(&dir.join("trang-thai.json")).unwrap_or_default()
}

pub fn ghi_trang_thai(dir: &Path, t: &TrangThai) -> Result<(), String> {
    ghi_json(&dir.join("trang-thai.json"), &TrangThai { cap_nhat: bay_gio(), ..t.clone() })
}

#[cfg(test)]
mod tests {
    #[test]
    fn lo_trong_nap_duoc_o_che_do_kho_va_khong_bao_gio_ghi_de() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("config").join("lo.json");
        assert!(tao_lo_trong(&p, None).unwrap(), "lần đầu thì tạo (kể cả thư mục config)");
        let cfg = LoConfig::nap(&p).unwrap();
        assert!(cfg.units.is_empty());
        assert_eq!((cfg.base_url.as_str(), cfg.data_root.as_str(), cfg.settings.cho_phep_gui_that), ("https://kekhaivtvl.dcs.vn", "data", false));
        assert_eq!(cfg.settings.kiem_tra_script, "scripts/kiem-tra/cli.mjs");
        std::fs::write(&p, r#"{"baseUrl":"x","units":[{"username":"a","excelFile":"x"}]}"#).unwrap();
        assert!(!tao_lo_trong(&p, None).unwrap(), "đã có tệp thì giữ nguyên");
        assert_eq!(LoConfig::nap(&p).unwrap().units.len(), 1);
    }

    #[test]
    fn lo_trong_dung_duoc_tap_lenh_kiem_tra_tuyet_doi_va_them_don_vi_tay() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("lo.json");
        tao_lo_trong(&p, Some("/opt/vtvl/scripts/kiem-tra/cli.mjs")).unwrap();
        assert_eq!(LoConfig::nap(&p).unwrap().settings.kiem_tra_script, "/opt/vtvl/scripts/kiem-tra/cli.mjs");
        let d = ThemDonVi { username: "Kekhai_NB_Test".into(), label: "Đơn vị thử".into(), password: String::new(), excel_file: String::new(), duong: String::new() };
        assert_eq!(them_don_vi_vao_tep(&p, &d).unwrap(), "kekhai_nb_test");
        assert_eq!(LoConfig::nap(&p).unwrap().units.len(), 1);
    }

    #[test]
    fn xoa_don_vi_giu_don_vi_khac_va_cho_xoa_ca_cai_cuoi() {
        let dir = std::env::temp_dir().join(format!("vtvl-xoa-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join("lo.json");
        std::fs::write(&p, r#"{"baseUrl":"x","units":[{"username":"a","excelFile":"x"},{"username":"b","password":"giu","excelFile":"y"}]}"#).unwrap();
        xoa_don_vi_khoi_tep(&p, " A ").unwrap();
        let v: serde_json::Value = doc_json(&p).unwrap();
        assert_eq!((v["units"].as_array().unwrap().len(), v["units"][0]["password"].as_str()), (1, Some("giu")));
        assert!(xoa_don_vi_khoi_tep(&p, "zz").is_err());
        xoa_don_vi_khoi_tep(&p, "b").unwrap();
        assert!(LoConfig::nap(&p).unwrap().units.is_empty(), "xóa hết vẫn nạp được lô trống");
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn sua_don_vi_giu_mat_khau_khi_de_trong_va_xoa_khi_yeu_cau() {
        let dir = std::env::temp_dir().join(format!("vtvl-sua-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join("lo.json");
        std::fs::write(&p, r#"{"baseUrl":"x","units":[{"username":"a","password":"cu","excelFile":"nguon/a.xlsx","duong":"A"},{"username":"b","password":"giu","excelFile":"nguon/b.xlsx"}]}"#).unwrap();
        std::fs::write(dir.join("nguon.json"), "{}").unwrap();
        let d = SuaDonVi { username: "a".into(), label: "Mới".into(), password: String::new(), xoa_mat_khau: false, excel_file: "nguon/moi.xlsx".into(), duong: String::new(), enabled: false };
        sua_don_vi_trong_tep(&p, &dir, &d).unwrap();
        let v: serde_json::Value = doc_json(&p).unwrap();
        assert_eq!((v["units"][0]["password"].as_str(), v["units"][0]["label"].as_str(), v["units"][0]["enabled"].as_bool()), (Some("cu"), Some("Mới"), Some(false)));
        assert!(v["units"][0].get("duong").is_none() && v["units"][1]["password"] == "giu");
        assert!(!dir.join("nguon.json").exists());
        sua_don_vi_trong_tep(&p, &dir, &SuaDonVi { xoa_mat_khau: true, ..d.clone() }).unwrap();
        assert!(doc_json::<serde_json::Value>(&p).unwrap()["units"][0].get("password").is_none());
        assert!(sua_don_vi_trong_tep(&p, &dir, &SuaDonVi { username: "zz".into(), ..d }).is_err());
        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn them_don_vi_giu_mat_khau_cu_va_chan_trung() {
        let dir = std::env::temp_dir().join(format!("vtvl-them-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join("lo.json");
        std::fs::write(&p, r#"{"baseUrl":"https://x","units":[{"username":"a","password":"bi-mat","excelFile":"nguon/a.xlsx"}]}"#).unwrap();
        let d = ThemDonVi { username: " B_1 ".into(), label: "Đơn vị B".into(), password: "mk".into(), excel_file: String::new(), duong: "b".into() };
        assert_eq!(them_don_vi_vao_tep(&p, &d).unwrap(), "b_1");
        let v: serde_json::Value = doc_json(&p).unwrap();
        assert_eq!(v["units"][0]["password"], "bi-mat");
        assert_eq!((v["units"][1]["excelFile"].as_str(), v["units"][1]["duong"].as_str()), (Some("nguon/b_1.xlsx"), Some("B")));
        assert!(them_don_vi_vao_tep(&p, &d).unwrap_err().contains("đã có"));
        let xau = ThemDonVi { excel_file: "../x.xlsx".into(), username: "c".into(), ..d.clone() };
        assert!(them_don_vi_vao_tep(&p, &xau).is_err());
        std::fs::remove_dir_all(&dir).ok();
    }

    use super::*;

    #[test]
    fn username_is_sanitized() {
        assert_eq!(safe_username("Kekhai_NB_DuLich").unwrap(), "kekhai_nb_dulich");
        for bad in ["", "../x", "a/b", "a b", ".ẩn", "tên-việt", &"a".repeat(65)] {
            assert!(safe_username(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn excel_path_stays_inside_unit_dir() {
        let d = Path::new("/data/u");
        assert!(duong_excel(d, "nguon/a.xlsx").is_ok());
        for bad in ["../a.xlsx", "/etc/passwd", "nguon/../../x", ""] {
            assert!(duong_excel(d, bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn config_validation() {
        let dir = tempfile::tempdir().unwrap();
        let ghi = |s: &str| { let p = dir.path().join("lo.json"); fs::write(&p, s).unwrap(); p };
        let ok = ghi(r#"{"baseUrl":"https://x","units":[{"username":"A","excelFile":"nguon/a.xlsx"}]}"#);
        let cfg = LoConfig::nap(&ok).unwrap();
        assert!(cfg.settings.cho_phep_xoa_dong, "xóa dòng bật theo quyết định");
        assert_eq!(cfg.settings.concurrency, 3);
        assert!(cfg.units[0].enabled);
        let dup = ghi(r#"{"baseUrl":"https://x","units":[{"username":"A","excelFile":"a"},{"username":"a","excelFile":"b"}]}"#);
        assert!(LoConfig::nap(&dup).unwrap_err().contains("trùng"));
        let single = ghi(r#"{"baseUrl":"https://x","units":[{"username":"a","excelFile":"a","mode":"single"}]}"#);
        assert!(LoConfig::nap(&single).unwrap_err().contains("formKey"));
        let mode = ghi(r#"{"baseUrl":"https://x","units":[{"username":"a","excelFile":"a","mode":"full"}]}"#);
        assert!(LoConfig::nap(&mode).is_err());
    }

    #[test]
    fn device_id_is_created_once_and_real_sending_is_off_by_default() {
        let dir = tempfile::tempdir().unwrap();
        let a = thiet_bi(dir.path()).unwrap();
        assert_eq!(a.device_id, thiet_bi(dir.path()).unwrap().device_id);
        assert_eq!(a.device_id.len(), 36);
        assert!(!Settings::default().cho_phep_gui_that);
        let cfg: LoConfig = serde_json::from_str(r#"{"baseUrl":"https://x","units":[{"username":"a","excelFile":"a","duong":"C"}]}"#).unwrap();
        let p = dir.path().join("lo.json");
        fs::write(&p, serde_json::to_string(&cfg).unwrap()).unwrap();
        assert!(LoConfig::nap(&p).unwrap_err().contains("duong"));
    }

    #[test]
    fn data_root_is_next_to_app() {
        let cfg: LoConfig = serde_json::from_str(r#"{"baseUrl":"https://x","units":[]}"#).unwrap();
        assert_eq!(goc_ung_dung(Path::new("/app/config/lo.json")), PathBuf::from("/app"));
        assert_eq!(data_root(Path::new("/app/config/lo.json"), &cfg), PathBuf::from("/app/data"));
        assert_eq!(data_root(Path::new("/tai-lieu/lo-sdl.json"), &cfg), PathBuf::from("/tai-lieu/data"), "tệp ở nơi khác: dữ liệu cạnh tệp");
    }

    #[test]
    fn chosen_excel_overrides_config_without_touching_it() {
        let dir = tempfile::tempdir().unwrap();
        let u: UnitEntry = serde_json::from_str(r#"{"username":"a","excelFile":"nguon/cu.xlsx"}"#).unwrap();
        assert_eq!(excel_hien_tai(dir.path(), &u), "nguon/cu.xlsx");
        dat_excel(dir.path(), "nguon/moi.xlsx").unwrap();
        assert_eq!(excel_hien_tai(dir.path(), &u), "nguon/moi.xlsx");
        assert!(dat_excel(dir.path(), "../x.xlsx").is_err());
        assert_eq!(excel_hien_tai(dir.path(), &u), "nguon/moi.xlsx", "đường dẫn xấu không ghi đè");
    }

    #[test]
    fn password_is_read_but_never_serialized() {
        let u: UnitEntry = serde_json::from_str(r#"{"username":"a","excelFile":"x","password":"bí-mật"}"#).unwrap();
        assert_eq!(u.password.as_deref(), Some("bí-mật"));
        assert!(!serde_json::to_string(&u).unwrap().contains("bí-mật"));
        assert!(!serde_json::to_string(&u).unwrap().contains("password"));
        assert_eq!(Settings::default().kiem_tra_script, "scripts/kiem-tra/cli.mjs");
    }

    #[test]
    fn immutable_files_cannot_be_overwritten() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("goi.json");
        ghi_json_moi(&p, &serde_json::json!({"a": 1})).unwrap();
        assert!(ghi_json_moi(&p, &serde_json::json!({"a": 2})).is_err());
        let v: serde_json::Value = doc_json(&p).unwrap();
        assert_eq!(v["a"], 1);
    }

    #[test]
    fn state_round_trips_and_log_has_no_secrets() {
        let dir = tempfile::tempdir().unwrap();
        tao_thu_muc(dir.path()).unwrap();
        assert!(dir.path().join("thay-doi/goi").is_dir());
        let t = TrangThai { buoc: Buoc::SanSangGui, tien_do: 60, ..Default::default() };
        ghi_trang_thai(dir.path(), &t).unwrap();
        assert_eq!(doc_trang_thai(dir.path()).buoc, Buoc::SanSangGui);
        let mut e = su_kien("gui_goi");
        e.changeset_id = Some("cs-1");
        e.so_thay_doi = Some(3);
        ghi_nhat_ky(dir.path(), &e).unwrap();
        let log = fs::read_to_string(dir.path().join("nhat-ky.jsonl")).unwrap();
        assert!(log.contains("\"su_kien\":\"gui_goi\"") && !log.contains("cookie"));
    }
}

// ---------------------------------------------------------------------------
// Thiết bị (một mã cố định cho mỗi máy cài ứng dụng)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThietBiLuu {
    pub schema: u32,
    #[serde(rename = "deviceId")]
    pub device_id: String,
    pub ten: String,
}

/// Đọc hoặc tạo `<dataRoot>/_chung/thiet-bi.json`. Mã thiết bị là UUID v4, tạo một lần.
pub fn thiet_bi(root: &Path) -> Result<ThietBiLuu, String> {
    let file = root.join("_chung").join("thiet-bi.json");
    if let Ok(t) = doc_json::<ThietBiLuu>(&file) {
        return Ok(t);
    }
    let t = ThietBiLuu { schema: SCHEMA, device_id: uuid::Uuid::new_v4().to_string(), ten: "VTVL Batch".into() };
    ghi_json(&file, &t)?;
    Ok(t)
}
