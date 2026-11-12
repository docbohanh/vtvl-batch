//! Xuất các biểu của một hồ sơ (đọc từ cổng) thành bộ biểu theo mẫu B30K: tiến trình phụ Node `scripts/xuat-b30k/cli.mjs`
//! ghi dữ liệu vào bản sao `templates/03_Bo_bieu_VTVL_30000.xlsx` (chỉ ghi ô NHẬP, giữ công thức, khóa, danh sách chọn).

use crate::quan_tri::DuLieuBieu;
use serde_json::{json, Map, Value};
use std::path::{Path, PathBuf};
use std::time::Duration;
use tokio::process::Command;

pub const TEN_MAU: &str = "03_Bo_bieu_VTVL_30000.xlsx";
const HAN_CHO: Duration = Duration::from_secs(300);

/// Các thư mục `scripts/` và `templates/` suy từ đường dẫn tập lệnh kiểm tra (`.../scripts/kiem-tra/cli.mjs`).
pub fn duong_xuat(kiem_tra_script: &Path) -> Result<(PathBuf, PathBuf), String> {
    let scripts = kiem_tra_script.parent().and_then(Path::parent).ok_or("Không xác định được thư mục scripts/")?;
    let script = scripts.join("xuat-b30k").join("cli.mjs");
    let mau = scripts.parent().map(|g| g.join("templates").join(TEN_MAU)).ok_or("Không xác định được thư mục templates/")?;
    if !script.is_file() { return Err(format!("Thiếu tập lệnh xuất B30K: {}", script.display())); }
    if !mau.is_file() { return Err(format!("Thiếu mẫu bộ biểu B30K: {} (đặt tệp {TEN_MAU} vào thư mục templates/ cạnh scripts/)", mau.display())); }
    Ok((script, mau))
}

/// Dữ liệu vào cho tập lệnh Node: `{bieu: {<khóa>: {kieu: {A: "DECIMAL"…}, dong: [{A: …}]}}}`.
pub fn dung_vao(cac: &[DuLieuBieu]) -> Value {
    let mut bieu = Map::new();
    for b in cac {
        let kieu: Map<String, Value> = b.bieu.cot.iter().map(|c| (c.chu.clone(), json!(c.kieu))).collect();
        let dong: Vec<Value> = b.dong.iter().map(|d| Value::Object(d.du_lieu.iter().map(|(k, v)| (k.clone(), v.clone())).collect())).collect();
        bieu.insert(b.bieu.khoa.clone(), json!({ "kieu": kieu, "dong": dong }));
    }
    json!({ "bieu": bieu })
}

/// Đọc dòng JSON cuối của stdout Node: `{ok:true,…}` hoặc `{ok:false,loi}`.
pub fn doc_ket_qua(stdout: &str, stderr: &str) -> Result<Value, String> {
    let dong = stdout.lines().rev().find(|l| l.trim_start().starts_with('{'));
    match dong.and_then(|l| serde_json::from_str::<Value>(l).ok()) {
        Some(v) if v["ok"].as_bool() == Some(true) => Ok(v),
        Some(v) => Err(format!("Xuất B30K thất bại: {}", v["loi"].as_str().unwrap_or("lỗi không rõ"))),
        None => Err(format!("Xuất B30K thất bại: {}", crate::kiem_tra_local::loi_tu_stderr(stderr))),
    }
}

/// Ghi `cac` vào bản sao mẫu B30K tại `dich`.
pub async fn xuat(node: &str, kiem_tra_script: &Path, cac: &[DuLieuBieu], dich: &Path) -> Result<(), String> {
    if cac.is_empty() { return Err("Hồ sơ chưa có biểu nào để xuất".into()); }
    let (script, mau) = duong_xuat(kiem_tra_script)?;
    let vao = std::env::temp_dir().join(format!("vtvl-xuat-b30k-{}-{}.json", std::process::id(), chrono::Utc::now().timestamp_millis()));
    std::fs::write(&vao, serde_json::to_vec(&dung_vao(cac)).map_err(|e| e.to_string())?).map_err(|e| format!("Không ghi được tệp tạm: {e}"))?;
    let node = crate::kiem_tra_local::tim_node(node);
    let kq = tokio::time::timeout(HAN_CHO, Command::new(&node).arg(&script).arg(&vao).arg(&mau).arg(dich).kill_on_drop(true).output()).await;
    let _ = std::fs::remove_file(&vao);
    let out = kq.map_err(|_| "Xuất B30K quá thời gian chờ (5 phút)".to_string())?
        .map_err(|e| format!("Không chạy được Node ({node}): {e}. Cài Node.js 20 trở lên hoặc đặt đường dẫn đầy đủ vào `settings.node` trong cấu hình lô."))?;
    doc_ket_qua(&String::from_utf8_lossy(&out.stdout), &String::from_utf8_lossy(&out.stderr)).map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::quan_tri::{Bieu, Cot, Dong};

    fn bieu() -> DuLieuBieu {
        let cot = |c: &str, k: &str| Cot { chu: c.into(), tieu_de: c.into(), loai: "INPUT".into(), kieu: k.into() };
        DuLieuBieu {
            bieu: Bieu { khoa: "c3".into(), ma: "C3".into(), tieu_de: "".into(), buoc: 1, cot: vec![cot("A", "TEXT"), cot("J", "DECIMAL")] },
            trang_thai: "".into(), tong: 1, dong_dat: 1, dong_chua_dat: 0, canh_bao: 0, bi_cat: false,
            dong: vec![Dong { so: 1, du_lieu: [("A".to_string(), json!("X-01")), ("J".to_string(), json!("2.5"))].into_iter().collect(), trang_thai: "OK".into(), loi: vec![], cap_nhat: "".into() }],
        }
    }

    #[test]
    fn dau_vao_mang_kieu_cot_va_dong_du_lieu() {
        let v = dung_vao(&[bieu()]);
        assert_eq!(v["bieu"]["c3"]["kieu"]["J"], "DECIMAL");
        assert_eq!(v["bieu"]["c3"]["dong"][0]["A"], "X-01");
    }

    #[test]
    fn ket_qua_node_ok_loi_va_stderr() {
        assert!(doc_ket_qua("rac\n{\"ok\":true,\"soDong\":{}}\n", "").is_ok());
        assert_eq!(doc_ket_qua("{\"ok\":false,\"loi\":\"vượt sức chứa\"}", "").unwrap_err(), "Xuất B30K thất bại: vượt sức chứa");
        assert!(doc_ket_qua("", "Error: Cannot find module").unwrap_err().contains("Cannot find module"));
    }

    #[test]
    fn duong_xuat_bao_thieu_tep() {
        let e = duong_xuat(Path::new("/khong/co/scripts/kiem-tra/cli.mjs")).unwrap_err();
        assert!(e.contains("Thiếu tập lệnh xuất B30K"));
    }
}
