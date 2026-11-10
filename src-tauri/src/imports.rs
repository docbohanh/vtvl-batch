//! Đường A, bước kiểm tra: `POST /imports` → theo dõi trạng thái → tải tệp kết quả (giống `vtvl_app/src/cong/kiem-tra.js`).
//! Kết chuyển (`/imports/{id}/commit`) nằm ở `ket_chuyen.rs`.

use crate::portal::{net_err, with_retry, Credentials, Session, StepError};
use reqwest::{multipart, Method};
use serde_json::Value;
use std::path::Path;
use std::time::{Duration, Instant};

pub const TEMPLATE_VERSION: &str = "v2";
const XLSX_MIME: &str = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAX_UPLOAD_BYTES: usize = 50 * 1024 * 1024;
const MIN_CHECK_WAIT: Duration = Duration::from_secs(300);
const JOB_POLL: Duration = Duration::from_millis(1500);
const JOB_TIMEOUT: Duration = Duration::from_secs(60);
const FINAL_STATES: [&str; 5] = ["VALIDATED", "FAILED", "CANCELLED", "COMMITTED", "COMPLETED"];

// ---------- ngữ cảnh: đơn vị, kỳ, hồ sơ ----------

#[derive(Debug, Clone, Default, PartialEq)]
pub struct Ctx {
    pub org_id: String,
    pub period_id: String,
    pub submission_id: String,
}

fn unwrap_list(v: &Value) -> Vec<Value> {
    if let Some(a) = v.as_array() {
        return a.clone();
    }
    ["content", "items", "data", "result", "rows"]
        .iter()
        .find_map(|k| v[*k].as_array().cloned())
        .unwrap_or_default()
}

fn text(v: &Value, key: &str) -> String {
    match &v[key] {
        Value::String(s) => s.clone(),
        Value::Number(n) => n.to_string(),
        _ => String::new(),
    }
}

/// Chọn kỳ, hồ sơ, đơn vị mặc định (cùng cách chọn với `suggestContext` của vtvl_app).
/// Hình dạng thật: `/auth/me` có `orgUnits[]`, `defaultPeriodId`; `/submissions` lồng `orgUnit{}` và `period{}`.
pub fn pick_context(me: &Value, periods: &Value, subs: &Value) -> Ctx {
    let periods = unwrap_list(periods);
    let subs = unwrap_list(subs);
    let my_org = text(&me["orgUnits"][0], "id");

    let default_period = text(me, "defaultPeriodId");
    let period_id = if !default_period.is_empty() {
        default_period
    } else {
        periods
            .iter()
            .find(|p| {
                let s = text(p, "status").to_uppercase();
                ["OPEN", "ACTIVE", "CURRENT"].iter().any(|k| s.contains(k))
            })
            .or(periods.last())
            .map(|p| text(p, "id"))
            .unwrap_or_default()
    };

    let in_period = |s: &&Value| period_id.is_empty() || text(&s["period"], "id") == period_id;
    let mine = |s: &&Value| my_org.is_empty() || text(&s["orgUnit"], "id") == my_org;
    let sub = subs
        .iter()
        .find(|s| in_period(s) && mine(s))
        .or_else(|| subs.iter().find(in_period))
        .or(subs.first());

    let from_sub = |outer: &str| sub.map(|s| text(&s[outer], "id")).unwrap_or_default();
    let pick = |a: String, b: String| if a.is_empty() { b } else { a };
    Ctx {
        org_id: pick(from_sub("orgUnit"), my_org),
        period_id: pick(from_sub("period"), period_id),
        submission_id: sub.map(|s| text(s, "id")).unwrap_or_default(),
    }
}

// ---------- tải lên ----------

fn safe_id(id: &str) -> Result<&str, StepError> {
    let ok = !id.is_empty()
        && id.len() <= 100
        && id.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '.' | '-'));
    if ok {
        Ok(id)
    } else {
        Err(StepError::Fatal("Mã do cổng trả về không hợp lệ".into()))
    }
}

pub struct UploadReq<'a> {
    pub ctx: &'a Ctx,
    pub path: &'a Path,
    /// `Some(formKey)` khi nạp một biểu; `None` khi nạp cả bộ biểu.
    pub form_key: Option<&'a str>,
}

pub async fn upload_excel(s: Session, req: &UploadReq<'_>) -> Result<String, StepError> {
    let bytes = tokio::fs::read(req.path)
        .await
        .map_err(|e| StepError::Fatal(format!("Không đọc được tệp Excel: {e}")))?;
    if bytes.is_empty() {
        return Err(StepError::Fatal("Tệp Excel rỗng".into()));
    }
    if bytes.len() > MAX_UPLOAD_BYTES {
        return Err(StepError::Fatal("Tệp vượt 50 MB, cổng không nhận".into()));
    }
    let name = req
        .path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "bo_bieu.xlsx".into());
    let part = multipart::Part::bytes(bytes)
        .file_name(name)
        .mime_str(XLSX_MIME)
        .map_err(|e| StepError::Fatal(e.to_string()))?;
    let mut form = multipart::Form::new()
        .part("file", part)
        .text("mode", if req.form_key.is_some() { "single" } else { "workbook" })
        .text("orgId", req.ctx.org_id.clone())
        .text("periodId", req.ctx.period_id.clone())
        .text("submissionId", req.ctx.submission_id.clone())
        .text("templateVersion", TEMPLATE_VERSION);
    if let Some(k) = req.form_key {
        form = form.text("formKey", k.to_string());
    }
    let resp = s
        .send(Method::POST, "/imports", &[], Some(form), "application/json")
        .await?;
    let json = crate::portal::parse_json(resp).await?;
    let id = ["id", "importId"]
        .iter()
        .map(|k| text(&json, k))
        .find(|v| !v.is_empty())
        .ok_or_else(|| StepError::Fatal("Cổng không trả mã lần nhập".into()))?;
    Ok(safe_id(&id)?.to_string())
}

// ---------- theo dõi trạng thái ----------

#[derive(Debug, Clone, PartialEq, Default)]
pub struct ImportInfo {
    pub status: String,
    pub total: Option<u64>,
    pub block: Option<u64>,
    pub warning: Option<u64>,
    /// Lý do `FAILED`, lấy từ `fileIssues[]` (mức khác WARNING/INFO).
    pub error: Option<String>,
    pub warnings: Vec<String>,
}

impl ImportInfo {
    pub fn is_final(&self) -> bool {
        FINAL_STATES.contains(&self.status.as_str())
    }
}

/// Hình dạng thật của `GET /imports/{id}`: thống kê nằm trong `summary{}`, lỗi mức tệp trong `fileIssues[]`.
pub fn parse_import_info(v: &Value) -> ImportInfo {
    let num = |k: &str| v["summary"][k].as_u64();
    let issues = v["fileIssues"].as_array().cloned().unwrap_or_default();
    let msg = |i: &Value| i["user_message"].as_str().filter(|s| !s.is_empty()).map(str::to_string);
    let severity = |i: &Value| i["severity"].as_str().unwrap_or("").to_uppercase();
    let error = issues
        .iter()
        .filter(|i| !matches!(severity(i).as_str(), "WARNING" | "INFO"))
        .find_map(msg)
        .or_else(|| {
            ["errorMessage", "message", "error"]
                .iter()
                .find_map(|k| v[*k].as_str().filter(|s| !s.is_empty()).map(str::to_string))
        });
    ImportInfo {
        status: v["status"].as_str().unwrap_or("UNKNOWN").to_uppercase(),
        total: num("totalRows"),
        block: num("blockRows"),
        warning: num("warningRows"),
        error,
        warnings: issues
            .iter()
            .filter(|i| severity(i) == "WARNING")
            .filter_map(msg)
            .collect(),
    }
}

async fn fetch_info(s: Session, id: &str) -> Result<ImportInfo, StepError> {
    let v = s.get_json(&format!("/imports/{}", safe_id(id)?), &[]).await?;
    Ok(parse_import_info(&v))
}

/// Chờ cổng kiểm tra xong (UPLOADED → CHECKING → VALIDATING → trạng thái cuối).
pub async fn wait_final(
    sess: &mut Session,
    creds: &Credentials<'_>,
    retries: u32,
    poll: Duration,
    id: &str,
) -> Result<ImportInfo, String> {
    let deadline = Instant::now() + creds.timeout.max(MIN_CHECK_WAIT);
    loop {
        let info = with_retry(sess, creds, retries, |s| fetch_info(s, id)).await?;
        if info.is_final() {
            return Ok(info);
        }
        if Instant::now() >= deadline {
            return Err("Quá thời gian chờ cổng kiểm tra, xem lại trên cổng".into());
        }
        tokio::time::sleep(poll).await;
    }
}

// ---------- tệp kết quả (sheet "Danh sách lỗi") ----------

fn is_zip(b: &[u8]) -> bool {
    b.len() >= 2 && b[0] == 0x50 && b[1] == 0x4b
}

/// `GET /imports/{id}/result-file` trả JSON tham chiếu một job xuất tệp (`{jobId}`); chờ job xong rồi tải `/files/{fileId}`.
pub async fn download_result(s: Session, id: &str) -> Result<Vec<u8>, StepError> {
    let resp = s
        .send(Method::GET, &format!("/imports/{}/result-file", safe_id(id)?), &[], None, "*/*")
        .await?;
    let first = resp.bytes().await.map_err(net_err)?;
    if is_zip(&first) {
        return Ok(first.to_vec());
    }
    let job: Value = serde_json::from_slice(&first)
        .map_err(|_| StepError::Fatal("Cổng không trả về tệp kết quả hợp lệ".into()))?;
    let job_id = job["jobId"]
        .as_str()
        .ok_or_else(|| StepError::Fatal("Cổng không trả về tệp kết quả hợp lệ".into()))?;
    let file_id = wait_job(&s, job_id).await?;
    download_file(&s, &file_id).await
}

async fn wait_job(s: &Session, job_id: &str) -> Result<String, StepError> {
    let deadline = Instant::now() + JOB_TIMEOUT;
    loop {
        let job = s.get_json(&format!("/jobs/{}", safe_id(job_id)?), &[]).await?;
        match job["status"].as_str().unwrap_or("").to_uppercase().as_str() {
            "SUCCEEDED" => {
                return job["result"]["fileId"]
                    .as_str()
                    .map(str::to_string)
                    .ok_or_else(|| StepError::Fatal("Cổng xuất tệp xong nhưng không có mã tệp".into()));
            }
            "FAILED" | "CANCELLED" => {
                let why = job["userMessage"].as_str().unwrap_or("không rõ lý do");
                return Err(StepError::Fatal(format!("Cổng xuất tệp kết quả không thành công: {why}")));
            }
            _ if Instant::now() >= deadline => {
                return Err(StepError::Fatal("Cổng xuất tệp kết quả quá lâu, thử lại sau".into()));
            }
            _ => tokio::time::sleep(JOB_POLL).await,
        }
    }
}

/// `/files/{id}` thường chuyển hướng (302) sang kho lưu trữ có chữ ký tạm thời; không gửi cookie cổng sang đó.
async fn download_file(s: &Session, file_id: &str) -> Result<Vec<u8>, StepError> {
    let resp = s
        .send_raw(Method::GET, &format!("/files/{}", safe_id(file_id)?), &[], None, "*/*")
        .await?;
    let resp = if resp.status().is_redirection() {
        let loc = resp
            .headers()
            .get("location")
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| StepError::Fatal("Cổng chuyển hướng nhưng không có địa chỉ đích".into()))?
            .to_string();
        reqwest::get(&loc).await.map_err(net_err)?
    } else {
        resp
    };
    if !resp.status().is_success() {
        return Err(StepError::Fatal(format!("Không tải được tệp kết quả (HTTP {})", resp.status().as_u16())));
    }
    let bytes = resp.bytes().await.map_err(net_err)?;
    if is_zip(&bytes) {
        Ok(bytes.to_vec())
    } else {
        Err(StepError::Fatal("Tệp tải về từ cổng không đúng định dạng .xlsx".into()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;


    #[test]
    fn info_reads_nested_summary_and_issues() {
        let v = json!({
            "status": "validated",
            "summary": {"totalRows": 4917, "blockRows": 3, "warningRows": 39},
            "fileIssues": [
                {"severity": "WARNING", "user_message": "Thiếu sheet phụ"},
                {"severity": "ERROR", "user_message": "Tệp không đúng mẫu"}
            ]
        });
        let i = parse_import_info(&v);
        assert_eq!((i.status.as_str(), i.total, i.block, i.warning), ("VALIDATED", Some(4917), Some(3), Some(39)));
        assert_eq!(i.error.as_deref(), Some("Tệp không đúng mẫu"));
        assert_eq!(i.warnings, vec!["Thiếu sheet phụ".to_string()]);
        assert!(i.is_final());
    }

    #[test]
    fn processing_states_are_not_final() {
        for s in ["UPLOADED", "CHECKING", "VALIDATING", "COMMITTING"] {
            assert!(!parse_import_info(&json!({"status": s})).is_final());
        }
    }


    #[test]
    fn context_follows_default_period_and_nested_shapes() {
        let me = json!({"defaultPeriodId": "p2", "orgUnits": [{"id": "o1"}]});
        let periods = json!({"items": [{"id": "p1", "status": "CLOSED"}, {"id": "p2", "status": "OPEN"}]});
        let subs = json!([
            {"id": "s1", "orgUnit": {"id": "o1"}, "period": {"id": "p1"}},
            {"id": "s2", "orgUnit": {"id": "o1"}, "period": {"id": "p2"}}
        ]);
        assert_eq!(
            pick_context(&me, &periods, &subs),
            Ctx { org_id: "o1".into(), period_id: "p2".into(), submission_id: "s2".into() }
        );
    }

    #[test]
    fn context_falls_back_to_open_period() {
        let me = json!({"orgUnits": [{"id": "o1"}]});
        let periods = json!([{"id": "p1", "status": "CLOSED"}, {"id": "p2", "status": "OPEN"}]);
        let c = pick_context(&me, &periods, &json!([]));
        assert_eq!(c.period_id, "p2");
        assert!(c.submission_id.is_empty());
    }

    #[test]
    fn ids_are_validated() {
        assert!(safe_id("imp-1.a_b").is_ok());
        assert!(safe_id("../x").is_err());
        assert!(safe_id("").is_err());
    }

    #[test]
    fn zip_magic() {
        assert!(is_zip(b"PK\x03\x04"));
        assert!(!is_zip(b"{\"jobId\"}"));
    }
}
