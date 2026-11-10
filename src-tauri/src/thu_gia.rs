//! Máy chủ HTTP giả cho test (chỉ biên dịch khi test): trả lời theo kịch bản, ghi lại yêu cầu.

use crate::portal::{connect, Credentials, Session, ThietBi};
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

pub type Kich = Vec<(String, u16, Value)>;
#[derive(Clone, Default)]
pub struct Ghi(pub Arc<Mutex<Vec<(String, String, Vec<(String, String)>, Vec<u8>)>>>);

/// Máy chủ HTTP giả: trả lời theo kịch bản `(đuôi đường dẫn, mã, JSON)`, mục đầu khớp được dùng một lần (trừ `/auth/me` dùng lại); ghi lại yêu cầu.
pub async fn may_chu_gia(kich: Kich) -> (String, Ghi) {
    let l = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = format!("http://{}", l.local_addr().unwrap());
    let ghi = Ghi::default();
    let (g, kich) = (ghi.clone(), Arc::new(Mutex::new(kich)));
    tokio::spawn(async move {
        loop {
            let Ok((mut s, _)) = l.accept().await else { return };
            let (g, kich) = (g.clone(), kich.clone());
            tokio::spawn(async move {
                let mut buf = Vec::new();
                let mut tmp = [0u8; 8192];
                let (dau, mut thele) = loop {
                    let n = s.read(&mut tmp).await.unwrap_or(0);
                    if n == 0 { return; }
                    buf.extend_from_slice(&tmp[..n]);
                    if let Some(p) = buf.windows(4).position(|w| w == b"\r\n\r\n") { break (String::from_utf8_lossy(&buf[..p]).into_owned(), buf[p + 4..].to_vec()); }
                };
                let mut lines = dau.lines();
                let dong1: Vec<&str> = lines.next().unwrap().split(' ').collect();
                let headers: Vec<(String, String)> = lines.filter_map(|l| l.split_once(": ").map(|(k, v)| (k.to_lowercase(), v.to_string()))).collect();
                let dai: usize = headers.iter().find(|(k, _)| k == "content-length").and_then(|(_, v)| v.parse().ok()).unwrap_or(0);
                while thele.len() < dai {
                    let n = s.read(&mut tmp).await.unwrap_or(0);
                    if n == 0 { break; }
                    thele.extend_from_slice(&tmp[..n]);
                }
                let (method, path) = (dong1[0].to_string(), dong1[1].to_string());
                g.0.lock().unwrap().push((method, path.clone(), headers, thele));
                let (ma, body) = {
                    let mut k = kich.lock().unwrap();
                    match k.iter().position(|(p, _, _)| path.split('?').next().unwrap_or("").ends_with(p.as_str())) {
                        Some(i) if k[i].0 != "/auth/me" => { let (_, c, b) = k.remove(i); (c, b) }
                        Some(i) => (k[i].1, k[i].2.clone()),
                        None => (404, json!({"code": "NOT_FOUND"})),
                    }
                };
                let tx = body.to_string();
                let resp = format!("HTTP/1.1 {ma} X\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{tx}", tx.len());
                let _ = s.write_all(resp.as_bytes()).await;
            });
        }
    });
    (addr, ghi)
}

pub async fn phien(addr: &str) -> Session {
    let c = Credentials { base: addr, cookie: "SESSION=x; XSRF-TOKEN=tok", timeout: Duration::from_secs(5) };
    connect(&c).await.unwrap().voi_thiet_bi(ThietBi { id: "dev-1".into(), ten: "VTVL Batch".into(), phien_ban: "1.0.0".into(), nen_tang: "test".into() })
}
