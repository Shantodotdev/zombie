import type { ReactNode } from 'react'
import type { WeaponId } from '../game/config'

/** Flat silhouette of each weapon, tinted with its accent colour. */
export function GunIcon({ id, color, className = 'gun-art' }: { id: WeaponId; color: string; className?: string }) {
  const g = '#aab4c8'
  const d = '#5b6579'
  let body: ReactNode
  switch (id) {
    case 'carbine':
      body = (<><rect x="8" y="15" width="14" height="10" fill={d} /><rect x="22" y="16" width="62" height="8" fill={g} /><rect x="84" y="18" width="26" height="4" fill={g} /><rect x="52" y="24" width="8" height="12" fill={d} /><rect x="48" y="12" width="18" height="4" fill={color} /></>)
      break
    case 'shotgun':
      body = (<><rect x="6" y="15" width="16" height="11" fill="#8a6a44" /><rect x="22" y="16" width="52" height="9" fill={d} /><rect x="74" y="15" width="38" height="4" fill={g} /><rect x="74" y="21" width="32" height="4" fill={g} /><rect x="58" y="24" width="22" height="6" fill="#8a6a44" /></>)
      break
    case 'vectors':
      body = (<><rect x="20" y="10" width="54" height="9" fill={g} /><rect x="74" y="12" width="26" height="4" fill={g} /><rect x="38" y="19" width="6" height="14" fill={d} /><rect x="20" y="22" width="54" height="9" fill={g} /><rect x="74" y="24" width="26" height="4" fill={g} /><rect x="22" y="12" width="40" height="2" fill={color} /></>)
      break
    case 'railgun':
      body = (<><rect x="8" y="14" width="96" height="12" fill={d} /><rect x="10" y="10" width="104" height="3" fill={color} /><rect x="10" y="27" width="104" height="3" fill={color} />{[34, 52, 70, 88].map((x) => <rect key={x} x={x} y="8" width="4" height="24" fill={color} opacity="0.75" />)}</>)
      break
    case 'flamer':
      body = (<><rect x="8" y="8" width="24" height="26" rx="4" fill="#8a8f99" /><rect x="34" y="16" width="52" height="10" fill="#b23a20" /><rect x="86" y="18" width="20" height="6" fill={d} /><polygon points="106,21 120,12 116,21 120,30" fill={color} /></>)
      break
    case 'launcher':
      body = (<><rect x="8" y="14" width="100" height="12" fill="#4a5a34" /><rect x="48" y="9" width="24" height="22" fill={d} /><rect x="40" y="26" width="7" height="10" fill={d} /><rect x="100" y="12" width="10" height="16" fill={g} /><rect x="22" y="10" width="6" height="4" fill={color} /></>)
      break
    case 'minigun':
      body = (<><rect x="8" y="12" width="26" height="18" fill={d} /><rect x="34" y="13" width="76" height="3" fill={g} /><rect x="34" y="19" width="76" height="3" fill={g} /><rect x="34" y="25" width="76" height="3" fill={g} /><rect x="100" y="11" width="6" height="19" fill={d} /><rect x="12" y="30" width="22" height="8" fill="#6a5a2a" /></>)
      break
    case 'arc':
      body = (<><rect x="14" y="15" width="62" height="10" fill={d} /><circle cx="86" cy="20" r="9" fill={color} opacity="0.9" /><circle cx="86" cy="20" r="14" fill={color} opacity="0.2" />{[30, 44, 58].map((x) => <rect key={x} x={x} y="12" width="4" height="16" fill={color} />)}<rect x="10" y="22" width="14" height="12" fill={d} /></>)
      break
    default:
      body = (<><rect x="16" y="20" width="12" height="16" fill="#8a6a44" /><rect x="24" y="14" width="30" height="10" fill={g} /><rect x="54" y="16" width="52" height="6" fill={g} /><rect x="34" y="11" width="14" height="14" fill={d} /></>)
  }
  return (
    <svg className={className} viewBox="0 0 124 42" aria-hidden>
      {body}
    </svg>
  )
}

export const hex = (c: number) => '#' + c.toString(16).padStart(6, '0')
