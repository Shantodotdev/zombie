import type { WeaponId } from '../game/config'

/** Generated low-poly artwork, shared by UI cards and loadout slots only. */
export function GunIcon({ id, className = 'gun-art' }: { id: WeaponId; color: string; className?: string }) {
  return (
    <img
      className={className}
      src={`${import.meta.env.BASE_URL}images/weapons/${id}.png`}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  )
}

export const hex = (c: number) => '#' + c.toString(16).padStart(6, '0')

export const weaponLabel = (name: string) => name.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())
