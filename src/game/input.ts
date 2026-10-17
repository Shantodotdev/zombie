export class Input {
  private keys = new Set<string>()
  private pressedSet = new Set<string>()
  mouseX = 0
  mouseY = 0
  /** virtual cursor offset (px) from the player's on-screen position; driven by relative mouse motion */
  virtX = 0
  virtY = -140
  fire = false
  altFire = false
  altPressed = false
  wheel = 0
  private disposers: Array<() => void> = []

  constructor(private target: HTMLElement) {
    const on = <K extends keyof WindowEventMap>(
      t: Window | HTMLElement,
      type: string,
      fn: (e: any) => void,
      opts?: AddEventListenerOptions,
    ) => {
      t.addEventListener(type, fn, opts)
      this.disposers.push(() => t.removeEventListener(type, fn, opts))
    }

    on(window, 'keydown', (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Tab') e.preventDefault()
      if (!e.repeat) this.pressedSet.add(e.code)
      this.keys.add(e.code)
    })
    on(window, 'keyup', (e: KeyboardEvent) => this.keys.delete(e.code))
    on(window, 'blur', () => this.reset())
    on(window, 'mousemove', (e: MouseEvent) => {
      this.mouseX = e.clientX
      this.mouseY = e.clientY
      this.virtX += e.movementX
      this.virtY += e.movementY
    })
    on(target, 'mousedown', (e: MouseEvent) => {
      this.mouseX = e.clientX
      this.mouseY = e.clientY
      if (e.button === 0) this.fire = true
      if (e.button === 2) {
        this.altFire = true
        this.altPressed = true
      }
    })
    on(window, 'mouseup', (e: MouseEvent) => {
      if (e.button === 0) this.fire = false
      if (e.button === 2) this.altFire = false
    })
    on(target, 'contextmenu', (e: Event) => e.preventDefault())
    on(
      target,
      'wheel',
      (e: WheelEvent) => {
        e.preventDefault()
        this.wheel += Math.sign(e.deltaY)
      },
      { passive: false },
    )
  }

  down(code: string) {
    return this.keys.has(code)
  }
  pressed(code: string) {
    return this.pressedSet.has(code)
  }

  endFrame() {
    this.pressedSet.clear()
    this.altPressed = false
    this.wheel = 0
  }

  reset() {
    this.keys.clear()
    this.pressedSet.clear()
    this.fire = false
    this.altFire = false
  }

  dispose() {
    this.disposers.forEach((d) => d())
    this.disposers = []
  }
}
