//! Đường A (tài khoản có quyền `import`): kiểm tra tệp trên cổng rồi kết chuyển.
//! `POST /imports` + chờ `VALIDATED` (đã có ở `imports.rs`), sau đó `POST /imports/{id}/commit` với `If-Match "{version}"` và
//! `{duplicatePolicy: "skip"}`; có thể trả `202` rồi đọc `commitResult` từ `GET /imports/{id}` (bản 1.2.8, `phien-api-*.js`).
//! Viết sẵn theo mã Desktop; **chưa chạy với cổng thật** (tài khoản thử chưa có quyền `import`), nên mặc định ở chế độ khô.

use crate::portal::{Session, StepError};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::{Duration, Instant};

const DANG_XU_LY: [&str; 4] = ["UPLOADED", "CHECKING", "VALIDATING", "COMMITTING"];
/// Chính sách dòng trùng khi kết chuyển: bỏ qua (quyết định 09/11/2026).
pub const CHINH_SACH_TRUNG: &str = "skip";

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct KetQuaCommit {
    pub added: u64,
    pub updated: u64,
    #[serde(rename = "skippedDuplicate")]
    pub skipped_duplicate: u64,
    pub rejected: u64,
    pub remaining: u64,
}

pub fn doc_ket_qua_commit(v: &Value) -> KetQuaCommit {
    let n = |k: &str| v[k].as_u64().unwrap_or(0);
    KetQuaCommit { added: n("added"), updated: n("updated"), skipped_duplicate: n("skippedDuplicate"), rejected: n("rejected"), remaining: n("remaining") }
}

fn id_an_toan(id: &str) -> Result<&str, StepError> {
    let ok = !id.is_empty() && id.len() <= 100 && id.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | '-'));
    if ok { Ok(id) } else { Err(StepError::Fatal("Mã lần nhập không hợp lệ".into())) }
}

fn loi(e: StepError) -> String {
    match e {
        StepError::Retry(m) | StepError::Auth(m) | StepError::Fatal(m) => m,
    }
}

/// Kết chuyển một lần nhập đã `VALIDATED`. Không thử lại tự động (không idempotent): lỗi mạng giữa chừng thì người dùng kiểm tra trạng thái trước khi làm lại.
pub async fn commit(sess: &Session, import_id: &str, poll: Duration, toi_da_cho: Duration) -> Result<(KetQuaCommit, Value), String> {
    let id = id_an_toan(import_id).map_err(loi)?;
    let info = sess.get_json(&format!("/imports/{id}"), &[]).await.map_err(loi)?;
    if info["status"].as_str() != Some("VALIDATED") {
        return Err(format!("Lần nhập chưa ở trạng thái VALIDATED (hiện là {}), chưa kết chuyển được", info["status"].as_str().unwrap_or("không rõ")));
    }
    let version = info["version"].as_u64().unwrap_or(0).to_string();
    let if_match = format!("\"{version}\"");
    let body = serde_json::to_vec(&json!({"duplicatePolicy": CHINH_SACH_TRUNG})).map_err(|e| e.to_string())?;
    let (status, phan_hoi) = sess.post_json(&format!("/imports/{id}/commit"), body, false, &[("If-Match", &if_match)]).await.map_err(loi)?;
    let ket = if status.as_u16() == 202 { cho_commit(sess, id, poll, toi_da_cho).await? } else { phan_hoi.clone() };
    Ok((doc_ket_qua_commit(&ket), ket))
}

async fn cho_commit(sess: &Session, id: &str, poll: Duration, toi_da: Duration) -> Result<Value, String> {
    let han = Instant::now() + toi_da;
    loop {
        tokio::time::sleep(poll).await;
        let v = sess.get_json(&format!("/imports/{id}"), &[]).await.map_err(loi)?;
        if !DANG_XU_LY.contains(&v["status"].as_str().unwrap_or("")) {
            return if v["commitResult"].is_object() { Ok(v["commitResult"].clone()) } else { Err(format!("Cổng báo trạng thái {} nhưng không có commitResult", v["status"].as_str().unwrap_or("không rõ"))) };
        }
        if Instant::now() > han {
            return Err("Hết thời gian chờ cổng kết chuyển; kiểm tra trạng thái lần nhập trên cổng trước khi làm lại".into());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::thu_gia::{may_chu_gia, phien};

    #[test]
    fn commit_result_is_read_with_defaults() {
        let r = doc_ket_qua_commit(&json!({"added": 12, "updated": 3, "skippedDuplicate": 1}));
        assert_eq!(r, KetQuaCommit { added: 12, updated: 3, skipped_duplicate: 1, rejected: 0, remaining: 0 });
    }

    #[tokio::test]
    async fn commit_sends_if_match_and_reads_async_result() {
        let (addr, ghi) = may_chu_gia(vec![
            ("/auth/me".into(), 200, json!({})),
            ("/imports/imp-1".into(), 200, json!({"status": "VALIDATED", "version": 7})),
            ("/imports/imp-1/commit".into(), 202, json!({})),
            ("/imports/imp-1".into(), 200, json!({"status": "COMMITTING"})),
            ("/imports/imp-1".into(), 200, json!({"status": "COMMITTED", "commitResult": {"added": 5, "updated": 1, "skippedDuplicate": 2, "rejected": 0, "remaining": 0}})),
        ]).await;
        let (kq, _) = commit(&phien(&addr).await, "imp-1", Duration::from_millis(5), Duration::from_secs(5)).await.unwrap();
        assert_eq!((kq.added, kq.updated, kq.skipped_duplicate), (5, 1, 2));
        let reqs = ghi.0.lock().unwrap();
        let post = reqs.iter().find(|r| r.0 == "POST").unwrap();
        assert_eq!(post.1, "/api/v1/imports/imp-1/commit");
        assert_eq!(post.2.iter().find(|(k, _)| k == "if-match").map(|(_, v)| v.as_str()), Some("\"7\""));
        assert_eq!(serde_json::from_slice::<Value>(&post.3).unwrap(), json!({"duplicatePolicy": "skip"}));
    }

    #[tokio::test]
    async fn commit_refuses_unvalidated_import_and_reads_sync_result() {
        let (addr, _) = may_chu_gia(vec![("/auth/me".into(), 200, json!({})), ("/imports/x".into(), 200, json!({"status": "FAILED"}))]).await;
        assert!(commit(&phien(&addr).await, "x", Duration::from_millis(5), Duration::from_secs(1)).await.unwrap_err().contains("VALIDATED"));
        assert!(commit(&phien(&addr).await, "../x", Duration::from_millis(5), Duration::from_secs(1)).await.is_err());
        let (addr2, _) = may_chu_gia(vec![
            ("/auth/me".into(), 200, json!({})),
            ("/imports/y".into(), 200, json!({"status": "VALIDATED", "version": 1})),
            ("/imports/y/commit".into(), 200, json!({"added": 3})),
        ]).await;
        assert_eq!(commit(&phien(&addr2).await, "y", Duration::from_millis(5), Duration::from_secs(1)).await.unwrap().0.added, 3);
    }
}
