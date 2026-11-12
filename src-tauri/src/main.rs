//! VTVL Batch: quản lý nhiều đơn vị song song (đường B: gói thay đổi).
//! Luồng: kiểm tra kết nối tất cả → chuẩn bị (kiểm tra Excel, tính thay đổi) → Gửi / Gửi lại / Gửi tất cả. Không tự gửi, không nộp hồ sơ.

mod bao_cao_cay;
mod bao_cao_tien_do;
mod cong_mat_khau;
mod danh_muc;
mod goi;
mod imports;
mod ket_chuyen;
mod ket_noi;
mod kiem_tra_lai;
mod kiem_tra_local;
mod lo;
mod may_chu;
mod portal;
mod cap_nhat;
mod may;
mod quan_tri;
mod xuat_b30k;
mod tao_tai_khoan;
#[cfg(test)]
mod thu_gia;
mod thay_doi;
mod tong_quan;
mod xoa_du_lieu;

use lo::{Buoc, LoConfig, TomTatKiemTra, TomTatThayDoi, TrangThai, UnitEntry};
use portal::{Credentials, DangNhap, Session, ThietBi};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::Duration;
use tauri::{Manager, State};
use tokio::sync::Semaphore;

const KET_NOI_TOI_DA_PHUT: i64 = 30;
const RULE_VERSION_MAC_DINH: &str = "2026.1";
/// `X-App-Version` gửi cho cổng: phiên bản giao thức ứng dụng tuân theo (bản web/Desktop 1.2.8), không phải phiên bản của VTVL Batch.
/// Cổng yêu cầu tối thiểu 1.1.1 (`/client/config`).
const PHIEN_BAN_GIAO_THUC: &str = "1.2.8";

struct Lo {
    cfg: LoConfig,
    root: PathBuf,
    /// Thư mục ứng dụng: gốc cho đường dẫn tương đối của cấu hình (ví dụ tập lệnh đăng nhập).
    goc: PathBuf,
}

/// Cookie từng tài khoản (khóa là username chữ thường). Chỉ giữ trong bộ nhớ.
type KhoCookie = Arc<Mutex<HashMap<String, String>>>;

/// NHÁNH ADMIN: tạm bỏ cổng mật khẩu khởi động (đặt `false` để bật lại).
const TAM_BO_MAT_KHAU_KHOI_DONG: bool = true;

pub struct AppState {
    lo: Mutex<Option<Arc<Lo>>>,
    cookies: KhoCookie,
    nguoi: Mutex<String>,
    cau_hinh: Mutex<Option<PathBuf>>,
    /// Cổng mật khẩu khởi động: mã băm đã nạp, số lần sai, đã mở khóa chưa.
    khoa_khoi_dong: Mutex<KhoaKhoiDong>,
    dang_chay: Arc<Mutex<HashSet<String>>>,
    /// Phiên quản trị dùng lại giữa các lần xem (đăng nhập một lần).
    phien_quan_tri: tokio::sync::Mutex<Option<Session>>,
}

struct KhoaKhoiDong {
    hash: Option<String>,
    da_sai: u32,
    da_mo: bool,
}

impl Default for KhoaKhoiDong {
    fn default() -> Self {
        Self { hash: None, da_sai: 0, da_mo: TAM_BO_MAT_KHAU_KHOI_DONG }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            lo: Mutex::default(), cookies: KhoCookie::default(), nguoi: Mutex::default(), cau_hinh: Mutex::default(),
            khoa_khoi_dong: Mutex::default(), dang_chay: Arc::default(), phien_quan_tri: tokio::sync::Mutex::new(None),
        }
    }
}

/// Mọi lệnh dùng dữ liệu lô đều phải qua cổng mật khẩu trước.
fn yeu_cau_da_mo(state: &AppState) -> Result<(), String> {
    if khoa(&state.khoa_khoi_dong).da_mo { Ok(()) } else { Err("Chưa nhập mật khẩu khởi động".into()) }
}

#[derive(Serialize)]
struct TinhTrangKhoa {
    #[serde(rename = "daMo")]
    da_mo: bool,
    #[serde(rename = "tuBanSao")]
    tu_ban_sao: bool,
    #[serde(rename = "loiMang")]
    loi_mang: Option<String>,
    #[serde(rename = "soLanToiDa")]
    so_lan_toi_da: u32,
}

/// Bắt đầu cổng mật khẩu: nạp mã băm (mạng, hoặc bản lưu). Lỗi nếu không có cả hai.
#[tauri::command]
async fn khoi_dong_khoa(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<TinhTrangKhoa, String> {
    if khoa(&state.khoa_khoi_dong).da_mo {
        return Ok(TinhTrangKhoa { da_mo: true, tu_ban_sao: false, loi_mang: None, so_lan_toi_da: cong_mat_khau::SO_LAN_TOI_DA });
    }
    let dir = app.path().app_data_dir().map_err(|e| format!("Không xác định được thư mục dữ liệu ứng dụng: {e}"))?;
    let m = cong_mat_khau::nap_ma_bam(&dir, cong_mat_khau::PASS_PHASE_URL).await?;
    let mut k = khoa(&state.khoa_khoi_dong);
    k.hash = Some(m.hash);
    Ok(TinhTrangKhoa { da_mo: false, tu_ban_sao: m.tu_ban_sao, loi_mang: m.loi_mang, so_lan_toi_da: cong_mat_khau::SO_LAN_TOI_DA })
}

#[derive(Serialize)]
struct KetQuaMaPin {
    ok: bool,
    #[serde(rename = "conLai")]
    con_lai: u32,
}

/// Kiểm tra mã 6 số. Sai quá số lần cho phép thì khóa tới khi mở lại ứng dụng. Mật khẩu không được lưu hay ghi nhật ký.
#[tauri::command]
fn kiem_tra_ma(ma: String, state: State<AppState>) -> Result<KetQuaMaPin, String> {
    let mut k = khoa(&state.khoa_khoi_dong);
    if k.da_mo {
        return Ok(KetQuaMaPin { ok: true, con_lai: cong_mat_khau::SO_LAN_TOI_DA });
    }
    if k.da_sai >= cong_mat_khau::SO_LAN_TOI_DA {
        return Err("Nhập sai quá số lần cho phép. Hãy đóng và mở lại ứng dụng.".into());
    }
    let hash = k.hash.clone().ok_or("Chưa nạp được mật khẩu: tải lại màn hình xác thực")?;
    if cong_mat_khau::kiem_tra(&ma, &hash) {
        k.da_mo = true;
        return Ok(KetQuaMaPin { ok: true, con_lai: cong_mat_khau::SO_LAN_TOI_DA });
    }
    k.da_sai += 1;
    Ok(KetQuaMaPin { ok: false, con_lai: cong_mat_khau::SO_LAN_TOI_DA - k.da_sai })
}

fn khoa<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

/// Chống hai thao tác cùng lúc trên một tài khoản; tự nhả khi hết phạm vi.
struct KhoaTaiKhoan {
    set: Arc<Mutex<HashSet<String>>>,
    ten: String,
}
impl KhoaTaiKhoan {
    fn lay(set: &Arc<Mutex<HashSet<String>>>, ten: &str) -> Result<Self, String> {
        if !khoa(set).insert(ten.to_string()) {
            return Err(format!("{ten}: đang có thao tác khác chạy, đợi xong rồi thử lại"));
        }
        Ok(Self { set: set.clone(), ten: ten.to_string() })
    }
}
impl Drop for KhoaTaiKhoan {
    fn drop(&mut self) {
        khoa(&self.set).remove(&self.ten);
    }
}

// ---------------------------------------------------------------------------
// Góc nhìn cho giao diện
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
struct CauHinhDon {
    #[serde(rename = "excelFile")]
    excel_file: String,
    duong: String,
}

#[derive(Debug, Serialize)]
struct DonViView {
    username: String,
    label: String,
    enabled: bool,
    #[serde(rename = "excelFile")]
    excel_file: String,
    #[serde(rename = "coCookie")]
    co_cookie: bool,
    /// Đã cấu hình `password`: ứng dụng tự đăng nhập bằng trình duyệt ngầm khi cần cookie.
    #[serde(rename = "coMatKhau")]
    co_mat_khau: bool,
    /// Đường dẫn đầy đủ nơi ứng dụng tìm tệp Excel: `<dataRoot>/<username>/<excelFile>`.
    #[serde(rename = "excelPath")]
    excel_path: String,
    #[serde(rename = "excelCo")]
    excel_co: bool,
    /// Giá trị gốc trong tệp JSON của lô (để sửa): excelFile chưa bị lựa chọn riêng ghi đè, và đường A/B.
    #[serde(rename = "cauHinh")]
    cau_hinh: CauHinhDon,
    #[serde(rename = "trangThai")]
    trang_thai: TrangThai,
    #[serde(rename = "ketNoi")]
    ket_noi: Option<ket_noi::KetNoi>,
    #[serde(rename = "taiKhoan")]
    tai_khoan: Option<ket_noi::TaiKhoan>,
}

fn xem(lo: &Lo, cookies: &HashMap<String, String>, u: &UnitEntry) -> DonViView {
    let dir = lo::unit_dir(&lo.root, &u.username).unwrap_or_default();
    let excel = lo::duong_excel(&dir, &lo::excel_hien_tai(&dir, u)).ok();
    DonViView {
        username: u.username.clone(),
        label: u.label.clone(),
        enabled: u.enabled,
        excel_file: lo::excel_hien_tai(&dir, u),
        co_cookie: cookies.get(&u.username.to_lowercase()).is_some_and(|c| !c.trim().is_empty()),
        co_mat_khau: co_mat_khau(u),
        excel_path: excel.as_ref().map(|p| p.display().to_string()).unwrap_or_else(|| lo::excel_hien_tai(&dir, u)),
        excel_co: excel.as_ref().is_some_and(|p| p.is_file()),
        cau_hinh: CauHinhDon { excel_file: u.excel_file.clone(), duong: u.duong.clone().unwrap_or_default() },
        trang_thai: lo::doc_trang_thai(&dir),
        ket_noi: lo::doc_json(&dir.join("ket-noi.json")).ok(),
        tai_khoan: lo::doc_json(&dir.join("tai-khoan.json")).ok(),
    }
}

fn lay_lo(state: &AppState) -> Result<Arc<Lo>, String> {
    yeu_cau_da_mo(state)?;
    khoa(&state.lo).clone().ok_or_else(|| "Chưa nạp cấu hình lô".to_string())
}

fn tim_unit<'a>(lo: &'a Lo, username: &str) -> Result<&'a UnitEntry, String> {
    let n = lo::safe_username(username)?;
    lo.cfg.units.iter().find(|u| u.username.to_lowercase() == n).ok_or_else(|| format!("Không có tài khoản {n} trong lô"))
}

fn co_mat_khau(u: &UnitEntry) -> bool {
    u.password.as_deref().is_some_and(|p| !p.is_empty())
}

/// Cookie hiện có trong bộ nhớ (rỗng nếu chưa có).
fn cookie_hien(ck: &KhoCookie, u: &UnitEntry) -> String {
    khoa(ck).get(&u.username.to_lowercase()).cloned().unwrap_or_default()
}

/// Thiết bị của ứng dụng: mã cố định cho mỗi máy cài đặt, gửi kèm mọi yêu cầu (`X-Device-Id`…).
fn thiet_bi_ung_dung(lo: &Lo) -> Result<ThietBi, String> {
    let tb = lo::thiet_bi(&lo.root)?;
    Ok(ThietBi { id: tb.device_id, ten: tb.ten, phien_ban: PHIEN_BAN_GIAO_THUC.into(), nen_tang: std::env::consts::OS.into() })
}

/// Cách đăng nhập của đơn vị: có `password` thì **kênh Desktop** (có quyền sửa như ứng dụng Desktop); không thì cookie web dán tay (chỉ xem).
fn kieu_dang_nhap<'a>(u: &'a UnitEntry, cookie: &'a str, tb: &'a ThietBi) -> DangNhap<'a> {
    match u.password.as_deref().filter(|p| !p.is_empty()) {
        Some(p) => DangNhap::Desktop { username: &u.username, password: p, thiet_bi: tb },
        None => DangNhap::Cookie(cookie),
    }
}

/// Mở phiên cho đơn vị (đăng nhập kênh Desktop hoặc cookie).
async fn mo_phien_don_vi(lo: &Lo, u: &UnitEntry, ck: &KhoCookie) -> Result<Session, String> {
    let tb = thiet_bi_ung_dung(lo)?;
    let cookie = cookie_hien(ck, u);
    portal::mo_phien(&lo.cfg.base_url, &kieu_dang_nhap(u, &cookie, &tb), Duration::from_secs(lo.cfg.settings.timeout_sec)).await
}

fn cap_nhat(dir: &Path, f: impl FnOnce(&mut TrangThai)) {
    let mut t = lo::doc_trang_thai(dir);
    f(&mut t);
    let _ = lo::ghi_trang_thai(dir, &t);
}

fn dat_loi(dir: &Path, buoc: Buoc, loi: &str) {
    cap_nhat(dir, |t| {
        t.buoc = buoc;
        t.loi = Some(loi.to_string());
    });
    let mut e = lo::su_kien("loi");
    e.ket_qua = Some(if buoc == Buoc::Chan { "chan" } else { "loi" });
    let _ = lo::ghi_nhat_ky(dir, &e);
}

/// Nhãn kỳ "dd/mm/yyyy – dd/mm/yyyy" từ tên kỳ ("Kỳ 01/10/2025 – 30/09/2026"); `None` nếu không thấy hai ngày.
fn nhan_ky(ten: &str) -> Option<String> {
    let ngay: Vec<&str> = ten
        .split(|c: char| !(c.is_ascii_digit() || c == '/'))
        .filter(|t| t.len() >= 8 && t.matches('/').count() == 2)
        .collect();
    (ngay.len() >= 2).then(|| format!("{} – {}", ngay[0], ngay[1]))
}

// ---------------------------------------------------------------------------
// Lệnh: nạp lô, cookie, trạng thái
// ---------------------------------------------------------------------------

/// Đường dẫn cấu hình lô: tuyệt đối thì dùng thẳng; tương đối thì thử theo thư mục chạy rồi thư mục cha (khi chạy `tauri dev` thư mục chạy là `src-tauri`).
fn giai_duong_cau_hinh(path: &str) -> Result<PathBuf, String> {
    let p = PathBuf::from(path.trim());
    if p.is_absolute() || p.is_file() {
        return Ok(p);
    }
    let cha = PathBuf::from("..").join(&p);
    if cha.is_file() {
        return Ok(cha.canonicalize().unwrap_or(cha));
    }
    Err(format!("Không thấy tệp cấu hình lô: {}", p.display()))
}

fn nap_lo(p: &Path, state: &AppState) -> Result<Vec<DonViView>, String> {
    yeu_cau_da_mo(state)?;
    let cfg = LoConfig::nap(p)?;
    let root = lo::data_root(p, &cfg);
    for u in &cfg.units {
        lo::tao_thu_muc(&lo::unit_dir(&root, &u.username)?)?;
    }
    let goc = lo::goc_ung_dung(p);
    {
        let mut ten = khoa(&state.nguoi);
        if ten.trim().is_empty() { *ten = cfg.settings.nguoi_van_hanh.clone(); } // điền sẵn người vận hành mặc định
    }
    let lo = Arc::new(Lo { cfg, root, goc });
    *khoa(&state.lo) = Some(lo.clone());
    *khoa(&state.cau_hinh) = Some(p.to_path_buf());
    let ck = khoa(&state.cookies).clone();
    Ok(lo.cfg.units.iter().map(|u| xem(&lo, &ck, u)).collect())
}

/// Tập lệnh kiểm tra tệp Excel tìm được trên máy (cạnh tệp chạy, thư mục chạy hoặc cha của nó khi `tauri dev`): đường dẫn tuyệt đối, hoặc `None`.
fn tim_tap_lenh_kiem_tra() -> Option<String> {
    let tuong_doi = Path::new("scripts").join("kiem-tra").join("cli.mjs");
    let mut goc: Vec<PathBuf> = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        goc.extend(exe.parent().map(Path::to_path_buf));
    }
    if let Ok(cwd) = std::env::current_dir() {
        goc.push(cwd.clone());
        goc.extend(cwd.parent().map(Path::to_path_buf));
    }
    goc.iter().map(|g| g.join(&tuong_doi)).find(|p| p.is_file()).and_then(|p| p.canonicalize().ok()).map(|p| p.to_string_lossy().into_owned())
}

/// Lần đầu mở ứng dụng (chưa có tệp JSON của lô): tạo sẵn lô trống `<thư mục dữ liệu ứng dụng>/config/lo.json` (nếu chưa có) và trả đường dẫn.
/// Không bao giờ ghi đè tệp đã có. Dữ liệu từng tài khoản nằm ở `<thư mục dữ liệu ứng dụng>/data/`.
#[tauri::command]
fn khoi_tao_lo_trong(app: tauri::AppHandle, state: State<AppState>) -> Result<String, String> {
    yeu_cau_da_mo(&state)?;
    let dir = app.path().app_data_dir().map_err(|e| format!("Không xác định được thư mục dữ liệu ứng dụng: {e}"))?;
    let p = dir.join("config").join("lo.json");
    lo::tao_lo_trong(&p, tim_tap_lenh_kiem_tra().as_deref())?;
    Ok(p.to_string_lossy().into_owned())
}

#[tauri::command]
fn lo_nap(path: String, state: State<AppState>) -> Result<Vec<DonViView>, String> {
    nap_lo(&giai_duong_cau_hinh(&path)?, &state)
}

/// Thêm một đơn vị vào tệp JSON của lô rồi nạp lại.
#[tauri::command]
fn them_don_vi(don: lo::ThemDonVi, state: State<AppState>) -> Result<Vec<DonViView>, String> {
    let p = khoa(&state.cau_hinh).clone().ok_or("Chưa nạp cấu hình lô: chọn tệp JSON trước")?;
    lo::them_don_vi_vao_tep(&p, &don)?;
    nap_lo(&p, &state)
}

/// Sửa thông tin một đơn vị trong tệp JSON của lô rồi nạp lại.
#[tauri::command]
fn sua_don_vi(don: lo::SuaDonVi, state: State<AppState>) -> Result<Vec<DonViView>, String> {
    let p = khoa(&state.cau_hinh).clone().ok_or("Chưa nạp cấu hình lô: chọn tệp JSON trước")?;
    let lo = lay_lo(&state)?;
    let dir = lo::unit_dir(&lo.root, &don.username)?;
    lo::sua_don_vi_trong_tep(&p, &dir, &don)?;
    nap_lo(&p, &state)
}

/// Xóa một đơn vị khỏi tệp JSON của lô rồi nạp lại. Giữ nguyên thư mục dữ liệu của tài khoản.
#[tauri::command]
fn xoa_don_vi(username: String, state: State<AppState>) -> Result<Vec<DonViView>, String> {
    let p = khoa(&state.cau_hinh).clone().ok_or("Chưa nạp cấu hình lô: chọn tệp JSON trước")?;
    let lo = lay_lo(&state)?;
    let u = tim_unit(&lo, &username)?;
    let _khoa = KhoaTaiKhoan::lay(&state.dang_chay, &u.username)?; // đang chạy thao tác thì không xóa
    lo::xoa_don_vi_khoi_tep(&p, &u.username)?;
    khoa(&state.cookies).remove(&u.username.to_lowercase());
    nap_lo(&p, &state)
}

/// Người vận hành đang dùng (mặc định lấy từ `settings.nguoiVanHanh`).
#[tauri::command]
fn lay_nguoi(state: State<AppState>) -> String {
    khoa(&state.nguoi).clone()
}

#[tauri::command]
fn dat_cookie(username: String, cookie: String, state: State<AppState>) -> Result<(), String> {
    let lo = lay_lo(&state)?;
    let u = tim_unit(&lo, &username)?;
    khoa(&state.cookies).insert(u.username.to_lowercase(), portal::normalize_cookie(&cookie));
    Ok(())
}

#[tauri::command]
fn dat_nguoi(ten: String, state: State<AppState>) {
    *khoa(&state.nguoi) = ten.trim().to_string();
}

#[tauri::command]
fn lay_trang_thai(state: State<AppState>) -> Result<Vec<DonViView>, String> {
    let lo = lay_lo(&state)?;
    let ck = khoa(&state.cookies).clone();
    Ok(lo.cfg.units.iter().map(|u| xem(&lo, &ck, u)).collect())
}

// ---------------------------------------------------------------------------
// Kiểm tra kết nối (chỉ đọc)
// ---------------------------------------------------------------------------

async fn kiem_tra_mot(lo: &Lo, u: &UnitEntry, ck: &KhoCookie) -> Result<ket_noi::KetNoi, String> {
    let dir = lo::unit_dir(&lo.root, &u.username)?;
    cap_nhat(&dir, |t| { t.buoc = Buoc::KiemTraKetNoi; t.tien_do = 5; t.loi = None; });
    let tb = thiet_bi_ung_dung(lo)?;
    let cookie = cookie_hien(ck, u);
    let k = ket_noi::kiem_tra(u, &lo.cfg.base_url, &lo.cfg.settings, &kieu_dang_nhap(u, &cookie, &tb), &dir).await;
    cap_nhat(&dir, |t| {
        t.ket_noi = k.ket_qua.clone();
        t.tien_do = 10;
        match &k.chan {
            Some(c) => { t.buoc = Buoc::Chan; t.loi = Some(format!("{}: {}", c.ma, c.thong_bao)); }
            None => if matches!(t.buoc, Buoc::KiemTraKetNoi | Buoc::Chan | Buoc::Loi) { t.buoc = Buoc::ChuaChay; t.loi = None; },
        }
    });
    let mut e = lo::su_kien("kiem_tra_ket_noi");
    e.ket_qua = Some(if k.chan.is_some() { "chan" } else { "ok" });
    let _ = lo::ghi_nhat_ky(&dir, &e);
    Ok(k)
}

/// Đăng nhập lại (kênh Desktop nếu có password) rồi kiểm tra kết nối một đơn vị.
#[tauri::command]
async fn dang_nhap(username: String, state: State<'_, AppState>) -> Result<(), String> {
    let lo = lay_lo(&state)?;
    let u = tim_unit(&lo, &username)?.clone();
    let _khoa = KhoaTaiKhoan::lay(&state.dang_chay, &u.username)?;
    kiem_tra_mot(&lo, &u, &state.cookies).await.map(|_| ())
}

/// Đăng nhập kênh Desktop và trả token Bearer hiện tại để giao diện sao chép vào bộ nhớ tạm. Token là bí mật: không ghi đĩa, không ghi nhật ký (chỉ ghi sự kiện).
#[tauri::command]
async fn lay_bearer(username: String, state: State<'_, AppState>) -> Result<String, String> {
    let lo = lay_lo(&state)?;
    let u = tim_unit(&lo, &username)?.clone();
    if !co_mat_khau(&u) {
        return Err("Đơn vị chưa cấu hình mật khẩu nên chưa có token Bearer (chỉ kênh Desktop mới có). Thêm password trong thông tin đơn vị.".into());
    }
    let _khoa = KhoaTaiKhoan::lay(&state.dang_chay, &u.username)?;
    let sess = mo_phien_don_vi(&lo, &u, &state.cookies).await?;
    let token = sess.bearer_cho_nguoi_dung().await?.ok_or("Phiên không phải kênh Desktop: không có token Bearer")?;
    let dir = lo::unit_dir(&lo.root, &u.username)?;
    let mut e = lo::su_kien("sao_chep_bearer");
    e.ket_qua = Some("ok");
    let _ = lo::ghi_nhat_ky(&dir, &e);
    Ok(token)
}

/// Chỉ kiểm tra tệp Excel của đơn vị (không tính thay đổi, không gửi gì) và làm mới số liệu trên cổng để so sánh. Cần đã kiểm tra kết nối (có `tai-khoan.json`).
/// Kết quả chi tiết lưu ở `kiem-tra/<runId>.json`; giao diện đọc qua `lay_ket_qua_kiem_tra`. Gói thay đổi đã dựng từ tệp cũ bị coi là lỗi thời.
#[tauri::command]
async fn kiem_tra_tep(username: String, state: State<'_, AppState>) -> Result<(), String> {
    let lo = lay_lo(&state)?;
    let u = tim_unit(&lo, &username)?.clone();
    let _khoa = KhoaTaiKhoan::lay(&state.dang_chay, &u.username)?;
    let dir = lo::unit_dir(&lo.root, &u.username)?;
    let tk: ket_noi::TaiKhoan = lo::doc_json(&dir.join("tai-khoan.json")).map_err(|_| "Chưa đọc được thông tin tài khoản: bấm \"Kiểm tra kết nối\" trước".to_string())?;
    let truoc = lo::doc_trang_thai(&dir);
    let sess = mo_phien_don_vi(&lo, &u, &state.cookies).await?;
    let kq = kiem_tra_file(&lo, &u, &tk, &sess, &dir).await;
    let kq = match kq {
        Ok(k) => k,
        Err(e) => {
            cap_nhat(&dir, |t| t.buoc = truoc.buoc);
            return Err(e);
        }
    };
    // số liệu trên cổng (chỉ đọc); lỗi tải không làm hỏng kết quả kiểm tra tệp
    if let Ok((_, hang)) = may_chu::tai(&sess, &tk.ky_id, &tk.ho_so.id, &dir).await {
        if let Ok(anh) = may_chu::chuan_hoa(&hang) {
            cap_nhat(&dir, |t| {
                let cu = t.so_dong.take().unwrap_or_default();
                t.so_dong = Some(lo::SoDongTheoBieu { cong: dem_theo_bieu(&anh), excel: cu.excel, tong_cong: tong_cong(&anh), tong_excel: cu.tong_excel });
            });
        }
    }
    cap_nhat(&dir, |t| {
        t.tien_do = 55;
        if truoc.buoc == Buoc::SanSangGui {
            t.buoc = Buoc::CanXemXet; // tệp đã kiểm tra lại: gói dựng từ tệp cũ không còn đáng tin
            t.thay_doi = None;
            t.ghi_chu = Some("Đã kiểm tra lại tệp Excel: bấm Chuẩn bị để tính lại thay đổi trước khi gửi.".into());
        } else {
            t.buoc = truoc.buoc;
        }
    });
    let mut e = lo::su_kien("kiem_tra_tep");
    e.ket_qua = Some(if kq.kq.dong_loi == 0 { "ok" } else { "co_loi" });
    let _ = lo::ghi_nhat_ky(&dir, &e);
    Ok(())
}

/// Kết quả kiểm tra tệp gần nhất của đơn vị (nội dung `kiem-tra/<runId>.json`), hoặc null nếu chưa kiểm tra.
#[tauri::command]
fn lay_ket_qua_kiem_tra(username: String, state: State<AppState>) -> Result<Option<serde_json::Value>, String> {
    let lo = lay_lo(&state)?;
    let u = tim_unit(&lo, &username)?;
    let dir = lo::unit_dir(&lo.root, &u.username)?;
    let Some(kt) = lo::doc_trang_thai(&dir).kiem_tra else { return Ok(None) };
    if kt.ket_qua_file.contains("..") || Path::new(&kt.ket_qua_file).is_absolute() {
        return Err("Đường dẫn kết quả kiểm tra không hợp lệ".into());
    }
    Ok(lo::doc_json(&dir.join(&kt.ket_qua_file)).ok())
}

#[tauri::command]
async fn kiem_tra_ket_noi_tat_ca(state: State<'_, AppState>) -> Result<Vec<DonViView>, String> {
    let lo = lay_lo(&state)?;
    let sem = Arc::new(Semaphore::new(lo.cfg.settings.concurrency.max(1)));
    let mut tasks = Vec::new();
    for u in lo.cfg.units.iter().filter(|u| u.enabled).cloned() {
        let (lo, sem, ck, dang_chay) = (lo.clone(), sem.clone(), state.cookies.clone(), state.dang_chay.clone());
        tasks.push(tokio::spawn(async move {
            let Ok(_p) = sem.acquire_owned().await else { return };
            let Ok(_k) = KhoaTaiKhoan::lay(&dang_chay, &u.username) else { return };
            let _ = kiem_tra_mot(&lo, &u, &ck).await;
        }));
    }
    for t in tasks {
        t.await.map_err(|e| format!("Tác vụ bị dừng đột ngột: {e}"))?;
    }
    let ck = khoa(&state.cookies).clone();
    Ok(lo.cfg.units.iter().map(|u| xem(&lo, &ck, u)).collect())
}

// ---------------------------------------------------------------------------
// Tạo tài khoản (đơn vị con + tài khoản kê khai) bằng tài khoản quản trị
// ---------------------------------------------------------------------------

/// Mở phiên bằng một tài khoản quản trị cụ thể (kênh Desktop).
async fn mo_phien_voi(lo: &Lo, qt: &tao_tai_khoan::TaiKhoanQuanTri) -> Result<Session, String> {
    let tb = thiet_bi_ung_dung(lo)?;
    let dn = DangNhap::Desktop { username: &qt.username, password: &qt.password, thiet_bi: &tb };
    portal::mo_phien(&lo.cfg.base_url, &dn, Duration::from_secs(lo.cfg.settings.timeout_sec)).await
        .map_err(|e| format!("Đăng nhập tài khoản quản trị {} thất bại: {e}", qt.username))
}

/// Phiên quản trị theo tài khoản đang dùng (thiết lập trong ứng dụng, hoặc `settings.taiKhoanQuanTri` của lô).
async fn mo_phien_quan_tri(lo: &Lo) -> Result<Session, String> {
    let (qt, _) = quan_tri::tai_khoan_dang_dung(lo).ok_or("Chưa thiết lập tài khoản quản trị")?;
    mo_phien_voi(lo, &qt).await
}

/// Cây đơn vị trên cổng và các tên đăng nhập đã có, để giao diện chọn đơn vị cha. Chỉ đọc.
#[tauri::command]
async fn tq_lay_cay(state: State<'_, AppState>) -> Result<tao_tai_khoan::Cay, String> {
    let lo = lay_lo(&state)?;
    let sess = mo_phien_quan_tri(&lo).await?;
    tao_tai_khoan::lay_cay(&sess, &tao_tai_khoan::hom_nay()).await
}

#[derive(Serialize)]
struct KetQuaTaoView {
    #[serde(flatten)]
    kq: tao_tai_khoan::KetQuaTao,
    /// Danh sách đơn vị của lô sau khi thêm (khi chọn thêm vào lô).
    #[serde(rename = "donVi")]
    don_vi: Option<Vec<DonViView>>,
}

/// Tạo đơn vị con + tài khoản trên cổng THẬT. Tùy chọn thêm luôn vào lô JSON (kèm mật khẩu tạm) để dùng ngay.
#[tauri::command]
async fn tq_tao(yeu_cau: tao_tai_khoan::YeuCauTao, them_vao_lo: bool, state: State<'_, AppState>) -> Result<KetQuaTaoView, String> {
    let lo = lay_lo(&state)?;
    let sess = mo_phien_quan_tri(&lo).await?;
    let kq = tao_tai_khoan::tao(&sess, &yeu_cau, &tao_tai_khoan::hom_nay()).await?;
    let mut e = lo::su_kien("tao_tai_khoan");
    e.ket_qua = Some("ok");
    let _ = lo::ghi_nhat_ky(&lo.root.join("_chung"), &e);
    let don_vi = if them_vao_lo && !kq.mat_khau.is_empty() {
        let p = khoa(&state.cau_hinh).clone().ok_or("Chưa nạp cấu hình lô")?;
        let them = lo::ThemDonVi { username: kq.ten_dang_nhap.clone(), label: yeu_cau.ten.trim().to_string(), password: kq.mat_khau.clone(), excel_file: String::new(), duong: String::new() };
        lo::them_don_vi_vao_tep(&p, &them)?;
        Some(nap_lo(&p, &state)?)
    } else {
        None
    };
    Ok(KetQuaTaoView { kq, don_vi })
}

/// Xuất báo cáo Excel (Tên đơn vị | Tài khoản | Mật khẩu) vào `<data>/_chung/bao-cao/`; trả đường dẫn tệp. Tệp chứa mật khẩu nên nằm trong `data/` (đã loại khỏi git).
#[tauri::command]
fn tq_xuat_excel(hang: Vec<tao_tai_khoan::DongBaoCao>, ten_tep: String, state: State<AppState>) -> Result<String, String> {
    let lo = lay_lo(&state)?;
    let f = lo.root.join("_chung").join("bao-cao").join(tao_tai_khoan::ten_tep_bao_cao(&ten_tep)?);
    tao_tai_khoan::xuat_excel(&f, &hang)?;
    Ok(f.to_string_lossy().into_owned())
}

// ---------------------------------------------------------------------------
// Chuẩn bị: kiểm tra Excel + tính thay đổi (không gửi gì)
// ---------------------------------------------------------------------------

fn sha256_hex(bytes: &[u8]) -> String {
    Sha256::digest(bytes).iter().map(|b| format!("{b:02x}")).collect()
}

fn cau_hinh_gui(s: &lo::Settings) -> goi::CauHinhGui {
    goi::CauHinhGui { poll_dau_ms: s.poll_interval_ms.max(200), ..Default::default() }
}

/// Dòng đã chuẩn hóa của lần kiểm tra gần nhất, giữ lại để tính lại thay đổi khi đối chiếu sau gửi.
#[derive(Debug, Serialize, Deserialize)]
struct DongDaKiemTra {
    schema: u32,
    #[serde(rename = "runId")]
    run_id: String,
    dong: std::collections::BTreeMap<String, Vec<kiem_tra_local::DongTho>>,
    #[serde(rename = "cotNhap")]
    cot_nhap: std::collections::BTreeMap<String, Vec<String>>,
    #[serde(rename = "dongLoi")]
    dong_loi: Vec<(String, u32)>,
}

struct KetQuaFile {
    kq: kiem_tra_local::KetQuaKiemTra,
    sha: String,
    run_id: String,
}

/// Số dòng từng biểu của một nguồn (Excel hoặc ảnh chụp cổng): biểu rỗng vẫn giữ để hiện 0. Thuần.
fn dem_theo_bieu<T>(m: &std::collections::BTreeMap<String, Vec<T>>) -> std::collections::BTreeMap<String, usize> {
    m.iter().map(|(k, v)| (k.clone(), v.len())).collect()
}

/// Dòng dạng thống nhất của Excel và cổng: cột → giá trị (bỏ ô trống).
type Hang = std::collections::BTreeMap<String, Vec<std::collections::BTreeMap<String, String>>>;

fn so_o(h: &std::collections::BTreeMap<String, String>, c: &str) -> Option<f64> {
    h.get(c).and_then(|x| x.trim().replace(',', ".").parse::<f64>().ok())
}

fn nam_o(h: &std::collections::BTreeMap<String, String>) -> String {
    h.get("B").map(|n| n.trim().trim_end_matches(".0").to_string()).unwrap_or_default()
}

/// Số người biên chế của một nguồn:
/// - C3: Σ cột J "Người cần bố trí" (khóa "").
/// - D2 theo năm: "Người cần bố trí trong năm" (cột C). Cột C là cột tự tính, Excel không lưu; cổng cũng có thể chưa tính (để trống).
///   Khi đó tính lại đúng công thức: Σ C3.J + Σ biến động dự báo của năm đó (du_bao_5_nam.C là "biến động so C3").
///   Cột D ("Người có thể bố trí") là số nhập khác, không phải số người cần bố trí nên không dùng ở đây.
fn tong_nguoi(f: &Hang) -> lo::Tong {
    let mut kq = lo::Tong::new();
    let tong_cot = |bieu: &str, c: &str| f.get(bieu).map(|v| v.iter().filter_map(|h| so_o(h, c)).sum::<f64>());
    let c3 = tong_cot("c3", "J");
    if let Some(t) = c3 {
        kq.insert("c3".into(), [("".to_string(), t)].into_iter().collect());
    }
    let Some(d2) = f.get("d2").filter(|v| !v.is_empty()) else { return kq };
    let mut theo_nam = std::collections::BTreeMap::<String, f64>::new();
    if d2.iter().any(|h| so_o(h, "C").is_some()) {
        for h in d2 { *theo_nam.entry(nam_o(h)).or_insert(0.0) += so_o(h, "C").unwrap_or(0.0); }
    } else {
        let mut bien_dong = std::collections::BTreeMap::<String, f64>::new();
        for h in f.get("du_bao_5_nam").into_iter().flatten() { *bien_dong.entry(nam_o(h)).or_insert(0.0) += so_o(h, "C").unwrap_or(0.0); }
        for h in d2 { theo_nam.entry(nam_o(h)).or_insert_with_key(|n| c3.unwrap_or(0.0) + bien_dong.get(n).copied().unwrap_or(0.0)); }
    }
    kq.insert("d2".into(), theo_nam);
    kq
}

fn tong_excel(m: &std::collections::BTreeMap<String, Vec<kiem_tra_local::DongTho>>) -> lo::Tong {
    let f: Hang = m.iter().filter(|(k, _)| matches!(k.as_str(), "c3" | "d2" | "du_bao_5_nam"))
        .map(|(k, v)| (k.clone(), v.iter().map(|r| r.data.iter().filter_map(|(c, x)| x.clone().map(|x| (c.clone(), x))).collect()).collect())).collect();
    tong_nguoi(&f)
}

fn tong_cong(m: &thay_doi::AnhChup) -> lo::Tong {
    let f: Hang = m.iter().filter(|(k, _)| matches!(k.as_str(), "c3" | "d2" | "du_bao_5_nam"))
        .map(|(k, v)| (k.clone(), v.iter().map(|r| r.data.clone()).collect())).collect();
    tong_nguoi(&f)
}

/// Bước dùng chung: kiểm tra Excel trên máy, lưu `kiem-tra/<runId>.json` và `kiem-tra/dong.json`.
async fn kiem_tra_file(lo: &Lo, u: &UnitEntry, tk: &ket_noi::TaiKhoan, sess: &Session, dir: &std::path::Path) -> Result<KetQuaFile, String> {
    let s = &lo.cfg.settings;
    let excel = lo::duong_excel(dir, &lo::excel_hien_tai(dir, u))?;
    let bytes = std::fs::read(&excel).map_err(|e| format!("Không đọc được tệp Excel {}: {e}", excel.display()))?;
    cap_nhat(dir, |t| { t.buoc = Buoc::DangKiemTraFile; t.tien_do = 25; });
    let dm = danh_muc::dam_bao(sess, &lo.root, s.request_interval_ms).await?;
    let ky = nhan_ky(&tk.ky);
    let script = if Path::new(&s.kiem_tra_script).is_absolute() { PathBuf::from(&s.kiem_tra_script) } else { lo.goc.join(&s.kiem_tra_script) };
    let y = kiem_tra_local::YeuCau {
        node: &s.node, script: &script, excel: &excel, mode: &u.mode, form_key: u.form_key.as_deref(), ky: ky.as_deref(), danh_muc: Some(&dm),
        timeout: Duration::from_secs(s.timeout_sec),
    };
    let (kq, mut tho) = kiem_tra_local::chay(&y).await?;
    if let Some(o) = tho.as_object_mut() {
        o.remove("dong");
        o.remove("cot_nhap");
    }
    let sha = sha256_hex(&bytes);
    let run_id = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
    let file_kq = format!("kiem-tra/{run_id}.json");
    lo::ghi_json(&dir.join(&file_kq), &serde_json::json!({
        "schema": lo::SCHEMA, "runId": run_id,
        "tep": {"ten": excel.file_name().map(|n| n.to_string_lossy().into_owned()), "sha256": sha, "kichThuoc": bytes.len()},
        "quyTac": {"phienBan": tho["phien_ban_quy_tac"], "nguon": "vtvl_app/src/cong/local"}, "ketQua": tho,
    }))?;
    lo::ghi_json(&dir.join("kiem-tra").join("dong.json"), &DongDaKiemTra { schema: lo::SCHEMA, run_id: run_id.clone(), dong: kq.dong.clone(), cot_nhap: kq.cot_nhap.clone(), dong_loi: kq.dong_loi_chan().into_iter().collect() })?;
    cap_nhat(dir, |t| {
        t.tien_do = 55;
        t.kiem_tra = Some(TomTatKiemTra { tong_dong: kq.tong_dong, dong_loi: kq.dong_loi, canh_bao: kq.so_canh_bao(), ket_qua_file: file_kq.clone() });
        t.so_dong = Some(lo::SoDongTheoBieu { cong: Default::default(), excel: dem_theo_bieu(&kq.dong), tong_cong: Default::default(), tong_excel: tong_excel(&kq.dong) }); // số dòng trên cổng điền ở bước sau (đường B)
    });
    Ok(KetQuaFile { kq, sha, run_id })
}

/// Kết luận khi tính ra 0 thay đổi: khớp máy chủ (bình thường) hay có dòng bị bỏ qua (cần xem). Thuần.
/// Trả (bước, lỗi nếu cần xem xét, ghi chú nếu khớp).
fn ket_luan_khong_thay_doi(k: &thay_doi::KetQuaTinh) -> (Buoc, Option<String>, Option<String>) {
    let dem = |ld: &str| k.bo_qua.iter().filter(|b| b.ly_do == ld).count();
    let mut ly_do = Vec::new();
    for (ld, mau) in [
        ("dong_loi", "dòng còn lỗi nên bị chặn"), ("khong_duoc_phan_cong", "dòng thuộc biểu chưa được phân công cho tài khoản"),
        ("thieu_khoa", "dòng thiếu cột khóa"), ("trung_trong_tep", "dòng trùng trong tệp"),
    ] {
        let n = dem(ld);
        if n > 0 { ly_do.push(format!("{n} {mau}")); }
    }
    if !k.bo_qua.is_empty() {
        return (Buoc::CanXemXet, Some(format!("Không có thay đổi nào để gửi vì: {}.", ly_do.join("; "))), None);
    }
    if k.khong_doi > 0 {
        return (Buoc::DaKhop, None, Some(format!("Excel đã khớp hoàn toàn với máy chủ ({} dòng không đổi): không có gì để gửi.", k.khong_doi)));
    }
    (Buoc::CanXemXet, Some("Tệp Excel không có dòng dữ liệu nào để so sánh với máy chủ.".into()), None)
}

/// Đường B: tải ảnh chụp hồ sơ, tính thay đổi, ghi `thay-doi/thay-doi.json`.
async fn chuan_bi_b(lo: &Lo, tk: &ket_noi::TaiKhoan, sess: &Session, dir: &std::path::Path, kf: &KetQuaFile) -> Result<(), String> {
    let s = &lo.cfg.settings;
    let (wrap, hang) = may_chu::tai(sess, &tk.ky_id, &tk.ho_so.id, dir).await?;
    let anh = may_chu::chuan_hoa(&hang)?;
    cap_nhat(dir, |t| { // số dòng hiện có trên cổng, để xem trước cạnh số dòng trong Excel
        let cu = t.so_dong.take().unwrap_or_default();
        t.so_dong = Some(lo::SoDongTheoBieu { cong: dem_theo_bieu(&anh), excel: cu.excel, tong_cong: tong_cong(&anh), tong_excel: cu.tong_excel });
    });
    let cho_sua = (!tk.bieu_duoc_sua.is_empty()).then_some(tk.bieu_duoc_sua.as_slice());
    let kqt = thay_doi::tinh(&kf.kq.dong, &kf.kq.cot_nhap, &kf.kq.dong_loi_chan(), &anh, s.cho_phep_xoa_dong, cho_sua);
    lo::ghi_json(&dir.join("thay-doi").join("thay-doi.json"), &serde_json::json!({
        "schema": lo::SCHEMA, "tinhLuc": lo::bay_gio(), "nguon": {"sha256": kf.sha, "runId": kf.run_id},
        "gocMayChu": {"phienBanHoSo": wrap["phienBanHoSo"], "cursor": wrap["cursor"]},
        "chinhSach": {"dongLoiChan": true, "trungDong": "bo_qua", "xoaDong": s.cho_phep_xoa_dong},
        "thayDoi": kqt.thay_doi, "boQua": kqt.bo_qua, "canhBao": kqt.canh_bao, "khongDoi": kqt.khong_doi, "xoaNhieu": kqt.xoa_nhieu,
    }))?;
    cap_nhat(dir, |t| {
        t.tien_do = 70;
        t.thay_doi = Some(TomTatThayDoi { tong: kqt.thay_doi.len(), tao: kqt.dem("tao"), sua: kqt.dem("sua"), bo: kqt.dem("bo"), file: "thay-doi/thay-doi.json".into() });
        let (buoc, loi, khop) = if kqt.thay_doi.is_empty() { ket_luan_khong_thay_doi(&kqt) } else { (Buoc::SanSangGui, None, None) };
        t.buoc = buoc;
        t.loi = loi;
        let ghi: Vec<String> = khop.into_iter().chain((!kqt.canh_bao.is_empty()).then(|| kqt.canh_bao.join(" · "))).collect();
        t.ghi_chu = (!ghi.is_empty()).then(|| ghi.join(" · "));
    });
    Ok(())
}

/// Đường A: đưa tệp lên cổng kiểm tra (`/imports`), chờ kết quả, lưu tệp kết quả. Không kết chuyển.
async fn chuan_bi_a(lo: &Lo, u: &UnitEntry, tk: &ket_noi::TaiKhoan, sess: Session, cookie: &str, dir: &std::path::Path) -> Result<(), String> {
    let s = &lo.cfg.settings;
    let excel = lo::duong_excel(dir, &lo::excel_hien_tai(dir, u))?;
    let creds = Credentials { base: &lo.cfg.base_url, cookie, timeout: Duration::from_secs(s.timeout_sec) };
    let mut sess = sess;
    let ctx = imports::Ctx { org_id: tk.org_id.clone(), period_id: tk.ky_id.clone(), submission_id: tk.ho_so.id.clone() };
    let form_key = (u.mode == "single").then_some(u.form_key.as_deref().unwrap_or(""));
    cap_nhat(dir, |t| { t.tien_do = 60; });
    let req = imports::UploadReq { ctx: &ctx, path: &excel, form_key };
    let import_id = portal::with_retry(&mut sess, &creds, s.retry_count, |se| { let req = &req; async move { imports::upload_excel(se, req).await } }).await?;
    let info = imports::wait_final(&mut sess, &creds, s.retry_count, Duration::from_millis(s.poll_interval_ms), &import_id).await?;
    let xlsx = portal::with_retry(&mut sess, &creds, s.retry_count, |se| imports::download_result(se, &import_id)).await.ok();
    if let Some(b) = &xlsx {
        let _ = std::fs::write(dir.join("ket-qua").join(format!("{import_id}.xlsx")), b);
    }
    lo::ghi_json(&dir.join("ket-qua").join(format!("{import_id}.json")), &serde_json::json!({"schema": lo::SCHEMA, "importId": import_id, "status": info.status, "tong": info.total, "loiChan": info.block, "canhBao": info.warning, "committed": false}))?;
    let ok = info.status == "VALIDATED" && info.block.unwrap_or(0) == 0;
    cap_nhat(dir, |t| {
        t.tien_do = 70;
        t.thay_doi = Some(TomTatThayDoi { tong: info.total.unwrap_or(0) as usize, tao: 0, sua: 0, bo: 0, file: format!("ket-qua/{import_id}.json") });
        t.goi_hien_tai = Some(lo::GoiHienTai { changeset_id: import_id.clone(), trang_thai: "da_kiem_tra_cong".into(), so_lan_thu: 0 });
        t.buoc = if ok { Buoc::SanSangGui } else { Buoc::CanXemXet };
        t.loi = (!ok).then(|| info.error.clone().unwrap_or_else(|| format!("Cổng còn {} dòng lỗi phải sửa (xem ket-qua/{import_id}.xlsx)", info.block.unwrap_or(0))));
    });
    Ok(())
}

async fn chuan_bi_mot(lo: &Lo, u: &UnitEntry, ck: &KhoCookie) -> Result<(), String> {
    let dir = lo::unit_dir(&lo.root, &u.username)?;
    let k = kiem_tra_mot(lo, u, ck).await?;
    if let Some(c) = k.chan {
        return Err(format!("{}: {}", c.ma, c.thong_bao));
    }
    let cookie = cookie_hien(ck, u);
    let cookie = cookie.as_str(); // chỉ dùng cho đường A khi phải đăng nhập lại bằng cookie
    let tk: ket_noi::TaiKhoan = lo::doc_json(&dir.join("tai-khoan.json"))?;
    let sess = mo_phien_don_vi(lo, u, ck).await?;
    let kf = kiem_tra_file(lo, u, &tk, &sess, &dir).await?;
    if tk.quyen.duong == "A" {
        chuan_bi_a(lo, u, &tk, sess, cookie, &dir).await?;
    } else {
        chuan_bi_b(lo, &tk, &sess, &dir, &kf).await?;
    }
    let mut e = lo::su_kien("chuan_bi");
    e.so_thay_doi = lo::doc_trang_thai(&dir).thay_doi.map(|t| t.tong);
    let _ = lo::ghi_nhat_ky(&dir, &e);
    Ok(())
}

/// Chuẩn bị một đơn vị; lỗi được ghi vào trạng thái đơn vị (chặn hoặc lỗi) rồi trả lại.
async fn chuan_bi_va_ghi_loi(lo: &Lo, u: &UnitEntry, ck: &KhoCookie) -> Result<(), String> {
    let dir = lo::unit_dir(&lo.root, &u.username)?;
    match chuan_bi_mot(lo, u, ck).await {
        Ok(()) => Ok(()),
        Err(e) => {
            let chan = ["COOKIE_", "THIEU_QUYEN", "KY_DONG", "WAF", "DANG_NHAP", "CHUA_PHAN_CONG", "NGU_CANH"].iter().any(|p| e.starts_with(p));
            dat_loi(&dir, if chan { Buoc::Chan } else { Buoc::Loi }, &e);
            Err(e)
        }
    }
}

#[tauri::command]
async fn chuan_bi(username: String, state: State<'_, AppState>) -> Result<(), String> {
    let lo = lay_lo(&state)?;
    let u = tim_unit(&lo, &username)?.clone();
    let _khoa = KhoaTaiKhoan::lay(&state.dang_chay, &u.username)?;
    chuan_bi_va_ghi_loi(&lo, &u, &state.cookies).await
}

/// Chuẩn bị mọi đơn vị đang bật (kiểm tra Excel + tính thay đổi, không gửi gì), chạy song song theo `concurrency`. Lỗi từng đơn vị nằm trên thẻ của đơn vị đó.
#[tauri::command]
async fn chuan_bi_tat_ca(state: State<'_, AppState>) -> Result<Vec<DonViView>, String> {
    let lo = lay_lo(&state)?;
    let sem = Arc::new(Semaphore::new(lo.cfg.settings.concurrency.max(1)));
    let mut tasks = Vec::new();
    for u in lo.cfg.units.iter().filter(|u| u.enabled).cloned() {
        let (lo, sem, ck, dang_chay) = (lo.clone(), sem.clone(), state.cookies.clone(), state.dang_chay.clone());
        tasks.push(tokio::spawn(async move {
            let Ok(_p) = sem.acquire_owned().await else { return };
            let Ok(_k) = KhoaTaiKhoan::lay(&dang_chay, &u.username) else { return };
            let _ = chuan_bi_va_ghi_loi(&lo, &u, &ck).await;
        }));
    }
    for t in tasks {
        t.await.map_err(|e| format!("Tác vụ bị dừng đột ngột: {e}"))?;
    }
    let ck = khoa(&state.cookies).clone();
    Ok(lo.cfg.units.iter().map(|u| xem(&lo, &ck, u)).collect())
}

// ---------------------------------------------------------------------------
// Gửi / Gửi lại / Gửi tất cả
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct GuiYeuCau {
    username: String,
    /// Số thay đổi người dùng đã thấy trên màn hình; phải khớp số hiện tại mới gửi.
    #[serde(rename = "soThayDoi")]
    so_thay_doi: usize,
}

fn ket_noi_con_moi(dir: &std::path::Path) -> Result<(), String> {
    let k: ket_noi::KetNoi = lo::doc_json(&dir.join("ket-noi.json")).map_err(|_| "Chưa kiểm tra kết nối: bấm \"Kiểm tra kết nối\" trước".to_string())?;
    if k.ket_qua == "chan" {
        return Err("Kết nối đang bị chặn, xử lý rồi kiểm tra lại".into());
    }
    let luc = chrono::DateTime::parse_from_rfc3339(&k.luc).map_err(|_| "ket-noi.json hỏng".to_string())?;
    if (chrono::Utc::now() - luc.with_timezone(&chrono::Utc)).num_minutes() > KET_NOI_TOI_DA_PHUT {
        return Err(format!("Kiểm tra kết nối đã quá {KET_NOI_TOI_DA_PHUT} phút, kiểm tra lại trước khi gửi"));
    }
    Ok(())
}

/// Kết quả một lần gửi: đã gửi thật hoặc chạy khô (đã dựng gói, chưa gọi cổng).
#[derive(Debug, PartialEq)]
enum LanGui {
    DaGui,
    CheDoKho,
}

/// Đối chiếu sau khi gửi: tải lại ảnh chụp, tính lại thay đổi từ cùng dữ liệu Excel; còn thay đổi nào là chưa khớp.
async fn doi_chieu(lo: &Lo, tk: &ket_noi::TaiKhoan, sess: &Session, dir: &std::path::Path) -> Result<(usize, bool), String> {
    let d: DongDaKiemTra = lo::doc_json(&dir.join("kiem-tra").join("dong.json"))?;
    let (_, hang) = may_chu::tai(sess, &tk.ky_id, &tk.ho_so.id, dir).await?;
    let anh = may_chu::chuan_hoa(&hang)?;
    let loi: HashSet<(String, u32)> = d.dong_loi.into_iter().collect();
    let cho_sua = (!tk.bieu_duoc_sua.is_empty()).then_some(tk.bieu_duoc_sua.as_slice());
    let con = thay_doi::tinh(&d.dong, &d.cot_nhap, &loi, &anh, lo.cfg.settings.cho_phep_xoa_dong, cho_sua);
    lo::ghi_json(&dir.join("ket-qua").join("doi-chieu.json"), &serde_json::json!({"schema": lo::SCHEMA, "luc": lo::bay_gio(), "conLai": con.thay_doi.len(), "tao": con.dem("tao"), "sua": con.dem("sua"), "bo": con.dem("bo")}))?;
    Ok((con.thay_doi.len(), con.thay_doi.is_empty()))
}

/// Đường B: dựng gói (hoặc dùng lại gói dở), gửi từng gói, đối chiếu.
async fn gui_b(lo: &Lo, tk: &ket_noi::TaiKhoan, sess: &Session, dir: &std::path::Path, nguoi: &str, so_thay_doi: usize) -> Result<LanGui, String> {
    let s = &lo.cfg.settings;
    let mut cac_goi = goi::goi_dang_do(dir)?;
    if cac_goi.is_empty() {
        let file: serde_json::Value = lo::doc_json(&dir.join("thay-doi").join("thay-doi.json"))?;
        let td: Vec<thay_doi::ThayDoiItem> = serde_json::from_value(file["thayDoi"].clone()).map_err(|e| format!("thay-doi.json hỏng: {e}"))?;
        if td.len() != so_thay_doi {
            return Err(format!("Số thay đổi đã xác nhận ({so_thay_doi}) khác số hiện tại ({}); xem lại rồi xác nhận lại", td.len()));
        }
        let sao = format!("sao-luu/truoc-{}", chrono::Local::now().format("%Y%m%d-%H%M%S"));
        std::fs::create_dir_all(dir.join(&sao)).map_err(|e| e.to_string())?;
        for f in ["bootstrap.json", "hang.json"] {
            let _ = std::fs::copy(dir.join("may-chu").join(f), dir.join(&sao).join(f));
        }
        let rv = lo::doc_json::<serde_json::Value>(&dir.join("may-chu").join("bootstrap.json")).ok().and_then(|w| w["ruleVersion"].as_str().map(str::to_string)).unwrap_or_else(|| RULE_VERSION_MAC_DINH.into());
        let tb = lo::thiet_bi(&lo.root)?;
        let import_id = uuid::Uuid::new_v4().to_string();
        let ctx = goi::NguCanhGoi { submission_id: &tk.ho_so.id, device_id: &tb.device_id, rule_version: &rv, sao_luu: Some(&sao) };
        cac_goi = goi::dung_goi(dir, &ctx, &td, s.changeset_max_changes, |d| goi::chuyen_thanh_changes(d, &import_id))?;
    } else if so_thay_doi > 0 && cac_goi.iter().map(goi::Goi::so_thay_doi).sum::<usize>() != so_thay_doi {
        return Err("Số thay đổi đã xác nhận khác số thay đổi trong gói đang dở; xem lại rồi xác nhận lại".into());
    }
    cap_nhat(dir, |t| { t.goi_hien_tai = cac_goi.first().map(|g| lo::GoiHienTai { changeset_id: g.id().into(), trang_thai: "chua_gui".into(), so_lan_thu: 0 }); });
    if !s.cho_phep_gui_that {
        cap_nhat(dir, |t| {
            t.buoc = Buoc::SanSangGui;
            t.tien_do = 75;
            t.loi = None;
            t.ghi_chu = Some(format!("Chế độ khô: đã dựng {} gói ({} thay đổi) trong thay-doi/goi/, CHƯA gửi lên cổng. Bật choPhepGuiThat trong cấu hình để gửi thật.", cac_goi.len(), cac_goi.iter().map(goi::Goi::so_thay_doi).sum::<usize>()));
        });
        return Ok(LanGui::CheDoKho);
    }
    cap_nhat(dir, |t| { t.buoc = Buoc::DangGui; t.tien_do = 80; t.loi = None; t.ghi_chu = None; });
    let ch = cau_hinh_gui(s);
    let mut co_tu_choi = 0usize;
    let mut ly_do: Vec<(String, usize)> = Vec::new();
    for g in cac_goi {
        let bn = match goi::gui_goi(sess, dir, &g, nguoi, &ch).await {
            Err(goi::LoiGui::DoiKhoa) => {
                let moi = goi::doi_khoa(dir, &g)?;
                goi::gui_goi(sess, dir, &moi, nguoi, &ch).await.map_err(|e| format!("{e:?}"))?
            }
            Err(goi::LoiGui::Khac(m)) => return Err(m),
            Ok(b) => b,
        };
        co_tu_choi += (bn["tomTat"]["tuChoi"].as_u64().unwrap_or(0) + bn["tomTat"]["xungDot"].as_u64().unwrap_or(0)) as usize;
        for m in bn["lyDoTuChoi"].as_array().into_iter().flatten() {
            let (tb, so) = (m["thongBao"].as_str().unwrap_or("").to_string(), m["so"].as_u64().unwrap_or(0) as usize);
            match ly_do.iter_mut().find(|(t, _)| *t == tb) {
                Some(e) => e.1 += so,
                None => ly_do.push((tb, so)),
            }
        }
    }
    cap_nhat(dir, |t| { t.buoc = Buoc::ChoBienNhan; t.tien_do = 90; });
    let (con, khop) = doi_chieu(lo, tk, sess, dir).await?;
    cap_nhat(dir, |t| {
        t.tien_do = 100;
        t.buoc = if khop { Buoc::DongBoXong } else { Buoc::CanXemXet };
        t.goi_hien_tai = t.goi_hien_tai.take().map(|mut g| { g.trang_thai = "da_nhan".into(); g });
        if co_tu_choi > 0 {
            let chi_tiet: Vec<String> = ly_do.iter().map(|(m, n)| format!("«{m}» ({n})")).collect();
            t.loi = Some(format!("Cổng từ chối {co_tu_choi} thay đổi: {}. Dữ liệu từ chối KHÔNG được ghi vào hồ sơ.", chi_tiet.join("; ")));
        }
        t.ghi_chu = Some(if khop { "Đã gửi và đối chiếu: hồ sơ trên cổng khớp với tệp Excel.".to_string() } else { format!("Sau đối chiếu còn {con} thay đổi chưa khớp với cổng. Xem ket-qua/doi-chieu.json.") });
    });
    Ok(LanGui::DaGui)
}

/// Đường A: kết chuyển lần nhập đã kiểm tra.
async fn gui_a(lo: &Lo, sess: &Session, dir: &std::path::Path, nguoi: &str) -> Result<LanGui, String> {
    let s = &lo.cfg.settings;
    let tt = lo::doc_trang_thai(dir);
    let import_id = tt.goi_hien_tai.as_ref().map(|g| g.changeset_id.clone()).ok_or("Chưa có lần nhập đã kiểm tra: bấm Chuẩn bị trước")?;
    if !s.cho_phep_gui_that {
        cap_nhat(dir, |t| { t.buoc = Buoc::SanSangGui; t.loi = None; t.ghi_chu = Some(format!("Chế độ khô: lần nhập {import_id} sẵn sàng kết chuyển, CHƯA gọi commit. Bật choPhepGuiThat trong cấu hình để kết chuyển thật.")); });
        return Ok(LanGui::CheDoKho);
    }
    cap_nhat(dir, |t| { t.buoc = Buoc::DangGui; t.tien_do = 80; t.loi = None; t.ghi_chu = None; });
    let (kq, tho) = ket_chuyen::commit(sess, &import_id, Duration::from_millis(s.poll_interval_ms), Duration::from_secs(15 * 60)).await?;
    lo::ghi_json(&dir.join("ket-qua").join(format!("commit-{import_id}.json")), &serde_json::json!({"schema": lo::SCHEMA, "luc": lo::bay_gio(), "importId": import_id, "ketQua": kq, "tho": tho}))?;
    let mut e = lo::su_kien("ket_chuyen");
    e.changeset_id = Some(&import_id);
    e.so_thay_doi = Some((kq.added + kq.updated) as usize);
    e.nguoi = Some(nguoi);
    let _ = lo::ghi_nhat_ky(dir, &e);
    cap_nhat(dir, |t| {
        t.tien_do = 100;
        t.buoc = if kq.rejected == 0 && kq.remaining == 0 { Buoc::DongBoXong } else { Buoc::CanXemXet };
        t.ghi_chu = Some(format!("Kết chuyển: thêm {}, sửa {}, bỏ trùng {}, từ chối {}, còn lại {}.", kq.added, kq.updated, kq.skipped_duplicate, kq.rejected, kq.remaining));
    });
    Ok(LanGui::DaGui)
}

async fn gui_mot(lo: &Lo, u: &UnitEntry, ck: &KhoCookie, nguoi: &str, so_thay_doi: usize) -> Result<LanGui, String> {
    if nguoi.trim().is_empty() {
        return Err("Nhập tên người vận hành trước khi gửi".into());
    }
    let dir = lo::unit_dir(&lo.root, &u.username)?;
    ket_noi_con_moi(&dir)?;
    let tt = lo::doc_trang_thai(&dir);
    if !matches!(tt.buoc, Buoc::SanSangGui | Buoc::Loi | Buoc::ChoBienNhan) {
        return Err(format!("Đơn vị chưa sẵn sàng gửi (bước hiện tại: {:?})", tt.buoc));
    }
    let tk: ket_noi::TaiKhoan = lo::doc_json(&dir.join("tai-khoan.json"))?;
    let sess = mo_phien_don_vi(lo, u, ck).await?;
    let kq = if tk.quyen.duong == "A" {
        gui_a(lo, &sess, &dir, nguoi).await?
    } else {
        gui_b(lo, &tk, &sess, &dir, nguoi, so_thay_doi).await?
    };
    if kq == LanGui::DaGui {
        let _ = buoc_8_kiem_tra(&sess, &tk.ho_so.id, &dir, false).await;
    }
    Ok(kq)
}

/// Chạy bước 8 "Kiểm tra" trên cổng (kiểm tra lại toàn bộ hồ sơ) để tiến độ bước 8 lên đủ. `rieng = false`: gọi sau khi gửi, không bao giờ
/// làm hỏng lần gửi đã xong (lỗi chỉ ghi vào ghi chú, nhật ký). `rieng = true`: người dùng bấm "Gửi Bước 8", ghi chú được thay bằng kết quả
/// mới và lỗi được trả về để hiển thị.
async fn buoc_8_kiem_tra(sess: &Session, sid: &str, dir: &std::path::Path, rieng: bool) -> Result<(), String> {
    let kq = kiem_tra_lai::chay(sess, sid, Duration::from_millis(kiem_tra_lai::CHU_KY_HOI_MS), Duration::from_secs(kiem_tra_lai::TOI_DA_CHO_S)).await;
    let (ghi_chu, ket_qua) = match &kq {
        Ok(k) => (kiem_tra_lai::tom_tat(k), if k.san_sang { "ok" } else { "con_chan" }),
        Err(e) if rieng => (format!("Chưa chạy được bước 8 Kiểm tra trên cổng: {e}."), "loi"),
        Err(e) => (format!("Đã gửi, nhưng chưa chạy được bước 8 Kiểm tra trên cổng: {e}. Vào Kiểm tra và gửi của ứng dụng Desktop bấm Kiểm tra lại."), "loi"),
    };
    cap_nhat(dir, |t| {
        t.ghi_chu = Some(match t.ghi_chu.take() {
            Some(cu) if !rieng && !cu.is_empty() => format!("{cu} {ghi_chu}"),
            _ => ghi_chu.clone(),
        });
    });
    let mut e = lo::su_kien("kiem_tra_lai");
    e.ket_qua = Some(ket_qua);
    let _ = lo::ghi_nhat_ky(dir, &e);
    kq.map(|_| ())
}

/// Nút "Gửi Bước 8": chỉ chạy riêng bước kiểm tra lại trên cổng, không gửi gói thay đổi nào. Cần tên người vận hành và `choPhepGuiThat`.
#[tauri::command]
async fn gui_buoc_8(username: String, state: State<'_, AppState>) -> Result<(), String> {
    let lo = lay_lo(&state)?;
    let u = tim_unit(&lo, &username)?.clone();
    if khoa(&state.nguoi).trim().is_empty() {
        return Err("Nhập tên người vận hành trước khi gửi bước 8".into());
    }
    if !lo.cfg.settings.cho_phep_gui_that {
        return Err("Chế độ khô: gửi bước 8 bị khóa. Bật choPhepGuiThat trong cấu hình lô để chạy thật.".into());
    }
    let _khoa = KhoaTaiKhoan::lay(&state.dang_chay, &u.username)?;
    let dir = lo::unit_dir(&lo.root, &u.username)?;
    let (sess, tk) = ngu_canh_xoa(&lo, &u, &state.cookies).await?;
    buoc_8_kiem_tra(&sess, &tk.ho_so.id, &dir, true).await
}

async fn gui_va_ghi_loi(lo: &Lo, u: &UnitEntry, ck: &KhoCookie, nguoi: &str, so: usize) -> Result<(), String> {
    let dir = lo::unit_dir(&lo.root, &u.username)?;
    let r = gui_mot(lo, u, ck, nguoi, so).await;
    if let Err(e) = &r {
        dat_loi(&dir, Buoc::Loi, e);
    }
    r.map(|_| ())
}

#[tauri::command]
async fn gui(username: String, so_thay_doi: usize, state: State<'_, AppState>) -> Result<(), String> {
    let lo = lay_lo(&state)?;
    let u = tim_unit(&lo, &username)?.clone();
    let _khoa = KhoaTaiKhoan::lay(&state.dang_chay, &u.username)?;
    let nguoi = khoa(&state.nguoi).clone();
    gui_va_ghi_loi(&lo, &u, &state.cookies, &nguoi, so_thay_doi).await
}

/// Gửi lại dùng đúng gói đang dở (cùng khóa), nên không cần xác nhận số thay đổi mới.
#[tauri::command]
async fn gui_lai(username: String, state: State<'_, AppState>) -> Result<(), String> {
    let lo = lay_lo(&state)?;
    let u = tim_unit(&lo, &username)?.clone();
    let _khoa = KhoaTaiKhoan::lay(&state.dang_chay, &u.username)?;
    let nguoi = khoa(&state.nguoi).clone();
    gui_va_ghi_loi(&lo, &u, &state.cookies, &nguoi, 0).await
}

#[derive(Debug, Serialize)]
struct KetQuaGui {
    username: String,
    ok: bool,
    loi: Option<String>,
}

#[tauri::command]
async fn gui_tat_ca(danh_sach: Vec<GuiYeuCau>, state: State<'_, AppState>) -> Result<Vec<KetQuaGui>, String> {
    let lo = lay_lo(&state)?;
    let nguoi = khoa(&state.nguoi).clone();
    let sem = Arc::new(Semaphore::new(lo.cfg.settings.concurrency.max(1)));
    let mut tasks = Vec::new();
    for y in danh_sach {
        let u = tim_unit(&lo, &y.username)?.clone();
        let (lo, sem, nguoi, ck, dang_chay) = (lo.clone(), sem.clone(), nguoi.clone(), state.cookies.clone(), state.dang_chay.clone());
        tasks.push(tokio::spawn(async move {
            let _p = sem.acquire_owned().await.ok();
            let r = match KhoaTaiKhoan::lay(&dang_chay, &u.username) {
                Ok(_k) => gui_va_ghi_loi(&lo, &u, &ck, &nguoi, y.so_thay_doi).await,
                Err(e) => Err(e),
            };
            KetQuaGui { username: u.username.clone(), ok: r.is_ok(), loi: r.err() }
        }));
    }
    let mut kq = Vec::new();
    for t in tasks {
        kq.push(t.await.map_err(|e| format!("Tác vụ bị dừng đột ngột: {e}"))?);
    }
    Ok(kq)
}

// ---------------------------------------------------------------------------
// Chọn lại tệp Excel
// ---------------------------------------------------------------------------

/// Sau khi đổi dữ liệu nguồn hoặc dữ liệu trên cổng, kết quả cũ (kiểm tra, thay đổi, gói dở) không còn đúng: đóng gói dở (giữ vết) và về bước đầu.
fn dat_lai_sau_doi(dir: &Path, ly_do: &str) {
    for g in goi::goi_dang_do(dir).unwrap_or_default() {
        let _ = lo::ghi_json(&goi::duong_bien_nhan(dir, g.id()), &serde_json::json!({"schema": lo::SCHEMA, "changesetId": g.id(), "ketThuc": true, "ketQua": "huy", "lyDo": ly_do}));
    }
    cap_nhat(dir, |t| {
        t.buoc = Buoc::ChuaChay;
        t.tien_do = 10;
        t.kiem_tra = None;
        t.thay_doi = None;
        t.so_dong = None;
        t.goi_hien_tai = None;
        t.loi = None;
        t.ghi_chu = Some(format!("{ly_do}: cần Chuẩn bị lại."));
    });
}

/// Chọn lại tệp Excel của đơn vị: chép vào `data/<username>/nguon/` (trừ khi đã nằm đó) và ghi `nguon.json`; không sửa tệp cấu hình lô.
#[tauri::command]
fn chon_excel(username: String, duong_dan: String, state: State<AppState>) -> Result<(), String> {
    let lo = lay_lo(&state)?;
    let u = tim_unit(&lo, &username)?;
    let _khoa = KhoaTaiKhoan::lay(&state.dang_chay, &u.username)?;
    let dir = lo::unit_dir(&lo.root, &u.username)?;
    let nguon = PathBuf::from(duong_dan.trim());
    if !nguon.is_file() {
        return Err(format!("Không thấy tệp: {}", nguon.display()));
    }
    if !nguon.extension().is_some_and(|e| e.eq_ignore_ascii_case("xlsx")) {
        return Err("Chỉ nhận tệp .xlsx".into());
    }
    let ten = nguon.file_name().map(|n| n.to_string_lossy().into_owned()).ok_or("Tên tệp không hợp lệ")?;
    let dich = dir.join("nguon").join(&ten);
    let cung = nguon.canonicalize().ok().zip(dich.canonicalize().ok()).is_some_and(|(a, b)| a == b);
    if !cung {
        lo::tao_thu_muc(&dir)?;
        std::fs::copy(&nguon, &dich).map_err(|e| format!("Không chép được tệp vào {}: {e}", dich.display()))?;
    }
    lo::dat_excel(&dir, &format!("nguon/{ten}"))?;
    dat_lai_sau_doi(&dir, "Đã đổi tệp Excel");
    let mut e = lo::su_kien("doi_tep_excel");
    e.ket_qua = Some("ok");
    let _ = lo::ghi_nhat_ky(&dir, &e);
    Ok(())
}

/// Chọn hồ sơ cho đơn vị (khi tài khoản thấy nhiều hồ sơ). Ghi `ho-so.json`, đưa đơn vị về bước đầu rồi kiểm tra kết nối lại để đọc hồ sơ mới.
#[tauri::command]
async fn chon_ho_so(username: String, ho_so_id: String, state: State<'_, AppState>) -> Result<(), String> {
    let lo = lay_lo(&state)?;
    let u = tim_unit(&lo, &username)?.clone();
    let _khoa = KhoaTaiKhoan::lay(&state.dang_chay, &u.username)?;
    let dir = lo::unit_dir(&lo.root, &u.username)?;
    let tk: ket_noi::TaiKhoan = lo::doc_json(&dir.join("tai-khoan.json")).map_err(|_| "Chưa biết các hồ sơ của tài khoản: bấm \"Kiểm tra kết nối\" trước".to_string())?;
    if !tk.ho_so_co_the.iter().any(|h| h.id == ho_so_id) {
        return Err("Hồ sơ không có trong danh sách của tài khoản".into());
    }
    lo::dat_ho_so(&dir, &ho_so_id)?;
    dat_lai_sau_doi(&dir, "Đã đổi hồ sơ");
    kiem_tra_mot(&lo, &u, &state.cookies).await.map(|_| ())
}

// ---------------------------------------------------------------------------
// Xóa dữ liệu cũ trên cổng (không hoàn tác; theo vtvl_app/src/cong/xoa-du-lieu.js)
// ---------------------------------------------------------------------------

/// Phiên và hồ sơ của đơn vị để xóa: hồ sơ lấy từ `tai-khoan.json` (cần Kiểm tra kết nối trước).
async fn ngu_canh_xoa(lo: &Lo, u: &UnitEntry, ck: &KhoCookie) -> Result<(Session, ket_noi::TaiKhoan), String> {
    let dir = lo::unit_dir(&lo.root, &u.username)?;
    let tk: ket_noi::TaiKhoan = lo::doc_json(&dir.join("tai-khoan.json")).map_err(|_| "Chưa biết hồ sơ của tài khoản: bấm \"Kiểm tra kết nối\" trước".to_string())?;
    Ok((mo_phien_don_vi(lo, u, ck).await?, tk))
}

/// Kết quả "Tổng quan" gửi giao diện: lời chào, đơn vị, kỳ và số liệu như trang làm việc Desktop.
#[derive(Serialize)]
struct TongQuanView {
    chao: String,
    #[serde(rename = "donVi")]
    don_vi: String,
    ky: String,
    #[serde(flatten)]
    so_lieu: tong_quan::TongQuan,
}

/// Đọc số liệu tổng quan của đơn vị từ cổng (chỉ đọc). Cần đã có thông tin tài khoản (Kiểm tra kết nối).
#[tauri::command]
async fn tong_quan(username: String, state: State<'_, AppState>) -> Result<TongQuanView, String> {
    let lo = lay_lo(&state)?;
    let u = tim_unit(&lo, &username)?.clone();
    let _khoa = KhoaTaiKhoan::lay(&state.dang_chay, &u.username)?;
    let (sess, tk) = ngu_canh_xoa(&lo, &u, &state.cookies).await?;
    let so_lieu = tong_quan::lay(&sess, &tk.org_id, &tk.ky_id).await?;
    Ok(TongQuanView { chao: tk.ho_ten, don_vi: tk.don_vi, ky: tk.ky, so_lieu })
}

/// Đếm số dòng sẽ bị xóa (chỉ đọc).
#[tauri::command]
async fn xoa_dem(username: String, state: State<'_, AppState>) -> Result<Vec<xoa_du_lieu::DongDem>, String> {
    let lo = lay_lo(&state)?;
    let u = tim_unit(&lo, &username)?.clone();
    let _khoa = KhoaTaiKhoan::lay(&state.dang_chay, &u.username)?;
    let (sess, tk) = ngu_canh_xoa(&lo, &u, &state.cookies).await?;
    xoa_du_lieu::dem_dong(&sess, &tk.ho_so.id, &xoa_du_lieu::bieu_mac_dinh(), Duration::from_millis(lo.cfg.settings.request_interval_ms)).await
}

/// Xóa toàn bộ dữ liệu của hồ sơ. Cần: có tên người vận hành và `choPhepGuiThat` (xóa không hoàn tác được); giao diện bắt bấm hai lần để xác nhận.
#[tauri::command]
async fn xoa_du_lieu(username: String, state: State<'_, AppState>) -> Result<Vec<xoa_du_lieu::KetQuaXoa>, String> {
    let lo = lay_lo(&state)?;
    let u = tim_unit(&lo, &username)?.clone();
    let nguoi = khoa(&state.nguoi).clone();
    if nguoi.trim().is_empty() {
        return Err("Nhập tên người vận hành trước khi xóa (ghi vào nhật ký)".into());
    }
    if !lo.cfg.settings.cho_phep_gui_that {
        return Err("Chế độ khô: xóa bị khóa. Bật choPhepGuiThat trong cấu hình lô để xóa thật (không hoàn tác được).".into());
    }
    let _khoa = KhoaTaiKhoan::lay(&state.dang_chay, &u.username)?;
    let dir = lo::unit_dir(&lo.root, &u.username)?;
    let (sess, tk) = ngu_canh_xoa(&lo, &u, &state.cookies).await?;
    let tb = lo::thiet_bi(&lo.root)?;
    let ch = cau_hinh_gui(&lo.cfg.settings);
    let may = may::doc();
    let mut e = lo::su_kien("xoa_du_lieu_bat_dau");
    e.nguoi = Some(&nguoi);
    e.may = Some(&may);
    let _ = lo::ghi_nhat_ky(&dir, &e);
    // Như Desktop: xóa là thay đổi DELETE đẩy qua gói thay đổi; cổng chặn xóa trực tiếp qua REST với phiên web
    let tham_so = xoa_du_lieu::ThamSoXoa { dir: &dir, period_id: &tk.ky_id, submission_id: &tk.ho_so.id, device_id: &tb.device_id, toi_da: lo.cfg.settings.changeset_max_changes, nguoi: &nguoi, cau_hinh: &ch };
    let kq = xoa_du_lieu::xoa_qua_goi(&sess, &tham_so, &xoa_du_lieu::bieu_mac_dinh()).await;
    let tong = kq.as_ref().map(|k| k.iter().map(|x| x.da_xoa).sum::<usize>()).ok();
    let mut e2 = lo::su_kien("xoa_du_lieu_xong");
    e2.so_thay_doi = tong;
    e2.ket_qua = Some(if kq.is_ok() { "ok" } else { "loi" });
    e2.nguoi = Some(&nguoi);
    e2.may = Some(&may);
    let _ = lo::ghi_nhat_ky(&dir, &e2);
    dat_lai_sau_doi(&dir, "Đã xóa dữ liệu trên cổng");
    kq
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![khoi_dong_khoa, khoi_tao_lo_trong, kiem_tra_ma, kiem_tra_tep, lay_ket_qua_kiem_tra, lo_nap, them_don_vi, sua_don_vi, xoa_don_vi, lay_bearer, lay_nguoi, chon_excel, chon_ho_so, xoa_dem, tong_quan, gui_buoc_8, xoa_du_lieu, dang_nhap, dat_cookie, dat_nguoi, lay_trang_thai, kiem_tra_ket_noi_tat_ca, tq_lay_cay, tq_tao, quan_tri::qt_tai_khoan, quan_tri::qt_dat_tai_khoan, quan_tri::qt_danh_sach, quan_tri::qt_cac_ky, quan_tri::qt_chi_tiet, quan_tri::qt_bieu, cap_nhat::kiem_tra_cap_nhat, cap_nhat::mo_trang_tai, quan_tri::qt_xuat_excel, bao_cao_cay::bc_cay_trang_thai, bao_cao_cay::bc_cay_xuat, bao_cao_tien_do::bc_tien_do_xuat, tq_xuat_excel, chuan_bi, chuan_bi_tat_ca, gui, gui_lai, gui_tat_ca])
        .run(tauri::generate_context!())
        .expect("error");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn khong_thay_doi_phan_biet_khop_voi_dong_bi_bo_qua() {
        use crate::thay_doi::{BoQua, KetQuaTinh};
        let khop = KetQuaTinh { khong_doi: 3, ..Default::default() };
        let (b, loi, ghi) = super::ket_luan_khong_thay_doi(&khop);
        assert_eq!((b, loi.is_none(), ghi.unwrap().contains("3 dòng")), (Buoc::DaKhop, true, true));
        let bo = KetQuaTinh { khong_doi: 3, bo_qua: vec![BoQua { bieu: "b1".into(), dong_excel: 5, ly_do: "dong_loi".into() }], ..Default::default() };
        let (b, loi, _) = super::ket_luan_khong_thay_doi(&bo);
        assert_eq!(b, Buoc::CanXemXet);
        assert!(loi.unwrap().contains("1 dòng còn lỗi"));
        assert_eq!(super::ket_luan_khong_thay_doi(&KetQuaTinh::default()).0, Buoc::CanXemXet);
    }

    #[test]
    fn tong_nguoi_c3_la_cot_j_va_d2_la_nguoi_can_bo_tri_theo_nam() {
        let hang = |ds: &[&[(&str, &str)]]| -> Vec<std::collections::BTreeMap<String, String>> {
            ds.iter().map(|r| r.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect()).collect()
        };
        let mut f = super::Hang::new();
        f.insert("c3".into(), hang(&[&[("J", "1,5")], &[("J", "2")], &[]]));
        // Excel / cổng chưa tính cột C: tính lại = Σ J + biến động dự báo; cột D (người có thể bố trí) không được dùng
        f.insert("d2".into(), hang(&[&[("B", "2027"), ("D", "9")], &[("B", "2028.0"), ("D", "9")]]));
        f.insert("du_bao_5_nam".into(), hang(&[&[("B", "2027"), ("C", "0")], &[("B", "2028"), ("C", "-1")], &[("B", "2028"), ("C", "2")]]));
        let t = super::tong_nguoi(&f);
        assert_eq!(t["c3"][""], 3.5);
        assert_eq!((t["d2"]["2027"], t["d2"]["2028"]), (3.5, 4.5));
        // cổng đã tính cột C thì dùng đúng số của cổng
        f.insert("d2".into(), hang(&[&[("B", "2027"), ("C", "5"), ("D", "9")], &[("B", "2027"), ("C", "4")], &[("B", "2028"), ("C", "7")]]));
        let t = super::tong_nguoi(&f);
        assert_eq!((t["d2"]["2027"], t["d2"]["2028"]), (9.0, 7.0));
        assert!(!super::tong_nguoi(&super::Hang::new()).contains_key("d2"));
    }

    #[test]
    fn reset_closes_pending_packages_and_clears_state() {
        let dir = tempfile::tempdir().unwrap();
        lo::tao_thu_muc(dir.path()).unwrap();
        let item = thay_doi::ThayDoiItem { id: "td-1".into(), bieu: "b1".into(), dong_excel: Some(3), khoa: "k".into(), loai: "tao".into(), row_id: None, phien_ban_dong: None, truong: Default::default(), truoc: None, trang_thai: "san_sang".into() };
        let ctx = goi::NguCanhGoi { submission_id: "s", device_id: "d", rule_version: "v", sao_luu: None };
        goi::dung_goi(dir.path(), &ctx, &[item], 10, |d| Ok(d.iter().map(|_| serde_json::json!({})).collect())).unwrap();
        assert_eq!(goi::goi_dang_do(dir.path()).unwrap().len(), 1);
        cap_nhat(dir.path(), |t| { t.buoc = Buoc::SanSangGui; t.thay_doi = Some(TomTatThayDoi::default()); });
        dat_lai_sau_doi(dir.path(), "Đã đổi tệp Excel");
        assert!(goi::goi_dang_do(dir.path()).unwrap().is_empty(), "gói dở bị đóng, không gửi nhầm dữ liệu cũ");
        let t = lo::doc_trang_thai(dir.path());
        assert_eq!(t.buoc, Buoc::ChuaChay);
        assert!(t.thay_doi.is_none() && t.ghi_chu.unwrap().contains("Chuẩn bị lại"));
    }

    #[test]
    fn row_counts_per_form_keep_empty_forms() {
        let mut m: std::collections::BTreeMap<String, Vec<u8>> = Default::default();
        m.insert("d2".into(), vec![1; 160]);
        m.insert("b2_ct".into(), vec![]);
        let d = dem_theo_bieu(&m);
        assert_eq!((d["d2"], d["b2_ct"]), (160, 0));
    }

    #[test]
    fn config_path_resolution() {
        let dir = tempfile::tempdir().unwrap();
        let f = dir.path().join("lo.json");
        std::fs::write(&f, "{}").unwrap();
        assert_eq!(giai_duong_cau_hinh(f.to_str().unwrap()).unwrap(), f);
        assert!(giai_duong_cau_hinh("khong/co/lo.json").unwrap_err().contains("Không thấy tệp"));
    }

    #[test]
    fn period_label_is_extracted_from_name() {
        assert_eq!(nhan_ky("Kỳ 01/10/2025 – 30/09/2026").as_deref(), Some("01/10/2025 – 30/09/2026"));
        assert_eq!(nhan_ky("Kỳ 2025-2026"), None);
    }

    #[test]
    fn account_lock_blocks_concurrent_operations_and_releases() {
        let set = Arc::new(Mutex::new(HashSet::new()));
        let k = KhoaTaiKhoan::lay(&set, "a").unwrap();
        assert!(KhoaTaiKhoan::lay(&set, "a").is_err());
        assert!(KhoaTaiKhoan::lay(&set, "b").is_ok());
        drop(k);
        assert!(KhoaTaiKhoan::lay(&set, "a").is_ok());
    }

    #[test]
    fn fresh_connection_check_is_required_before_sending() {
        let dir = tempfile::tempdir().unwrap();
        assert!(ket_noi_con_moi(dir.path()).unwrap_err().contains("Chưa kiểm tra kết nối"));
        let mut k = ket_noi::KetNoi { schema: 1, luc: lo::bay_gio(), ket_qua: "ok".into(), cac_buoc: vec![], chan: None };
        lo::ghi_json(&dir.path().join("ket-noi.json"), &k).unwrap();
        assert!(ket_noi_con_moi(dir.path()).is_ok());
        k.luc = (chrono::Utc::now() - chrono::Duration::minutes(45)).format("%Y-%m-%dT%H:%M:%SZ").to_string();
        lo::ghi_json(&dir.path().join("ket-noi.json"), &k).unwrap();
        assert!(ket_noi_con_moi(dir.path()).unwrap_err().contains("quá 30 phút"));
        k.ket_qua = "chan".into();
        lo::ghi_json(&dir.path().join("ket-noi.json"), &k).unwrap();
        assert!(ket_noi_con_moi(dir.path()).unwrap_err().contains("bị chặn"));
    }

    #[test]
    fn hash_is_hex_sha256() {
        assert_eq!(sha256_hex(b"abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    }
}
