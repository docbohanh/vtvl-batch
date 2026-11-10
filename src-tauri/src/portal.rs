//! Máy khách tới cổng chính thức, gọi `/api/v1/*`. Hai kiểu phiên:
//!  - **Kênh Desktop** (ưu tiên): `POST /api/v1/auth/desktop/login` bằng tài khoản + mật khẩu, nhận token Bearer (tự làm mới, tự đăng nhập lại khi hết hạn).
//!    Đây là kênh ứng dụng máy tính dùng; **quyền sửa/nhập chỉ có ở kênh này** (đã kiểm chứng: cùng tài khoản, phiên web `canEdit = 0/11`, kênh Desktop `10/11`).
//!  - **Cookie web** (dự phòng, dán tay): chỉ xem được; ghi dữ liệu bị cổng từ chối.
//!
//! Module này không cố vượt tầng chống tự động (WAF); đăng nhập Desktop là điểm cuối API thường, không bị WAF chặn.

use reqwest::cookie::{CookieStore, Jar};
use reqwest::{multipart, Client, Method, StatusCode, Url};
use serde_json::Value;
use std::future::Future;
use std::sync::Arc;
use std::time::{Duration, Instant};

const API: &str = "/api/v1";
const MAX_DETAIL_CHARS: usize = 300;
const RETRY_BASE_DELAY_MS: u64 = 500;
const LAM_MOI_TRUOC: Duration = Duration::from_secs(30);
const HAN_MAC_DINH_S: u64 = 300;

/// Phân loại lỗi để quyết định thử lại, đăng nhập lại hay dừng hẳn.
#[derive(Debug)]
pub enum StepError {
    /// Lỗi tạm thời (mạng, 5xx, 429): thử lại.
    Retry(String),
    /// Phiên hết hạn (401 hoặc bị chuyển hướng đăng nhập): đăng nhập lại một lần.
    Auth(String),
    /// Lỗi chắc chắn (thiếu quyền 403, dữ liệu sai, 4xx khác): dừng.
    Fatal(String),
}

pub struct Credentials<'a> {
    pub base: &'a str,
    /// Cookie dán từ trình duyệt; rỗng thì đăng nhập bằng tài khoản.
    pub cookie: &'a str,
    pub timeout: Duration,
}

/// Thiết bị của ứng dụng: cổng nhận diện qua tiêu đề `X-Device-Id` (đăng ký ngầm ở lần gọi đầu, bản 1.2.8 `runtime-*.js`).
#[derive(Debug, Clone, PartialEq)]
pub struct ThietBi {
    pub id: String,
    pub ten: String,
    pub phien_ban: String,
    pub nen_tang: String,
}

/// Phiên kênh Desktop: token Bearer và thông tin để làm mới/đăng nhập lại. Chỉ trong bộ nhớ.
struct DesktopAuth {
    username: String,
    password: String,
    access: String,
    refresh: String,
    het_han: Instant,
}

/// Cách mở phiên.
pub enum DangNhap<'a> {
    /// Cookie web dán tay (chỉ xem).
    Cookie(&'a str),
    /// Tài khoản + mật khẩu, đăng nhập kênh Desktop.
    Desktop { username: &'a str, password: &'a str, thiet_bi: &'a ThietBi },
}

/// Phiên làm việc. Không bao giờ ghi ra đĩa.
#[derive(Clone)]
pub struct Session {
    api: Client,
    jar: Arc<Jar>,
    base: String,
    url: Url,
    thiet_bi: Option<Arc<ThietBi>>,
    desktop: Option<Arc<tokio::sync::Mutex<DesktopAuth>>>,
}

pub fn net_err(e: reqwest::Error) -> StepError {
    StepError::Retry(format!("Lỗi mạng: {e}"))
}

/// Lấy thông báo dễ hiểu từ nội dung lỗi của cổng.
pub fn user_message(body: &str) -> String {
    if let Ok(v) = serde_json::from_str::<Value>(body) {
        for k in ["userMessage", "message", "error", "detail", "title"] {
            if let Some(s) = v[k].as_str().filter(|s| !s.is_empty()) {
                return s.to_string();
            }
        }
    }
    body.chars().take(MAX_DETAIL_CHARS).collect()
}

/// Mã lỗi nghiệp vụ của cổng (`code` trong phản hồi `problem+json`), ví dụ `SUBMISSION_LOCKED`, `IDEMPOTENCY_KEY_REUSED`.
pub fn ma_loi_cong(body: &str) -> Option<String> {
    serde_json::from_str::<Value>(body).ok()?["code"].as_str().filter(|c| !c.is_empty()).map(str::to_string)
}

pub fn classify_http(status: StatusCode, body: &str) -> StepError {
    let ma = ma_loi_cong(body).map(|c| format!(" [{c}]")).unwrap_or_default();
    let msg = format!("Cổng trả lỗi {}{ma}: {}", status.as_u16(), user_message(body));
    match status {
        StatusCode::UNAUTHORIZED => StepError::Auth(msg),
        StatusCode::REQUEST_TIMEOUT | StatusCode::TOO_MANY_REQUESTS => StepError::Retry(msg),
        s if s.is_server_error() => StepError::Retry(msg),
        // 403 là thiếu quyền ("Đồng chí không có quyền thực hiện thao tác này"): đăng nhập lại không giải quyết được.
        _ => StepError::Fatal(msg),
    }
}

async fn check_status(resp: reqwest::Response) -> Result<reqwest::Response, StepError> {
    let status = resp.status();
    if status.is_success() {
        return Ok(resp);
    }
    if status.is_redirection() {
        return Err(StepError::Auth("Phiên đăng nhập đã hết hạn".into()));
    }
    let body = resp.text().await.unwrap_or_default();
    Err(classify_http(status, &body))
}

impl Session {
    /// Gắn thiết bị cho phiên cookie dùng trong test (phiên Desktop đã có thiết bị từ lúc đăng nhập).
    #[cfg(test)]
    pub fn voi_thiet_bi(mut self, t: ThietBi) -> Self {
        self.thiet_bi = Some(Arc::new(t));
        self
    }

    fn them_thiet_bi(&self, mut req: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        if let Some(t) = &self.thiet_bi {
            req = req.header("x-device-id", &t.id).header("x-device-name", &t.ten).header("x-app-version", &t.phien_ban).header("x-platform", &t.nen_tang);
        }
        req
    }

    pub fn la_desktop(&self) -> bool {
        self.desktop.is_some()
    }

    /// Token Bearer còn hạn (làm mới khi sắp hết); `None` nếu không phải phiên Desktop.
    async fn bearer(&self) -> Result<Option<String>, StepError> {
        let Some(d) = &self.desktop else { return Ok(None) };
        let mut a = d.lock().await;
        if a.het_han <= Instant::now() + LAM_MOI_TRUOC {
            self.lam_moi(&mut a).await?;
        }
        Ok(Some(a.access.clone()))
    }

    /// Token Bearer hiện tại để người dùng sao chép; lỗi thành chuỗi tiếng Việt. `None` nếu không phải phiên Desktop.
    pub async fn bearer_cho_nguoi_dung(&self) -> Result<Option<String>, String> {
        self.bearer().await.map_err(|e| match e { StepError::Retry(m) | StepError::Auth(m) | StepError::Fatal(m) => m })
    }

    /// Làm mới token (`/auth/desktop/refresh`); không được thì đăng nhập lại bằng mật khẩu.
    async fn lam_moi(&self, a: &mut DesktopAuth) -> Result<(), StepError> {
        let tb = self.thiet_bi.clone();
        if !a.refresh.is_empty() {
            let r = self.api.post(format!("{}{}/auth/desktop/refresh", self.base, API)).header("accept", "application/json").json(&serde_json::json!({"refreshToken": a.refresh}));
            let r = match &tb { Some(t) => them_tb(r, t), None => r };
            if let Ok(resp) = r.send().await {
                if resp.status().is_success() {
                    if let Ok(v) = resp.json::<Value>().await {
                        if let Some(t) = doc_token(&v) {
                            a.access = t.0;
                            a.refresh = t.1.unwrap_or_default();
                            a.het_han = t.2;
                            return Ok(());
                        }
                    }
                }
            }
        }
        let t = dang_nhap_desktop(&self.api, &self.base, &a.username, &a.password, tb.as_deref()).await.map_err(StepError::Auth)?;
        a.access = t.0;
        a.refresh = t.1.unwrap_or_default();
        a.het_han = t.2;
        Ok(())
    }

    /// Đăng nhập lại ngay bằng mật khẩu (bỏ qua token cũ). Chỉ cho phiên Desktop.
    pub async fn dang_nhap_lai(&self) -> Result<(), String> {
        let Some(d) = &self.desktop else { return Err("Phiên cookie không tự đăng nhập lại được".into()) };
        let mut a = d.lock().await;
        a.refresh.clear();
        self.lam_moi(&mut a).await.map_err(|e| match e { StepError::Auth(m) | StepError::Retry(m) | StepError::Fatal(m) => m })
    }

    fn api_url(&self, path: &str) -> String {
        format!("{}{}{}", self.base, API, path)
    }

    fn xsrf(&self) -> Option<String> {
        let header = self.jar.cookies(&self.url)?;
        cookie_value(header.to_str().ok()?, "XSRF-TOKEN").map(|v| percent_decode(&v))
    }

    /// Gửi yêu cầu, không kiểm tra mã trạng thái (dùng cho endpoint chuyển hướng như `/files/{id}`).
    pub async fn send_raw(
        &self,
        method: Method,
        path: &str,
        query: &[(&str, &str)],
        form: Option<multipart::Form>,
        accept: &str,
    ) -> Result<reqwest::Response, StepError> {
        let dung = |token: Option<String>| {
            let mut req = self.them_thiet_bi(self.api.request(method.clone(), self.api_url(path)).header("accept", accept));
            if !query.is_empty() {
                req = req.query(query);
            }
            match token {
                Some(t) => req.bearer_auth(t),
                None if method != Method::GET => match self.xsrf() { Some(x) => req.header("x-xsrf-token", x), None => req },
                None => req,
            }
        };
        let token = self.bearer().await?;
        if let Some(f) = form {
            return dung(token).multipart(f).send().await.map_err(net_err); // multipart không gửi lại được
        }
        let resp = dung(token).send().await.map_err(net_err)?;
        if resp.status() == StatusCode::UNAUTHORIZED && self.desktop.is_some() {
            self.dang_nhap_lai().await.map_err(StepError::Auth)?;
            return dung(self.bearer().await?).send().await.map_err(net_err);
        }
        Ok(resp)
    }

    pub async fn send(
        &self,
        method: Method,
        path: &str,
        query: &[(&str, &str)],
        form: Option<multipart::Form>,
        accept: &str,
    ) -> Result<reqwest::Response, StepError> {
        check_status(self.send_raw(method, path, query, form, accept).await?).await
    }

    pub async fn get_json(&self, path: &str, query: &[(&str, &str)]) -> Result<Value, StepError> {
        let resp = self
            .send(Method::GET, path, query, None, "application/json")
            .await?;
        parse_json(resp).await
    }

    /// POST JSON (tùy chọn nén gzip) với các tiêu đề thêm; trả mã trạng thái và JSON. Dùng gửi gói thay đổi.
    pub async fn post_json(&self, path: &str, body: Vec<u8>, gzip: bool, extra: &[(&str, &str)]) -> Result<(StatusCode, Value), StepError> {
        let dung = |token: Option<String>| {
            let mut req = self.them_thiet_bi(self.api.post(self.api_url(path)).header("accept", "application/json").header("content-type", "application/json").body(body.clone()));
            if gzip {
                req = req.header("content-encoding", "gzip");
            }
            req = match token {
                Some(t) => req.bearer_auth(t),
                None => match self.xsrf() { Some(x) => req.header("x-xsrf-token", x), None => req },
            };
            for (k, v) in extra {
                req = req.header(*k, *v);
            }
            req
        };
        let mut resp = dung(self.bearer().await?).send().await.map_err(net_err)?;
        if resp.status() == StatusCode::UNAUTHORIZED && self.desktop.is_some() {
            self.dang_nhap_lai().await.map_err(StepError::Auth)?;
            resp = dung(self.bearer().await?).send().await.map_err(net_err)?;
        }
        let resp = check_status(resp).await?;
        let status = resp.status();
        Ok((status, parse_json(resp).await?))
    }

    /// Tải tệp `/files/{id}` (thường chuyển hướng 302 sang kho lưu trữ, không gửi cookie sang đó); tự giải nén gzip.
    pub async fn tai_tep(&self, file_id: &str) -> Result<Vec<u8>, StepError> {
        let ok = !file_id.is_empty() && file_id.len() <= 100 && file_id.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.'));
        if !ok {
            return Err(StepError::Fatal("Mã tệp do cổng trả về không hợp lệ".into()));
        }
        let resp = self.send_raw(Method::GET, &format!("/files/{file_id}"), &[], None, "*/*").await?;
        let resp = if resp.status().is_redirection() {
            let loc = resp.headers().get("location").and_then(|v| v.to_str().ok()).ok_or_else(|| StepError::Fatal("Cổng chuyển hướng nhưng không có địa chỉ đích".into()))?.to_string();
            reqwest::get(&loc).await.map_err(net_err)?
        } else {
            resp
        };
        if !resp.status().is_success() {
            return Err(StepError::Fatal(format!("Không tải được tệp (HTTP {})", resp.status().as_u16())));
        }
        let bytes = resp.bytes().await.map_err(net_err)?;
        gunzip_neu_can(&bytes).map_err(StepError::Fatal)
    }

    async fn probe(&self) -> bool {
        self.send_raw(Method::GET, "/auth/me", &[], None, "application/json")
            .await
            .map(|r| r.status() == StatusCode::OK)
            .unwrap_or(false)
    }
}

/// Giải nén nếu là gzip (hai byte đầu 1f 8b), không thì trả nguyên.
pub fn gunzip_neu_can(b: &[u8]) -> Result<Vec<u8>, String> {
    use std::io::Read;
    if b.len() < 2 || b[0] != 0x1f || b[1] != 0x8b {
        return Ok(b.to_vec());
    }
    let mut out = Vec::new();
    flate2::read::GzDecoder::new(b).read_to_end(&mut out).map_err(|e| format!("Không giải nén được tệp: {e}"))?;
    Ok(out)
}

pub async fn parse_json(resp: reqwest::Response) -> Result<Value, StepError> {
    let text = resp.text().await.map_err(net_err)?;
    if text.is_empty() {
        return Ok(Value::Null);
    }
    serde_json::from_str(&text)
        .map_err(|_| StepError::Fatal("Cổng trả về dữ liệu không phải JSON".into()))
}

// ---------------------------------------------------------------------------
// Đăng nhập
// ---------------------------------------------------------------------------

fn them_tb(req: reqwest::RequestBuilder, t: &ThietBi) -> reqwest::RequestBuilder {
    req.header("x-device-id", &t.id).header("x-device-name", &t.ten).header("x-app-version", &t.phien_ban).header("x-platform", &t.nen_tang)
}

/// `(access, refresh, hạn)` từ phản hồi đăng nhập/làm mới: `{accessToken, refreshToken, expiresIn, refreshExpiresIn}`.
fn doc_token(v: &Value) -> Option<(String, Option<String>, Instant)> {
    let access = v["accessToken"].as_str().filter(|t| !t.is_empty())?.to_string();
    let refresh = v["refreshToken"].as_str().filter(|t| !t.is_empty()).map(str::to_string);
    let giay = v["expiresIn"].as_u64().unwrap_or(HAN_MAC_DINH_S);
    Some((access, refresh, Instant::now() + Duration::from_secs(giay)))
}

/// `POST /api/v1/auth/desktop/login`. Lỗi trả chuỗi có mã nghiệp vụ, ví dụ `[INVALID_CREDENTIALS]`.
async fn dang_nhap_desktop(api: &Client, base: &str, user: &str, pass: &str, tb: Option<&ThietBi>) -> Result<(String, Option<String>, Instant), String> {
    let mut body = serde_json::json!({"username": user, "password": pass});
    if let Some(t) = tb {
        body["deviceId"] = t.id.clone().into();
        body["deviceName"] = t.ten.clone().into();
        body["appVersion"] = t.phien_ban.clone().into();
        body["platform"] = t.nen_tang.clone().into();
    }
    let mut req = api.post(format!("{base}{API}/auth/desktop/login")).header("accept", "application/json, application/problem+json").json(&body);
    if let Some(t) = tb {
        req = them_tb(req, t);
    }
    let resp = req.send().await.map_err(|e| format!("Lỗi mạng: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(match classify_http(status, &text) { StepError::Auth(m) | StepError::Retry(m) | StepError::Fatal(m) => m });
    }
    let v: Value = serde_json::from_str(&text).map_err(|_| "Phản hồi đăng nhập không phải JSON".to_string())?;
    doc_token(&v).ok_or_else(|| "Phản hồi đăng nhập không có accessToken".to_string())
}

/// Mở phiên theo cách đã chọn.
pub async fn mo_phien(base: &str, dn: &DangNhap<'_>, timeout: Duration) -> Result<Session, String> {
    match dn {
        DangNhap::Cookie(c) => {
            let creds = Credentials { base, cookie: c, timeout };
            connect(&creds).await
        }
        DangNhap::Desktop { username, password, thiet_bi } => {
            if username.is_empty() || password.is_empty() {
                return Err("Thiếu tài khoản hoặc mật khẩu để đăng nhập kênh Desktop".into());
            }
            let base = base.trim_end_matches('/').to_string();
            let url = Url::parse(&base).map_err(|e| format!("Địa chỉ cổng không hợp lệ: {e}"))?;
            let jar = Arc::new(Jar::default());
            let api = Client::builder().cookie_provider(jar.clone()).redirect(reqwest::redirect::Policy::none()).timeout(timeout).build().map_err(|e| e.to_string())?;
            let t = dang_nhap_desktop(&api, &base, username, password, Some(thiet_bi)).await?;
            let auth = DesktopAuth { username: username.to_string(), password: password.to_string(), access: t.0, refresh: t.1.unwrap_or_default(), het_han: t.2 };
            Ok(Session { api, jar, base, url, thiet_bi: Some(Arc::new((*thiet_bi).clone())), desktop: Some(Arc::new(tokio::sync::Mutex::new(auth))) })
        }
    }
}

/// Kết nối: ưu tiên cookie dán sẵn, không có thì đăng nhập Keycloak bằng tài khoản.
pub async fn connect(c: &Credentials<'_>) -> Result<Session, String> {
    let base = c.base.trim_end_matches('/').to_string();
    let url = Url::parse(&base).map_err(|e| format!("Địa chỉ cổng không hợp lệ: {e}"))?;
    let jar = Arc::new(Jar::default());
    let api = Client::builder()
        .cookie_provider(jar.clone())
        .redirect(reqwest::redirect::Policy::none())
        .timeout(c.timeout)
        .build()
        .map_err(|e| e.to_string())?;
    let sess = Session { api, jar, base, url, thiet_bi: None, desktop: None };

    let cookie = normalize_cookie(c.cookie);
    if !cookie.is_empty() {
        for pair in cookie.split(';').map(str::trim).filter(|p| p.contains('=')) {
            sess.jar.add_cookie_str(&format!("{pair}; Path=/"), &sess.url);
        }
        return if sess.probe().await {
            Ok(sess)
        } else {
            Err("Cookie đã hết hạn hoặc không hợp lệ. Đăng nhập cổng trên trình duyệt và dán cookie mới.".into())
        };
    }
    Err("Chưa có cookie. Dùng đăng nhập kênh Desktop (mo_phien với DangNhap::Desktop) hoặc dán cookie.".into())
}

/// Chấp nhận cả dạng dán từ DevTools ("Cookie: a=b; c=d", nhiều dòng).
pub fn normalize_cookie(raw: &str) -> String {
    let one_line = raw.split_whitespace().collect::<Vec<_>>().join(" ");
    let t = one_line.as_str();
    let t = if t.len() >= 7 && t[..7].eq_ignore_ascii_case("cookie:") {
        &t[7..]
    } else {
        t
    };
    t.trim().to_string()
}

pub fn cookie_value(header: &str, name: &str) -> Option<String> {
    header
        .split(';')
        .map(str::trim)
        .find_map(|kv| kv.strip_prefix(name)?.strip_prefix('='))
        .map(str::to_string)
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        let hex = (b[i] == b'%' && i + 2 < b.len())
            .then(|| std::str::from_utf8(&b[i + 1..i + 3]).ok())
            .flatten()
            .and_then(|h| u8::from_str_radix(h, 16).ok());
        match hex {
            Some(v) => {
                out.push(v);
                i += 3;
            }
            None => {
                out.push(b[i]);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Đăng nhập có thử lại (lỗi mạng tạm thời).
#[allow(dead_code)]
pub async fn connect_with_retry(c: &Credentials<'_>, retries: u32) -> Result<Session, String> {
    let mut last = String::new();
    for attempt in 0..=retries {
        match connect(c).await {
            Ok(s) => return Ok(s),
            Err(e) => last = e,
        }
        if attempt < retries {
            tokio::time::sleep(Duration::from_millis(RETRY_BASE_DELAY_MS * 2u64.pow(attempt))).await;
        }
    }
    Err(last)
}

/// Chạy `op`; thử lại lỗi tạm thời tối đa `retries` lần (chờ tăng dần),
/// gặp lỗi phiên thì kết nối lại đúng một lần.
pub async fn with_retry<T, F, Fut>(
    sess: &mut Session,
    creds: &Credentials<'_>,
    retries: u32,
    op: F,
) -> Result<T, String>
where
    F: Fn(Session) -> Fut,
    Fut: Future<Output = Result<T, StepError>>,
{
    let mut tries = 0u32;
    let mut reconnected = false;
    loop {
        match op(sess.clone()).await {
            Ok(v) => return Ok(v),
            Err(StepError::Fatal(m)) => return Err(m),
            Err(StepError::Auth(m)) => {
                if reconnected {
                    return Err(m);
                }
                reconnected = true;
                if sess.la_desktop() {
                    sess.dang_nhap_lai().await?;
                } else {
                    *sess = connect(creds).await?;
                }
            }
            Err(StepError::Retry(m)) => {
                if tries >= retries {
                    return Err(m);
                }
                tries += 1;
                tokio::time::sleep(Duration::from_millis(RETRY_BASE_DELAY_MS * 2u64.pow(tries - 1))).await;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;




    #[test]
    fn cookie_is_normalized() {
        assert_eq!(normalize_cookie("Cookie: a=1;\n b=2 "), "a=1; b=2");
        assert_eq!(normalize_cookie("  a=1 "), "a=1");
        assert_eq!(normalize_cookie(""), "");
    }

    #[test]
    fn cookie_value_matches_exact_name() {
        let h = "XSRF-TOKEN=abc; SESSION=xyz; OTHER-SESSION=no";
        assert_eq!(cookie_value(h, "SESSION").as_deref(), Some("xyz"));
        assert!(cookie_value("OTHER-SESSION=no", "SESSION").is_none());
    }

    #[test]
    fn percent_decoding() {
        assert_eq!(percent_decode("a%2Fb%3D"), "a/b=");
        assert_eq!(percent_decode("100%"), "100%");
    }

    #[test]
    fn forbidden_is_fatal_not_auth() {
        let body = r#"{"userMessage":"Đồng chí không có quyền thực hiện thao tác này."}"#;
        match classify_http(StatusCode::FORBIDDEN, body) {
            StepError::Fatal(m) => assert!(m.contains("403") && m.contains("không có quyền")),
            other => panic!("sai loại lỗi: {other:?}"),
        }
    }

    #[test]
    fn http_errors_are_classified() {
        assert!(matches!(classify_http(StatusCode::UNAUTHORIZED, ""), StepError::Auth(_)));
        assert!(matches!(classify_http(StatusCode::BAD_GATEWAY, ""), StepError::Retry(_)));
        assert!(matches!(classify_http(StatusCode::TOO_MANY_REQUESTS, ""), StepError::Retry(_)));
        assert!(matches!(classify_http(StatusCode::BAD_REQUEST, "x"), StepError::Fatal(_)));
    }

    fn tb() -> ThietBi {
        ThietBi { id: "dev-1".into(), ten: "VTVL Batch".into(), phien_ban: "1.2.8".into(), nen_tang: "macos".into() }
    }
    fn bearer_cua(r: &(String, String, Vec<(String, String)>, Vec<u8>)) -> Option<String> {
        r.2.iter().find(|(k, _)| k == "authorization").map(|(_, v)| v.clone())
    }

    #[tokio::test]
    async fn token_is_refreshed_before_it_expires() {
        use crate::thu_gia::may_chu_gia;
        let (addr, ghi) = may_chu_gia(vec![
            ("/auth/desktop/login".into(), 200, serde_json::json!({"accessToken": "A1", "refreshToken": "R1", "expiresIn": 1})),
            ("/auth/desktop/refresh".into(), 200, serde_json::json!({"accessToken": "A2", "refreshToken": "R2", "expiresIn": 900})),
            ("/dat".into(), 200, serde_json::json!({"ok": true})),
        ]).await;
        let t = tb();
        let s = mo_phien(&addr, &DangNhap::Desktop { username: "u", password: "p", thiet_bi: &t }, Duration::from_secs(5)).await.unwrap();
        assert_eq!(s.get_json("/dat", &[]).await.unwrap()["ok"], true);
        let reqs = ghi.0.lock().unwrap();
        let dat = reqs.iter().find(|r| r.1.ends_with("/dat")).unwrap();
        assert_eq!(bearer_cua(dat).as_deref(), Some("Bearer A2"), "token sắp hết hạn được làm mới trước khi gọi");
        let rf = reqs.iter().find(|r| r.1.ends_with("/auth/desktop/refresh")).unwrap();
        assert_eq!(serde_json::from_slice::<Value>(&rf.3).unwrap()["refreshToken"], "R1");
    }

    #[tokio::test]
    async fn unauthorized_triggers_one_relogin_and_a_retry() {
        use crate::thu_gia::may_chu_gia;
        let (addr, ghi) = may_chu_gia(vec![
            ("/auth/desktop/login".into(), 200, serde_json::json!({"accessToken": "A1", "refreshToken": "R1", "expiresIn": 900})),
            ("/dat".into(), 401, serde_json::json!({"code": "UNAUTHORIZED"})),
            ("/auth/desktop/login".into(), 200, serde_json::json!({"accessToken": "B1", "refreshToken": "R2", "expiresIn": 900})),
            ("/dat".into(), 200, serde_json::json!({"ok": true})),
        ]).await;
        let t = tb();
        let s = mo_phien(&addr, &DangNhap::Desktop { username: "u", password: "p", thiet_bi: &t }, Duration::from_secs(5)).await.unwrap();
        assert_eq!(s.get_json("/dat", &[]).await.unwrap()["ok"], true);
        let reqs = ghi.0.lock().unwrap();
        let dat: Vec<_> = reqs.iter().filter(|r| r.1.ends_with("/dat")).map(|r| bearer_cua(r).unwrap()).collect();
        assert_eq!(dat, vec!["Bearer A1", "Bearer B1"]);
        assert_eq!(reqs.iter().filter(|r| r.1.ends_with("/auth/desktop/login")).count(), 2);
        let login: Value = serde_json::from_slice(&reqs[0].3).unwrap();
        assert_eq!((login["username"].as_str(), login["deviceId"].as_str()), (Some("u"), Some("dev-1")));
    }

    #[tokio::test]
    async fn wrong_password_message_carries_the_server_code() {
        use crate::thu_gia::may_chu_gia;
        let (addr, _) = may_chu_gia(vec![("/auth/desktop/login".into(), 401, serde_json::json!({"code": "INVALID_CREDENTIALS", "userMessage": "Tên đăng nhập hoặc mật khẩu không đúng."}))]).await;
        let t = tb();
        let e = mo_phien(&addr, &DangNhap::Desktop { username: "u", password: "x", thiet_bi: &t }, Duration::from_secs(5)).await.err().unwrap();
        assert!(e.contains("[INVALID_CREDENTIALS]") && e.contains("không đúng"));
        assert!(mo_phien(&addr, &DangNhap::Desktop { username: "", password: "x", thiet_bi: &t }, Duration::from_secs(5)).await.is_err());
    }

    #[test]
    fn portal_error_code_is_kept_in_message() {
        let body = r#"{"code":"SUBMISSION_LOCKED","userMessage":"Hồ sơ đang khóa"}"#;
        assert_eq!(ma_loi_cong(body).as_deref(), Some("SUBMISSION_LOCKED"));
        match classify_http(StatusCode::CONFLICT, body) {
            StepError::Fatal(m) => assert!(m.contains("[SUBMISSION_LOCKED]") && m.contains("Hồ sơ đang khóa")),
            other => panic!("{other:?}"),
        }
        assert_eq!(ma_loi_cong("không phải json"), None);
    }

    #[test]
    fn gzip_is_detected_by_magic() {
        assert_eq!(gunzip_neu_can(b"{\"a\":1}").unwrap(), b"{\"a\":1}");
        let z = crate::goi::gzip(b"xyz").unwrap();
        assert_eq!(gunzip_neu_can(&z).unwrap(), b"xyz");
    }

    #[test]
    fn user_message_prefers_user_message_field() {
        assert_eq!(user_message(r#"{"message":"a","userMessage":"b"}"#), "b");
        assert_eq!(user_message("lỗi thô"), "lỗi thô");
    }

    #[tokio::test]
    async fn connect_without_credentials_fails() {
        let c = Credentials {
            base: "http://127.0.0.1:1",
            cookie: "",
            timeout: Duration::from_secs(1),
        };
        assert!(connect(&c).await.is_err());
    }
}
