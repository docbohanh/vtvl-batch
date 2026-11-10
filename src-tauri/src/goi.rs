//! Gói thay đổi (đường B): dựng, lưu bất biến, gửi và theo dõi kết quả.
//!
//! Định dạng theo bản 1.2.8 (`runtime-*.js`: `gopThayDoi`, `guiLo`, `submitChangeset`, `choKetQuaLo`):
//! `POST /submissions/{id}/changesets` (gzip, `Idempotency-Key`=changesetId, `Prefer: respond-async`) với thân
//! `{changesetId, deviceId, ruleVersion, hasMore?, changes[{changeId, formKey, rowId, clientRowId, op, baseVersion, fields, changedAt, source}]}`;
//! phản hồi `202 {taskId, status, receivedChanges}` rồi theo dõi `GET /submissions/{id}/changeset-tasks/{taskId}`, hoặc `200 {results[]}`.
//! `fields` khóa theo chữ cột (như `data` của dòng máy chủ). **Chưa kiểm chứng với cổng thật**: chạy qua chế độ khô cho tới khi bật `choPhepGuiThat`.

use crate::lo::{self, SuKien};
use crate::portal::Session;
use crate::thay_doi::ThayDoiItem;
use flate2::write::GzEncoder;
use flate2::Compression;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::Write;
use std::path::Path;
use std::time::{Duration, Instant};

/// Thứ tự biểu khi nhập (giống Desktop): biểu nền trước, biểu phụ thuộc sau.
const THU_TU_BIEU: [&str; 10] = ["c1", "a1", "a2", "b1", "b2_ct", "c2", "c3", "d1", "du_bao_5_nam", "d2"];

/// Thứ hạng khi xóa: xóa biểu con trước, biểu cha sau (`de` của cổng: a2=2, a1 và c1=3, còn lại 1).
fn hang_xoa(form: &str) -> u8 {
    match form {
        "a2" => 2,
        "a1" | "c1" => 3,
        _ => 1,
    }
}

fn vi_tri_bieu(form: &str) -> usize {
    THU_TU_BIEU.iter().position(|f| *f == form).unwrap_or(THU_TU_BIEU.len())
}

/// Tạo/sửa theo thứ tự biểu rồi thứ tự gốc; xóa xếp sau cùng theo thứ hạng.
pub fn sap_xep(thay_doi: &[ThayDoiItem]) -> Vec<&ThayDoiItem> {
    let mut v: Vec<(usize, &ThayDoiItem)> = thay_doi.iter().enumerate().collect();
    v.sort_by_key(|(i, t)| if t.loai == "bo" { (1u8, hang_xoa(&t.bieu) as usize, *i) } else { (0u8, vi_tri_bieu(&t.bieu), *i) });
    v.into_iter().map(|(_, t)| t).collect()
}

/// Đổi thay đổi của ứng dụng sang `change` của cổng.
pub fn chuyen_thanh_changes(thay_doi: &[ThayDoiItem], import_id: &str) -> Result<Vec<Value>, String> {
    let luc = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string();
    let source = json!({"kind": "IMPORT", "importId": import_id});
    thay_doi.iter().map(|t| {
        let fields = serde_json::to_value(&t.truong).map_err(|e| e.to_string())?;
        let can_row = || t.row_id.clone().ok_or_else(|| format!("{} dòng {:?}: thiếu rowId của máy chủ", t.bieu, t.dong_excel));
        let (row_id, client_row_id, op, base, fields) = match t.loai.as_str() {
            "tao" => {
                let id = uuid::Uuid::now_v7().to_string();
                (json!(id), json!(id), "CREATE", Value::Null, fields)
            }
            "sua" => (json!(can_row()?), Value::Null, "UPDATE", json!(t.phien_ban_dong), fields),
            "bo" => (json!(can_row()?), Value::Null, "DELETE", json!(t.phien_ban_dong), json!({})),
            khac => return Err(format!("Loại thay đổi không hợp lệ: {khac}")),
        };
        // Desktop: xóa do người dùng thao tác có `source = null`; chỉ nhập từ Excel mới có `{kind: IMPORT}`
        let nguon = if op == "DELETE" { Value::Null } else { source.clone() };
        Ok(json!({"changeId": uuid::Uuid::new_v4().to_string(), "formKey": t.bieu, "rowId": row_id, "clientRowId": client_row_id, "op": op, "baseVersion": base, "fields": fields, "changedAt": luc, "source": nguon}))
    }).collect()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UngDung {
    #[serde(rename = "tuThayDoi")]
    pub tu_thay_doi: Vec<String>,
    #[serde(rename = "dungLuc")]
    pub dung_luc: String,
    #[serde(rename = "saoLuu")]
    pub sao_luu: Option<String>,
    #[serde(rename = "thuTu")]
    pub thu_tu: usize,
    /// Gói này thay cho gói cũ vì cổng báo khóa idempotency đã dùng với nội dung khác.
    #[serde(default, rename = "thayKhoaTu", skip_serializing_if = "Option::is_none")]
    pub thay_khoa_tu: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Goi {
    pub schema: u32,
    #[serde(rename = "ungDung")]
    pub ung_dung: UngDung,
    /// Đúng thứ gửi cho cổng.
    pub body: Value,
    pub gui: Value,
}

impl Goi {
    pub fn id(&self) -> &str {
        self.body["changesetId"].as_str().unwrap_or("")
    }
    pub fn so_thay_doi(&self) -> usize {
        self.body["changes"].as_array().map_or(0, Vec::len)
    }
}

pub fn duong_goi(dir: &Path, changeset_id: &str) -> std::path::PathBuf {
    dir.join("thay-doi").join("goi").join(format!("{changeset_id}.json"))
}

pub fn duong_bien_nhan(dir: &Path, changeset_id: &str) -> std::path::PathBuf {
    dir.join("thay-doi").join("goi").join(format!("{changeset_id}.bien-nhan.json"))
}

pub struct NguCanhGoi<'a> {
    pub submission_id: &'a str,
    pub device_id: &'a str,
    pub rule_version: &'a str,
    pub sao_luu: Option<&'a str>,
}

fn mot_goi(ctx: &NguCanhGoi, changes: Vec<Value>, tu: &[&ThayDoiItem], thu_tu: usize, con_nua: bool, thay_khoa_tu: Option<String>) -> Goi {
    let id = format!("cs-{}", uuid::Uuid::new_v4());
    let mut body = json!({"changesetId": id, "deviceId": ctx.device_id, "ruleVersion": ctx.rule_version, "changes": changes});
    if con_nua {
        body["hasMore"] = json!(true);
    }
    Goi {
        schema: lo::SCHEMA,
        ung_dung: UngDung { tu_thay_doi: tu.iter().map(|t| t.id.clone()).collect(), dung_luc: lo::bay_gio(), sao_luu: ctx.sao_luu.map(str::to_string), thu_tu, thay_khoa_tu },
        body,
        gui: json!({"diaChi": format!("/submissions/{}/changesets", ctx.submission_id), "tieuDe": {"Idempotency-Key": id, "Prefer": "respond-async"}, "gzip": true}),
    }
}

/// Chia thay đổi (đã sắp xếp) thành các gói không quá `toi_da` thay đổi, ghi bất biến vào `thay-doi/goi/`.
/// `chuyen` đổi một đoạn thay đổi sang `change` (số `change` phải bằng số thay đổi).
pub fn dung_goi(dir: &Path, ctx: &NguCanhGoi, thay_doi: &[ThayDoiItem], toi_da: usize, chuyen: impl Fn(&[ThayDoiItem]) -> Result<Vec<Value>, String>) -> Result<Vec<Goi>, String> {
    if thay_doi.is_empty() {
        return Err("Không có thay đổi nào để gửi".into());
    }
    let sap: Vec<&ThayDoiItem> = sap_xep(thay_doi);
    let doan: Vec<&[&ThayDoiItem]> = sap.chunks(toi_da.clamp(1, 1000)).collect();
    let mut cac_goi = Vec::new();
    for (i, d) in doan.iter().enumerate() {
        let gia_tri: Vec<ThayDoiItem> = d.iter().map(|t| (*t).clone()).collect();
        let changes = chuyen(&gia_tri)?;
        if changes.len() != d.len() {
            return Err(format!("Đổi thay đổi sang gói không khớp: {} thay đổi → {} change", d.len(), changes.len()));
        }
        let goi = mot_goi(ctx, changes, d, i, i + 1 < doan.len(), None);
        lo::ghi_json_moi(&duong_goi(dir, goi.id()), &goi)?;
        cac_goi.push(goi);
    }
    Ok(cac_goi)
}

/// Tạo gói mới (khóa mới) thay cho `goi` khi cổng báo `IDEMPOTENCY_KEY_REUSED`; gói cũ giữ nguyên làm vết.
pub fn doi_khoa(dir: &Path, goi: &Goi) -> Result<Goi, String> {
    let mut moi = goi.clone();
    let id = format!("cs-{}", uuid::Uuid::new_v4());
    moi.body["changesetId"] = json!(id);
    moi.gui["tieuDe"]["Idempotency-Key"] = json!(id);
    moi.ung_dung.thay_khoa_tu = Some(goi.id().to_string());
    moi.ung_dung.dung_luc = lo::bay_gio();
    lo::ghi_json_moi(&duong_goi(dir, &id), &moi)?;
    lo::ghi_json(&duong_bien_nhan(dir, goi.id()), &json!({"schema": lo::SCHEMA, "changesetId": goi.id(), "ketThuc": true, "ketQua": "thay_khoa", "thayBang": id}))?;
    Ok(moi)
}

pub fn gzip(bytes: &[u8]) -> Result<Vec<u8>, String> {
    let mut e = GzEncoder::new(Vec::new(), Compression::default());
    e.write_all(bytes).map_err(|e| e.to_string())?;
    e.finish().map_err(|e| e.to_string())
}

/// Gói chưa có biên nhận cuối trong `thay-doi/goi/`, theo thứ tự (để gửi lại đúng gói cũ, cùng khóa).
pub fn goi_dang_do(dir: &Path) -> Result<Vec<Goi>, String> {
    let thu_muc = dir.join("thay-doi").join("goi");
    let mut ds: Vec<Goi> = Vec::new();
    for e in std::fs::read_dir(&thu_muc).map_err(|e| e.to_string())?.flatten() {
        let ten = e.file_name().to_string_lossy().into_owned();
        if !ten.starts_with("cs-") || ten.ends_with(".bien-nhan.json") || !ten.ends_with(".json") {
            continue;
        }
        let goi: Goi = lo::doc_json(&e.path())?;
        let xong = lo::doc_json::<Value>(&duong_bien_nhan(dir, goi.id())).map(|b| b["ketThuc"].as_bool().unwrap_or(false)).unwrap_or(false);
        if !xong {
            ds.push(goi);
        }
    }
    ds.sort_by(|a, b| (a.ung_dung.thu_tu, &a.ung_dung.dung_luc).cmp(&(b.ung_dung.thu_tu, &b.ung_dung.dung_luc)));
    Ok(ds)
}

// ---------------------------------------------------------------------------
// Gửi
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
pub struct CauHinhGui {
    pub poll_dau_ms: u64,
    pub poll_toi_da_ms: u64,
    pub toi_da_cho: Duration,
    pub lan_hang_doi_day: u32,
}

impl Default for CauHinhGui {
    fn default() -> Self {
        Self { poll_dau_ms: 1000, poll_toi_da_ms: 8000, toi_da_cho: Duration::from_secs(15 * 60), lan_hang_doi_day: 5 }
    }
}

#[derive(Debug, PartialEq)]
pub enum LoiGui {
    /// Cổng báo khóa idempotency đã dùng với nội dung khác: cần gói mới (`doi_khoa`).
    DoiKhoa,
    Khac(String),
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TomTatKetQua {
    pub nhan: usize,
    #[serde(rename = "xungDot")]
    pub xung_dot: usize,
    #[serde(rename = "tuChoi")]
    pub tu_choi: usize,
}

/// Đếm kết quả từng thay đổi theo trường `status` (⚠️ tên giá trị chưa xác minh; dùng từ khóa, bản gốc luôn được lưu).
pub fn dem_ket_qua(results: &[Value]) -> TomTatKetQua {
    let mut k = TomTatKetQua { nhan: 0, xung_dot: 0, tu_choi: 0 };
    for r in results {
        let s = r["status"].as_str().or_else(|| r["result"].as_str()).unwrap_or("").to_uppercase();
        if s.contains("CONFLICT") {
            k.xung_dot += 1;
        } else if s.contains("REJECT") || s.contains("FAIL") || s.contains("ERROR") {
            k.tu_choi += 1;
        } else {
            k.nhan += 1;
        }
    }
    k
}

/// Lý do máy chủ từ chối/xung đột (`userMessage`), gộp theo thông báo: [(thông báo, số thay đổi)]. Hình dạng thật của kết quả từng thay đổi
/// (✅ gặp thật 10/11/2026): `{changeId, rowId, clientRowId, status: "REJECTED", userMessage, errors[], conflicts[], rowDeleted, version}`.
pub fn ly_do_tu_choi(results: &[Value]) -> Vec<(String, usize)> {
    let mut out: Vec<(String, usize)> = Vec::new();
    for r in results {
        let s = r["status"].as_str().unwrap_or("").to_uppercase();
        if !(s.contains("REJECT") || s.contains("CONFLICT") || s.contains("FAIL") || s.contains("ERROR")) {
            continue;
        }
        let m = r["userMessage"].as_str().filter(|m| !m.is_empty()).unwrap_or("(máy chủ không nêu lý do)").to_string();
        match out.iter_mut().find(|(t, _)| *t == m) {
            Some(e) => e.1 += 1,
            None => out.push((m, 1)),
        }
    }
    out
}

fn loi_tu_step(e: crate::portal::StepError) -> String {
    match e {
        crate::portal::StepError::Retry(m) | crate::portal::StepError::Auth(m) | crate::portal::StepError::Fatal(m) => m,
    }
}

/// Gửi một gói và chờ kết quả. Ghi `<id>.bien-nhan.json` (`ketThuc: true`) khi xong; lỗi thì không ghi để gửi lại được cùng khóa.
pub async fn gui_goi(sess: &Session, dir: &Path, goi: &Goi, nguoi: &str, ch: &CauHinhGui) -> Result<Value, LoiGui> {
    let id = goi.id().to_string();
    let body = serde_json::to_vec(&goi.body).map_err(|e| LoiGui::Khac(e.to_string()))?;
    let path = goi.gui["diaChi"].as_str().ok_or_else(|| LoiGui::Khac("Gói thiếu địa chỉ gửi".into()))?.to_string();
    let nen = gzip(&body).map_err(LoiGui::Khac)?;
    let mut lan = 0;
    let (status, phan_hoi) = loop {
        match sess.post_json(&path, nen.clone(), true, &[("Idempotency-Key", &id), ("Prefer", "respond-async")]).await {
            Ok(r) => break r,
            Err(e) => {
                let m = loi_tu_step(e);
                if m.contains("[IDEMPOTENCY_KEY_REUSED]") {
                    return Err(LoiGui::DoiKhoa);
                }
                lan += 1;
                if m.contains("[SYNC_QUEUE_FULL]") && lan <= ch.lan_hang_doi_day {
                    tokio::time::sleep(Duration::from_millis(ch.poll_toi_da_ms)).await;
                    continue;
                }
                return Err(LoiGui::Khac(m));
            }
        }
    };
    let ket_qua: Value = if let Some(arr) = phan_hoi["results"].as_array() {
        json!({"results": arr})
    } else if let Some(task) = phan_hoi["taskId"].as_str() {
        if phan_hoi["receivedChanges"].as_u64() != Some(goi.so_thay_doi() as u64) {
            return Err(LoiGui::Khac(format!("Cổng nhận {:?} thay đổi, khác {} đã gửi", phan_hoi["receivedChanges"], goi.so_thay_doi())));
        }
        cho_ket_qua(sess, goi, task, ch).await.map_err(LoiGui::Khac)?
    } else {
        return Err(LoiGui::Khac("Phản hồi gửi gói không nhận dạng được (không có results hoặc taskId)".into()));
    };
    let results = ket_qua["results"].as_array().cloned().unwrap_or_default();
    let tom_tat = dem_ket_qua(&results);
    let bien_nhan = json!({
        "schema": lo::SCHEMA, "changesetId": id, "guiLuc": lo::bay_gio(), "ketThuc": true,
        "phanHoiGui": {"httpStatus": status.as_u16(), "body": phan_hoi}, "ketQua": ket_qua, "tomTat": tom_tat,
        "lyDoTuChoi": ly_do_tu_choi(&results).into_iter().map(|(m, n)| json!({"thongBao": m, "so": n})).collect::<Vec<_>>(),
    });
    lo::ghi_json(&duong_bien_nhan(dir, &id), &bien_nhan).map_err(LoiGui::Khac)?;
    let mut e: SuKien = lo::su_kien("gui_goi");
    e.changeset_id = Some(&id);
    e.so_thay_doi = Some(goi.so_thay_doi());
    e.ket_qua = Some(if tom_tat.tu_choi + tom_tat.xung_dot > 0 { "co_tu_choi" } else { "ok" });
    e.nguoi = Some(nguoi);
    let _ = lo::ghi_nhat_ky(dir, &e);
    Ok(bien_nhan)
}

/// Theo dõi tác vụ nền tới `SUCCEEDED` (trả `result`) hoặc `FAILED`.
async fn cho_ket_qua(sess: &Session, goi: &Goi, task_id: &str, ch: &CauHinhGui) -> Result<Value, String> {
    let goc = goi.gui["diaChi"].as_str().unwrap_or("").trim_end_matches("/changesets");
    let duong = format!("{goc}/changeset-tasks/{task_id}");
    let han = Instant::now() + ch.toi_da_cho;
    let mut cho = ch.poll_dau_ms;
    loop {
        tokio::time::sleep(Duration::from_millis(cho)).await;
        cho = (cho * 2).min(ch.poll_toi_da_ms);
        if Instant::now() > han {
            return Err("Hết thời gian chờ cổng xử lý gói (gói vẫn còn trên cổng, bấm Gửi lại để theo dõi tiếp)".into());
        }
        let s = sess.get_json(&duong, &[]).await.map_err(loi_tu_step)?;
        if s["taskId"].as_str() != Some(task_id) {
            return Err("Trạng thái tác vụ không khớp mã tác vụ đã gửi".into());
        }
        match s["status"].as_str().unwrap_or("") {
            "QUEUED" | "RUNNING" => {
                if let Some(g) = s["retryAfterSeconds"].as_u64() {
                    cho = (g * 1000).clamp(ch.poll_dau_ms, ch.poll_toi_da_ms);
                }
            }
            "SUCCEEDED" if s["result"]["results"].is_array() => return Ok(s["result"].clone()),
            "SUCCEEDED" => return Err(if s["resultExpired"].as_bool() == Some(true) { "Kết quả gói đã hết hạn trên cổng, đối chiếu lại bằng cách tải ảnh chụp".into() } else { "Tác vụ xong nhưng không có kết quả".into() }),
            "FAILED" => return Err(format!("Cổng xử lý gói thất bại [{}]: {}", s["errorCode"].as_str().unwrap_or("?"), s["userMessage"].as_str().unwrap_or("không rõ lý do"))),
            khac => return Err(format!("Trạng thái tác vụ lạ: \"{khac}\"")),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::thu_gia::{may_chu_gia, phien};
    use crate::thay_doi::Truong;

    fn td(bieu: &str, loai: &str, i: usize) -> ThayDoiItem {
        let mut truong = Truong::new();
        truong.insert("A".into(), Some(format!("CV-{i}")));
        ThayDoiItem { id: format!("td-{i:06}"), bieu: bieu.into(), dong_excel: Some(i as u32), khoa: format!("cv-{i}"), loai: loai.into(), row_id: (loai != "tao").then(|| format!("row-{i}")), phien_ban_dong: (loai != "tao").then_some(3), truong, truoc: None, trang_thai: "san_sang".into() }
    }
    fn gia(d: &[ThayDoiItem]) -> Result<Vec<Value>, String> {
        Ok(d.iter().map(|t| json!({"op": "gia", "id": t.id})).collect())
    }
    fn ctx<'a>() -> NguCanhGoi<'a> {
        NguCanhGoi { submission_id: "s1", device_id: "dev-1", rule_version: "2026.1", sao_luu: Some("sao-luu/x") }
    }

    #[test]
    fn changes_follow_desktop_format() {
        let mut sua = td("b1", "sua", 2);
        sua.truong.insert("C".into(), None);
        let ds = [td("b1", "tao", 1), sua, td("a1", "bo", 3)];
        let c = chuyen_thanh_changes(&ds, "imp-1").unwrap();
        let (tao, up, del) = (&c[0], &c[1], &c[2]);
        assert_eq!((tao["op"].as_str(), tao["baseVersion"].is_null(), tao["rowId"] == tao["clientRowId"]), (Some("CREATE"), true, true));
        assert_eq!(tao["rowId"].as_str().unwrap().len(), 36);
        assert_eq!(tao["rowId"].as_str().unwrap().as_bytes()[14], b'7', "UUID v7 như Desktop");
        assert_eq!((up["op"].as_str(), up["rowId"].as_str(), up["clientRowId"].is_null(), up["baseVersion"].as_u64()), (Some("UPDATE"), Some("row-2"), true, Some(3)));
        assert!(up["fields"]["C"].is_null() && up["fields"]["A"] == "CV-2");
        assert_eq!((del["op"].as_str(), del["fields"].as_object().map(|o| o.len())), (Some("DELETE"), Some(0)));
        assert_eq!(tao["source"], json!({"kind": "IMPORT", "importId": "imp-1"}));
        assert!(del["source"].is_null(), "xóa không mang nguồn IMPORT");
        assert!(tao["changeId"].as_str().is_some() && tao["changedAt"].as_str().unwrap().ends_with('Z'));
        let mut thieu = td("b1", "sua", 4);
        thieu.row_id = None;
        assert!(chuyen_thanh_changes(&[thieu], "i").unwrap_err().contains("rowId"));
        assert!(chuyen_thanh_changes(&[td("b1", "la", 5)], "i").is_err());
    }

    #[test]
    fn ordering_puts_parents_first_and_deletes_children_first() {
        let ds = [td("a1", "bo", 1), td("d2", "tao", 2), td("a2", "bo", 3), td("c1", "tao", 4), td("b1", "bo", 5), td("a2", "sua", 6)];
        let thu_tu: Vec<(String, String)> = sap_xep(&ds).iter().map(|t| (t.bieu.clone(), t.loai.clone())).collect();
        let ky: Vec<(&str, &str)> = thu_tu.iter().map(|(a, b)| (a.as_str(), b.as_str())).collect();
        assert_eq!(ky, vec![("c1", "tao"), ("a2", "sua"), ("d2", "tao"), ("b1", "bo"), ("a2", "bo"), ("a1", "bo")]);
    }

    #[test]
    fn body_matches_wire_format_and_is_immutable() {
        let dir = tempfile::tempdir().unwrap();
        lo::tao_thu_muc(dir.path()).unwrap();
        let ds: Vec<ThayDoiItem> = (0..5).map(|i| td("b1", "tao", i)).collect();
        let goi = dung_goi(dir.path(), &ctx(), &ds, 2, gia).unwrap();
        assert_eq!(goi.len(), 3);
        assert_eq!(goi.iter().map(|g| g.body.get("hasMore").is_some()).collect::<Vec<_>>(), vec![true, true, false]);
        let b = &goi[0].body;
        assert_eq!((b["deviceId"].as_str(), b["ruleVersion"].as_str()), (Some("dev-1"), Some("2026.1")));
        assert!(b.get("createdAt").is_none() && b.get("attempts").is_none(), "chỉ chứa trường cổng nhận");
        assert_eq!(goi[0].gui["tieuDe"]["Idempotency-Key"], b["changesetId"]);
        assert_eq!(goi_dang_do(dir.path()).unwrap().iter().map(|g| g.ung_dung.thu_tu).collect::<Vec<_>>(), vec![0, 1, 2]);
        assert!(lo::ghi_json_moi(&duong_goi(dir.path(), goi[0].id()), &goi[0]).is_err());
        assert!(dung_goi(dir.path(), &ctx(), &[], 10, gia).is_err());
        assert!(dung_goi(dir.path(), &ctx(), &ds, 10, |_| Ok(vec![json!({})])).unwrap_err().contains("không khớp"));
    }

    #[test]
    fn key_replacement_keeps_old_package_as_trace() {
        let dir = tempfile::tempdir().unwrap();
        lo::tao_thu_muc(dir.path()).unwrap();
        let goi = dung_goi(dir.path(), &ctx(), &[td("b1", "tao", 1)], 10, gia).unwrap().remove(0);
        let moi = doi_khoa(dir.path(), &goi).unwrap();
        assert_ne!(moi.id(), goi.id());
        assert_eq!(moi.body["changes"], goi.body["changes"]);
        assert_eq!(moi.ung_dung.thay_khoa_tu.as_deref(), Some(goi.id()));
        let dang_do = goi_dang_do(dir.path()).unwrap();
        assert_eq!(dang_do.len(), 1, "gói cũ đã đóng, chỉ còn gói mới");
        assert_eq!(dang_do[0].id(), moi.id());
    }

    #[test]
    fn rejection_reasons_are_grouped_by_server_message() {
        let r = [
            json!({"status": "REJECTED", "userMessage": "Dữ liệu của đơn vị khác chỉ được xem, không sửa được.", "errors": [], "conflicts": []}),
            json!({"status": "REJECTED", "userMessage": "Dữ liệu của đơn vị khác chỉ được xem, không sửa được."}),
            json!({"status": "CONFLICT"}),
            json!({"status": "APPLIED"}),
        ];
        assert_eq!(ly_do_tu_choi(&r), vec![("Dữ liệu của đơn vị khác chỉ được xem, không sửa được.".to_string(), 2), ("(máy chủ không nêu lý do)".to_string(), 1)]);
    }

    #[test]
    fn result_counting_uses_status_keywords() {
        let r = [json!({"status": "ACCEPTED"}), json!({"status": "CONFLICT"}), json!({"status": "REJECTED"}), json!({"result": "ok"})];
        assert_eq!(dem_ket_qua(&r), TomTatKetQua { nhan: 2, xung_dot: 1, tu_choi: 1 });
    }

    fn nhanh() -> CauHinhGui {
        CauHinhGui { poll_dau_ms: 5, poll_toi_da_ms: 20, toi_da_cho: Duration::from_secs(5), lan_hang_doi_day: 2 }
    }
    async fn goi_mau(dir: &Path) -> Goi {
        lo::tao_thu_muc(dir).unwrap();
        dung_goi(dir, &ctx(), &[td("b1", "tao", 1), td("b1", "tao", 2)], 10, |d| chuyen_thanh_changes(d, "imp")).unwrap().remove(0)
    }

    #[tokio::test]
    async fn async_send_polls_task_until_success_and_writes_receipt() {
        let (addr, ghi) = may_chu_gia(vec![
            ("/auth/me".into(), 200, json!({})),
            ("/changesets".into(), 202, json!({"taskId": "t1", "status": "QUEUED", "receivedChanges": 2})),
            ("/changeset-tasks/t1".into(), 200, json!({"taskId": "t1", "status": "RUNNING", "receivedChanges": 2, "retryAfterSeconds": 0})),
            ("/changeset-tasks/t1".into(), 200, json!({"taskId": "t1", "status": "SUCCEEDED", "receivedChanges": 2, "result": {"results": [{"status": "ACCEPTED"}, {"status": "ACCEPTED"}]}})),
        ]).await;
        let dir = tempfile::tempdir().unwrap();
        let goi = goi_mau(dir.path()).await;
        let sess = phien(&addr).await;
        let bn = gui_goi(&sess, dir.path(), &goi, "vận hành", &nhanh()).await.unwrap();
        assert_eq!(bn["tomTat"], json!({"nhan": 2, "xungDot": 0, "tuChoi": 0}));
        assert!(goi_dang_do(dir.path()).unwrap().is_empty(), "đã có biên nhận cuối");
        let reqs = ghi.0.lock().unwrap();
        let post = reqs.iter().find(|r| r.0 == "POST").unwrap();
        assert_eq!(post.1, "/api/v1/submissions/s1/changesets");
        let h = |k: &str| post.2.iter().find(|(n, _)| n == k).map(|(_, v)| v.as_str());
        assert_eq!((h("idempotency-key"), h("prefer"), h("content-encoding"), h("x-device-id"), h("x-xsrf-token")), (Some(goi.id()), Some("respond-async"), Some("gzip"), Some("dev-1"), Some("tok")));
        let thuc: Value = serde_json::from_slice(&crate::portal::gunzip_neu_can(&post.3).unwrap()).unwrap();
        assert_eq!(thuc, goi.body, "thân gửi đúng như gói đã lưu");
    }

    #[tokio::test]
    async fn sync_response_task_failure_and_reused_key() {
        let (addr, _) = may_chu_gia(vec![
            ("/auth/me".into(), 200, json!({})),
            ("/changesets".into(), 200, json!({"results": [{"status": "CONFLICT"}, {"status": "REJECTED"}]})),
        ]).await;
        let dir = tempfile::tempdir().unwrap();
        let goi = goi_mau(dir.path()).await;
        let bn = gui_goi(&phien(&addr).await, dir.path(), &goi, "x", &nhanh()).await.unwrap();
        assert_eq!(bn["tomTat"], json!({"nhan": 0, "xungDot": 1, "tuChoi": 1}));

        let (addr2, _) = may_chu_gia(vec![
            ("/auth/me".into(), 200, json!({})),
            ("/changesets".into(), 409, json!({"code": "IDEMPOTENCY_KEY_REUSED", "userMessage": "khóa đã dùng"})),
        ]).await;
        let dir2 = tempfile::tempdir().unwrap();
        let goi2 = goi_mau(dir2.path()).await;
        assert_eq!(gui_goi(&phien(&addr2).await, dir2.path(), &goi2, "x", &nhanh()).await.unwrap_err(), LoiGui::DoiKhoa);

        let (addr3, _) = may_chu_gia(vec![
            ("/auth/me".into(), 200, json!({})),
            ("/changesets".into(), 202, json!({"taskId": "t9", "status": "QUEUED", "receivedChanges": 2})),
            ("/changeset-tasks/t9".into(), 200, json!({"taskId": "t9", "status": "FAILED", "receivedChanges": 2, "errorCode": "SYNC_TASK_ERROR", "userMessage": "lỗi xử lý"})),
        ]).await;
        let dir3 = tempfile::tempdir().unwrap();
        let goi3 = goi_mau(dir3.path()).await;
        let LoiGui::Khac(m) = gui_goi(&phien(&addr3).await, dir3.path(), &goi3, "x", &nhanh()).await.unwrap_err() else { panic!() };
        assert!(m.contains("SYNC_TASK_ERROR") && m.contains("lỗi xử lý"));
        assert_eq!(goi_dang_do(dir3.path()).unwrap().len(), 1, "lỗi thì gói còn dở, gửi lại được cùng khóa");
    }

    #[tokio::test]
    async fn locked_submission_and_wrong_received_count_are_reported() {
        let (addr, _) = may_chu_gia(vec![
            ("/auth/me".into(), 200, json!({})),
            ("/changesets".into(), 409, json!({"code": "SUBMISSION_LOCKED", "userMessage": "Hồ sơ đang khóa"})),
        ]).await;
        let dir = tempfile::tempdir().unwrap();
        let goi = goi_mau(dir.path()).await;
        let LoiGui::Khac(m) = gui_goi(&phien(&addr).await, dir.path(), &goi, "x", &nhanh()).await.unwrap_err() else { panic!() };
        assert!(m.contains("SUBMISSION_LOCKED"));

        let (addr2, _) = may_chu_gia(vec![
            ("/auth/me".into(), 200, json!({})),
            ("/changesets".into(), 202, json!({"taskId": "t", "status": "QUEUED", "receivedChanges": 1})),
        ]).await;
        let dir2 = tempfile::tempdir().unwrap();
        let goi2 = goi_mau(dir2.path()).await;
        let LoiGui::Khac(m2) = gui_goi(&phien(&addr2).await, dir2.path(), &goi2, "x", &nhanh()).await.unwrap_err() else { panic!() };
        assert!(m2.contains("khác 2 đã gửi"));
    }

    #[test]
    fn gzip_round_trips() {
        let z = gzip(b"{\"a\":1}").unwrap();
        assert_eq!(&z[..2], &[0x1f, 0x8b]);
        assert_eq!(crate::portal::gunzip_neu_can(&z).unwrap(), b"{\"a\":1}");
    }
}
