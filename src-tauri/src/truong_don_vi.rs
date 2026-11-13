//! Tài khoản thường được phân công nhiều đơn vị (trưởng đơn vị): đăng nhập xong chọn đơn vị và kỳ, rồi xem hồ sơ các đơn vị cấp dưới trực tiếp.
//! Dùng chung phiên và các lệnh xem biểu (`qt_chi_tiet`, `qt_bieu`, `qt_xuat_excel`) của tài khoản đã thiết lập ở `quan_tri`.
//! Chỉ đọc cổng. Xem biểu và tải hồ sơ dùng các lệnh chung `qt_chi_tiet`, `qt_bieu`, `qt_xuat_excel`.

use crate::quan_tri::{cac_ky, doc_ho_so, don_vi_duoc_phan_cong, dung_ma_ho_so, lay_het_trang, phien, HoSoQt, Ky};
use crate::{lay_lo, AppState};
use serde::Serialize;
use serde_json::Value;
use std::collections::HashSet;
use tauri::State;

const KICH_CO_TRANG_HO_SO: usize = 500;

#[derive(Debug, Serialize, PartialEq)]
pub struct DonViChon {
    pub id: String,
    pub ma: String,
    pub ten: String,
}

#[derive(Debug, Serialize)]
pub struct ThongTinTdv {
    #[serde(rename = "hoTen")]
    pub ho_ten: String,
    #[serde(rename = "donVi")]
    pub don_vi: Vec<DonViChon>,
    /// Các kỳ chính thức (mã dạng `2025-2026`), kỳ đang mở đứng trước.
    pub ky: Vec<Ky>,
}

#[derive(Debug, Serialize)]
pub struct DanhSachTdv {
    #[serde(rename = "quetLuc")]
    pub quet_luc: String,
    pub ky: Ky,
    #[serde(rename = "donVi")]
    pub don_vi: DonViChon,
    #[serde(rename = "hoSo")]
    pub ho_so: Vec<HoSoQt>,
}

/// Mã kỳ chính thức có dạng `yyyy-yyyy`; các kỳ thử nghiệm (E2E…) bị bỏ. Không còn kỳ nào khớp thì giữ nguyên để người dùng vẫn chọn được. Thuần.
pub fn loc_ky_chinh_thuc(ky: Vec<Ky>) -> Vec<Ky> {
    let dung = |m: &str| m.len() == 9 && m.as_bytes()[4] == b'-' && m.chars().enumerate().all(|(i, c)| i == 4 || c.is_ascii_digit());
    let chinh: Vec<Ky> = ky.iter().filter(|k| dung(&k.ma)).cloned().collect();
    if chinh.is_empty() { ky } else { chinh }
}

/// Mã các đơn vị con trực tiếp trong phản hồi `/org-units/tree` (gốc là nút đầu, con ở `children`). Thuần.
pub fn con_truc_tiep(cay: &Value, goc_id: &str) -> HashSet<String> {
    let nut: Vec<&Value> = match cay.as_array() { Some(a) => a.iter().collect(), None => vec![cay] };
    nut.into_iter().filter(|n| n["id"].as_str() == Some(goc_id))
        .flat_map(|n| n["children"].as_array().into_iter().flatten())
        .filter_map(|c| c["id"].as_str().map(str::to_string)).collect()
}

/// Giữ hồ sơ của các đơn vị con trực tiếp, sắp theo tên. Thuần.
pub fn loc_ho_so_cap_duoi(tho: &[Value], con: &HashSet<String>) -> Vec<HoSoQt> {
    let mut ra: Vec<HoSoQt> = tho.iter().map(doc_ho_so).filter(|h| con.contains(&h.org_id)).collect();
    ra.sort_by(|a, b| a.ten.to_lowercase().cmp(&b.ten.to_lowercase()));
    ra
}

/// Đơn vị được phân công và các kỳ để chọn sau khi đăng nhập.
#[tauri::command]
pub async fn tdv_thong_tin(state: State<'_, AppState>) -> Result<ThongTinTdv, String> {
    let lo = lay_lo(&state)?;
    let s = phien(&state, &lo, false).await?;
    let me = s.get_json("/auth/me", &[]).await.map_err(|e| format!("{e:?}"))?;
    let don_vi: Vec<DonViChon> = don_vi_duoc_phan_cong(&me).into_iter().map(|(id, ma, ten)| DonViChon { id, ma, ten }).collect();
    let ky = loc_ky_chinh_thuc(cac_ky(&s.get_json("/periods", &[]).await.map_err(|e| format!("{e:?}"))?));
    Ok(ThongTinTdv { ho_ten: me["user"]["fullName"].as_str().unwrap_or_default().to_string(), don_vi, ky })
}

/// Hồ sơ của các đơn vị cấp dưới trực tiếp của `don_vi_id` trong kỳ `ky_id`.
#[tauri::command]
pub async fn tdv_danh_sach(don_vi_id: String, ky_id: String, state: State<'_, AppState>) -> Result<DanhSachTdv, String> {
    dung_ma_ho_so(&don_vi_id)?;
    dung_ma_ho_so(&ky_id)?;
    let lo = lay_lo(&state)?;
    let s = phien(&state, &lo, false).await?;
    let me = s.get_json("/auth/me", &[]).await.map_err(|e| format!("{e:?}"))?;
    let don_vi = don_vi_duoc_phan_cong(&me).into_iter().find(|(id, _, _)| *id == don_vi_id).map(|(id, ma, ten)| DonViChon { id, ma, ten })
        .ok_or("Đơn vị này không nằm trong các đơn vị được phân công cho tài khoản")?;
    let ky = cac_ky(&s.get_json("/periods", &[]).await.map_err(|e| format!("{e:?}"))?).into_iter().find(|k| k.id == ky_id).ok_or("Kỳ đã chọn không còn trên cổng")?;
    let ngay = crate::tao_tai_khoan::hom_nay();
    let cay = s.get_json("/org-units/tree", &[("rootId", &don_vi_id), ("depth", "2"), ("activeAt", &ngay), ("includeInactive", "false")]).await.map_err(|e| format!("{e:?}"))?;
    let con = con_truc_tiep(&cay, &don_vi_id);
    let tho = lay_het_trang(&s, "/submissions", &[("periodId", &ky.id), ("scope", "SUBTREE")], KICH_CO_TRANG_HO_SO, usize::MAX).await?;
    Ok(DanhSachTdv { quet_luc: crate::lo::bay_gio(), ky, don_vi, ho_so: loc_ho_so_cap_duoi(&tho, &con) })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn ky(ma: &str) -> Ky { Ky { id: ma.into(), ma: ma.into(), ten: ma.into(), tu_ngay: String::new(), den_ngay: String::new(), trang_thai: String::new(), han_gui: String::new() } }

    #[test]
    fn loc_ky_chi_giu_ma_nam_hoc_va_khong_de_rong() {
        let ds = loc_ky_chinh_thuc(vec![ky("E2EAX123"), ky("2025-2026"), ky("<h1>x</h1>"), ky("2024-2025")]);
        assert_eq!(ds.iter().map(|k| k.ma.as_str()).collect::<Vec<_>>(), ["2025-2026", "2024-2025"]);
        assert_eq!(loc_ky_chinh_thuc(vec![ky("E2E1")]).len(), 1, "không có kỳ chính thức thì giữ nguyên");
    }

    #[test]
    fn con_truc_tiep_chi_lay_cap_ngay_duoi_goc() {
        let cay = json!([{"id": "g", "children": [{"id": "c1", "children": [{"id": "ch"}]}, {"id": "c2"}]}]);
        let con = con_truc_tiep(&cay, "g");
        assert_eq!((con.len(), con.contains("c1"), con.contains("c2"), con.contains("ch")), (2, true, true, false));
        assert!(con_truc_tiep(&json!({"id": "g"}), "g").is_empty());
        assert!(con_truc_tiep(&cay, "khac").is_empty());
    }

    #[test]
    fn loc_ho_so_giu_don_vi_con_va_sap_theo_ten() {
        let h = |id: &str, org: &str, ten: &str| json!({"id": id, "orgUnit": {"id": org, "name": ten}, "status": "DRAFT"});
        let tho = vec![h("1", "c2", "Đảng ủy B"), h("2", "x", "Ngoài nhánh"), h("3", "c1", "Đảng ủy A")];
        let con: HashSet<String> = ["c1", "c2"].iter().map(|s| s.to_string()).collect();
        assert_eq!(loc_ho_so_cap_duoi(&tho, &con).iter().map(|h| h.id.as_str()).collect::<Vec<_>>(), ["3", "1"]);
    }
}
