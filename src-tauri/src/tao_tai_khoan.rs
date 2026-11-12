//! Tạo đơn vị con + tài khoản (Đầu mối dữ liệu + Cán bộ kê khai) trên cổng bằng tài khoản quản trị.
//! Cùng logic với `DE_AN_VTVL/TAO_TAI_KHOAN/script` (`ke_hoach.mjs`, `cong_api.mjs`), nhưng gọi API qua kênh Desktop (token Bearer), không cần Chrome.
//! Mật khẩu quản trị chỉ đọc từ cấu hình vào bộ nhớ; mật khẩu tạm của tài khoản mới chỉ trả cho giao diện (và ghi vào lô nếu người dùng chọn).

use crate::portal::{Session, StepError};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::HashSet;

const VAI_TRO: [&str; 2] = ["DATA_STEWARD", "UNIT_ENTRY"];
const TRANG_NGUOI_DUNG: usize = 100;
const TOI_DA_TRANG: usize = 50;

/// Tài khoản quản trị trong cấu hình (`settings.taiKhoanQuanTri`). Không bao giờ ghi lại ra tệp.
#[derive(Debug, Clone, Deserialize)]
pub struct TaiKhoanQuanTri {
    pub username: String,
    #[serde(default)]
    pub password: String,
}

/// Một nút của cây tổ chức.
#[derive(Debug, Clone, Serialize)]
pub struct Nut {
    pub id: String,
    pub ma: String,
    pub ten: String,
    #[serde(rename = "chaId")]
    pub cha_id: Option<String>,
    #[serde(skip)]
    pub khoi: String,
    #[serde(skip)]
    pub cap: String,
    #[serde(skip)]
    pub ma_dvhc: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct Cay {
    pub nut: Vec<Nut>,
    #[serde(rename = "tenDangNhap")]
    pub ten_dang_nhap: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct YeuCauTao {
    #[serde(rename = "chaId")]
    pub cha_id: String,
    pub ten: String,
    /// Trống: tự sinh mã kế tiếp dưới cha.
    #[serde(default)]
    pub ma: String,
    #[serde(rename = "tenDangNhap")]
    pub ten_dang_nhap: String,
}

#[derive(Debug, Serialize)]
pub struct KetQuaTao {
    #[serde(rename = "orgId")]
    pub org_id: String,
    pub ma: String,
    #[serde(rename = "donViMoi")]
    pub don_vi_moi: bool,
    #[serde(rename = "tenDangNhap")]
    pub ten_dang_nhap: String,
    #[serde(rename = "matKhau")]
    pub mat_khau: String,
}

fn text(v: &Value, k: &str) -> String {
    v[k].as_str().unwrap_or("").to_string()
}

fn loi(e: StepError) -> String {
    match e { StepError::Auth(m) | StepError::Retry(m) | StepError::Fatal(m) => m }
}

/// So sánh tên không phân biệt hoa thường và khoảng trắng thừa.
fn chuan_ten(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase()
}

/// Mã đề xuất tiếp theo dưới cha: `<mã cha>.S001`…; riêng cha là UBND tỉnh (`CP-T37.00`) thì theo dãy cơ quan cấp tỉnh `CP-T37.32`, `.33`…
pub fn ma_tiep_theo(ma_cha: &str, da_co: &HashSet<String>) -> Result<String, String> {
    if let Some(tien_to) = ma_cha.strip_suffix(".00").filter(|t| t.starts_with("CP-T") && t[4..].chars().all(|c| c.is_ascii_digit())) {
        let lon_nhat = da_co.iter()
            .filter_map(|m| m.strip_prefix(&format!("{tien_to}."))?.parse::<u32>().ok().filter(|_| m.len() == tien_to.len() + 3))
            .max().unwrap_or(0);
        return Ok(format!("{tien_to}.{:02}", lon_nhat + 1));
    }
    (1..1000).map(|i| format!("{ma_cha}.S{i:03}")).find(|m| !da_co.contains(m)).ok_or_else(|| format!("Hết mã khả dụng dưới {ma_cha}"))
}

/// Tạo UUID cố định theo nội dung: gửi lại cùng yêu cầu thì cổng không tạo bản trùng.
fn khoa_co_dinh(loai: &str, body: &Value) -> String {
    let h: String = Sha256::digest(format!("{loai}|{body}").as_bytes()).iter().map(|b| format!("{b:02x}")).collect();
    format!("{}-{}-5{}-a{}-{}", &h[0..8], &h[8..12], &h[13..16], &h[17..20], &h[20..32])
}

fn than_don_vi(cha: &Nut, ten: &str, ma: &str, ngay: &str) -> Value {
    json!({
        "code": ma, "name": ten, "parentId": cha.id, "block": cha.khoi, "level": cha.cap,
        "regionCode": null, "adminUnitCode": cha.ma_dvhc, "managingOrgId": cha.id,
        "effectiveFrom": ngay, "effectiveTo": null,
    })
}

fn than_tai_khoan(ten_dn: &str, ten: &str, org_id: &str, ngay: &str) -> Value {
    json!({
        "username": ten_dn, "fullName": ten, "title": null, "homeOrgId": org_id, "loginMethod": "PASSWORD",
        "roleAssignments": VAI_TRO.iter().map(|role| json!({
            "role": role, "scopeOrgUnitId": null, "includeSubtree": true, "validFrom": ngay, "validTo": null,
            "rules": {"includes": [{"type": "NODE", "orgUnitId": org_id, "includeSubtree": true}], "excludes": [], "levels": [], "blocks": []},
        })).collect::<Vec<_>>(),
    })
}

/// Ngày hôm nay theo giờ Việt Nam (UTC+7), dạng `YYYY-MM-DD`.
pub fn hom_nay() -> String {
    (chrono::Utc::now() + chrono::Duration::hours(7)).format("%Y-%m-%d").to_string()
}

fn duyet(n: &Value, cha: Option<&Value>, ra: &mut Vec<Nut>) {
    ra.push(Nut {
        id: text(n, "id"), ma: text(n, "code"), ten: text(n, "name"),
        cha_id: cha.map(|c| text(c, "id")), khoi: text(n, "block"), cap: text(n, "level"),
        ma_dvhc: n["adminUnitCode"].as_str().map(str::to_string),
    });
    for c in n["children"].as_array().into_iter().flatten() {
        duyet(c, Some(n), ra);
    }
}

/// Mã đơn vị hành chính: của nút, không có thì lần lên tổ tiên.
fn ma_dvhc(id: &str, nut: &[Nut]) -> Option<String> {
    let mut cur = nut.iter().find(|n| n.id == id);
    while let Some(n) = cur {
        if n.ma_dvhc.is_some() { return n.ma_dvhc.clone(); }
        cur = n.cha_id.as_deref().and_then(|c| nut.iter().find(|x| x.id == c));
    }
    None
}

/// Toàn bộ cây đơn vị (phẳng, mỗi nút có `cha_id`). Chỉ đọc.
pub async fn lay_nut(sess: &Session, ngay: &str) -> Result<Vec<Nut>, String> {
    let tren = sess.get_json("/org-units/tree", &[("depth", "1"), ("activeAt", ngay), ("includeInactive", "false")]).await.map_err(loi)?;
    let mut nut = Vec::new();
    for goc in tren.as_array().into_iter().flatten() {
        let id = text(goc, "id");
        let cay = sess.get_json("/org-units/tree", &[("rootId", &id), ("depth", "20"), ("activeAt", ngay), ("includeInactive", "false")]).await.map_err(loi)?;
        match cay.as_array() {
            Some(ds) => ds.iter().for_each(|n| duyet(n, None, &mut nut)),
            None => duyet(&cay, None, &mut nut),
        }
    }
    Ok(nut)
}

/// Toàn bộ cây (phẳng) và danh sách tên đăng nhập đang có. Chỉ đọc.
pub async fn lay_cay(sess: &Session, ngay: &str) -> Result<Cay, String> {
    let nut = lay_nut(sess, ngay).await?;
    let mut ten_dn = Vec::new();
    for trang in 1..=TOI_DA_TRANG {
        let j = sess.get_json("/admin/users", &[("page", &trang.to_string()), ("size", &TRANG_NGUOI_DUNG.to_string())]).await.map_err(loi)?;
        let ds = j["items"].as_array().cloned().unwrap_or_default();
        ten_dn.extend(ds.iter().map(|u| text(u, "username")));
        let tong = j["total"].as_u64().or_else(|| j["totalElements"].as_u64()).unwrap_or(0) as usize;
        if ds.is_empty() || ten_dn.len() >= tong { break; }
    }
    Ok(Cay { nut, ten_dang_nhap: ten_dn })
}

/// Tạo (hoặc dùng lại đơn vị cùng tên dưới cùng cha) rồi tạo tài khoản. Dừng ở lỗi đầu tiên.
pub async fn tao(sess: &Session, y: &YeuCauTao, ngay: &str) -> Result<KetQuaTao, String> {
    let ten = y.ten.split_whitespace().collect::<Vec<_>>().join(" ");
    let ten_dn = crate::lo::safe_username(&y.ten_dang_nhap)?;
    if ten.is_empty() {
        return Err("Thiếu tên đơn vị".into());
    }
    let cay = lay_cay(sess, ngay).await?;
    if cay.ten_dang_nhap.iter().any(|u| u.eq_ignore_ascii_case(&ten_dn)) {
        return Err(format!("Tên đăng nhập {ten_dn} đã có trên cổng"));
    }
    let cha = cay.nut.iter().find(|n| n.id == y.cha_id).ok_or("Không còn thấy đơn vị cha trên cổng")?;
    let cha = Nut { ma_dvhc: ma_dvhc(&cha.id, &cay.nut), ..cha.clone() };

    let cung_ten = cay.nut.iter().find(|n| n.cha_id.as_deref() == Some(&cha.id) && chuan_ten(&n.ten) == chuan_ten(&ten));
    let (org_id, ma, don_vi_moi) = match cung_ten {
        Some(n) => (n.id.clone(), n.ma.clone(), false),
        None => {
            let da_co: HashSet<String> = cay.nut.iter().map(|n| n.ma.clone()).collect();
            let ma = if y.ma.trim().is_empty() { ma_tiep_theo(&cha.ma, &da_co)? } else { y.ma.trim().to_string() };
            if let Some(n) = cay.nut.iter().find(|n| n.ma == ma) {
                return Err(format!("Mã {ma} đã dùng cho \"{}\"", n.ten));
            }
            let body = than_don_vi(&cha, &ten, &ma, ngay);
            let r = post(sess, "/org-units", &body, "org").await.map_err(|e| format!("Tạo đơn vị: {e}"))?;
            (text(&r, "id"), ma, true)
        }
    };
    if org_id.is_empty() {
        return Err("Cổng không trả id đơn vị vừa tạo".into());
    }
    let body = than_tai_khoan(&ten_dn, &ten, &org_id, ngay);
    let r = post(sess, "/admin/users", &body, "user").await.map_err(|e| format!("Tạo tài khoản (đơn vị {ma} đã {}): {e}", if don_vi_moi { "tạo" } else { "có sẵn" }))?;
    let mat_khau = r["temporaryPassword"]["temporaryPassword"].as_str().unwrap_or("").to_string();
    Ok(KetQuaTao { org_id, ma, don_vi_moi, ten_dang_nhap: ten_dn, mat_khau })
}

async fn post(sess: &Session, duong: &str, body: &Value, loai: &str) -> Result<Value, String> {
    let khoa = khoa_co_dinh(loai, body);
    let bytes = serde_json::to_vec(body).map_err(|e| e.to_string())?;
    sess.post_json(duong, bytes, false, &[("Idempotency-Key", &khoa)]).await.map(|(_, v)| v).map_err(loi)
}

/// Một dòng báo cáo: tên đơn vị, tài khoản, mật khẩu.
#[derive(Debug, Clone, Deserialize)]
pub struct DongBaoCao {
    pub ten: String,
    #[serde(rename = "taiKhoan")]
    pub tai_khoan: String,
    #[serde(rename = "matKhau")]
    pub mat_khau: String,
}

const TIEU_DE_BAO_CAO: [&str; 3] = ["Tên đơn vị", "Tài khoản", "Mật khẩu"];

/// Ghi báo cáo Excel `Tên đơn vị | Tài khoản | Mật khẩu` (mọi ô là văn bản). Tệp chứa mật khẩu: quyền 600 trên Unix.
pub fn xuat_excel(duong_dan: &std::path::Path, hang: &[DongBaoCao]) -> Result<(), String> {
    use rust_xlsxwriter::{Format, FormatAlign, Workbook};
    let mut wb = Workbook::new();
    let ws = wb.add_worksheet();
    ws.set_name("Tài khoản").map_err(|e| e.to_string())?;
    let dam = Format::new().set_bold().set_align(FormatAlign::Left);
    for (c, t) in TIEU_DE_BAO_CAO.iter().enumerate() {
        ws.write_string_with_format(0, c as u16, *t, &dam).map_err(|e| e.to_string())?;
    }
    for (i, h) in hang.iter().enumerate() {
        let r = i as u32 + 1;
        for (c, v) in [&h.ten, &h.tai_khoan, &h.mat_khau].into_iter().enumerate() {
            ws.write_string(r, c as u16, v).map_err(|e| e.to_string())?;
        }
    }
    ws.set_column_width(0, 52).map_err(|e| e.to_string())?;
    ws.set_column_width(1, 26).map_err(|e| e.to_string())?;
    ws.set_column_width(2, 22).map_err(|e| e.to_string())?;
    ws.set_freeze_panes(1, 0).map_err(|e| e.to_string())?;
    if let Some(cha) = duong_dan.parent() {
        std::fs::create_dir_all(cha).map_err(|e| format!("Không tạo được thư mục báo cáo: {e}"))?;
    }
    wb.save(duong_dan).map_err(|e| format!("Không ghi được báo cáo Excel: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(duong_dan, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

/// Tên tệp báo cáo an toàn: chỉ chữ, số, `_`, `-`, `.`; luôn đuôi `.xlsx`, không chứa đường dẫn.
pub fn ten_tep_bao_cao(ten: &str) -> Result<String, String> {
    let goc: String = ten.trim().trim_end_matches(".xlsx").chars().filter(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-')).collect();
    if goc.is_empty() { Err("Tên tệp báo cáo không hợp lệ".into()) } else { Ok(format!("{goc}.xlsx")) }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tap(v: &[&str]) -> HashSet<String> { v.iter().map(|s| s.to_string()).collect() }

    #[test]
    fn ma_duoi_xa_la_s_ba_chu_so_bo_qua_ma_da_co() {
        assert_eq!(ma_tiep_theo("CP-T37X14614.00", &tap(&[])).unwrap(), "CP-T37X14614.00.S001");
        assert_eq!(ma_tiep_theo("CP-T37X14614.00", &tap(&["CP-T37X14614.00.S001", "CP-T37X14614.00.S002"])).unwrap(), "CP-T37X14614.00.S003");
        assert_eq!(ma_tiep_theo("CP-T37.12", &tap(&[])).unwrap(), "CP-T37.12.S001");
    }

    #[test]
    fn ma_duoi_ubnd_tinh_theo_day_co_quan_cap_tinh() {
        assert_eq!(ma_tiep_theo("CP-T37.00", &tap(&["CP-T37.31", "CP-T37.12", "CP-T37.31.S001"])).unwrap(), "CP-T37.32");
    }

    #[test]
    fn than_tai_khoan_gan_ca_hai_vai_tro_vao_don_vi_con() {
        let t = than_tai_khoan("a_b", "Đơn vị A", "org1", "2026-11-10");
        let vt: Vec<&str> = t["roleAssignments"].as_array().unwrap().iter().filter_map(|r| r["role"].as_str()).collect();
        assert_eq!(vt, ["DATA_STEWARD", "UNIT_ENTRY"]);
        assert_eq!(t["roleAssignments"][0]["rules"]["includes"][0]["orgUnitId"], "org1");
        assert_eq!(t["homeOrgId"], "org1");
    }

    #[test]
    fn ten_tep_bao_cao_bo_ky_tu_la_va_duong_dan() {
        assert_eq!(ten_tep_bao_cao("TaiKhoan_20261110_2100").unwrap(), "TaiKhoan_20261110_2100.xlsx");
        assert_eq!(ten_tep_bao_cao("../../etc/x.xlsx").unwrap(), "etcx.xlsx");
        assert!(ten_tep_bao_cao("../").is_err());
    }

    #[test]
    fn xuat_excel_ghi_ba_cot_dung_noi_dung() {
        let dir = std::env::temp_dir().join(format!("vtvl_bc_{}", std::process::id()));
        let f = dir.join("bc.xlsx");
        let hang = vec![DongBaoCao { ten: "Trường Mầm non A".into(), tai_khoan: "a_mn".into(), mat_khau: "Pa$$1".into() }];
        xuat_excel(&f, &hang).unwrap();
        let zip = std::fs::read(&f).unwrap();
        assert_eq!(&zip[..2], b"PK");
        let mut z = zip::ZipArchive::new(std::io::Cursor::new(zip)).unwrap();
        let mut chuoi = String::new();
        std::io::Read::read_to_string(&mut z.by_name("xl/sharedStrings.xml").unwrap(), &mut chuoi).unwrap();
        for can in ["Tên đơn vị", "Tài khoản", "Mật khẩu", "Trường Mầm non A", "a_mn", "Pa$$1"] {
            assert!(chuoi.contains(can), "thiếu {can}");
        }
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn khoa_co_dinh_theo_noi_dung() {
        let a = khoa_co_dinh("org", &json!({"x": 1}));
        assert_eq!(a, khoa_co_dinh("org", &json!({"x": 1})));
        assert_ne!(a, khoa_co_dinh("user", &json!({"x": 1})));
        assert_eq!(a.len(), 36);
    }

    #[test]
    fn ma_dvhc_lan_len_to_tien() {
        let n = |id: &str, cha: Option<&str>, dv: Option<&str>| Nut { id: id.into(), ma: id.into(), ten: id.into(), cha_id: cha.map(str::to_string), khoi: String::new(), cap: String::new(), ma_dvhc: dv.map(str::to_string) };
        let cay = vec![n("a", None, Some("123")), n("b", Some("a"), None), n("c", Some("b"), None)];
        assert_eq!(ma_dvhc("c", &cay).as_deref(), Some("123"));
        assert_eq!(ma_dvhc("zzz", &cay), None);
    }
}
