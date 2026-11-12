//! Màn hình "Tổng quan" của một đơn vị: số liệu giống trang làm việc của ứng dụng Desktop
//! (`GET /dashboard?orgUnitId&periodId&scope=SELF`). Chỉ đọc, không thay đổi gì trên cổng.

use crate::portal::{Session, StepError};
use serde::Serialize;
use serde_json::Value;

/// Một ô chỉ số (vd "Nhiệm vụ 502", "VTVL đủ căn cứ 100 %"). Giá trị giữ nguyên kiểu cổng trả (số, chuỗi hoặc rỗng) để giao diện định dạng.
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Kpi {
    pub khoa: String,
    pub nhan: String,
    #[serde(rename = "giaTri")]
    pub gia_tri: Value,
    #[serde(rename = "donVi")]
    pub don_vi: String,
    #[serde(rename = "chuaKiemChung")]
    pub chua_kiem_chung: Value,
}

/// Một bước trong "Tiến độ 08 bước".
#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct Buoc {
    pub buoc: u32,
    #[serde(rename = "tieuDe")]
    pub tieu_de: String,
    #[serde(rename = "xong")]
    pub xong: u64,
    #[serde(rename = "dangLam")]
    pub dang_lam: u64,
    #[serde(rename = "chuaBatDau")]
    pub chua_bat_dau: u64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct TongQuan {
    pub kpis: Vec<Kpi>,
    pub buoc: Vec<Buoc>,
    #[serde(rename = "capNhat")]
    pub cap_nhat: String,
}

fn chuoi(v: &Value, k: &str) -> String {
    v[k].as_str().unwrap_or_default().to_string()
}

fn so(v: &Value, k: &str) -> u64 {
    v[k].as_u64().unwrap_or(0)
}

/// Thuần: dựng số liệu tổng quan từ phản hồi `/dashboard`. Bỏ qua phần tử thiếu nhãn; bước thiếu số thứ tự lấy theo vị trí.
pub fn phan_tich(v: &Value) -> TongQuan {
    let kpis = v["kpis"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter(|k| !chuoi(k, "label").is_empty())
                .map(|k| Kpi {
                    khoa: chuoi(k, "key"),
                    nhan: chuoi(k, "label"),
                    gia_tri: k["value"].clone(),
                    don_vi: chuoi(k, "unit"),
                    chua_kiem_chung: k["unverifiedValue"].clone(),
                })
                .collect()
        })
        .unwrap_or_default();
    let buoc = v["steps"]
        .as_array()
        .map(|a| {
            a.iter()
                .enumerate()
                .map(|(i, b)| Buoc {
                    buoc: b["step"].as_u64().map(|n| n as u32).unwrap_or(i as u32 + 1),
                    tieu_de: chuoi(b, "title"),
                    xong: so(b, "done"),
                    dang_lam: so(b, "inProgress"),
                    chua_bat_dau: so(b, "notStarted"),
                })
                .collect()
        })
        .unwrap_or_default();
    TongQuan { kpis, buoc, cap_nhat: chuoi(v, "generatedAt") }
}

fn loi(e: StepError) -> String {
    match e {
        StepError::Auth(m) | StepError::Retry(m) | StepError::Fatal(m) => m,
    }
}

/// Mã đơn vị/kỳ chỉ gồm chữ, số, `-`, `_`: để không chèn được ký tự lạ vào tham số truy vấn.
fn an_toan(s: &str) -> bool {
    !s.is_empty() && s.len() <= 64 && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

/// Đọc số liệu tổng quan của đơn vị `org_id` trong kỳ `ky_id` (phạm vi `SELF`, như trang làm việc Desktop).
pub async fn lay(sess: &Session, org_id: &str, ky_id: &str) -> Result<TongQuan, String> {
    if !an_toan(org_id) || !an_toan(ky_id) {
        return Err("Mã đơn vị hoặc kỳ không hợp lệ: bấm Kiểm tra kết nối để đọc lại".into());
    }
    let v = sess
        .get_json("/dashboard", &[("orgUnitId", org_id), ("periodId", ky_id), ("scope", "SELF")])
        .await
        .map_err(loi)?;
    Ok(phan_tich(&v))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn dung_chi_so_va_buoc_tu_phan_hoi_cong() {
        let v = json!({
            "kpis": [
                {"key": "TASKS", "label": "Nhiệm vụ", "value": 502},
                {"key": "COVERAGE", "label": "VTVL đủ căn cứ", "value": 100, "unit": "%"},
                {"key": "X", "label": "Có chưa kiểm chứng", "value": 7, "unverifiedValue": 2},
                {"key": "BO", "label": ""}
            ],
            "steps": [
                {"step": 1, "title": "Rà soát nhiệm vụ", "done": 5, "inProgress": 0, "notStarted": 0},
                {"title": "Phân rã công việc", "done": 1, "inProgress": 2, "notStarted": 3}
            ],
            "generatedAt": "2026-11-11T12:06:00+07:00"
        });
        let t = phan_tich(&v);
        assert_eq!(t.kpis.len(), 3, "bỏ ô thiếu nhãn");
        assert_eq!(t.kpis[0].gia_tri, json!(502));
        assert_eq!(t.kpis[1].don_vi, "%");
        assert_eq!(t.kpis[2].chua_kiem_chung, json!(2));
        assert_eq!(t.buoc.len(), 2);
        assert_eq!(t.buoc[1].buoc, 2, "bước thiếu số thứ tự lấy theo vị trí");
        assert_eq!((t.buoc[1].xong, t.buoc[1].dang_lam, t.buoc[1].chua_bat_dau), (1, 2, 3));
        assert_eq!(t.cap_nhat, "2026-11-11T12:06:00+07:00");
    }

    #[test]
    fn phan_hoi_rong_hoac_sai_kieu_khong_gay_loi() {
        for v in [json!({}), json!(null), json!({"kpis": "x", "steps": 3})] {
            let t = phan_tich(&v);
            assert!(t.kpis.is_empty() && t.buoc.is_empty() && t.cap_nhat.is_empty());
        }
    }

    #[test]
    fn chi_nhan_ma_an_toan() {
        assert!(an_toan("0c000000-0000-0000-0000-000000002526"));
        assert!(!an_toan(""));
        assert!(!an_toan("a&scope=ALL"));
        assert!(!an_toan("a b"));
    }
}
