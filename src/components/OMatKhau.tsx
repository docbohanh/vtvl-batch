import { useState } from 'react';
import { IcMat, IcMatGach } from './Icons';

export interface OMatKhauProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  nhan: string;
}

/** Ô mật khẩu có nút ẩn/hiện. Luôn bắt đầu ở dạng ẩn. */
export function OMatKhau({ value, onChange, placeholder, disabled, nhan }: OMatKhauProps) {
  const [hien, setHien] = useState(false);
  return (
    <span className="o-mat-khau">
      <input type={hien ? 'text' : 'password'} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} autoComplete="new-password" spellCheck={false} aria-label={nhan} />
      <button type="button" className="o-mat-khau__nut" onClick={() => setHien((h) => !h)} disabled={disabled} aria-pressed={hien} aria-label={hien ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} title={hien ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}>
        {hien ? <IcMatGach /> : <IcMat />}
      </button>
    </span>
  );
}
