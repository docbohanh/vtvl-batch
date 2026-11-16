//! Gửi hồ sơ lên cấp trên: hành động `SUBMIT` của cổng, giống nút "Gửi" ở màn Kiểm tra và gửi của ứng dụng Desktop.
//!
//! Đối chiếu từ mã giao diện Desktop (`workflow-local`): `POST /submissions/{id}/submit`, tiêu đề `Idempotency-Key`,
//! thân `{expectedVersion, comments}`; trả `{submission}` (có `submittedAt`, `status`, `allowedActions`). Điều kiện bật nút của Desktop:
//! `allowedActions` có `SUBMIT` và `readiness.ready`. Bước ký gửi của lãnh đạo (`sign-and-send`) KHÔNG làm ở đây: người gửi không tự xác nhận
//! hồ sơ của mình (Desktop cũng chặn).

use crate::portal::{Session, StepError};
use serde_json::{json, Value};

#[derive(Debug, Clone, PartialEq)]
pub struct KetQuaGui {
    pub da_gui_luc: Option<String>,
    pub trang_thai: Option<String>,
    pub con_cho_lanh_dao: bool,
}

fn loi(e: StepError) -> String {
    match e {
        StepError::Auth(m) | StepError::Retry(m) | StepError::Fatal(m) => m,
    }
}

fn an_toan(id: &str) -> bool {
    !id.is_empty() && id.len() <= 100 && id.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | '-'))
}

/// Thuần: quyết định có gửi được không. Trả `expectedVersion` khi được; ngược lại trả lý do tiếng Việt.
pub fn quyet_dinh(sub: &Value, readiness: &Value) -> Result<u64, String> {
    if sub["submittedAt"].as_str().map(|s| !s.trim().is_empty()).unwrap_or(false) {
        return Err(format!("Hồ sơ đã gửi lúc {} (trạng thái {}).", sub["submittedAt"].as_str().unwrap_or_default(), sub["status"].as_str().unwrap_or("?")));
    }
    let duoc = sub["allowedActions"].as_array().map(|a| a.iter().any(|x| x == "SUBMIT")).unwrap_or(false);
    if !duoc {
        return Err(format!("Tài khoản chưa được phép gửi hồ sơ ở trạng thái {} (thiếu quyền SUBMIT).", sub["status"].as_str().unwrap_or("?")));
    }
    if readiness["ready"] != json!(true) {
        let nv = readiness["blockers"].as_array().and_then(|a| a.first()).and_then(|b| b["userMessage"].as_str()).unwrap_or("hồ sơ chưa sẵn sàng");
        return Err(format!("Chưa gửi được: {nv}. Chạy Gửi Bước 8 và sửa lỗi trước."));
    }
    sub["version"].as_u64().ok_or_else(|| "Cổng không trả số phiên bản (version) của hồ sơ".to_string())
}

/// Thuần: đọc `submittedAt`, `status`, và cờ còn chờ lãnh đạo ký gửi từ một đối tượng hồ sơ.
pub fn doc_ket_qua(sub: &Value) -> KetQuaGui {
    let lay = |k: &str| sub[k].as_str().map(str::trim).filter(|x| !x.is_empty()).map(str::to_string);
    let cho = sub["allowedActions"].as_array().map(|a| a.iter().any(|x| x == "SIGN_AND_SEND")).unwrap_or(false);
    KetQuaGui { da_gui_luc: lay("submittedAt"), trang_thai: lay("status"), con_cho_lanh_dao: cho || lay("status").as_deref() == Some("UNIT_REVIEW") }
}

/// Gửi hồ sơ `sid`. Chỉ gọi khi người vận hành đã xác nhận; cổng vẫn kiểm quyền và phiên bản (409 nếu hồ sơ vừa bị sửa).
pub async fn gui(sess: &Session, sid: &str) -> Result<KetQuaGui, String> {
    if !an_toan(sid) {
        return Err("Mã hồ sơ không hợp lệ".into());
    }
    let sub = sess.get_json(&format!("/submissions/{sid}"), &[]).await.map_err(loi)?;
    let rd = sess.get_json(&format!("/submissions/{sid}/readiness"), &[]).await.map_err(loi)?;
    let version = quyet_dinh(&sub, &rd)?;
    let khoa = uuid::Uuid::new_v4().to_string();
    let than = serde_json::to_vec(&json!({"expectedVersion": version, "comments": Value::Null})).map_err(|e| e.to_string())?;
    sess.post_json(&format!("/submissions/{sid}/submit"), than, false, &[("Idempotency-Key", &khoa)]).await.map_err(loi)?;
    // Đọc lại để lấy submittedAt do cổng gán, không dựa vào phản hồi của lệnh gửi.
    let sau = sess.get_json(&format!("/submissions/{sid}"), &[]).await.map_err(loi)?;
    Ok(doc_ket_qua(&sau))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sub(extra: Value) -> Value {
        let mut v = json!({"status": "DRAFT", "version": 7, "submittedAt": null, "allowedActions": ["EDIT", "SUBMIT"]});
        for (k, x) in extra.as_object().unwrap() {
            v[k] = x.clone();
        }
        v
    }

    #[test]
    fn duoc_gui_khi_co_quyen_va_san_sang() {
        assert_eq!(quyet_dinh(&sub(json!({})), &json!({"ready": true})), Ok(7));
    }

    #[test]
    fn chan_khi_da_gui_thieu_quyen_hoac_chua_san_sang() {
        assert!(quyet_dinh(&sub(json!({"submittedAt": "2026-11-12T08:00:00+07:00"})), &json!({"ready": true})).unwrap_err().contains("đã gửi"));
        assert!(quyet_dinh(&sub(json!({"allowedActions": ["EDIT"]})), &json!({"ready": true})).unwrap_err().contains("SUBMIT"));
        let e = quyet_dinh(&sub(json!({})), &json!({"ready": false, "blockers": [{"userMessage": "Còn 3 lỗi"}]})).unwrap_err();
        assert!(e.contains("Còn 3 lỗi"));
        assert!(quyet_dinh(&sub(json!({"version": null})), &json!({"ready": true})).is_err());
    }

    #[test]
    fn doc_ket_qua_nhan_ra_cho_lanh_dao() {
        let k = doc_ket_qua(&json!({"status": "UNIT_REVIEW", "submittedAt": "t", "allowedActions": ["SIGN_AND_SEND"]}));
        assert_eq!((k.da_gui_luc.as_deref(), k.con_cho_lanh_dao), (Some("t"), true));
        assert_eq!(doc_ket_qua(&json!({"status": "DRAFT"})).da_gui_luc, None);
    }
}
