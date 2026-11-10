//! Danh mục sản phẩm chuẩn dùng chung cả lô: tải một lần từ `/catalogs/products`, lưu `data/_chung/danh-muc.json` (làm mới sau 24 giờ).

use crate::lo;
use crate::portal::Session;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};

const TUOI_TOI_DA: Duration = Duration::from_secs(24 * 3600);
const CO_TRANG: usize = 200;
const TRANG_TOI_DA: usize = 200;
const DA_XAC_NHAN: &str = "Đã xác nhận";

pub fn tep_chung(root: &Path) -> PathBuf {
    root.join("_chung").join("danh-muc.json")
}

fn con_moi(p: &Path) -> bool {
    std::fs::metadata(p).and_then(|m| m.modified()).ok().and_then(|t| SystemTime::now().duration_since(t).ok()).is_some_and(|d| d < TUOI_TOI_DA)
}

/// Sản phẩm chuẩn = "Đã xác nhận" và còn hiệu lực vào ngày `hom_nay` (YYYY-MM-DD; `effectiveTo` trống là không giới hạn).
pub fn loc_san_pham(items: &[Value], hom_nay: &str) -> (Vec<String>, Vec<Value>) {
    let mut ma = Vec::new();
    let mut sp = Vec::new();
    for p in items {
        let code = p["code"].as_str().unwrap_or("").trim();
        let tu = p["effectiveFrom"].as_str().unwrap_or("");
        let den = p["effectiveTo"].as_str().unwrap_or("");
        let hieu_luc = (tu.is_empty() || tu <= hom_nay) && (den.is_empty() || den >= hom_nay);
        if code.is_empty() || p["confirmStatus"].as_str() != Some(DA_XAC_NHAN) || !hieu_luc {
            continue;
        }
        let phut = p["standardMinutes"].as_str().and_then(|s| s.replace(',', ".").parse::<f64>().ok()).or_else(|| p["standardMinutes"].as_f64()).filter(|m| *m > 0.0);
        ma.push(code.to_string());
        sp.push(json!({"ma_sp": code, "phut_chuan": phut, "trang_thai": DA_XAC_NHAN}));
    }
    (ma, sp)
}

/// Bảo đảm có tệp danh mục mới; trả đường dẫn. Lỗi tải thì dùng bản cũ nếu có, không thì báo lỗi.
pub async fn dam_bao(sess: &Session, root: &Path, nghi_ms: u64) -> Result<PathBuf, String> {
    let file = tep_chung(root);
    if con_moi(&file) {
        return Ok(file);
    }
    match tai(sess, nghi_ms).await {
        Ok(items) => {
            let (ma, sp) = loc_san_pham(&items, &chrono::Local::now().format("%Y-%m-%d").to_string());
            lo::ghi_json(&file, &json!({"schema": lo::SCHEMA, "taiLuc": lo::bay_gio(), "products": ma, "sanPham": sp}))?;
            Ok(file)
        }
        Err(e) if file.exists() => {
            let _ = e; // dùng bản cũ: kiểm tra mã SP vẫn chạy được, chỉ có thể lỗi thời
            Ok(file)
        }
        Err(e) => Err(format!("Không tải được danh mục sản phẩm chuẩn: {e}")),
    }
}

async fn tai(sess: &Session, nghi_ms: u64) -> Result<Vec<Value>, String> {
    let mut tat_ca: Vec<Value> = Vec::new();
    for trang in 1..=TRANG_TOI_DA {
        let (p, s) = (trang.to_string(), CO_TRANG.to_string());
        let v = sess.get_json("/catalogs/products", &[("page", &p), ("size", &s)]).await.map_err(|e| format!("{e:?}"))?;
        let items = v["items"].as_array().cloned().unwrap_or_default();
        let tong = v["total"].as_u64().unwrap_or(0) as usize;
        let rong = items.is_empty();
        tat_ca.extend(items);
        if rong || tat_ca.len() >= tong {
            break;
        }
        tokio::time::sleep(Duration::from_millis(nghi_ms)).await;
    }
    Ok(tat_ca)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_confirmed_effective_products_are_standard() {
        let items = vec![
            json!({"code": "SP.01", "confirmStatus": "Đã xác nhận", "standardMinutes": "20", "effectiveFrom": "2025-10-01", "effectiveTo": null}),
            json!({"code": "SP.02", "confirmStatus": "Đang kiểm chứng", "standardMinutes": "5", "effectiveFrom": "2025-10-01"}),
            json!({"code": "SP.03", "confirmStatus": "Đã xác nhận", "standardMinutes": "7,5", "effectiveFrom": "2025-10-01", "effectiveTo": "2026-01-01"}),
            json!({"code": " ", "confirmStatus": "Đã xác nhận"}),
            json!({"code": "SP.04", "confirmStatus": "Đã xác nhận", "standardMinutes": "0"}),
        ];
        let (ma, sp) = loc_san_pham(&items, "2026-11-09");
        assert_eq!(ma, vec!["SP.01", "SP.04"]);
        assert_eq!(sp[0]["phut_chuan"], 20.0);
        assert!(sp[1]["phut_chuan"].is_null(), "phút 0 coi như chưa có");
    }
}
