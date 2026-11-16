import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { api, loiThanhChuoi } from '../api';
import { demMucTD, locNhomTD, mauDanhGia, mauKetLuan, NHAN_KET_LUAN, NHAN_MUC_LOI, type MauTD } from '../quanTri';
import type { BaoCaoTD, NhomTD } from '../types';
import { IcCanhBao, IcDong, IcLamMoi, IcTim } from './Icons';

const SO_MUC_HIEN = 100;
const CAC_MUC = ['BB', 'CB', 'TK'] as const;

export interface BaoCaoThamDinhDialogProps {
  open: boolean;
  /** Đường dẫn tệp Excel đang thẩm định. */
  duongDan: string;
  tenTep: string;
  onClose: () => void;
}

/**
 * Báo cáo thẩm định theo skill `vtvl-tham-dinh`: kết luận A/B/C/D, 18 chỉ số, phiếu 12 nội dung và danh sách mã lỗi chi tiết đến từng biểu, cột, dòng.
 * Chạy ngay trên máy bằng lõi thẩm định của công cụ web; không đăng nhập, không gửi gì lên cổng.
 */
export function BaoCaoThamDinhDialog({ open, duongDan, tenTep, onClose }: BaoCaoThamDinhDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const lanTai = useRef(0);
  const [xacNhan, setXacNhan] = useState(true);
  const [bc, setBc] = useState<BaoCaoTD | null>(null);
  const [dangChay, setDangChay] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);
  const [muc, setMuc] = useState<string | null>(null);
  const [tim, setTim] = useState('');
  const timTre = useDeferredValue(tim);

  const chay = useCallback(async (xn: boolean) => {
    const lan = ++lanTai.current; // bỏ kết quả của lần chạy cũ nếu đã đổi tệp hoặc bấm chạy lại
    setDangChay(true); setLoi(null);
    try {
      const kq = await api.thamDinhBaoCao(duongDan, xn);
      if (lan === lanTai.current) setBc(kq);
    } catch (e) {
      if (lan === lanTai.current) setLoi(loiThanhChuoi(e));
    } finally {
      if (lan === lanTai.current) setDangChay(false);
    }
  }, [duongDan]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) { setBc(null); setMuc(null); setTim(''); setXacNhan(true); d.showModal(); void chay(true); }
    if (!open && d.open) { lanTai.current++; d.close(); }
  }, [open, chay]);

  const nhom = useMemo(() => (bc ? locNhomTD(bc.nhom, muc, timTre) : []), [bc, muc, timTre]);
  const dem = useMemo(() => (bc ? demMucTD(bc.nhom) : {}), [bc]);

  return (
    <dialog ref={ref} className="hop-kt td" onClose={onClose} aria-labelledby="td-tieu-de">
      <header className="hop-kt__dau">
        <div>
          <p className="hop-tq__vet">Thẩm định theo mã lỗi</p>
          <h2 id="td-tieu-de">{tenTep}</h2>
          <p>{bc ? `Công cụ thẩm định ${bc.phienBan}` : 'Chạy lõi thẩm định ngay trên máy, không gửi gì lên cổng'}</p>
        </div>
        <button type="button" className="nut nut--vuong nut--gon" onClick={onClose} aria-label="Đóng"><IcDong /></button>
      </header>

      <div className="hop-kt__than" aria-busy={dangChay}>
        {loi && <p className="thong-bao thong-bao--loi" role="alert"><IcCanhBao />{loi}</p>}
        {dangChay && <p className="hsqt__trang" role="status"><span className="quay" aria-hidden="true" /> Đang thẩm định, lần đầu có thể mất vài chục giây (tải công cụ thẩm định)…</p>}
        {bc && !dangChay && (
          <>
            <KetLuan bc={bc} xacNhan={xacNhan} onDoiXacNhan={(v) => { setXacNhan(v); void chay(v); }} />
            <BangChiSo bc={bc} />
            <BangPhieu bc={bc} />
            <section className="td__muc" aria-labelledby="td-ma-loi">
              <h3 id="td-ma-loi">Mã lỗi chi tiết <span className="td__phu">{bc.nhom.length} nhóm</span></h3>
              <div className="td__loc">
                <div className="qt__loc" role="group" aria-label="Lọc theo mức">
                  <button type="button" className={`loc-nut${muc === null ? ' loc-nut--chon' : ''}`} aria-pressed={muc === null} onClick={() => setMuc(null)}>Tất cả <b>{bc.nhom.length}</b></button>
                  {CAC_MUC.map((m) => (
                    <button key={m} type="button" className={`loc-nut td__loc-${m}${muc === m ? ' loc-nut--chon' : ''}`} aria-pressed={muc === m} onClick={() => setMuc(muc === m ? null : m)} disabled={!dem[m]}>
                      {NHAN_MUC_LOI[m]} <b>{dem[m] ?? 0}</b>
                    </button>
                  ))}
                </div>
                <label className="tim-kiem td__tim">
                  <IcTim aria-hidden="true" />
                  <input type="search" value={tim} onChange={(e) => setTim(e.target.value)} placeholder="Tìm mã lỗi, biểu, cột, mô tả…" aria-label="Tìm trong mã lỗi" autoComplete="off" spellCheck={false} />
                </label>
                <button type="button" className="nut" onClick={() => void chay(xacNhan)} title="Chạy lại thẩm định trên tệp hiện tại"><IcLamMoi /> Chạy lại</button>
              </div>
              {nhom.length === 0 ? <p className="bb__rong">Không có mã lỗi nào khớp.</p> : nhom.map((g) => <NhomLoi key={g.id} g={g} moSan={g.muc === 'BB' || timTre.trim() !== ''} />)}
            </section>
          </>
        )}
      </div>
    </dialog>
  );
}

function KetLuan({ bc, xacNhan, onDoiXacNhan }: { bc: BaoCaoTD; xacNhan: boolean; onDoiXacNhan: (v: boolean) => void }) {
  const mau = mauKetLuan(bc.ketLuan);
  return (
    <section className={`td__ket-luan td__ket-luan--${mau}`} aria-label="Kết luận">
      <div className="td__chu" aria-label={`Kết luận ${bc.ketLuan}`}>{bc.ketLuan}</div>
      <div className="td__ket-luan-noi-dung">
        <p className="td__ket-luan-nhan">{NHAN_KET_LUAN[bc.ketLuan] ?? `Kết luận ${bc.ketLuan}`}</p>
        {bc.lyDo.length > 0 && <ul>{bc.lyDo.map((l) => <li key={l}>{l}</li>)}</ul>}
        <label className="bb__chon">
          <input type="checkbox" checked={xacNhan} onChange={(e) => onDoiXacNhan(e.target.checked)} />
          Hồ sơ đã có xác nhận của người đứng đầu <span className="bb__phu">(bỏ chọn thì mã HS02 có thể làm kết luận thành D; đó là do tham số, không phải lỗi bộ biểu)</span>
        </label>
        <p className="td__phu">“Đạt” chỉ là kiểm tra kỹ thuật, vẫn cần người thẩm định xác nhận nghiệp vụ. Ứng dụng chưa ghi nhận trạng thái “đã giải trình” của từng nhóm mã nên C/D là mức khi chưa giải trình gì.</p>
      </div>
    </section>
  );
}

const lopMau = (m: MauTD): string => `td__mau td__mau--${m}`;

function BangChiSo({ bc }: { bc: BaoCaoTD }) {
  return (
    <section className="td__muc" aria-labelledby="td-chi-so">
      <h3 id="td-chi-so">Chỉ số thẩm định <span className="td__phu">{bc.chiSo.length} chỉ số</span></h3>
      <div className="td__cuon" tabIndex={0}>
        <table className="td__bang">
          <caption className="sr-only">Các chỉ số thẩm định</caption>
          <thead><tr><th scope="col">TT</th><th scope="col">Chỉ số</th><th scope="col">Giá trị</th><th scope="col">Đánh giá</th><th scope="col">Ngưỡng</th></tr></thead>
          <tbody>
            {bc.chiSo.map((c) => {
              const m = mauDanhGia(c.danhGia);
              return (
                <tr key={c.so} className={m === 'chu_y' || m === 'xau' ? 'td__hang--lech' : undefined}>
                  <td className="td__so-cot">{c.so}</td>
                  <th scope="row">{c.ten}{c.tuTen && c.tu !== null && c.mau !== null && <small className="td__chi-tiet">{c.tuTen} {c.tu.toLocaleString('vi-VN')} / {c.mauTen} {c.mau.toLocaleString('vi-VN')}</small>}</th>
                  <td className="td__so-cot"><b>{c.giaTri}</b></td>
                  <td><span className={lopMau(m)}>{c.danhGia || '—'}</span></td>
                  <td>{c.nguong}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BangPhieu({ bc }: { bc: BaoCaoTD }) {
  return (
    <section className="td__muc" aria-labelledby="td-phieu">
      <h3 id="td-phieu">Phiếu 12 nội dung</h3>
      <div className="td__cuon" tabIndex={0}>
        <table className="td__bang">
          <caption className="sr-only">Phiếu thẩm định 12 nội dung</caption>
          <thead><tr><th scope="col">TT</th><th scope="col">Nội dung</th><th scope="col">Kết quả</th><th scope="col">Chặn</th><th scope="col">Giải trình</th><th scope="col">Yêu cầu</th></tr></thead>
          <tbody>
            {bc.phieu.map((p) => (
              <tr key={p.tt}>
                <td className="td__so-cot">{p.tt}</td>
                <th scope="row">{p.noiDung}</th>
                <td><span className={lopMau(mauDanhGia(p.ketQua))}>{p.ketQua}</span></td>
                <td className="td__so-cot">{p.bb}</td>
                <td className="td__so-cot">{p.cb}</td>
                <td className="td__yeu-cau">{p.yeuCau}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Một nhóm mã lỗi: bấm để mở danh sách từng biểu/cột/dòng. Nhóm chặn (BB) mở sẵn. */
function NhomLoi({ g, moSan }: { g: NhomTD; moSan: boolean }) {
  const [soHien, setSoHien] = useState(SO_MUC_HIEN);
  const them = g.chiTiet.length - soHien;
  return (
    <details className={`td__nhom td__nhom--${g.muc}`} open={moSan}>
      <summary>
        <code className="td__ma">{g.id}</code>
        <span className={`td__muc-nhan td__muc-nhan--${g.muc}`}>{NHAN_MUC_LOI[g.muc] ?? g.muc}</span>
        <span className="td__ten">{g.ten}</span>
        <span className="td__so" title={`${g.soLuong} phát hiện`}>×{g.soLuong}</span>
      </summary>
      {g.chiTiet.length === 0 ? <p className="td__phu td__rong">Không có chi tiết theo dòng.</p> : (
        <div className="td__cuon" tabIndex={0}>
          <table className="td__bang">
            <caption className="sr-only">Chi tiết mã {g.id}</caption>
            <thead><tr><th scope="col">Biểu</th><th scope="col">Cột</th><th scope="col">Dòng</th><th scope="col">Giá trị</th><th scope="col">Mô tả</th><th scope="col">Đề nghị</th></tr></thead>
            <tbody>
              {g.chiTiet.slice(0, soHien).map((m, i) => (
                <tr key={`${m.bieu}-${m.cot}-${m.dong}-${i}`}>
                  <td>{m.bieu}</td>
                  <td>{m.cot}</td>
                  <td className="td__dong">{m.dong}</td>
                  <td className="td__gia-tri" title={m.giaTri}>{m.giaTri}</td>
                  <td>{m.moTa}{m.ma && <small className="td__chi-tiet">{m.ma}</small>}</td>
                  <td>{m.deNghi}{m.canCu && <small className="td__chi-tiet">{m.canCu}</small>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {them > 0 && <div className="bb__them"><span className="bb__phu">Đang hiện {soHien}/{g.chiTiet.length} mục</span><button type="button" className="nut" onClick={() => setSoHien((n) => n + SO_MUC_HIEN)}>Hiện thêm {Math.min(SO_MUC_HIEN, them)}</button><button type="button" className="nut" onClick={() => setSoHien(g.chiTiet.length)}>Hiện tất cả</button></div>}
    </details>
  );
}
