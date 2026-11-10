//! Ảnh chụp hồ sơ trên máy chủ để so sánh khi tính thay đổi và để đối chiếu sau khi gửi.
//!
//! Định dạng đã khảo sát (bản 1.2.8, hồ sơ thử): `GET /sync/bootstrap?periodId&submissionIds` trả siêu dữ liệu và `submissions[].rowsFileId`;
//! `GET /files/{rowsFileId}` (gzip) trả `{formKey: [{id, version, rowNo, deleted, data{A..}}]}` với `data` khóa theo chữ cột.

use crate::lo;
use crate::portal::Session;
use crate::thay_doi::{AnhChup, DongMayChu};
use serde_json::{json, Value};
use std::collections::BTreeMap;
use std::path::Path;

/// Tải siêu dữ liệu và toàn bộ dòng hồ sơ (chỉ đọc), lưu `may-chu/bootstrap.json`, `may-chu/hang.json`, `may-chu/con-tro.json`.
/// @returns (bọc siêu dữ liệu, dòng theo biểu)
pub async fn tai(sess: &Session, period_id: &str, submission_id: &str, dir: &Path) -> Result<(Value, Value), String> {
    let raw = sess
        .get_json("/sync/bootstrap", &[("periodId", period_id), ("submissionIds", submission_id)])
        .await
        .map_err(|e| format!("Không tải được ảnh chụp hồ sơ: {e:?}"))?;
    let sub = raw["submissions"].as_array().and_then(|a| a.iter().find(|s| s["submission"]["id"].as_str() == Some(submission_id)).or_else(|| a.first())).cloned().unwrap_or(Value::Null);
    let fid = sub["rowsFileId"].as_str().ok_or("Phản hồi /sync/bootstrap không có rowsFileId của hồ sơ")?;
    let bytes = sess.tai_tep(fid).await.map_err(|e| format!("Không tải được tệp dòng hồ sơ: {e:?}"))?;
    let hang: Value = serde_json::from_slice(&bytes).map_err(|e| format!("Tệp dòng hồ sơ không phải JSON: {e}"))?;
    let wrap = json!({
        "schema": lo::SCHEMA,
        "taiLuc": lo::bay_gio(),
        "submissionId": submission_id,
        "phienBanHoSo": sub["submission"]["version"].clone(),
        "ruleVersion": raw["ruleVersion"].clone(),
        "cursor": raw["cursor"].clone(),
        "tho": raw,
    });
    lo::ghi_json(&dir.join("may-chu").join("bootstrap.json"), &wrap)?;
    lo::ghi_json(&dir.join("may-chu").join("hang.json"), &hang)?;
    lo::ghi_json(&dir.join("may-chu").join("con-tro.json"), &json!({"schema": lo::SCHEMA, "cursor": wrap["cursor"]}))?;
    Ok((wrap, hang))
}

/// Giá trị ô của máy chủ về chuỗi: chữ giữ nguyên, số thành chuỗi số, rỗng/đúng-sai bỏ.
fn ve_chuoi(v: &Value) -> Option<String> {
    match v {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    }
}

/// Dòng theo biểu → ảnh chụp. Bỏ dòng đã xóa (`deleted`); lỗi nếu cấu trúc không đúng.
pub fn chuan_hoa(hang: &Value) -> Result<AnhChup, String> {
    let obj = hang.as_object().ok_or("Tệp dòng hồ sơ không phải đối tượng theo biểu")?;
    let mut anh = AnhChup::new();
    for (form, rows) in obj {
        let rows = rows.as_array().ok_or_else(|| format!("Biểu {form}: không phải danh sách dòng"))?;
        let mut ds = Vec::with_capacity(rows.len());
        for r in rows.iter().filter(|r| r["deleted"].as_bool() != Some(true)) {
            let id = r["id"].as_str().ok_or_else(|| format!("Biểu {form}: dòng thiếu id"))?;
            let data: BTreeMap<String, String> = r["data"].as_object().map(|d| d.iter().filter_map(|(k, v)| ve_chuoi(v).map(|s| (k.clone(), s))).collect()).unwrap_or_default();
            ds.push(DongMayChu { row_id: id.to_string(), version: r["version"].as_u64(), data });
        }
        anh.insert(form.clone(), ds);
    }
    Ok(anh)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rows_are_normalized_by_form_with_typed_values_as_strings() {
        let hang = json!({
            "a1": [{"id": "r1", "version": 2, "deleted": false, "data": {"A": "NV-1", "B": null, "C": 5, "D": true}},
                   {"id": "r2", "version": 1, "deleted": true, "data": {"A": "NV-2"}}],
            "b2_thaydoi": []
        });
        let anh = chuan_hoa(&hang).unwrap();
        assert_eq!(anh["a1"].len(), 1, "dòng đã xóa bị bỏ");
        let r = &anh["a1"][0];
        assert_eq!((r.row_id.as_str(), r.version), ("r1", Some(2)));
        assert_eq!(r.data.get("C").map(String::as_str), Some("5"));
        assert!(!r.data.contains_key("B") && !r.data.contains_key("D"));
        assert!(anh["b2_thaydoi"].is_empty());
    }

    #[test]
    fn malformed_files_are_rejected() {
        assert!(chuan_hoa(&json!([])).is_err());
        assert!(chuan_hoa(&json!({"a1": "x"})).is_err());
        assert!(chuan_hoa(&json!({"a1": [{"version": 1}]})).is_err());
    }
}
