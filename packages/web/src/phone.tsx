/**
 * Torna — the phone's physical parts.
 *
 * The frame, the card face and the booking cards. Everything here is drawn: the
 * artwork is inline SVG because the published page cannot load an external
 * image, and because a made-up hotel should not borrow a real photograph.
 *
 * The card carries the things a real prepaid card has — an EMV chip, the
 * contactless mark, a PAN with only the last four visible, an expiry, a holder.
 * The brand is invented; no real card network's mark or name appears.
 *
 * The one place hex colours are allowed. These are illustrations — a terracotta
 * roof, a lake, a plate — not interface colour, so they carry no token and a
 * theme change must not repaint them. Every colour used by the UI itself still
 * comes from styles.css.
 *
 * Owner: A(서진)
 */

import type { ReactNode } from 'react';
import { t, type Lang } from '@shared/copy';

/* eslint-disable react/no-danger -- the scenes are our own static SVG strings */

const CHIP = '<svg class="emv" viewBox="0 0 34 26" aria-hidden="true">'
  +'<rect x="0.5" y="0.5" width="33" height="25" rx="4" fill="#D9B978" stroke="#B9954F"/>'
  +'<path d="M12 .5V25.5M22 .5V25.5M.5 8.5H33.5M.5 17.5H33.5" stroke="#B9954F" stroke-width="1"/>'
  +'<rect x="12" y="8.5" width="10" height="9" fill="#E4CB9A" stroke="#B9954F"/></svg>';
const WAVE = '<svg class="wave" viewBox="0 0 20 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">'
  +'<path d="M3 7a9 9 0 0 1 0 10"/><path d="M8.5 4a15 15 0 0 1 0 16"/><path d="M14 1a21 21 0 0 1 0 22"/></svg>';

export const ART: Record<string, () => string> = {
  rome(){
    let a='';
    for(let i=0;i<7;i++){const x=-14+i*30;
      a+='<path d="M'+x+' 96 L'+x+' 64 a10 10 0 0 1 20 0 L'+(x+20)+' 96 Z" fill="#F2CDA2"/>';}
    let b='';
    return '<svg viewBox="0 0 320 96" preserveAspectRatio="xMidYMid slice" aria-hidden="true">'
      +'<defs><linearGradient id="skR" x1="0" y1="0" x2="0" y2="1">'
      +'<stop offset="0" stop-color="#F8DDBE"/><stop offset="1" stop-color="#E8AE7C"/></linearGradient></defs>'
      +'<rect width="320" height="96" fill="url(#skR)"/>'
      +'<circle cx="256" cy="26" r="14" fill="#FBEFDD" opacity=".9"/>'
      +'<path d="M0 78 L52 62 L104 76 L156 58 L214 76 L268 64 L320 78 L320 96 L0 96Z" fill="#D89A6B" opacity=".5"/>'
      +'<rect x="-24" y="40" width="222" height="56" fill="#A55E3B"/>'
      +'<rect x="-24" y="40" width="222" height="5" fill="#8E4D2F"/>'
      +'<rect x="-24" y="52" width="222" height="4" fill="#8E4D2F"/>'
      +a+b
      +'<g fill="#6E5236"><path d="M214 68q18-16 36 0z"/><rect x="230" y="66" width="4" height="30"/>'
      +'<path d="M254 76q14-13 28 0z"/><rect x="266" y="74" width="4" height="22"/></g>'
      +'</svg>';
  },
  como(){
    return '<svg viewBox="0 0 320 96" preserveAspectRatio="xMidYMid slice" aria-hidden="true">'
      +'<defs><linearGradient id="skC" x1="0" y1="0" x2="0" y2="1">'
      +'<stop offset="0" stop-color="#DCEEF7"/><stop offset="1" stop-color="#B7DCEC"/></linearGradient>'
      +'<linearGradient id="wtC" x1="0" y1="0" x2="0" y2="1">'
      +'<stop offset="0" stop-color="#8FD3E8"/><stop offset="1" stop-color="#5FB0D2"/></linearGradient></defs>'
      +'<rect width="320" height="96" fill="url(#skC)"/>'
      +'<path d="M0 58 L48 26 L96 58 L150 32 L208 60 L262 38 L320 62 L320 66 L0 66Z" fill="#7FA5B8"/>'
      +'<path d="M0 64 L40 42 L82 64 L134 46 L190 66 L246 50 L320 68 L320 70 L0 70Z" fill="#A9C6D6"/>'
      +'<rect y="66" width="320" height="30" fill="url(#wtC)"/>'
      +'<g stroke="#BFE2F0" stroke-width="1.5" stroke-linecap="round" opacity=".7">'
      +'<path d="M14 80h34M60 86h26M116 78h30M160 88h40M252 82h28M96 92h44"/></g>'
      +'<g fill="#FBFDFE"><path d="M212 78 L212 55 L231 78 Z"/><path d="M209 78 L208 74 L238 74 L234 78 Z"/></g>'
      +'<g fill="#F3EADB"><rect x="26" y="50" width="17" height="16"/><rect x="47" y="55" width="13" height="11"/>'
      +'<path d="M23 50 L34.5 41 L46 50 Z" fill="#C4705A"/><path d="M44 55 L53.5 48 L63 55 Z" fill="#C4705A"/></g>'
      +'</svg>';
  },
  food(){
    return '<svg viewBox="0 0 320 96" preserveAspectRatio="xMidYMid slice" aria-hidden="true">'
      +'<rect width="320" height="96" fill="#EFE7DB"/>'
      +'<g stroke="#E2D6C5" stroke-width="1"><path d="M0 22h320M0 74h320"/></g>'
      +'<circle cx="128" cy="48" r="34" fill="#FFFFFF"/>'
      +'<circle cx="128" cy="48" r="25" fill="none" stroke="#E8DFD2" stroke-width="2"/>'
      +'<circle cx="128" cy="48" r="15" fill="#C9A26B" opacity=".55"/>'
      +'<g fill="#B9AD9B"><rect x="78" y="32" width="4" height="32" rx="2"/><rect x="85" y="32" width="4" height="32" rx="2"/>'
      +'<rect x="171" y="32" width="5" height="32" rx="2.5"/><ellipse cx="173.5" cy="34" rx="5" ry="8"/></g>'
      +'<g><circle cx="234" cy="50" r="18" fill="#FFFFFF"/><circle cx="234" cy="50" r="11" fill="#7A5334"/>'
      +'<path d="M252 44a7 7 0 0 1 0 12" fill="none" stroke="#FFFFFF" stroke-width="4"/></g>'
      +'<rect x="272" y="30" width="34" height="40" rx="2" fill="#F7F2EA" transform="rotate(8 289 50)"/>'
      +'</svg>';
  }
};

export function PhoneFrame({ children, step }: { children: ReactNode; step?: string }) {
  return (
    <div className="phone">
      <div className="screen">
        <div className="scr anim" key={step}>
          <div className="sbar"><span>9:41</span><span>●●● ᯤ ▮</span></div>
          <div className="app-head"><div className="app-brand">HYBRID Travel</div></div>
          {children}
        </div>
      </div>
    </div>
  );
}

export function Card({ balance, bump }: { balance: number; bump?: string }) {
  return (
    <div className="card-face">
      <div className="cf-sheen" aria-hidden="true" />
      <div className="cf-top">
        <div className="cf-brand">HYBRID<span>TRAVEL</span></div>
        <div className="cf-wave" dangerouslySetInnerHTML={{ __html: WAVE }} />
      </div>
      <div dangerouslySetInnerHTML={{ __html: CHIP }} />
      <div className="bl">Available to spend</div>
      <div className="bv">
        <small>USD</small>
        <span className="num">{balance.toLocaleString('en-US')}</span>
        {bump && <span className="bumper">{bump}</span>}
      </div>
      <div className="pan mono">5412 •••• •••• 4417</div>
      <div className="cf-foot">
        <div className="cf-name">S. LEE</div>
        <div className="cf-thru"><span>VALID<br />THRU</span><b className="mono">09/29</b></div>
        <div className="cf-net">PREPAID</div>
      </div>
    </div>
  );
}

/** The payment-method row on a checkout screen. */
export function CardMini({ balance, lang }: { balance: number; lang: Lang }) {
  return (
    <div className="paym">
      <span className="paym-c" aria-hidden="true" />
      <div>
        <b>HYBRID Travel Card</b>
        <span>{t('app.paymentMethod', lang)}</span>
      </div>
      <span className="paym-bal mono">USD {balance.toLocaleString('en-US')}</span>
    </div>
  );
}

export function StayCard({
  art, cap, name, meta, price, action, gone,
}: {
  art: () => string;
  cap: string; name: string; meta: string;
  price: ReactNode; action: ReactNode; gone?: boolean;
}) {
  return (
    <div className={`stay${gone ? ' gone' : ''}`}>
      <div className="photo">
        <span dangerouslySetInnerHTML={{ __html: art() }} />
        <span className="scrim" />
        <span className="cap">{cap}</span>
      </div>
      <div className="stay-body">
        <div className="stay-name">{name}</div>
        <div className="stay-meta">{meta}</div>
        <div className="stay-foot">
          <span className="price">{price}</span>
          {action}
        </div>
      </div>
    </div>
  );
}
