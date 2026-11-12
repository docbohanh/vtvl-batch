//! Xóa dữ liệu cũ của một hồ sơ trên cổng để nạp dữ liệu mới, **theo cách ứng dụng Desktop làm**.
//!
//! Cổng chặn xóa trực tiếp qua REST (`bulk-delete`, `DELETE …/rows/{id}`) với phiên web: 403 "chỉ sửa/xóa trên ứng dụng máy tính".
//! Desktop không xóa kiểu đó: "Xóa dòng" tạo thay đổi `op: DELETE` rồi đẩy qua gói thay đổi (`POST /submissions/{id}/changesets`).
//! Ở đây: đếm dòng bằng `GET /submissions/{sid}/forms/{form}` (chỉ đọc), xóa bằng gói `DELETE` dựng từ ảnh chụp hồ sơ, rồi tải lại ảnh chụp để đối chiếu.
//! Thứ tự xóa NGƯỢC chiều phụ thuộc (biểu sau trước; cổng chặn xóa dòng có mã đang được biểu sau dùng). Không hoàn tác được.

use crate::goi::{self, CauHinhGui, LoiGui, NguCanhGoi};
use crate::lo;
use crate::may_chu;
use crate::portal::{Session, StepError};
use crate::thay_doi::{AnhChup, ThayDoiItem, Truong};
use serde::Serialize;
use serde_json::json;
use std::path::Path;
use std::time::Duration;

const CO_TRANG: usize = 500;
const SO_TRANG_TOI_DA: usize = 400;

pub struct BieuXoa {
    pub khoa: &'static str,
    pub ten: &'static str,
    pub mac_dinh: bool,
}

/// Biểu theo thứ tự XÓA (sau → trước). `mac_dinh: false`: B2 tổng hợp do hệ thống tự tổng hợp, không xóa trực tiếp.
pub const BIEU_XOA: [BieuXoa; 11] = [
    BieuXoa { khoa: "d2", ten: "D2 – Phương án biên chế", mac_dinh: true },
    BieuXoa { khoa: "du_bao_5_nam", ten: "Dự báo 5 năm", mac_dinh: true },
    BieuXoa { khoa: "d1", ten: "D1 – Nhân lực hiện có", mac_dinh: true },
    BieuXoa { khoa: "c3", ten: "C3 – Nhu cầu nhân lực", mac_dinh: true },
    BieuXoa { khoa: "c2", ten: "C2 – Bản mô tả, khung năng lực", mac_dinh: true },
    BieuXoa { khoa: "b2_thaydoi", ten: "B2 tổng hợp (hệ thống tự tổng hợp)", mac_dinh: false },
    BieuXoa { khoa: "b2_ct", ten: "B2 – Tác động chi tiết", mac_dinh: true },
    BieuXoa { khoa: "b1", ten: "B1 – Khối lượng và thời gian", mac_dinh: true },
    BieuXoa { khoa: "a2", ten: "A2 – Công việc và sản phẩm", mac_dinh: true },
    BieuXoa { khoa: "a1", ten: "A1 – Danh mục nhiệm vụ", mac_dinh: true },
    BieuXoa { khoa: "c1", ten: "C1 – Danh mục vị trí việc làm", mac_dinh: true },
];

pub fn bieu_mac_dinh() -> Vec<&'static BieuXoa> {
    BIEU_XOA.iter().filter(|b| b.mac_dinh).collect()
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct DongDem {
    pub khoa: String,
    pub ten: String,
    #[serde(rename = "soDong")]
    pub so_dong: Option<usize>,
    pub loi: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct KetQuaXoa {
    pub khoa: String,
    pub ten: String,
    #[serde(rename = "daXoa")]
    pub da_xoa: usize,
    #[serde(rename = "conLai")]
    pub con_lai: Option<usize>,
    pub loi: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
struct Hang {
    id: String,
    version: u64,
}

fn thong_bao(e: StepError) -> String {
    match e {
        StepError::Retry(m) | StepError::Auth(m) | StepError::Fatal(m) => m,
    }
}

fn loi_quyen(m: &str) -> bool {
    m.contains("lỗi 401") || m.contains("lỗi 403")
}

/// 403 kèm "chỉ sửa trên ứng dụng máy tính": không phải lỗi cookie, diễn giải cho rõ (như vtvl_app).
pub fn dien_giai_loi_quyen(m: &str) -> String {
    let web = m.contains("lỗi 403") && ["ứng dụng máy tính", "chỉ có trên trang web", "webOnly"].iter().any(|k| m.contains(k));
    if web {
        "Cổng chặn xóa qua web, không phải do cookie hết hạn: tài khoản này chỉ được sửa/xóa dữ liệu kê khai trên ỨNG DỤNG MÁY TÍNH (desktop) của cổng kê khai VTVL. Hãy dùng ứng dụng máy tính để xóa, hoặc đề nghị đầu mối cấp quyền thao tác qua API nếu cần xóa hàng loạt.".into()
    } else {
        m.to_string()
    }
}

fn duong_bieu(sid: &str, form: &str) -> String {
    format!("/submissions/{sid}/forms/{form}")
}

fn an_toan(id: &str) -> bool {
    !id.is_empty() && id.len() <= 100 && id.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | '-'))
}

/// Đọc hết các dòng còn hiệu lực của một biểu (phân trang).
async fn doc_het_dong(sess: &Session, sid: &str, form: &str, nghi: Duration) -> Result<Vec<Hang>, String> {
    let mut rows = Vec::new();
    for trang in 1..=SO_TRANG_TOI_DA {
        let (p, s) = (trang.to_string(), CO_TRANG.to_string());
        let v = sess.get_json(&duong_bieu(sid, form), &[("page", &p), ("size", &s)]).await.map_err(thong_bao)?;
        let items = v.as_array().cloned().or_else(|| v["items"].as_array().cloned()).unwrap_or_default();
        let so_item = items.len();
        rows.extend(items.iter().filter(|x| x["deleted"].as_bool() != Some(true)).filter_map(|x| {
            let id = x["id"].as_str().map(str::to_string).or_else(|| x["id"].as_u64().map(|n| n.to_string()))?;
            Some(Hang { id, version: x["version"].as_u64().unwrap_or(0) })
        }));
        let tong = v["total"].as_u64().map(|t| t as usize);
        if so_item < CO_TRANG || tong.is_some_and(|t| trang * CO_TRANG >= t) {
            return Ok(rows);
        }
        tokio::time::sleep(nghi).await;
    }
    Err(format!("Biểu {form} có quá nhiều trang, dừng để tránh vòng lặp vô hạn"))
}

/// Đếm dòng từng biểu (không xóa gì). Lỗi quyền (401/403) dừng hẳn vì mọi biểu sau cũng lỗi.
pub async fn dem_dong(sess: &Session, sid: &str, bieu: &[&BieuXoa], nghi: Duration) -> Result<Vec<DongDem>, String> {
    if !an_toan(sid) {
        return Err("Mã hồ sơ không hợp lệ".into());
    }
    let mut out = Vec::new();
    for b in bieu {
        match doc_het_dong(sess, sid, b.khoa, nghi).await {
            Ok(r) => out.push(DongDem { khoa: b.khoa.into(), ten: b.ten.into(), so_dong: Some(r.len()), loi: None }),
            Err(e) if loi_quyen(&e) => return Err(dien_giai_loi_quyen(&e)),
            // vẫn bị giới hạn tần suất sau các lần thử lại: các biểu sau cũng sẽ lỗi, dừng và báo một lần
            Err(e) if e.contains("lỗi 429") => return Err(format!("{e} (đã đếm {}/{} biểu; chờ 1–2 phút rồi bấm Xem trước lại)", out.len(), bieu.len())),
            Err(e) => out.push(DongDem { khoa: b.khoa.into(), ten: b.ten.into(), so_dong: None, loi: Some(e) }),
        }
        tokio::time::sleep(nghi).await;
    }
    Ok(out)
}

/// Thay đổi `DELETE` cho mọi dòng của các biểu đã chọn, xếp theo thứ tự xóa (biểu sau trước). Thuần.
pub fn dung_thay_doi_xoa(anh: &AnhChup, bieu: &[&BieuXoa]) -> Vec<ThayDoiItem> {
    let mut out = Vec::new();
    for b in bieu {
        for r in anh.get(b.khoa).map(Vec::as_slice).unwrap_or(&[]) {
            out.push(ThayDoiItem {
                id: format!("xoa-{:06}", out.len() + 1),
                bieu: b.khoa.into(),
                dong_excel: None,
                khoa: r.row_id.clone(),
                loai: "bo".into(),
                row_id: Some(r.row_id.clone()),
                phien_ban_dong: r.version,
                truong: Truong::new(),
                truoc: None,
                trang_thai: "san_sang".into(),
            });
        }
    }
    out
}

/// Đối chiếu trước/sau theo biểu: đã xóa = số dòng giảm, còn lại = số dòng sau. Thuần.
pub fn ket_qua_xoa(truoc: &AnhChup, sau: &AnhChup, bieu: &[&BieuXoa]) -> Vec<KetQuaXoa> {
    let dem = |a: &AnhChup, k: &str| a.get(k).map_or(0, Vec::len);
    bieu.iter().map(|b| {
        let (t, s) = (dem(truoc, b.khoa), dem(sau, b.khoa));
        KetQuaXoa { khoa: b.khoa.into(), ten: b.ten.into(), da_xoa: t.saturating_sub(s), con_lai: Some(s), loi: None }
    }).collect()
}

pub struct ThamSoXoa<'a> {
    pub dir: &'a Path,
    pub period_id: &'a str,
    pub submission_id: &'a str,
    pub device_id: &'a str,
    pub toi_da: usize,
    pub nguoi: &'a str,
    pub cau_hinh: &'a CauHinhGui,
}

/// Ghi biên nhận đóng cho gói xóa để gói không bao giờ bị gửi lại ngầm qua nút Gửi lại (xóa là thao tác một lần, phải bấm lại trong hộp thoại).
fn dong_goi_xoa(dir: &Path, g: &goi::Goi, ly_do: &str) {
    if !goi::duong_bien_nhan(dir, g.id()).exists() {
        let _ = lo::ghi_json(&goi::duong_bien_nhan(dir, g.id()), &json!({"schema": lo::SCHEMA, "changesetId": g.id(), "ketThuc": true, "ketQua": ly_do}));
    }
}

/// Xóa các biểu đã chọn bằng gói thay đổi `DELETE` (như Desktop). Trả kết quả theo biểu sau khi tải lại ảnh chụp để đối chiếu.
pub async fn xoa_qua_goi(sess: &Session, p: &ThamSoXoa<'_>, bieu: &[&BieuXoa]) -> Result<Vec<KetQuaXoa>, String> {
    if !an_toan(p.submission_id) {
        return Err("Mã hồ sơ không hợp lệ".into());
    }
    let (wrap, hang) = may_chu::tai(sess, p.period_id, p.submission_id, p.dir).await?;
    let truoc = may_chu::chuan_hoa(&hang)?;
    let items = dung_thay_doi_xoa(&truoc, bieu);
    if items.is_empty() {
        return Ok(ket_qua_xoa(&truoc, &truoc, bieu));
    }
    let rv = wrap["ruleVersion"].as_str().unwrap_or("2026.1");
    let ctx = NguCanhGoi { submission_id: p.submission_id, device_id: p.device_id, rule_version: rv, sao_luu: None };
    let cac_goi = goi::dung_goi(p.dir, &ctx, &items, p.toi_da, |d| goi::chuyen_thanh_changes(d, "xoa-du-lieu"))?;
    let mut loi: Option<String> = None;
    let mut ly_do: Vec<(String, usize)> = Vec::new();
    for g in &cac_goi {
        let kq = match goi::gui_goi(sess, p.dir, g, p.nguoi, p.cau_hinh).await {
            Err(LoiGui::DoiKhoa) => match goi::doi_khoa(p.dir, g) {
                Ok(moi) => { let r = goi::gui_goi(sess, p.dir, &moi, p.nguoi, p.cau_hinh).await; dong_goi_xoa(p.dir, &moi, "loi"); r }
                Err(e) => Err(LoiGui::Khac(e)),
            },
            r => r,
        };
        dong_goi_xoa(p.dir, g, "loi");
        if let Ok(bn) = &kq {
            for m in bn["lyDoTuChoi"].as_array().into_iter().flatten() {
                ly_do.push((m["thongBao"].as_str().unwrap_or("").to_string(), m["so"].as_u64().unwrap_or(0) as usize));
            }
        }
        if let Err(e) = kq {
            loi = Some(match e { LoiGui::DoiKhoa => "khóa idempotency bị trùng".to_string(), LoiGui::Khac(m) => dien_giai_loi_quyen(&m) });
            break;
        }
    }
    for g in &cac_goi {
        dong_goi_xoa(p.dir, g, "huy_sau_xoa");
    }
    if let Some(m) = loi {
        return Err(m);
    }
    let (_, hang_sau) = may_chu::tai(sess, p.period_id, p.submission_id, p.dir).await?;
    let kq = ket_qua_xoa(&truoc, &may_chu::chuan_hoa(&hang_sau)?, bieu);
    if !ly_do.is_empty() && kq.iter().all(|k| k.da_xoa == 0) {
        let tb: Vec<String> = ly_do.iter().map(|(m, n)| format!("«{m}» ({n})")).collect();
        return Err(format!("Cổng từ chối xóa, không dòng nào bị xóa: {}", tb.join("; ")));
    }
    Ok(kq)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::thu_gia::{may_chu_gia, phien};

    fn hai<'a>() -> Vec<&'a BieuXoa> {
        BIEU_XOA.iter().filter(|b| b.khoa == "b1" || b.khoa == "a1").collect()
    }

    #[test]
    fn default_order_is_reverse_of_dependency_and_skips_aggregated_b2() {
        let d: Vec<&str> = bieu_mac_dinh().iter().map(|b| b.khoa).collect();
        assert_eq!(d, vec!["d2", "du_bao_5_nam", "d1", "c3", "c2", "b2_ct", "b1", "a2", "a1", "c1"]);
        assert!(!d.contains(&"b2_thaydoi"));
    }

    #[test]
    fn web_only_forbidden_is_explained_but_cookie_errors_are_not() {
        let m = "Cổng trả lỗi 403: tài khoản chỉ được sửa trên ứng dụng máy tính";
        assert!(dien_giai_loi_quyen(m).contains("ỨNG DỤNG MÁY TÍNH") && dien_giai_loi_quyen(m).contains("không phải do cookie"));
        assert_eq!(dien_giai_loi_quyen("Cổng trả lỗi 401 [X]: hết hạn"), "Cổng trả lỗi 401 [X]: hết hạn");
        assert!(loi_quyen(m) && !loi_quyen("Cổng trả lỗi 500: x"));
    }

    #[tokio::test]
    async fn counting_skips_deleted_rows_and_reports_per_form_errors() {
        let (addr, _) = may_chu_gia(vec![
            ("/auth/me".into(), 200, json!({})),
            ("/forms/b1".into(), 200, json!({"items": [{"id": "r1", "version": 2}, {"id": "r2", "version": 1, "deleted": true}, {"id": "r3", "version": 5}], "total": 3})),
            ("/forms/a1".into(), 500, json!({"code": "X", "userMessage": "lỗi tạm"})),
        ]).await;
        let kq = dem_dong(&phien(&addr).await, "s1", &hai(), Duration::from_millis(1)).await.unwrap();
        assert_eq!((kq[0].khoa.as_str(), kq[0].so_dong), ("b1", Some(2)));
        assert!(kq[1].so_dong.is_none() && kq[1].loi.as_deref().unwrap().contains("lỗi tạm"));
        assert!(dem_dong(&phien(&addr).await, "../x", &hai(), Duration::from_millis(1)).await.is_err());
    }

    fn hang(rows: &[(&str, u64)]) -> serde_json::Value {
        json!(rows.iter().map(|(id, v)| json!({"id": id, "version": v, "deleted": false, "data": {"A": id}})).collect::<Vec<_>>())
    }

    #[test]
    fn delete_changes_are_built_in_removal_order_with_row_versions() {
        let hang_json = json!({"a1": hang(&[("r1", 2)]), "b1": hang(&[("r2", 5), ("r3", 1)]), "d2": hang(&[("r4", 7)]), "b2_thaydoi": hang(&[("x", 1)])});
        let anh = crate::may_chu::chuan_hoa(&hang_json).unwrap();
        let ds = dung_thay_doi_xoa(&anh, &bieu_mac_dinh());
        let thu_tu: Vec<(&str, &str)> = ds.iter().map(|t| (t.bieu.as_str(), t.row_id.as_deref().unwrap())).collect();
        assert_eq!(thu_tu, vec![("d2", "r4"), ("b1", "r2"), ("b1", "r3"), ("a1", "r1")], "biểu sau trước, không đụng B2 tổng hợp");
        assert_eq!((ds[1].loai.as_str(), ds[1].phien_ban_dong, ds[1].truong.len()), ("bo", Some(5), 0));
        let kq = ket_qua_xoa(&anh, &crate::may_chu::chuan_hoa(&json!({"a1": hang(&[("r1", 2)]), "b1": [], "d2": []})).unwrap(), &bieu_mac_dinh());
        let b1 = kq.iter().find(|k| k.khoa == "b1").unwrap();
        assert_eq!((b1.da_xoa, b1.con_lai), (2, Some(0)));
        assert_eq!(kq.iter().find(|k| k.khoa == "a1").unwrap().da_xoa, 0);
    }

    fn kich_ban_xoa(sau_hang: serde_json::Value, buoc_gui: (u16, serde_json::Value)) -> crate::thu_gia::Kich {
        let boot = json!({"cursor": "c", "ruleVersion": "2026.1", "submissions": [{"submission": {"id": "s1", "version": 3}, "rowsFileId": "f1"}]});
        vec![
            ("/auth/me".into(), 200, json!({})),
            ("/sync/bootstrap".into(), 200, boot.clone()),
            ("/files/f1".into(), 200, json!({"a1": hang(&[("r1", 2)]), "b1": hang(&[("r2", 5), ("r3", 1)])})),
            ("/changesets".into(), buoc_gui.0, buoc_gui.1),
            ("/sync/bootstrap".into(), 200, boot),
            ("/files/f1".into(), 200, sau_hang),
        ]
    }

    #[tokio::test]
    async fn deletion_goes_through_changesets_like_desktop_and_is_verified_by_recount() {
        let (addr, ghi) = may_chu_gia(kich_ban_xoa(json!({"a1": [], "b1": []}), (200, json!({"results": [{"status": "ACCEPTED"}, {"status": "ACCEPTED"}, {"status": "ACCEPTED"}]})))).await;
        let dir = tempfile::tempdir().unwrap();
        lo::tao_thu_muc(dir.path()).unwrap();
        let ch = CauHinhGui { poll_dau_ms: 5, poll_toi_da_ms: 20, toi_da_cho: Duration::from_secs(5), lan_hang_doi_day: 1 };
        let p = ThamSoXoa { dir: dir.path(), period_id: "p1", submission_id: "s1", device_id: "dev-1", toi_da: 1000, nguoi: "Thành", cau_hinh: &ch };
        let kq = xoa_qua_goi(&phien(&addr).await, &p, &bieu_mac_dinh()).await.unwrap();
        assert_eq!((kq.iter().find(|k| k.khoa == "b1").unwrap().da_xoa, kq.iter().find(|k| k.khoa == "a1").unwrap().da_xoa), (2, 1));
        assert!(kq.iter().all(|k| k.con_lai == Some(0)));
        let reqs = ghi.0.lock().unwrap();
        assert!(!reqs.iter().any(|r| r.0 == "DELETE" || r.1.contains("bulk-delete")), "không gọi REST xóa bị cổng chặn");
        let post = reqs.iter().find(|r| r.0 == "POST").unwrap();
        let body: serde_json::Value = serde_json::from_slice(&crate::portal::gunzip_neu_can(&post.3).unwrap()).unwrap();
        let ops: Vec<(&str, &str, u64)> = body["changes"].as_array().unwrap().iter().map(|c| (c["op"].as_str().unwrap(), c["formKey"].as_str().unwrap(), c["baseVersion"].as_u64().unwrap())).collect();
        assert_eq!(ops, vec![("DELETE", "b1", 5), ("DELETE", "b1", 1), ("DELETE", "a1", 2)]);
        assert!(body["changes"][0]["source"].is_null() && body["changes"][0]["fields"].as_object().unwrap().is_empty());
        assert!(goi::goi_dang_do(dir.path()).unwrap().is_empty(), "gói xóa luôn được đóng, không gửi lại ngầm");
    }

    #[tokio::test]
    async fn every_change_rejected_is_reported_with_the_servers_reason() {
        let tu_choi = json!({"results": [{"status": "REJECTED", "userMessage": "Dữ liệu của đơn vị khác chỉ được xem, không sửa được."}, {"status": "REJECTED", "userMessage": "Dữ liệu của đơn vị khác chỉ được xem, không sửa được."}, {"status": "REJECTED", "userMessage": "Dữ liệu của đơn vị khác chỉ được xem, không sửa được."}]});
        let (addr, _) = may_chu_gia(kich_ban_xoa(json!({"a1": hang(&[("r1", 2)]), "b1": hang(&[("r2", 5), ("r3", 1)])}), (200, tu_choi))).await;
        let dir = tempfile::tempdir().unwrap();
        lo::tao_thu_muc(dir.path()).unwrap();
        let ch = CauHinhGui { poll_dau_ms: 5, poll_toi_da_ms: 20, toi_da_cho: Duration::from_secs(5), lan_hang_doi_day: 1 };
        let p = ThamSoXoa { dir: dir.path(), period_id: "p1", submission_id: "s1", device_id: "d", toi_da: 1000, nguoi: "x", cau_hinh: &ch };
        let e = xoa_qua_goi(&phien(&addr).await, &p, &bieu_mac_dinh()).await.unwrap_err();
        assert!(e.contains("không dòng nào bị xóa") && e.contains("chỉ được xem") && e.contains("(3)"));
    }

    #[tokio::test]
    async fn rejected_send_reports_error_and_still_closes_the_packages() {
        let (addr, _) = may_chu_gia(kich_ban_xoa(json!({}), (409, json!({"code": "SUBMISSION_LOCKED", "userMessage": "Hồ sơ đang khóa"})))).await;
        let dir = tempfile::tempdir().unwrap();
        lo::tao_thu_muc(dir.path()).unwrap();
        let ch = CauHinhGui { poll_dau_ms: 5, poll_toi_da_ms: 20, toi_da_cho: Duration::from_secs(5), lan_hang_doi_day: 1 };
        let p = ThamSoXoa { dir: dir.path(), period_id: "p1", submission_id: "s1", device_id: "dev-1", toi_da: 1000, nguoi: "x", cau_hinh: &ch };
        let e = xoa_qua_goi(&phien(&addr).await, &p, &bieu_mac_dinh()).await.unwrap_err();
        assert!(e.contains("SUBMISSION_LOCKED"));
        assert!(goi::goi_dang_do(dir.path()).unwrap().is_empty());
    }
}
