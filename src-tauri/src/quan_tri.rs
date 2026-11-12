//! Chức năng quản trị (chỉ đọc): quét tài khoản và hồ sơ của kỳ hiện tại, lưu cache cục bộ, đọc chi tiết từng biểu của đơn vị bất kỳ.
//! Dùng tài khoản `SYSTEM_ADMIN` (`settings.taiKhoanQuanTri`), kênh Desktop. Không gửi hay sửa gì lên cổng.

use crate::portal::{Session, StepError};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

const KICH_CO_TRANG_NGUOI_DUNG: usize = 100;
const KICH_CO_TRANG_HO_SO: usize = 500;
const KICH_CO_TRANG_DONG: usize = 500;
const TOI_DA_TRANG: usize = 50;
/// Chặn an toàn khi một biểu quá lớn (một biểu thật nhất khoảng vài nghìn dòng).
const TOI_DA_DONG: usize = 20_000;

fn chuoi(v: &Value, k: &str) -> String {
    v[k].as_str().unwrap_or_default().to_string()
}

fn so(v: &Value, k: &str) -> u64 {
    v[k].as_u64().unwrap_or(0)
}

fn loi(e: StepError) -> String {
    match e { StepError::Auth(m) | StepError::Retry(m) | StepError::Fatal(m) => m }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Ky {
    pub id: String,
    pub ma: String,
    pub ten: String,
    #[serde(rename = "tuNgay")]
    pub tu_ngay: String,
    #[serde(rename = "denNgay")]
    pub den_ngay: String,
    #[serde(rename = "trangThai")]
    pub trang_thai: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TaiKhoanQt {
    #[serde(rename = "tenDangNhap")]
    pub ten_dang_nhap: String,
    #[serde(rename = "hoTen")]
    pub ho_ten: String,
    #[serde(rename = "orgId")]
    pub org_id: String,
    #[serde(rename = "trangThai")]
    pub trang_thai: String,
    #[serde(rename = "dangNhapCuoi")]
    pub dang_nhap_cuoi: String,
}

/// Một hồ sơ (bộ biểu) của một đơn vị trong kỳ.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct HoSoQt {
    pub id: String,
    #[serde(rename = "orgId")]
    pub org_id: String,
    pub ma: String,
    pub ten: String,
    pub cap: String,
    #[serde(rename = "trangThai")]
    pub trang_thai: String,
    #[serde(rename = "tienDo")]
    pub tien_do: u64,
    #[serde(rename = "capNhat")]
    pub cap_nhat: String,
    #[serde(rename = "dongDat")]
    pub dong_dat: u64,
    #[serde(rename = "dongChuaDat")]
    pub dong_chua_dat: u64,
    #[serde(rename = "canhBao")]
    pub canh_bao: u64,
    /// Tên đăng nhập gắn với đơn vị (khớp theo đơn vị chủ quản của tài khoản).
    #[serde(rename = "taiKhoan")]
    pub tai_khoan: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Cot {
    pub chu: String,
    #[serde(rename = "tieuDe")]
    pub tieu_de: String,
    /// INPUT, COMPUTED, CATALOG…
    pub loai: String,
    pub kieu: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Bieu {
    pub khoa: String,
    pub ma: String,
    #[serde(rename = "tieuDe")]
    pub tieu_de: String,
    pub buoc: u64,
    pub cot: Vec<Cot>,
}

/// Một nút của cây đơn vị trên cổng (để nhóm hồ sơ theo đơn vị cha).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct NutQt {
    pub id: String,
    pub ma: String,
    pub ten: String,
    #[serde(rename = "chaId")]
    pub cha_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DanhSach {
    #[serde(rename = "quetLuc")]
    pub quet_luc: String,
    pub ky: Ky,
    #[serde(rename = "taiKhoan")]
    pub tai_khoan: Vec<TaiKhoanQt>,
    #[serde(rename = "hoSo")]
    pub ho_so: Vec<HoSoQt>,
    pub bieu: Vec<Bieu>,
    /// Cây đơn vị; cache cũ chưa có thì rỗng (giao diện nhắc bấm "Cập nhật").
    #[serde(default, rename = "donVi")]
    pub don_vi: Vec<NutQt>,
}

// ---------------------------------------------------------------------------
// Phần thuần: đọc phản hồi của cổng
// ---------------------------------------------------------------------------

/// Kỳ hiện tại: ưu tiên kỳ mặc định của tài khoản nếu đang MỞ, không thì kỳ MỞ đầu tiên.
pub fn chon_ky(ky: &Value, mac_dinh: &str) -> Option<Ky> {
    let ds = ky.as_array()?;
    let mo = |k: &&Value| k["status"].as_str() == Some("OPEN");
    let k = ds.iter().filter(mo).find(|k| chuoi(k, "id") == mac_dinh).or_else(|| ds.iter().find(mo))?;
    Some(Ky { id: chuoi(k, "id"), ma: chuoi(k, "code"), ten: chuoi(k, "name"), tu_ngay: chuoi(k, "dateFrom"), den_ngay: chuoi(k, "dateTo"), trang_thai: chuoi(k, "status") })
}

pub fn doc_tai_khoan(u: &Value) -> TaiKhoanQt {
    let org = u["homeOrg"]["id"].as_str().or_else(|| u["orgUnits"][0]["id"].as_str()).unwrap_or_default();
    TaiKhoanQt { ten_dang_nhap: chuoi(u, "username"), ho_ten: chuoi(u, "fullName"), org_id: org.to_string(), trang_thai: chuoi(u, "status"), dang_nhap_cuoi: chuoi(u, "lastLoginAt") }
}

pub fn doc_ho_so(h: &Value) -> HoSoQt {
    let dv = &h["orgUnit"];
    let c = &h["counts"];
    HoSoQt {
        id: chuoi(h, "id"), org_id: chuoi(dv, "id"), ma: chuoi(dv, "code"), ten: chuoi(dv, "name"), cap: chuoi(dv, "level"),
        trang_thai: chuoi(h, "status"), tien_do: so(h, "progressPercent"), cap_nhat: chuoi(h, "updatedAt"),
        dong_dat: so(c, "rowsPassed"), dong_chua_dat: so(c, "rowsNotPassed"), canh_bao: so(c, "warning"), tai_khoan: Vec::new(),
    }
}

/// Gắn tên đăng nhập vào hồ sơ theo đơn vị chủ quản của tài khoản; sắp theo tên đơn vị.
pub fn gan_tai_khoan(mut ho_so: Vec<HoSoQt>, tai_khoan: &[TaiKhoanQt]) -> Vec<HoSoQt> {
    let mut theo_don_vi: BTreeMap<&str, Vec<String>> = BTreeMap::new();
    for t in tai_khoan.iter().filter(|t| !t.org_id.is_empty()) {
        theo_don_vi.entry(t.org_id.as_str()).or_default().push(t.ten_dang_nhap.clone());
    }
    for h in &mut ho_so {
        h.tai_khoan = theo_don_vi.get(h.org_id.as_str()).cloned().unwrap_or_default();
    }
    ho_so.sort_by(|a, b| a.ten.to_lowercase().cmp(&b.ten.to_lowercase()));
    ho_so
}

pub fn doc_cot(c: &Value) -> Cot {
    Cot { chu: chuoi(c, "letter"), tieu_de: chuoi(c, "title"), loai: chuoi(c, "kind"), kieu: chuoi(c, "dataType") }
}

pub fn doc_bieu(khung: &Value, luoc_do: &Value) -> Bieu {
    Bieu {
        khoa: chuoi(khung, "formKey"), ma: chuoi(khung, "displayCode"), tieu_de: chuoi(khung, "title"), buoc: so(khung, "step"),
        cot: luoc_do["columns"].as_array().map(|a| a.iter().map(doc_cot).collect()).unwrap_or_default(),
    }
}

/// Một dòng của biểu để xem: số dòng, giá trị theo chữ cột, và kết quả kiểm tra của cổng.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Dong {
    pub so: u64,
    #[serde(rename = "duLieu")]
    pub du_lieu: BTreeMap<String, Value>,
    #[serde(rename = "trangThai")]
    pub trang_thai: String,
    pub loi: Vec<String>,
    #[serde(rename = "capNhat")]
    pub cap_nhat: String,
}

pub fn doc_dong(d: &Value) -> Dong {
    let du_lieu = d["data"].as_object().map(|o| o.iter().map(|(k, v)| (k.clone(), v.clone())).collect()).unwrap_or_default();
    let loi = d["validation"]["errors"].as_array().map(|a| a.iter().map(|e| e["userMessage"].as_str().or_else(|| e["message"].as_str()).map(str::to_string).unwrap_or_else(|| e.to_string())).collect()).unwrap_or_default();
    Dong { so: so(d, "rowNo"), du_lieu, trang_thai: d["validation"]["status"].as_str().unwrap_or("").to_string(), loi, cap_nhat: chuoi(d, "updatedAt") }
}

// ---------------------------------------------------------------------------
// Gọi cổng (chỉ GET)
// ---------------------------------------------------------------------------

async fn lay_het_trang(s: &Session, duong: &str, truy_van: &[(&str, &str)], kich_co: usize, toi_da: usize) -> Result<Vec<Value>, String> {
    let mut ra: Vec<Value> = Vec::new();
    for trang in 1..=TOI_DA_TRANG {
        let (t, k) = (trang.to_string(), kich_co.to_string());
        let mut q: Vec<(&str, &str)> = truy_van.to_vec();
        q.extend([("page", t.as_str()), ("size", k.as_str())]);
        let j = s.get_json(duong, &q).await.map_err(loi)?;
        let ds = j["items"].as_array().cloned().unwrap_or_default();
        let tong = j["total"].as_u64().unwrap_or(0) as usize;
        let rong = ds.is_empty();
        ra.extend(ds);
        if rong || ra.len() >= tong || ra.len() >= toi_da { break; }
    }
    Ok(ra)
}

/// Quét một lần: kỳ hiện tại, toàn bộ tài khoản, toàn bộ hồ sơ của kỳ, khung các biểu.
pub async fn quet(s: &Session, bay_gio: &str) -> Result<DanhSach, String> {
    let me = s.get_json("/auth/me", &[]).await.map_err(loi)?;
    if !me["roles"].as_array().is_some_and(|r| r.iter().any(|x| x["role"].as_str() == Some("SYSTEM_ADMIN"))) {
        return Err("Tài khoản này không có vai trò Quản trị hệ thống (SYSTEM_ADMIN)".into());
    }
    let ky = chon_ky(&s.get_json("/periods", &[]).await.map_err(loi)?, me["defaultPeriodId"].as_str().unwrap_or("")).ok_or("Cổng không có kỳ kê khai nào đang mở")?;
    let tai_khoan: Vec<TaiKhoanQt> = lay_het_trang(s, "/admin/users", &[], KICH_CO_TRANG_NGUOI_DUNG, usize::MAX).await?.iter().map(doc_tai_khoan).collect();
    let ho_so_tho = lay_het_trang(s, "/submissions", &[("periodId", &ky.id), ("scope", "SUBTREE")], KICH_CO_TRANG_HO_SO, usize::MAX).await?;
    let ho_so = gan_tai_khoan(ho_so_tho.iter().map(doc_ho_so).collect(), &tai_khoan);
    let bieu = match ho_so.first() { Some(h) => quet_khung_bieu(s, &h.id).await?, None => Vec::new() };
    let don_vi = crate::tao_tai_khoan::lay_nut(s, &crate::tao_tai_khoan::hom_nay()).await?.into_iter()
        .map(|n| NutQt { id: n.id, ma: n.ma, ten: n.ten, cha_id: n.cha_id }).collect();
    Ok(DanhSach { quet_luc: bay_gio.to_string(), ky, tai_khoan, ho_so, bieu, don_vi })
}

/// Khung các biểu (tên, bước, cột) lấy từ một hồ sơ bất kỳ: mọi hồ sơ cùng kỳ dùng chung phiên bản biểu.
async fn quet_khung_bieu(s: &Session, id_ho_so: &str) -> Result<Vec<Bieu>, String> {
    let ct = s.get_json(&format!("/submissions/{id_ho_so}"), &[]).await.map_err(loi)?;
    let mut ra = Vec::new();
    for f in ct["forms"].as_array().into_iter().flatten() {
        let k = chuoi(f, "formKey");
        let ld = s.get_json(&format!("/submissions/{id_ho_so}/forms/{k}/schema"), &[]).await.map_err(loi)?;
        ra.push(doc_bieu(f, &ld));
    }
    ra.sort_by_key(|b| b.buoc);
    Ok(ra)
}

#[derive(Debug, Serialize)]
pub struct DuLieuBieu {
    pub bieu: Bieu,
    #[serde(rename = "trangThai")]
    pub trang_thai: String,
    pub tong: u64,
    #[serde(rename = "dongDat")]
    pub dong_dat: u64,
    #[serde(rename = "dongChuaDat")]
    pub dong_chua_dat: u64,
    #[serde(rename = "canhBao")]
    pub canh_bao: u64,
    pub dong: Vec<Dong>,
    /// Đúng khi biểu có nhiều dòng hơn giới hạn tải một lần.
    #[serde(rename = "biCat")]
    pub bi_cat: bool,
}

/// Đọc đủ dòng của một biểu (và khung cột) của một hồ sơ bất kỳ.
pub async fn doc_bieu_day_du(s: &Session, id_ho_so: &str, khoa: &str) -> Result<DuLieuBieu, String> {
    if khoa.is_empty() || !khoa.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_') {
        return Err(format!("Mã biểu không hợp lệ: \"{khoa}\""));
    }
    let ld = s.get_json(&format!("/submissions/{id_ho_so}/forms/{khoa}/schema"), &[]).await.map_err(loi)?;
    let dau = s.get_json(&format!("/submissions/{id_ho_so}/forms/{khoa}"), &[("page", "1"), ("size", "1")]).await.map_err(loi)?;
    let tong = so(&dau, "total");
    let tho = if tong == 0 { Vec::new() } else { lay_het_trang(s, &format!("/submissions/{id_ho_so}/forms/{khoa}"), &[], KICH_CO_TRANG_DONG, TOI_DA_DONG).await? };
    let c = &dau["counts"];
    let khung = serde_json::json!({"formKey": khoa, "displayCode": ld["displayCode"], "title": ld["title"], "step": ld["step"]});
    Ok(DuLieuBieu {
        bieu: doc_bieu(&khung, &ld), trang_thai: chuoi(&dau, "formStatus"), tong,
        dong_dat: so(c, "rowsPassed"), dong_chua_dat: so(c, "rowsNotPassed"), canh_bao: so(c, "warning"),
        bi_cat: (tho.len() as u64) < tong, dong: tho.iter().filter(|d| d["deleted"].as_bool() != Some(true)).map(doc_dong).collect(),
    })
}

#[derive(Debug, Serialize)]
pub struct TomTatBieu {
    pub khoa: String,
    pub ma: String,
    #[serde(rename = "tieuDe")]
    pub tieu_de: String,
    pub buoc: u64,
    #[serde(rename = "soDong")]
    pub so_dong: u64,
    #[serde(rename = "trangThai")]
    pub trang_thai: String,
    #[serde(rename = "dongChuaDat")]
    pub dong_chua_dat: u64,
}

/// Chi tiết một hồ sơ: danh sách biểu kèm số dòng và trạng thái (để dựng các tab).
pub async fn chi_tiet_ho_so(s: &Session, id_ho_so: &str) -> Result<Vec<TomTatBieu>, String> {
    let ct = s.get_json(&format!("/submissions/{id_ho_so}"), &[]).await.map_err(loi)?;
    let mut ra: Vec<TomTatBieu> = ct["forms"].as_array().into_iter().flatten().map(|f| TomTatBieu {
        khoa: chuoi(f, "formKey"), ma: chuoi(f, "displayCode"), tieu_de: chuoi(f, "title"), buoc: so(f, "step"),
        so_dong: so(f, "rowCount"), trang_thai: chuoi(f, "status"), dong_chua_dat: so(&f["counts"], "rowsNotPassed"),
    }).collect();
    ra.sort_by_key(|b| b.buoc);
    Ok(ra)
}

// ---------------------------------------------------------------------------
// Lệnh Tauri
// ---------------------------------------------------------------------------

use crate::{lay_lo, AppState};
use tauri::State;

fn tep_cache(lo: &crate::Lo) -> std::path::PathBuf {
    lo.root.join("_chung").join("quan-tri.json")
}

fn dung_ma_ho_so(id: &str) -> Result<(), String> {
    if !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_hexdigit() || c == '-') { Ok(()) } else { Err("Mã hồ sơ không hợp lệ".into()) }
}

/// Phiên quản trị: dùng lại phiên đã mở; `mo_moi` buộc đăng nhập lại.
async fn phien(state: &AppState, lo: &crate::Lo, mo_moi: bool) -> Result<Session, String> {
    let mut g = state.phien_quan_tri.lock().await;
    if mo_moi { *g = None; }
    if let Some(s) = g.as_ref() { return Ok(s.clone()); }
    let s = crate::mo_phien_quan_tri(lo).await?;
    *g = Some(s.clone());
    Ok(s)
}

/// Danh sách tài khoản + hồ sơ của kỳ hiện tại. Có cache thì dùng cache; `lam_moi` quét lại trên cổng và ghi đè cache.
#[tauri::command]
pub async fn qt_danh_sach(lam_moi: bool, state: State<'_, AppState>) -> Result<DanhSach, String> {
    let lo = lay_lo(&state)?;
    let tep = tep_cache(&lo);
    if !lam_moi {
        if let Ok(c) = crate::lo::doc_json::<DanhSach>(&tep) { return Ok(c); }
    }
    let s = phien(&state, &lo, lam_moi).await?;
    let ds = quet(&s, &crate::lo::bay_gio()).await?;
    crate::lo::ghi_json(&tep, &ds)?;
    let mut e = crate::lo::su_kien("quan_tri_quet");
    e.ket_qua = Some("ok");
    let _ = crate::lo::ghi_nhat_ky(&lo.root.join("_chung"), &e);
    Ok(ds)
}

/// Các biểu của một hồ sơ (số dòng, trạng thái), để dựng tab.
#[tauri::command]
pub async fn qt_chi_tiet(id_ho_so: String, state: State<'_, AppState>) -> Result<Vec<TomTatBieu>, String> {
    dung_ma_ho_so(&id_ho_so)?;
    let lo = lay_lo(&state)?;
    chi_tiet_ho_so(&phien(&state, &lo, false).await?, &id_ho_so).await
}

/// Toàn bộ dòng của một biểu trong một hồ sơ (đọc trực tiếp từ cổng, không cache).
#[tauri::command]
pub async fn qt_bieu(id_ho_so: String, khoa: String, state: State<'_, AppState>) -> Result<DuLieuBieu, String> {
    dung_ma_ho_so(&id_ho_so)?;
    let lo = lay_lo(&state)?;
    doc_bieu_day_du(&phien(&state, &lo, false).await?, &id_ho_so, &khoa).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn chon_ky_uu_tien_ky_mo_mac_dinh_roi_ky_mo_dau_tien() {
        let ds = json!([
            {"id": "a", "code": "A", "name": "A", "status": "DRAFT"},
            {"id": "b", "code": "B", "name": "B", "status": "OPEN", "dateFrom": "2025-10-01", "dateTo": "2026-09-30"},
            {"id": "c", "code": "C", "name": "C", "status": "OPEN"},
        ]);
        assert_eq!(chon_ky(&ds, "c").unwrap().id, "c");
        assert_eq!(chon_ky(&ds, "a").unwrap().id, "b", "kỳ mặc định không mở thì lấy kỳ mở đầu tiên");
        assert_eq!(chon_ky(&ds, "").unwrap().tu_ngay, "2025-10-01");
        assert!(chon_ky(&json!([{"id": "a", "status": "CLOSED"}]), "a").is_none());
    }

    #[test]
    fn doc_ho_so_va_gan_tai_khoan_theo_don_vi() {
        let h = json!({"id": "s1", "status": "DRAFT", "progressPercent": 60, "updatedAt": "t",
            "counts": {"rowsPassed": 10, "rowsNotPassed": 2, "warning": 1},
            "orgUnit": {"id": "o1", "code": "M1", "name": "Trường Z", "level": "XA"}});
        let ho = doc_ho_so(&h);
        assert_eq!((ho.id.as_str(), ho.org_id.as_str(), ho.tien_do, ho.dong_chua_dat, ho.canh_bao), ("s1", "o1", 60, 2, 1));
        let tk = |u: &str, o: &str| doc_tai_khoan(&json!({"username": u, "homeOrg": {"id": o}}));
        let kq = gan_tai_khoan(vec![ho], &[tk("a", "o1"), tk("b", "o2"), tk("c", "o1")]);
        assert_eq!(kq[0].tai_khoan, vec!["a", "c"]);
    }

    #[test]
    fn tai_khoan_lay_don_vi_tu_org_units_khi_thieu_home_org() {
        let t = doc_tai_khoan(&json!({"username": "x", "orgUnits": [{"id": "o9"}]}));
        assert_eq!(t.org_id, "o9");
    }

    #[test]
    fn doc_bieu_giu_cot_theo_thu_tu_va_loai() {
        let ld = json!({"columns": [
            {"letter": "A", "title": "Mã", "kind": "INPUT", "dataType": "TEXT"},
            {"letter": "B", "title": "Giờ", "kind": "COMPUTED", "dataType": "DECIMAL"}]});
        let b = doc_bieu(&json!({"formKey": "b1", "displayCode": "B1", "title": "Đo", "step": 3}), &ld);
        assert_eq!((b.khoa.as_str(), b.buoc, b.cot.len()), ("b1", 3, 2));
        assert_eq!((b.cot[1].chu.as_str(), b.cot[1].loai.as_str()), ("B", "COMPUTED"));
    }

    #[test]
    fn doc_dong_lay_loi_kiem_tra_cua_cong() {
        let d = doc_dong(&json!({"rowNo": 4, "data": {"A": "x", "B": null}, "updatedAt": "t",
            "validation": {"status": "BLOCK", "errors": [{"userMessage": "Thiếu mã"}, {"message": "Sai"}, {"code": "X"}]}}));
        assert_eq!((d.so, d.trang_thai.as_str()), (4, "BLOCK"));
        assert_eq!(d.loi[..2], ["Thiếu mã", "Sai"]);
        assert_eq!(d.loi.len(), 3);
        assert_eq!(d.du_lieu["A"], "x");
        assert!(doc_dong(&json!({})).loi.is_empty());
    }

    #[test]
    fn cache_cu_khong_co_cay_van_doc_duoc() {
        let cu = json!({"quetLuc": "t", "ky": {"id": "k", "ma": "m", "ten": "n", "tuNgay": "a", "denNgay": "b", "trangThai": "OPEN"}, "taiKhoan": [], "hoSo": [], "bieu": []});
        let ds: DanhSach = serde_json::from_value(cu).unwrap();
        assert!(ds.don_vi.is_empty());
        let moi: DanhSach = serde_json::from_value(json!({"quetLuc": "t", "ky": {"id": "k", "ma": "m", "ten": "n", "tuNgay": "a", "denNgay": "b", "trangThai": "OPEN"}, "taiKhoan": [], "hoSo": [], "bieu": [], "donVi": [{"id": "1", "ma": "A", "ten": "Gốc", "chaId": null}, {"id": "2", "ma": "B", "ten": "Con", "chaId": "1"}]})).unwrap();
        assert_eq!(moi.don_vi[1].cha_id.as_deref(), Some("1"));
    }

    /// Thử thật (chỉ đọc): `VTVL_TEST_USER=… VTVL_TEST_PASS=… cargo test quet_that -- --ignored --nocapture`.
    #[tokio::test]
    #[ignore = "cần cổng thật và tài khoản quản trị trong biến môi trường"]
    async fn quet_that() {
        use crate::portal::{DangNhap, ThietBi};
        let (Ok(u), Ok(p)) = (std::env::var("VTVL_TEST_USER"), std::env::var("VTVL_TEST_PASS")) else { panic!("thiếu biến") };
        let tb = ThietBi { id: "33333333-4444-4555-8666-777777777777".into(), ten: "VTVL Batch".into(), phien_ban: "1.2.8".into(), nen_tang: "macos".into() };
        let s = crate::portal::mo_phien("https://kekhaivtvl.dcs.vn", &DangNhap::Desktop { username: &u, password: &p, thiet_bi: &tb }, std::time::Duration::from_secs(60)).await.unwrap();
        let ds = quet(&s, "now").await.unwrap();
        let co_tk = ds.ho_so.iter().filter(|h| !h.tai_khoan.is_empty()).count();
        println!("KY {} {} | tai khoan {} | ho so {} (co tai khoan {}) | bieu {:?}", ds.ky.ma, ds.ky.trang_thai, ds.tai_khoan.len(), ds.ho_so.len(), co_tk, ds.bieu.iter().map(|b| (b.ma.clone(), b.cot.len())).collect::<Vec<_>>());
        let ids: std::collections::HashSet<&str> = ds.don_vi.iter().map(|n| n.id.as_str()).collect();
        let goc = ds.don_vi.iter().filter(|n| n.cha_id.as_deref().is_none_or(|c| !ids.contains(c))).count();
        println!("CAY nut={} goc={} ho_so_co_nut={}/{}", ds.don_vi.len(), goc, ds.ho_so.iter().filter(|h| ids.contains(h.org_id.as_str())).count(), ds.ho_so.len());
        let h = ds.ho_so.iter().find(|h| h.dong_dat > 50).unwrap();
        for k in ["b1", "c3", "d2"] {
            let t = std::time::Instant::now();
            let b = doc_bieu_day_du(&s, &h.id, k).await.unwrap();
            println!("BIEU {k}: tong={} doc={} cat={} chua_dat={} loi_dong_dau={:?} ({}ms)", b.tong, b.dong.len(), b.bi_cat, b.dong_chua_dat, b.dong.first().map(|d| d.loi.len()), t.elapsed().as_millis());
        }
        println!("CHITIET {:?}", chi_tiet_ho_so(&s, &h.id).await.unwrap().iter().map(|b| (b.ma.clone(), b.so_dong)).collect::<Vec<_>>());
    }
}
