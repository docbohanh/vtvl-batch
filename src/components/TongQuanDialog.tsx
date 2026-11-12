import { useCallback, useEffect, useRef, useState } from 'react';
import { api, loiThanhChuoi } from '../api';
import type { DonVi, TongQuan } from '../types';
import { buocHienTai, dinhDangCapNhat, dinhDangSo, mauKpi, tienDoBuoc } from '../tongQuan';
import { IcCanhBao, IcDong, IcLamMoi } from './Icons';

export interface TongQuanDialogProps {
  don: DonVi;
  open: boolean;
  onClose: () => void;
}

/** Màn hình tổng quan của đơn vị, theo "Trang làm việc" của ứng dụng Desktop: các chỉ số chính và tiến độ 08 bước. Đọc trực tiếp từ cổng, chỉ đọc. */
export function TongQuanDialog({ don, open, onClose }: TongQuanDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const lanTai = useRef(0);
  const [tq, setTq] = useState<TongQuan | null>(null);
  const [dangTai, setDangTai] = useState(false);
  const [loi, setLoi] = useState<string | null>(null);

  const tai = useCallback(async () => {
    const lan = ++lanTai.current; // bỏ kết quả của lần tải cũ nếu đã mở lại hoặc bấm tải lại
    setDangTai(true); setLoi(null);
    try {
      const kq = await api.tongQuan(don.username);
      if (lan === lanTai.current) setTq(kq);
    } catch (e) {
      if (lan === lanTai.current) setLoi(loiThanhChuoi(e));
    } finally {
      if (lan === lanTai.current) setDangTai(false);
    }
  }, [don.username]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) { setTq(null); d.showModal(); void tai(); }
    if (!open && d.open) { lanTai.current++; d.close(); }
  }, [open, tai]);

  const hien = tq ? buocHienTai(tq.buoc) : -1;

  return (
    <dialog ref={ref} className="hop-kt hop-tq" onClose={onClose} aria-labelledby={`tq-${don.username}`}>
      <header className="hop-kt__dau">
        <div>
          <p className="hop-tq__vet">Trang làm việc</p>
          <h2 id={`tq-${don.username}`}>{tq?.chao ? `Chào đồng chí ${tq.chao}` : don.label || don.username}</h2>
          <p>{tq ? [tq.donVi, tq.ky].filter(Boolean).join(' · ') : don.label || don.username}</p>
        </div>
        <button type="button" className="nut nut--vuong nut--gon" onClick={onClose} aria-label="Đóng"><IcDong /></button>
      </header>

      <div className="hop-kt__than" aria-busy={dangTai}>
        {loi && <p className="thong-bao thong-bao--loi" role="alert"><IcCanhBao />{loi}</p>}
        {dangTai && !tq && <p className="cong-mk__phu" role="status"><span className="quay" aria-hidden="true" /> Đang đọc số liệu từ cổng…</p>}

        {tq && (
          <>
            {tq.kpis.length === 0
              ? <p className="rong-tim">Cổng chưa trả chỉ số nào cho hồ sơ này.</p>
              : (
                <ul className="tq-luoi" aria-label="Chỉ số chính">
                  {tq.kpis.map((k, i) => {
                    const gt = dinhDangSo(k.giaTri);
                    const chua = dinhDangSo(k.chuaKiemChung);
                    return (
                      <li key={k.khoa || i} className={`tq-the tq-the--${mauKpi(k.khoa)}`}>
                        <span className="tq-the__nhan">{k.nhan}</span>
                        <b className="tq-the__so">{gt || '–'}{gt && k.donVi && <small>{k.donVi}</small>}</b>
                        {chua && <span className="tq-the__phu">trong đó {chua} chưa kiểm chứng</span>}
                      </li>
                    );
                  })}
                </ul>
              )}

            <section className="tq-tien-do" aria-label="Tiến độ 08 bước">
              <header>
                <h3>Tiến độ 08 bước</h3>
                {tq.capNhat && <span className="phu">Cập nhật {dinhDangCapNhat(tq.capNhat)}</span>}
              </header>
              {tq.buoc.length === 0
                ? <p className="rong-tim">Chưa có dữ liệu tiến độ.</p>
                : (
                  <ol className="tq-buoc">
                    {tq.buoc.map((b, i) => {
                      const t = tienDoBuoc(b);
                      return (
                        <li key={b.buoc} className={`tq-b tq-b--${t.tt}${i === hien ? ' tq-b--hien' : ''}`} aria-current={i === hien ? 'step' : undefined}>
                          <span className="tq-b__so">Bước {b.buoc}</span>
                          <span className="tq-b__ten">{b.tieuDe}</span>
                          <span className="tq-b__tt">{t.nhan}</span>
                          <span className="tq-b__thanh" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={t.phanTram} aria-label={`${b.tieuDe}: ${t.phanTram}%`}><i style={{ width: `${t.phanTram}%` }} /></span>
                        </li>
                      );
                    })}
                  </ol>
                )}
            </section>
          </>
        )}
      </div>

      <footer className="hop-kt__chan">
        <p className="phu">Số liệu đọc trực tiếp từ cổng (chỉ đọc, không thay đổi dữ liệu). Bấm “Tải lại” để lấy số mới nhất.</p>
        <div className="hop-kt__nut">
          <button type="button" className="nut" onClick={() => { void tai(); }} disabled={dangTai}>
            {dangTai ? <span className="quay" aria-hidden="true" /> : <IcLamMoi />} Tải lại
          </button>
          <button type="button" className="nut nut--chinh" onClick={onClose}>Đóng</button>
        </div>
      </footer>
    </dialog>
  );
}
