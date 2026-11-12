//! Bước 8 "Kiểm tra" của hồ sơ trên cổng, chạy sau khi gửi đồng bộ để tiến độ bước 8 lên đủ 100 %.
//!
//! Làm đúng như nút "Kiểm tra lại" của ứng dụng Desktop (`workflow-local`, `TrungTamLoiPage`):
//! `POST /submissions/{id}/recalculate` (kèm `Idempotency-Key`, thân `{}`) → nhận `jobId` → hỏi `GET /jobs/{jobId}` đến khi xong
//! → đọc `GET /submissions/{id}/readiness` để biết hồ sơ còn mục chặn nào. Không đổi dữ liệu kê khai, chỉ buộc cổng tính và kiểm tra lại.

use crate::portal::{Session, StepError};
use serde::Serialize;
use serde_json::Value;
use std::time::{Duration, Instant};

/// Chờ job kiểm tra lại: hỏi mỗi `CHU_KY_HOI_MS`, tối đa `TOI_DA_CHO_S` (như Desktop: 1,5 giây / 120 giây).
pub const CHU_KY_HOI_MS: u64 = 1_500;
pub const TOI_DA_CHO_S: u64 = 120;
/// Số lần gửi lệnh kiểm tra lại khi gặp lỗi tạm thời (cùng một `Idempotency-Key` nên gửi lại không nhân đôi việc).
const SO_LAN_GUI: u32 = 3;
const CHO_GUI_LAI_MS: u64 = 3_000;

/// Kết quả đọc `readiness` sau khi kiểm tra lại.
#[derive(Debug, Clone, Default, Serialize, PartialEq)]
pub struct KetQuaKiemTraLai {
    /// Hồ sơ đủ điều kiện (không còn lỗi phải sửa).
    #[serde(rename = "sanSang")]
    pub san_sang: bool,
    /// Các mục còn chặn: (nội dung, số lượng).
    pub chan: Vec<(String, u64)>,
    #[serde(rename = "choBoSung")]
    pub cho_bo_sung: u64,
    #[serde(rename = "canhBao")]
    pub canh_bao: u64,
    /// Thời điểm cổng kiểm tra gần nhất (nguyên văn từ cổng), rỗng nếu cổng không trả.
    #[serde(rename = "kiemTraLuc")]
    pub kiem_tra_luc: String,
    /// Hết thời gian chờ mà job chưa xong (cổng vẫn đang tính; kết quả có thể chưa mới nhất).
    #[serde(rename = "jobChuaXong")]
    pub job_chua_xong: bool,
}

/// Trạng thái một job của cổng.
#[derive(Debug, Clone, PartialEq)]
pub enum TrangThaiJob {
    Xong,
    Hong(String),
    DangChay,
}

/// Thuần: đọc `GET /jobs/{id}`. `SUCCEEDED` là xong; `FAILED`/`CANCELLED` là hỏng (kèm lời của cổng); còn lại là đang chạy.
pub fn doc_job(v: &Value) -> TrangThaiJob {
    match v["status"].as_str().unwrap_or("") {
        "SUCCEEDED" => TrangThaiJob::Xong,
        "FAILED" | "CANCELLED" => {
            let loi = v["userMessage"].as_str().map(str::trim).filter(|m| !m.is_empty()).unwrap_or("Cổng chưa kiểm tra lại được hồ sơ.");
            TrangThaiJob::Hong(loi.to_string())
        }
        _ => TrangThaiJob::DangChay,
    }
}

/// Thuần: đọc `GET /submissions/{id}/readiness`. `san_sang` chỉ đúng khi cổng báo `ready` và không còn mục chặn nào.
pub fn doc_readiness(v: &Value) -> KetQuaKiemTraLai {
    let chan: Vec<(String, u64)> = v["blockers"]
        .as_array()
        .map(|a| a.iter().map(|b| (b["userMessage"].as_str().unwrap_or("").trim().to_string(), b["count"].as_u64().unwrap_or(0))).collect())
        .unwrap_or_default();
    KetQuaKiemTraLai {
        san_sang: v["ready"].as_bool() == Some(true) && chan.is_empty(),
        chan,
        cho_bo_sung: v["pendingCount"].as_u64().unwrap_or(0),
        canh_bao: v["warningCount"].as_u64().unwrap_or(0),
        kiem_tra_luc: v["lastValidatedAt"].as_str().unwrap_or_default().to_string(),
        job_chua_xong: false,
    }
}

/// Thuần: một câu tóm tắt tiếng Việt cho ghi chú của đơn vị.
pub fn tom_tat(k: &KetQuaKiemTraLai) -> String {
    let phan_dau = if k.san_sang {
        "Bước 8 Kiểm tra: cổng đã kiểm tra lại hồ sơ, không còn lỗi phải sửa.".to_string()
    } else {
        let tong: u64 = k.chan.iter().map(|(_, n)| n).sum();
        let chi_tiet: Vec<String> = k.chan.iter().filter(|(m, _)| !m.is_empty()).map(|(m, n)| format!("«{m}» ({n})")).collect();
        format!("Bước 8 Kiểm tra: hồ sơ còn {tong} mục chặn{}.", if chi_tiet.is_empty() { String::new() } else { format!(": {}", chi_tiet.join("; ")) })
    };
    let mut them = Vec::new();
    if k.cho_bo_sung > 0 { them.push(format!("{} dòng chờ bổ sung căn cứ", k.cho_bo_sung)); }
    if k.canh_bao > 0 { them.push(format!("{} cảnh báo", k.canh_bao)); }
    if k.job_chua_xong { them.push("cổng vẫn đang tính, kết quả có thể chưa mới nhất".to_string()); }
    if them.is_empty() { phan_dau } else { format!("{phan_dau} Ngoài ra: {}.", them.join(", ")) }
}

fn loi(e: StepError) -> String {
    match e {
        StepError::Auth(m) | StepError::Retry(m) | StepError::Fatal(m) => m,
    }
}

/// Mã hồ sơ chỉ gồm chữ, số, `-`, `_`, `.` để không chèn được ký tự lạ vào đường dẫn.
fn an_toan(id: &str) -> bool {
    !id.is_empty() && id.len() <= 100 && id.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | '-'))
}

/// Gửi lệnh kiểm tra lại, trả `jobId` (rỗng nếu cổng không trả). Lỗi tạm thời gửi lại với cùng `Idempotency-Key`.
async fn gui_lenh(sess: &Session, sid: &str) -> Result<String, String> {
    let khoa = uuid::Uuid::new_v4().to_string();
    let mut lan = 0;
    loop {
        match sess.post_json(&format!("/submissions/{sid}/recalculate"), b"{}".to_vec(), false, &[("Idempotency-Key", &khoa)]).await {
            Ok((_, v)) => return Ok(v["jobId"].as_str().unwrap_or_default().to_string()),
            Err(StepError::Retry(m)) => {
                lan += 1;
                if lan >= SO_LAN_GUI {
                    return Err(m);
                }
                tokio::time::sleep(Duration::from_millis(CHO_GUI_LAI_MS)).await;
            }
            Err(e) => return Err(loi(e)),
        }
    }
}

/// Chờ job xong. `Ok(true)` = xong, `Ok(false)` = hết thời gian chờ mà cổng vẫn đang tính, `Err` = job hỏng hoặc lỗi đọc.
async fn cho_job(sess: &Session, job_id: &str, chu_ky: Duration, toi_da: Duration) -> Result<bool, String> {
    if !an_toan(job_id) {
        return Err("Mã công việc kiểm tra lại không hợp lệ".into());
    }
    let han = Instant::now() + toi_da;
    while Instant::now() < han {
        match doc_job(&sess.get_json(&format!("/jobs/{job_id}"), &[]).await.map_err(loi)?) {
            TrangThaiJob::Xong => return Ok(true),
            TrangThaiJob::Hong(m) => return Err(m),
            TrangThaiJob::DangChay => tokio::time::sleep(chu_ky).await,
        }
    }
    Ok(false)
}

/// Chạy bước 8 cho hồ sơ `sid`: kiểm tra lại toàn bộ trên cổng rồi đọc kết quả.
pub async fn chay(sess: &Session, sid: &str, chu_ky: Duration, toi_da: Duration) -> Result<KetQuaKiemTraLai, String> {
    if !an_toan(sid) {
        return Err("Mã hồ sơ không hợp lệ".into());
    }
    let job_id = gui_lenh(sess, sid).await?;
    let xong = if job_id.is_empty() { true } else { cho_job(sess, &job_id, chu_ky, toi_da).await? };
    let v = sess.get_json(&format!("/submissions/{sid}/readiness"), &[]).await.map_err(loi)?;
    Ok(KetQuaKiemTraLai { job_chua_xong: !xong, ..doc_readiness(&v) })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::thu_gia::{may_chu_gia, phien};
    use serde_json::json;

    #[test]
    fn job_xong_hong_hoac_dang_chay() {
        assert_eq!(doc_job(&json!({"status": "SUCCEEDED"})), TrangThaiJob::Xong);
        assert_eq!(doc_job(&json!({"status": "RUNNING"})), TrangThaiJob::DangChay);
        assert_eq!(doc_job(&json!({})), TrangThaiJob::DangChay);
        assert_eq!(doc_job(&json!({"status": "FAILED", "userMessage": " Hồ sơ đang bị khóa "})), TrangThaiJob::Hong("Hồ sơ đang bị khóa".into()));
        assert!(matches!(doc_job(&json!({"status": "CANCELLED"})), TrangThaiJob::Hong(m) if m.contains("chưa kiểm tra lại")));
    }

    #[test]
    fn readiness_san_sang_chi_khi_ready_va_het_muc_chan() {
        let ok = doc_readiness(&json!({"ready": true, "blockers": [], "pendingCount": 0, "warningCount": 2, "lastValidatedAt": "2026-11-11T16:29:00+07:00"}));
        assert!(ok.san_sang);
        assert_eq!((ok.canh_bao, ok.kiem_tra_luc.as_str()), (2, "2026-11-11T16:29:00+07:00"));
        let con_chan = doc_readiness(&json!({"ready": true, "blockers": [{"kind": "BLOCK_ISSUES", "count": 3, "userMessage": "Còn 3 lỗi phải sửa"}]}));
        assert!(!con_chan.san_sang, "còn mục chặn thì không sẵn sàng dù cờ ready=true");
        assert_eq!(con_chan.chan, vec![("Còn 3 lỗi phải sửa".to_string(), 3)]);
        assert!(!doc_readiness(&json!({})).san_sang);
    }

    #[test]
    fn tom_tat_cho_hai_truong_hop() {
        let ok = KetQuaKiemTraLai { san_sang: true, ..Default::default() };
        assert_eq!(tom_tat(&ok), "Bước 8 Kiểm tra: cổng đã kiểm tra lại hồ sơ, không còn lỗi phải sửa.");
        let chan = KetQuaKiemTraLai { chan: vec![("Còn 3 lỗi phải sửa".into(), 3), ("Thiếu biểu D2".into(), 1)], cho_bo_sung: 4, job_chua_xong: true, ..Default::default() };
        let t = tom_tat(&chan);
        assert!(t.contains("còn 4 mục chặn") && t.contains("«Còn 3 lỗi phải sửa» (3)") && t.contains("«Thiếu biểu D2» (1)"));
        assert!(t.contains("4 dòng chờ bổ sung căn cứ") && t.contains("vẫn đang tính"));
    }

    #[tokio::test]
    async fn chay_gui_lenh_co_khoa_lap_roi_cho_job_roi_doc_readiness() {
        let (addr, ghi) = may_chu_gia(vec![
            ("/auth/me".into(), 200, json!({})),
            ("/submissions/s-1/recalculate".into(), 202, json!({"jobId": "job-9"})),
            ("/jobs/job-9".into(), 200, json!({"status": "RUNNING"})),
            ("/jobs/job-9".into(), 200, json!({"status": "SUCCEEDED"})),
            ("/submissions/s-1/readiness".into(), 200, json!({"ready": true, "blockers": []})),
        ]).await;
        let kq = chay(&phien(&addr).await, "s-1", Duration::from_millis(5), Duration::from_secs(5)).await.unwrap();
        assert!(kq.san_sang && !kq.job_chua_xong);
        let reqs = ghi.0.lock().unwrap();
        let post = reqs.iter().find(|r| r.0 == "POST").unwrap();
        assert_eq!(post.1, "/api/v1/submissions/s-1/recalculate");
        assert!(post.2.iter().any(|(k, v)| k == "idempotency-key" && !v.is_empty()));
        assert_eq!(serde_json::from_slice::<Value>(&post.3).unwrap(), json!({}));
    }

    #[tokio::test]
    async fn chay_bao_loi_khi_job_hong_va_tu_choi_ma_la() {
        let (addr, _) = may_chu_gia(vec![
            ("/auth/me".into(), 200, json!({})),
            ("/submissions/s-2/recalculate".into(), 202, json!({"jobId": "job-1"})),
            ("/jobs/job-1".into(), 200, json!({"status": "FAILED", "userMessage": "Hồ sơ đang khóa"})),
        ]).await;
        let s = phien(&addr).await;
        assert_eq!(chay(&s, "s-2", Duration::from_millis(5), Duration::from_secs(5)).await.unwrap_err(), "Hồ sơ đang khóa");
        assert!(chay(&s, "../x", Duration::from_millis(5), Duration::from_secs(1)).await.is_err());
    }

    #[tokio::test]
    async fn chay_khong_co_job_id_thi_doc_thang_readiness() {
        let (addr, _) = may_chu_gia(vec![
            ("/auth/me".into(), 200, json!({})),
            ("/submissions/s-3/recalculate".into(), 200, json!({})),
            ("/submissions/s-3/readiness".into(), 200, json!({"ready": false, "blockers": [{"count": 2, "userMessage": "Còn 2 lỗi"}]})),
        ]).await;
        let kq = chay(&phien(&addr).await, "s-3", Duration::from_millis(5), Duration::from_secs(1)).await.unwrap();
        assert!(!kq.san_sang);
        assert_eq!(kq.chan.len(), 1);
    }

    /// Thử thật (đổi trạng thái tính toán trên cổng, không gửi dữ liệu):
    /// `VTVL_TEST_USER=… VTVL_TEST_PASS=… cargo test kiem_tra_lai_that -- --ignored --nocapture`.
    #[tokio::test]
    #[ignore = "cần cổng thật và tài khoản trong biến môi trường"]
    async fn kiem_tra_lai_that() {
        use crate::ket_noi::{kiem_tra, TaiKhoan};
        use crate::lo::{self, UnitEntry};
        use crate::portal::{DangNhap, ThietBi};
        let (Ok(u), Ok(p)) = (std::env::var("VTVL_TEST_USER"), std::env::var("VTVL_TEST_PASS")) else { panic!("thiếu VTVL_TEST_USER/VTVL_TEST_PASS") };
        let unit: UnitEntry = serde_json::from_value(serde_json::json!({"username": u, "excelFile": "x"})).unwrap();
        let tb = ThietBi { id: "33333333-4444-4555-8666-777777777777".into(), ten: "VTVL Batch".into(), phien_ban: "1.2.8".into(), nen_tang: "macos".into() };
        let dir = tempfile::tempdir().unwrap();
        let dn = DangNhap::Desktop { username: &u, password: &p, thiet_bi: &tb };
        let base = "https://kekhaivtvl.dcs.vn";
        let k = kiem_tra(&unit, base, &crate::lo::Settings::default(), &dn, dir.path()).await;
        assert!(k.chan.is_none(), "bị chặn: {:?}", k.chan);
        let tk: TaiKhoan = lo::doc_json(&dir.path().join("tai-khoan.json")).unwrap();
        let sess = crate::portal::mo_phien(base, &dn, Duration::from_secs(60)).await.unwrap();
        let buoc8 = |t: &crate::tong_quan::TongQuan| t.buoc.iter().find(|b| b.buoc == 8).map(|b| (b.xong, b.dang_lam, b.chua_bat_dau));
        let tien = |tag: &'static str| { let (s2, id) = (&sess, tk.ho_so.id.clone()); async move { let v = s2.get_json(&format!("/submissions/{id}/progress"), &[]).await.unwrap(); println!("PROGRESS_{tag}={}", v["steps"]); } };
        tien("TRUOC").await;
        let rd0 = sess.get_json(&format!("/submissions/{}/readiness", tk.ho_so.id), &[]).await.unwrap();
        println!("READY_TRUOC lastValidatedAt={} validationPending={}", rd0["lastValidatedAt"], rd0["validationPending"]);
        let sub = sess.get_json(&format!("/submissions/{}", tk.ho_so.id), &[]).await.unwrap();
        println!("SUB_TRUOC={}", sub.to_string().chars().take(900).collect::<String>());
        let truoc = crate::tong_quan::lay(&sess, &tk.org_id, &tk.ky_id).await.unwrap();
        println!("TRUOC buoc8={:?}", buoc8(&truoc));
        let kq = chay(&sess, &tk.ho_so.id, Duration::from_millis(CHU_KY_HOI_MS), Duration::from_secs(TOI_DA_CHO_S)).await;
        println!("KET QUA: {:?}", kq.as_ref().map(tom_tat));
        let sau = crate::tong_quan::lay(&sess, &tk.org_id, &tk.ky_id).await.unwrap();
        tien("SAU").await;
        let rd1 = sess.get_json(&format!("/submissions/{}/readiness", tk.ho_so.id), &[]).await.unwrap();
        println!("READY_SAU lastValidatedAt={} validationPending={}", rd1["lastValidatedAt"], rd1["validationPending"]);
        println!("SAU buoc8={:?}", buoc8(&sau));
        let raw = sess.get_json("/dashboard", &[("orgUnitId", &tk.org_id), ("periodId", &tk.ky_id), ("scope", "SELF")]).await.unwrap();
        println!("RAW_STEPS={}", raw["steps"]);
        let rd = sess.get_json(&format!("/submissions/{}/readiness", tk.ho_so.id), &[]).await.unwrap();
        println!("RAW_READINESS={}", rd.to_string().chars().take(1500).collect::<String>());
        let ds = |t: &crate::tong_quan::TongQuan| t.buoc.iter().map(|b| (b.buoc, b.tieu_de.clone(), b.xong, b.dang_lam, b.chua_bat_dau)).collect::<Vec<_>>();
        println!("BUOC truoc={:?}\nBUOC sau={:?}", ds(&truoc), ds(&sau));
        assert!(kq.is_ok());
    }
}
