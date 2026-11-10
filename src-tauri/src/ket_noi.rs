//! Kiểm tra kết nối một đơn vị (chỉ đọc): cookie, `/auth/me`, quyền, ngữ cảnh hồ sơ, kỳ.
//! Kết quả ghi vào `ket-noi.json` và `tai-khoan.json` của thư mục tài khoản.

use crate::imports::{pick_context, Ctx};
use crate::lo::{self, Settings, UnitEntry, SCHEMA};
use crate::portal::{self, DangNhap, Session};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::Path;
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct BuocKiem {
    pub ten: String,
    pub ok: bool,
    #[serde(rename = "chiTiet")]
    pub chi_tiet: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Chan {
    pub ma: String,
    #[serde(rename = "thongBao")]
    pub thong_bao: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KetNoi {
    pub schema: u32,
    pub luc: String,
    #[serde(rename = "ketQua")]
    pub ket_qua: String,
    #[serde(rename = "cacBuoc")]
    pub cac_buoc: Vec<BuocKiem>,
    pub chan: Option<Chan>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Quyen {
    #[serde(rename = "vaiTro")]
    pub vai_tro: Vec<String>,
    pub actions: Vec<String>,
    pub duong: String,
    #[serde(rename = "lyDo")]
    pub ly_do: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct HoSo {
    pub id: String,
    #[serde(rename = "trangThai")]
    pub trang_thai: String,
    #[serde(rename = "phienBan")]
    pub phien_ban: u64,
    pub khoa: bool,
    #[serde(rename = "hanNop")]
    pub han_nop: Option<String>,
}

/// Một hồ sơ tài khoản thấy được (kiểu `SUBTREE` như Desktop): để chọn hồ sơ có biểu sửa được.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct HoSoTomTat {
    pub id: String,
    pub ten: String,
    #[serde(rename = "trangThai")]
    pub trang_thai: String,
    #[serde(rename = "phienBan")]
    pub phien_ban: u64,
    /// Số biểu `canEdit = true` (`None` nếu không đọc được tiến độ).
    #[serde(rename = "soBieuSua")]
    pub so_bieu_sua: Option<usize>,
}

/// Hồ sơ dùng: cấu hình đơn vị (`submissionId`) thắng, rồi hồ sơ người dùng đã chọn, rồi hồ sơ có nhiều biểu sửa được nhất (hòa thì hồ sơ đầu).
pub fn chon_ho_so(cac: &[HoSoTomTat], da_chon: Option<&str>, cau_hinh: Option<&str>) -> Option<String> {
    if let Some(c) = cau_hinh.filter(|c| !c.is_empty()) {
        return Some(c.to_string());
    }
    if let Some(d) = da_chon.filter(|d| cac.iter().any(|h| h.id == *d)) {
        return Some(d.to_string());
    }
    cac.iter().enumerate().max_by_key(|(i, h)| (h.so_bieu_sua.unwrap_or(0), std::cmp::Reverse(*i))).map(|(_, h)| h.id.clone())
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TaiKhoan {
    pub schema: u32,
    pub username: String,
    #[serde(rename = "hoTen")]
    pub ho_ten: String,
    #[serde(rename = "orgId")]
    pub org_id: String,
    #[serde(rename = "donVi")]
    pub don_vi: String,
    #[serde(rename = "kyId")]
    pub ky_id: String,
    pub ky: String,
    #[serde(rename = "hoSo")]
    pub ho_so: HoSo,
    pub quyen: Quyen,
    /// Biểu mà tài khoản được phân công sửa (từ `/submissions/{id}/progress`); rỗng nếu chưa đọc được.
    #[serde(default, rename = "bieuDuocSua")]
    pub bieu_duoc_sua: Vec<String>,
    /// Mọi hồ sơ tài khoản thấy được (để chọn); rỗng nếu chưa đọc.
    #[serde(default, rename = "hoSoCoThe")]
    pub ho_so_co_the: Vec<HoSoTomTat>,
    #[serde(rename = "docLuc")]
    pub doc_luc: String,
}

const MAX_HO_SO: usize = 30;

fn danh_sach(v: &Value) -> Vec<Value> {
    v.as_array().cloned().or_else(|| ["content", "items", "data", "result", "rows"].iter().find_map(|k| v[*k].as_array().cloned())).unwrap_or_default()
}

fn chan(ma: &str, tb: impl Into<String>) -> Chan {
    Chan { ma: ma.into(), thong_bao: tb.into() }
}

fn text(v: &Value, k: &str) -> String {
    v[k].as_str().unwrap_or("").to_string()
}

/// Đường đưa dữ liệu lên: `B` (gói thay đổi, cần create + update) là đường chính; `A` (nhập tệp qua cổng, cần import) chỉ khi không có quyền cho B.
pub fn duong_tu_actions(actions: &[String], ep: Option<&str>) -> Result<(&'static str, &'static str), Chan> {
    let has = |a: &str| actions.iter().any(|x| x == a);
    let thieu = |can: &str| Chan { ma: "THIEU_QUYEN".into(), thong_bao: format!("Cấu hình ép đường {}: {can} (quyền hiện có: {}).", ep.unwrap_or(""), actions.join(", ")) };
    match ep {
        Some("B") if !(has("create") && has("update")) => return Err(thieu("cần quyền create và update")),
        Some("A") if !has("import") => return Err(thieu("cần quyền import")),
        Some("A") => return Ok(("A", "Ép đường A (nhập tệp qua cổng, có quyền import)")),
        _ => {}
    }
    if has("create") && has("update") {
        Ok(("B", "Có create và update (gói thay đổi)"))
    } else if has("import") {
        Ok(("A", "Chỉ có import: đường nhập tệp qua cổng, chưa hỗ trợ gửi đồng bộ"))
    } else {
        Err(chan("THIEU_QUYEN", format!("Tài khoản không có quyền create/update (quyền hiện có: {}).", actions.join(", "))))
    }
}

/// Phân loại lỗi mở phiên để hiện thông báo đúng hướng xử lý. `desktop`: đăng nhập kênh Desktop (khác cookie dán tay).
pub fn ma_loi_ket_noi(msg: &str, desktop: bool) -> &'static str {
    if msg.contains("INVALID_CREDENTIALS") {
        "SAI_MAT_KHAU"
    } else if msg.contains("WAF") {
        "WAF"
    } else if msg.contains("Lỗi mạng") || msg.contains("Không kết nối được") {
        "MANG"
    } else if desktop {
        "DANG_NHAP"
    } else {
        "COOKIE_HET_HAN"
    }
}

/// Thuần: từ phản hồi `/auth/me`, `/periods`, `/submissions` dựng tài khoản và các bước kiểm tra, hoặc lý do chặn.
pub fn phan_tich(unit: &UnitEntry, me: &Value, periods: &Value, subs: &Value) -> Result<(TaiKhoan, Vec<BuocKiem>), Chan> {
    let mut buoc = vec![BuocKiem { ten: "auth_me".into(), ok: true, chi_tiet: "200".into() }];
    let actions: Vec<String> = me["actions"].as_array().map(|a| a.iter().filter_map(|x| x.as_str().map(str::to_string)).collect()).unwrap_or_default();
    let (duong, ly_do) = duong_tu_actions(&actions, unit.duong.as_deref())?;
    buoc.push(BuocKiem { ten: "quyen".into(), ok: true, chi_tiet: format!("đường {duong}") });

    let auto = pick_context(me, periods, subs);
    let ctx = Ctx {
        org_id: unit.org_id.clone().filter(|s| !s.is_empty()).unwrap_or(auto.org_id),
        period_id: unit.period_id.clone().filter(|s| !s.is_empty()).unwrap_or(auto.period_id),
        submission_id: unit.submission_id.clone().filter(|s| !s.is_empty()).unwrap_or(auto.submission_id),
    };
    // hồ sơ được chọn có thể thuộc đơn vị/kỳ khác hồ sơ đầu tiên: lấy đơn vị và kỳ theo chính hồ sơ đó (trừ khi cấu hình ép)
    let ctx = {
        let ds: Vec<Value> = subs.as_array().cloned().or_else(|| ["content", "items", "data", "result", "rows"].iter().find_map(|k| subs[*k].as_array().cloned())).unwrap_or_default();
        match ds.iter().find(|x| text(x, "id") == ctx.submission_id) {
            Some(h) => Ctx {
                org_id: unit.org_id.clone().filter(|x| !x.is_empty()).unwrap_or_else(|| { let o = text(&h["orgUnit"], "id"); if o.is_empty() { ctx.org_id.clone() } else { o } }),
                period_id: unit.period_id.clone().filter(|x| !x.is_empty()).unwrap_or_else(|| { let k = text(&h["period"], "id"); if k.is_empty() { ctx.period_id.clone() } else { k } }),
                ..ctx
            },
            None => ctx,
        }
    };
    let thieu: Vec<&str> = [(&ctx.org_id, "đơn vị"), (&ctx.period_id, "kỳ"), (&ctx.submission_id, "hồ sơ")].iter().filter(|(v, _)| v.is_empty()).map(|(_, n)| *n).collect();
    if !thieu.is_empty() {
        return Err(chan("NGU_CANH", format!("Chưa xác định được {}. Điền orgId/periodId/submissionId trong cấu hình đơn vị.", thieu.join(", "))));
    }

    let list = |v: &Value| -> Vec<Value> {
        v.as_array().cloned().or_else(|| ["content", "items", "data", "result", "rows"].iter().find_map(|k| v[*k].as_array().cloned())).unwrap_or_default()
    };
    let sub = list(subs).into_iter().find(|s| text(s, "id") == ctx.submission_id).unwrap_or(Value::Null);
    let period = list(periods).into_iter().find(|p| text(p, "id") == ctx.period_id).unwrap_or(Value::Null);
    if text(&period, "status").eq_ignore_ascii_case("CLOSED") {
        return Err(chan("KY_DONG", format!("Kỳ {} đã đóng.", text(&period, "name"))));
    }
    let trang_thai = text(&sub, "status");
    buoc.push(BuocKiem { ten: "ho_so".into(), ok: trang_thai.eq_ignore_ascii_case("DRAFT"), chi_tiet: format!("trạng thái {}", if trang_thai.is_empty() { "không rõ" } else { &trang_thai }) });
    buoc.push(BuocKiem { ten: "ky".into(), ok: true, chi_tiet: text(&period, "name") });

    let acc = TaiKhoan {
        schema: SCHEMA,
        username: unit.username.clone(),
        ho_ten: text(&me["user"], "fullName"),
        org_id: ctx.org_id,
        don_vi: text(&me["orgUnits"][0], "name"),
        ky_id: ctx.period_id,
        ky: text(&period, "name"),
        ho_so: HoSo { id: ctx.submission_id, trang_thai, phien_ban: sub["version"].as_u64().unwrap_or(0), khoa: false, han_nop: sub["dueDate"].as_str().map(str::to_string) },
        quyen: Quyen {
            vai_tro: me["roles"].as_array().map(|r| r.iter().filter_map(|x| x["role"].as_str().map(str::to_string)).collect()).unwrap_or_default(),
            actions,
            duong: duong.into(),
            ly_do: ly_do.into(),
        },
        bieu_duoc_sua: Vec::new(),
        ho_so_co_the: Vec::new(),
        doc_luc: lo::bay_gio(),
    };
    Ok((acc, buoc))
}

/// Từ `/submissions/{id}/progress`: các biểu tài khoản được SỬA (`canEdit == true`).
/// Đã kiểm chứng bằng gửi thật (10/11/2026): với `canEdit = false` cổng nhận gói (202) nhưng từ chối từng thay đổi
/// (`REJECTED`: "Dữ liệu của đơn vị khác chỉ được xem, không sửa được."). Nên không biểu nào sửa được thì chặn trước khi gửi.
/// (Desktop chỉ lọc `view` ở máy khách, nhưng máy chủ vẫn từ chối.)
pub fn phan_cong(progress: &Value) -> Result<(Vec<String>, BuocKiem), Chan> {
    let Some(forms) = progress["forms"].as_array() else {
        return Ok((Vec::new(), BuocKiem { ten: "phan_cong".into(), ok: true, chi_tiet: "không đọc được danh sách biểu, bỏ qua".into() }));
    };
    let sua: Vec<String> = forms.iter().filter(|f| f["canEdit"].as_bool() == Some(true)).filter_map(|f| f["formKey"].as_str().map(str::to_string)).collect();
    if sua.is_empty() {
        let xem = forms.iter().filter(|f| f["assigned"].as_bool() == Some(true) || f["canView"].as_bool() == Some(true)).count();
        return Err(chan("CHUA_PHAN_CONG", format!("Tài khoản chỉ xem được {xem}/{} biểu, không có quyền Sửa biểu nào (canEdit = false). Cổng sẽ từ chối mọi thay đổi: \"Dữ liệu của đơn vị khác chỉ được xem, không sửa được.\" Đề nghị quản trị đơn vị phân công quyền Sửa cho tài khoản.", forms.len())));
    }
    Ok((sua.clone(), BuocKiem { ten: "phan_cong".into(), ok: true, chi_tiet: format!("được sửa {}/{} biểu", sua.len(), forms.len()) }))
}

fn ket_qua_tu(buoc: &[BuocKiem], chan: &Option<Chan>) -> &'static str {
    if chan.is_some() { "chan" } else if buoc.iter().all(|b| b.ok) { "ok" } else { "canh_bao" }
}

/// Đơn vị và kỳ để tạo hồ sơ: cấu hình ép thì theo cấu hình; không thì kỳ mặc định của tài khoản nếu có trong danh sách kỳ, còn không lấy kỳ đang mở (OPEN) đầu tiên.
fn ky_de_tao(unit: &UnitEntry, me: &Value, periods: &Value) -> Option<(String, String)> {
    let org = unit.org_id.clone().filter(|x| !x.is_empty()).unwrap_or_else(|| text(&me["orgUnits"][0], "id"));
    let ds = danh_sach(periods);
    let mac_dinh = text(me, "defaultPeriodId");
    let ky = unit.period_id.clone().filter(|x| !x.is_empty())
        .or_else(|| ds.iter().find(|p| text(p, "id") == mac_dinh).map(|p| text(p, "id")))
        .or_else(|| ds.iter().find(|p| text(p, "status").eq_ignore_ascii_case("OPEN")).map(|p| text(p, "id")))?;
    if org.is_empty() || ky.is_empty() { None } else { Some((org, ky)) }
}

/// Kiểm tra kết nối một đơn vị. Chỉ đọc, trừ khi đơn vị chưa có hồ sơ nào thì tự tạo một hồ sơ (như nút "Tạo hồ sơ" của Desktop). Ghi `ket-noi.json` (và `tai-khoan.json` khi đủ thông tin).
pub async fn kiem_tra(unit: &UnitEntry, base: &str, settings: &Settings, dn: &DangNhap<'_>, dir: &Path) -> KetNoi {
    let da_chon = lo::ho_so_da_chon(dir);
    let kq = chay(unit, base, settings, dn, da_chon.as_deref()).await;
    let (ket_noi, tai_khoan) = match kq {
        Ok((acc, buoc)) => (KetNoi { schema: SCHEMA, luc: lo::bay_gio(), ket_qua: ket_qua_tu(&buoc, &None).into(), cac_buoc: buoc, chan: None }, Some(acc)),
        Err((buoc, c)) => (KetNoi { schema: SCHEMA, luc: lo::bay_gio(), ket_qua: "chan".into(), cac_buoc: buoc, chan: Some(c) }, None),
    };
    let _ = lo::ghi_json(&dir.join("ket-noi.json"), &ket_noi);
    if let Some(a) = tai_khoan {
        let _ = lo::ghi_json(&dir.join("tai-khoan.json"), &a);
    }
    ket_noi
}

async fn chay(unit: &UnitEntry, base: &str, s: &Settings, dn: &DangNhap<'_>, da_chon: Option<&str>) -> Result<(TaiKhoan, Vec<BuocKiem>), (Vec<BuocKiem>, Chan)> {
    let fail = |buoc: &[BuocKiem], ten: &str, c: Chan| { let mut b = buoc.to_vec(); b.push(BuocKiem { ten: ten.into(), ok: false, chi_tiet: c.thong_bao.clone() }); (b, c) };
    let desktop = matches!(dn, DangNhap::Desktop { .. });
    let (ten_buoc, ok_buoc) = if desktop { ("dang_nhap", "đăng nhập kênh Desktop (token Bearer)") } else { ("cookie", "phiên cookie web còn hiệu lực (chỉ xem)") };
    if let DangNhap::Cookie(c) = dn {
        if c.trim().is_empty() {
            return Err(fail(&[], "cookie", chan("COOKIE_THIEU", "Chưa có cookie hoặc password cho tài khoản này.")));
        }
    }
    let sess: Session = portal::mo_phien(base, dn, Duration::from_secs(s.timeout_sec)).await.map_err(|e| fail(&[], ten_buoc, chan(ma_loi_ket_noi(&e, desktop), e)))?;
    let dau = vec![BuocKiem { ten: ten_buoc.into(), ok: true, chi_tiet: ok_buoc.into() }];
    let nghi = || tokio::time::sleep(Duration::from_millis(s.request_interval_ms));
    let loi_api = |e: portal::StepError| match e {
        portal::StepError::Auth(m) => chan(if desktop { "DANG_NHAP" } else { "COOKIE_HET_HAN" }, m),
        portal::StepError::Retry(m) => chan("MANG", m),
        portal::StepError::Fatal(m) => chan("API", m),
    };
    let me = sess.get_json("/auth/me", &[]).await.map_err(|e| fail(&dau, "auth_me", loi_api(e)))?;
    nghi().await;
    let periods = sess.get_json("/periods", &[]).await.unwrap_or(Value::Null);
    nghi().await;
    let ky = unit.period_id.clone().filter(|k| !k.is_empty()).unwrap_or_else(|| text(&me, "defaultPeriodId"));
    // như Desktop: liệt kê hồ sơ cả cây đơn vị (`scope=SUBTREE`) của kỳ; không được thì dùng danh sách mặc định
    let subs = match sess.get_json("/submissions", &[("periodId", &ky), ("scope", "SUBTREE"), ("size", "500")]).await {
        Ok(v) if !danh_sach(&v).is_empty() => v,
        _ => sess.get_json("/submissions", &[]).await.unwrap_or(Value::Null),
    };
    // chưa có hồ sơ nào: tự tạo như nút "Tạo hồ sơ" của ứng dụng Desktop (POST /submissions, nạp dữ liệu kế thừa)
    let subs = if danh_sach(&subs).is_empty() && unit.submission_id.as_deref().unwrap_or("").is_empty() {
        match ky_de_tao(unit, &me, &periods) {
            Some((org, ky_tao)) => {
                let body = serde_json::to_vec(&serde_json::json!({"orgId": org, "periodId": ky_tao, "inherit": true})).unwrap_or_default();
                if let Err(e) = sess.post_json("/submissions", body, false, &[]).await {
                    return Err(fail(&dau, "tao_ho_so", loi_api(e)));
                }
                nghi().await;
                sess.get_json("/submissions", &[("periodId", &ky_tao), ("scope", "SUBTREE"), ("size", "500")]).await.unwrap_or(Value::Null)
            }
            None => subs,
        }
    } else {
        subs
    };
    // quyền sửa từng hồ sơ (tiến độ từng hồ sơ) để chọn hồ sơ có biểu sửa được
    let mut cac: Vec<HoSoTomTat> = Vec::new();
    let mut tien_do_theo: std::collections::HashMap<String, Value> = std::collections::HashMap::new();
    for h in danh_sach(&subs).iter().take(MAX_HO_SO) {
        let id = text(h, "id");
        if id.is_empty() {
            continue;
        }
        nghi().await;
        let pr = sess.get_json(&format!("/submissions/{id}/progress"), &[]).await.unwrap_or(Value::Null);
        let so_sua = pr["forms"].as_array().map(|f| f.iter().filter(|x| x["canEdit"].as_bool() == Some(true)).count());
        cac.push(HoSoTomTat { id: id.clone(), ten: text(&h["orgUnit"], "name"), trang_thai: text(h, "status"), phien_ban: h["version"].as_u64().unwrap_or(0), so_bieu_sua: so_sua });
        tien_do_theo.insert(id, pr);
    }
    let chon = chon_ho_so(&cac, da_chon, unit.submission_id.as_deref());
    let unit2 = UnitEntry { submission_id: chon, ..unit.clone() };
    let (mut acc, mut buoc) = phan_tich(&unit2, &me, &periods, &subs).map_err(|c| fail(&dau, "ngu_canh", c))?;
    let tien_do = match tien_do_theo.remove(&acc.ho_so.id) {
        Some(v) => v,
        None => sess.get_json(&format!("/submissions/{}/progress", acc.ho_so.id), &[]).await.unwrap_or(Value::Null),
    };
    let (sua, b_pc) = phan_cong(&tien_do).map_err(|c| { let mut b = dau.clone(); b.extend(buoc.clone()); fail(&b, "phan_cong", c) })?;
    acc.bieu_duoc_sua = sua;
    acc.ho_so_co_the = cac;
    buoc.push(b_pc);
    let mut tat_ca = dau;
    tat_ca.append(&mut buoc);
    Ok((acc, tat_ca))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn unit() -> UnitEntry {
        serde_json::from_value(json!({"username": "u", "excelFile": "nguon/a.xlsx"})).unwrap()
    }
    fn me(actions: Value) -> Value {
        json!({"user": {"fullName": "Sở Du lịch"}, "roles": [{"role": "UNIT_ENTRY"}], "orgUnits": [{"id": "o1", "name": "Sở Du lịch"}], "actions": actions, "defaultPeriodId": "p1"})
    }
    fn periods() -> Value { json!({"items": [{"id": "p1", "name": "Kỳ 2025-2026", "status": "OPEN"}]}) }
    fn subs(status: &str) -> Value { json!([{"id": "s1", "status": status, "version": 3194, "dueDate": "2026-11-15", "orgUnit": {"id": "o1"}, "period": {"id": "p1"}}]) }

    #[test]
    fn ky_de_tao_uu_tien_cau_hinh_roi_ky_mac_dinh_roi_ky_dang_mo() {
        let ky = json!([{"id": "k1", "status": "CLOSED"}, {"id": "k2", "status": "OPEN"}]);
        let me_mac_dinh_la = |k: &str| json!({"orgUnits": [{"id": "o1"}], "defaultPeriodId": k});
        assert_eq!(ky_de_tao(&unit(), &me_mac_dinh_la("khong-co"), &ky), Some(("o1".into(), "k2".into())), "kỳ mặc định không có trong danh sách thì lấy kỳ đang mở");
        assert_eq!(ky_de_tao(&unit(), &me_mac_dinh_la("k1"), &ky), Some(("o1".into(), "k1".into())));
        let ep: UnitEntry = serde_json::from_value(json!({"username": "u", "excelFile": "a.xlsx", "periodId": "kx", "orgId": "ox"})).unwrap();
        assert_eq!(ky_de_tao(&ep, &me_mac_dinh_la("k1"), &ky), Some(("ox".into(), "kx".into())));
        assert_eq!(ky_de_tao(&unit(), &json!({}), &json!([])), None);
    }

    #[test]
    fn path_b_is_chosen_for_create_and_update_without_import() {
        let a: Vec<String> = ["read", "create", "update", "validate", "submit"].iter().map(|s| s.to_string()).collect();
        assert_eq!(duong_tu_actions(&a, None).unwrap().0, "B");
        let only_import: Vec<String> = vec!["import".into()];
        assert_eq!(duong_tu_actions(&only_import, None).unwrap().0, "A");
        let none: Vec<String> = vec!["read".into()];
        assert_eq!(duong_tu_actions(&none, None).unwrap_err().ma, "THIEU_QUYEN");
    }

    #[test]
    fn submission_choice_prefers_config_then_user_then_most_editable() {
        let h = |id: &str, n: Option<usize>| HoSoTomTat { id: id.into(), ten: id.into(), trang_thai: "DRAFT".into(), phien_ban: 1, so_bieu_sua: n };
        let cac = vec![h("a", Some(0)), h("b", Some(5)), h("c", Some(5)), h("d", None)];
        assert_eq!(chon_ho_so(&cac, None, None).as_deref(), Some("b"), "nhiều biểu sửa nhất, hòa thì đứng trước");
        assert_eq!(chon_ho_so(&cac, Some("a"), None).as_deref(), Some("a"), "người dùng đã chọn");
        assert_eq!(chon_ho_so(&cac, Some("không-có"), None).as_deref(), Some("b"), "lựa chọn cũ không còn thì chọn lại tự động");
        assert_eq!(chon_ho_so(&cac, Some("a"), Some("d")).as_deref(), Some("d"), "cấu hình đơn vị thắng");
        assert_eq!(chon_ho_so(&[], None, None), None);
    }

    #[test]
    fn chosen_submission_sets_its_own_unit_and_period() {
        let u: UnitEntry = serde_json::from_value(json!({"username": "u", "excelFile": "x", "submissionId": "s2"})).unwrap();
        let subs = json!([
            {"id": "s1", "status": "DRAFT", "version": 1, "orgUnit": {"id": "o1", "name": "Sở"}, "period": {"id": "p1"}},
            {"id": "s2", "status": "DRAFT", "version": 9, "orgUnit": {"id": "o2", "name": "Phòng"}, "period": {"id": "p1"}},
        ]);
        let (acc, _) = phan_tich(&u, &me(json!(["create", "update"])), &periods(), &subs).unwrap();
        assert_eq!((acc.ho_so.id.as_str(), acc.org_id.as_str(), acc.ho_so.phien_ban), ("s2", "o2", 9));
    }

    #[test]
    fn forced_path_requires_matching_permissions() {
        let both: Vec<String> = ["create", "update", "import"].iter().map(|s| s.to_string()).collect();
        assert_eq!(duong_tu_actions(&both, None).unwrap().0, "B");
        assert_eq!(duong_tu_actions(&both, Some("A")).unwrap().0, "A");
        let only_b: Vec<String> = ["create", "update"].iter().map(|s| s.to_string()).collect();
        assert_eq!(duong_tu_actions(&only_b, Some("A")).unwrap_err().ma, "THIEU_QUYEN");
        let only_a: Vec<String> = vec!["import".into()];
        assert_eq!(duong_tu_actions(&only_a, Some("B")).unwrap_err().ma, "THIEU_QUYEN");
    }

    #[test]
    fn assignment_requires_edit_permission_as_the_server_enforces_it() {
        let chi_xem = json!({"forms": [{"formKey": "a1", "assigned": true, "canView": true, "canEdit": false}, {"formKey": "b1", "assigned": true, "canView": true, "canEdit": false}]});
        let e = phan_cong(&chi_xem).unwrap_err();
        assert_eq!(e.ma, "CHUA_PHAN_CONG");
        assert!(e.thong_bao.contains("chỉ xem được 2/2 biểu") && e.thong_bao.contains("đơn vị khác chỉ được xem"));
        let mot = json!({"forms": [{"formKey": "a1", "canEdit": true}, {"formKey": "b1", "canEdit": false}]});
        let (sua, b) = phan_cong(&mot).unwrap();
        assert_eq!((sua, b.chi_tiet.as_str()), (vec!["a1".to_string()], "được sửa 1/2 biểu"));
        assert!(phan_cong(&Value::Null).unwrap().0.is_empty(), "không đọc được thì không chặn");
    }

    #[test]
    fn analysis_builds_account_and_flags_non_draft() {
        let (acc, buoc) = phan_tich(&unit(), &me(json!(["read", "create", "update"])), &periods(), &subs("DRAFT")).unwrap();
        assert_eq!((acc.quyen.duong.as_str(), acc.ho_so.id.as_str(), acc.ho_so.phien_ban), ("B", "s1", 3194));
        assert!(buoc.iter().all(|b| b.ok));
        let (_, buoc2) = phan_tich(&unit(), &me(json!(["create", "update"])), &periods(), &subs("SUBMITTED")).unwrap();
        assert!(buoc2.iter().any(|b| b.ten == "ho_so" && !b.ok));
        assert_eq!(ket_qua_tu(&buoc2, &None), "canh_bao");
    }

    #[test]
    fn closed_period_and_missing_context_block() {
        let closed = json!({"items": [{"id": "p1", "name": "Kỳ", "status": "CLOSED"}]});
        assert_eq!(phan_tich(&unit(), &me(json!(["create", "update"])), &closed, &subs("DRAFT")).unwrap_err().ma, "KY_DONG");
        assert_eq!(phan_tich(&unit(), &me(json!(["create", "update"])), &periods(), &json!([])).unwrap_err().ma, "NGU_CANH");
    }

    #[test]
    fn connection_errors_are_classified() {
        assert_eq!(ma_loi_ket_noi("Cookie đã hết hạn", false), "COOKIE_HET_HAN");
        assert_eq!(ma_loi_ket_noi("Lỗi mạng: x", false), "MANG");
        assert_eq!(ma_loi_ket_noi("trang thử thách chống truy cập tự động (WAF)", false), "WAF");
        assert_eq!(ma_loi_ket_noi("Cổng trả lỗi 401 [INVALID_CREDENTIALS]: sai", true), "SAI_MAT_KHAU");
        assert_eq!(ma_loi_ket_noi("Cổng trả lỗi 500: x", true), "DANG_NHAP");
    }

    #[tokio::test]
    async fn desktop_login_reads_permissions_with_bearer_and_picks_the_editable_submission() {
        use crate::thu_gia::may_chu_gia;
        let me_json = me(json!(["read", "create", "update", "import"]));
        let (addr, ghi) = may_chu_gia(vec![
            ("/auth/desktop/login".into(), 200, json!({"accessToken": "TOKEN-A", "refreshToken": "R", "expiresIn": 900, "refreshExpiresIn": 3600})),
            ("/auth/me".into(), 200, me_json),
            ("/periods".into(), 200, periods()),
            ("/submissions".into(), 200, json!([
                {"id": "s1", "status": "DRAFT", "version": 1, "orgUnit": {"id": "o1", "name": "Sở"}, "period": {"id": "p1"}},
                {"id": "s2", "status": "DRAFT", "version": 4, "orgUnit": {"id": "o2", "name": "Phòng"}, "period": {"id": "p1"}},
            ])),
            ("/submissions/s1/progress".into(), 200, json!({"forms": [{"formKey": "a1", "assigned": true, "canView": true, "canEdit": false}]})),
            ("/submissions/s2/progress".into(), 200, json!({"forms": [{"formKey": "a1", "assigned": true, "canView": true, "canEdit": true}, {"formKey": "b1", "assigned": true, "canView": true, "canEdit": true}]})),
        ]).await;
        let tb = portal::ThietBi { id: "dev-1".into(), ten: "VTVL Batch".into(), phien_ban: "1.2.8".into(), nen_tang: "macos".into() };
        let dir = tempfile::tempdir().unwrap();
        let dn = DangNhap::Desktop { username: "u", password: "p", thiet_bi: &tb };
        let k = kiem_tra(&unit(), &addr, &Settings::default(), &dn, dir.path()).await;
        assert!(k.chan.is_none(), "{:?}", k.chan);
        let tk: TaiKhoan = lo::doc_json(&dir.path().join("tai-khoan.json")).unwrap();
        assert_eq!((tk.ho_so.id.as_str(), tk.org_id.as_str(), tk.bieu_duoc_sua.clone()), ("s2", "o2", vec!["a1".to_string(), "b1".to_string()]));
        assert_eq!(tk.ho_so_co_the.iter().map(|h| h.so_bieu_sua).collect::<Vec<_>>(), vec![Some(0), Some(2)]);
        let reqs = ghi.0.lock().unwrap();
        let login = reqs.iter().find(|r| r.1.ends_with("/auth/desktop/login")).unwrap();
        assert_eq!(login.2.iter().find(|(k, _)| k == "x-device-id").map(|(_, v)| v.as_str()), Some("dev-1"));
        let me_req = reqs.iter().find(|r| r.1.ends_with("/auth/me")).unwrap();
        assert_eq!(me_req.2.iter().find(|(k, _)| k == "authorization").map(|(_, v)| v.as_str()), Some("Bearer TOKEN-A"));
        assert!(reqs.iter().all(|r| !r.2.iter().any(|(k, _)| k == "x-xsrf-token")), "kênh Desktop không dùng XSRF/cookie");
    }

    /// Thử thật (chỉ đọc): `VTVL_TEST_USER=… VTVL_TEST_PASS=… cargo test ket_noi_that -- --ignored --nocapture`.
    #[tokio::test]
    #[ignore = "cần cổng thật và tài khoản trong biến môi trường"]
    async fn ket_noi_that() {
        let (Ok(u), Ok(p)) = (std::env::var("VTVL_TEST_USER"), std::env::var("VTVL_TEST_PASS")) else { panic!("thiếu VTVL_TEST_USER/VTVL_TEST_PASS") };
        let unit: UnitEntry = serde_json::from_value(json!({"username": u, "excelFile": "x"})).unwrap();
        let tb = portal::ThietBi { id: "33333333-4444-4555-8666-777777777777".into(), ten: "VTVL Batch".into(), phien_ban: "1.2.8".into(), nen_tang: "macos".into() };
        let dir = tempfile::tempdir().unwrap();
        let k = kiem_tra(&unit, "https://kekhaivtvl.dcs.vn", &Settings::default(), &DangNhap::Desktop { username: &u, password: &p, thiet_bi: &tb }, dir.path()).await;
        println!("ket_qua={} chan={:?}", k.ket_qua, k.chan);
        for b in &k.cac_buoc { println!("  {} ok={} {}", b.ten, b.ok, b.chi_tiet); }
        let tk: TaiKhoan = lo::doc_json(&dir.path().join("tai-khoan.json")).unwrap();
        println!("duong={} hoso={} bieu_sua={:?} quyen={:?}", tk.quyen.duong, tk.ho_so.id, tk.bieu_duoc_sua, tk.quyen.actions);
        assert!(k.chan.is_none() && !tk.bieu_duoc_sua.is_empty());
    }

    #[tokio::test]
    async fn wrong_password_is_reported_as_such() {
        use crate::thu_gia::may_chu_gia;
        let (addr, _) = may_chu_gia(vec![("/auth/desktop/login".into(), 401, json!({"code": "INVALID_CREDENTIALS", "userMessage": "Tên đăng nhập hoặc mật khẩu không đúng."}))]).await;
        let tb = portal::ThietBi { id: "d".into(), ten: "n".into(), phien_ban: "1".into(), nen_tang: "x".into() };
        let dir = tempfile::tempdir().unwrap();
        let k = kiem_tra(&unit(), &addr, &Settings::default(), &DangNhap::Desktop { username: "u", password: "sai", thiet_bi: &tb }, dir.path()).await;
        assert_eq!(k.chan.as_ref().unwrap().ma, "SAI_MAT_KHAU");
        assert!(k.chan.unwrap().thong_bao.contains("không đúng"));
    }

    #[tokio::test]
    async fn empty_cookie_blocks_without_network() {
        let dir = tempfile::tempdir().unwrap();
        let k = kiem_tra(&unit(), "http://127.0.0.1:1", &Settings::default(), &DangNhap::Cookie("  "), dir.path()).await;
        assert_eq!(k.chan.as_ref().unwrap().ma, "COOKIE_THIEU");
        assert!(dir.path().join("ket-noi.json").exists());
        assert!(!dir.path().join("tai-khoan.json").exists());
    }
}
