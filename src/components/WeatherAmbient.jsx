import { useRef, useEffect } from 'react'

function getConditionType(description) {
  if (!description) return 'clear'
  const d = description.toLowerCase()
  if (d.includes('thunder') || d.includes('storm')) return 'thunder'
  if (d.includes('rain') || d.includes('shower') || d.includes('drizzle')) return 'rain'
  if (d.includes('snow') || d.includes('sleet') || d.includes('ice') || d.includes('flurr')) return 'snow'
  if (d.includes('fog') || d.includes('haze') || d.includes('mist') || d.includes('smoke')) return 'fog'
  if (d.includes('wind') || d.includes('breezy')) return 'wind'
  if (d.includes('cloud') || d.includes('overcast')) return 'cloudy'
  return 'clear'
}

class Particle {
  constructor(canvas, type) {
    this.canvas = canvas
    this.type = type
    this.reset(true)
  }

  reset(init = false) {
    const w = this.canvas.width
    const h = this.canvas.height
    switch (this.type) {
      case 'rain':
        this.x = Math.random() * (w + 100) - 50
        this.y = init ? Math.random() * h : -10
        this.speed = 8 + Math.random() * 6
        this.len = 12 + Math.random() * 18
        this.opacity = 0.15 + Math.random() * 0.2
        break
      case 'snow':
        this.x = Math.random() * (w + 40) - 20
        this.y = init ? Math.random() * h : -5
        this.speed = 0.5 + Math.random() * 1.5
        this.radius = 1 + Math.random() * 2.5
        this.drift = (Math.random() - 0.5) * 0.5
        this.opacity = 0.3 + Math.random() * 0.4
        break
      case 'fog':
        this.x = init ? Math.random() * w : -200
        this.y = Math.random() * h
        this.speed = 0.2 + Math.random() * 0.4
        this.radius = 80 + Math.random() * 120
        this.opacity = 0.02 + Math.random() * 0.04
        break
      case 'wind':
        this.x = init ? Math.random() * w : -20
        this.y = Math.random() * h
        this.speed = 3 + Math.random() * 5
        this.len = 20 + Math.random() * 40
        this.opacity = 0.06 + Math.random() * 0.08
        break
      case 'star':
        this.x = Math.random() * w
        this.y = Math.random() * (h * 0.6)
        this.radius = 0.5 + Math.random() * 1.2
        this.twinkleSpeed = 0.02 + Math.random() * 0.04
        this.twinklePhase = Math.random() * Math.PI * 2
        this.opacity = 0.3 + Math.random() * 0.5
        break
      default:
        this.x = Math.random() * w
        this.y = Math.random() * h
        this.speed = 0.1 + Math.random() * 0.3
        this.radius = 1 + Math.random() * 2
        this.opacity = 0.03 + Math.random() * 0.05
        this.drift = (Math.random() - 0.5) * 0.3
    }
  }

  update(time) {
    const w = this.canvas.width
    const h = this.canvas.height
    switch (this.type) {
      case 'rain':
        this.x -= 1.5
        this.y += this.speed
        if (this.y > h + 10) this.reset()
        break
      case 'snow':
        this.x += this.drift + Math.sin(time * 0.001 + this.x * 0.01) * 0.3
        this.y += this.speed
        if (this.y > h + 5) this.reset()
        break
      case 'fog':
        this.x += this.speed
        if (this.x > w + this.radius) this.reset()
        break
      case 'wind':
        this.x += this.speed
        if (this.x > w + 20) this.reset()
        break
      case 'star':
        this.twinklePhase += this.twinkleSpeed
        break
      default:
        this.x += this.drift
        this.y -= this.speed * 0.3
        if (this.y < -10 || this.x < -10 || this.x > w + 10) this.reset()
    }
  }

  draw(ctx, time) {
    switch (this.type) {
      case 'rain':
        ctx.strokeStyle = `rgba(120, 180, 255, ${this.opacity})`
        ctx.lineWidth = 1.2
        ctx.beginPath()
        ctx.moveTo(this.x, this.y)
        ctx.lineTo(this.x - 2, this.y + this.len)
        ctx.stroke()
        break
      case 'snow':
        ctx.fillStyle = `rgba(220, 230, 255, ${this.opacity})`
        ctx.beginPath()
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2)
        ctx.fill()
        break
      case 'fog':
        const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.radius)
        g.addColorStop(0, `rgba(180, 190, 210, ${this.opacity})`)
        g.addColorStop(1, 'rgba(180, 190, 210, 0)')
        ctx.fillStyle = g
        ctx.fillRect(this.x - this.radius, this.y - this.radius, this.radius * 2, this.radius * 2)
        break
      case 'wind':
        ctx.strokeStyle = `rgba(180, 200, 230, ${this.opacity})`
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(this.x, this.y)
        ctx.lineTo(this.x + this.len, this.y - 2)
        ctx.stroke()
        break
      case 'star':
        const twinkle = 0.5 + 0.5 * Math.sin(this.twinklePhase)
        ctx.fillStyle = `rgba(200, 220, 255, ${this.opacity * twinkle})`
        ctx.beginPath()
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2)
        ctx.fill()
        break
      default:
        ctx.fillStyle = `rgba(255, 200, 100, ${this.opacity})`
        ctx.beginPath()
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2)
        ctx.fill()
    }
  }
}

export default function WeatherAmbient({ description, isDaytime }) {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const particlesRef = useRef([])
  const flashRef = useRef({ active: false, opacity: 0, nextFlash: 0 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const condition = getConditionType(description)
    const isNight = isDaytime === false

    const resize = () => {
      canvas.width = canvas.offsetWidth * (window.devicePixelRatio || 1)
      canvas.height = canvas.offsetHeight * (window.devicePixelRatio || 1)
    }
    resize()
    window.addEventListener('resize', resize)

    // Create particles based on condition
    const particles = []
    let count = 0
    let pType = 'clear'

    switch (condition) {
      case 'thunder':
        pType = 'rain'
        count = 120
        break
      case 'rain':
        pType = 'rain'
        count = 80
        break
      case 'snow':
        pType = 'snow'
        count = 60
        break
      case 'fog':
        pType = 'fog'
        count = 15
        break
      case 'wind':
        pType = 'wind'
        count = 30
        break
      case 'cloudy':
        pType = 'fog'
        count = 8
        break
      default:
        pType = isNight ? 'star' : 'clear'
        count = isNight ? 40 : 15
    }

    for (let i = 0; i < count; i++) {
      particles.push(new Particle(canvas, pType))
    }
    particlesRef.current = particles

    const flash = flashRef.current
    flash.nextFlash = condition === 'thunder' ? Date.now() + 2000 + Math.random() * 5000 : Infinity

    const animate = (time) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Lightning flash for thunderstorms
      if (condition === 'thunder') {
        if (Date.now() > flash.nextFlash && !flash.active) {
          flash.active = true
          flash.opacity = 0.15 + Math.random() * 0.1
          flash.nextFlash = Date.now() + 3000 + Math.random() * 8000
        }
        if (flash.active) {
          ctx.fillStyle = `rgba(200, 210, 255, ${flash.opacity})`
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          flash.opacity *= 0.85
          if (flash.opacity < 0.01) flash.active = false
        }
      }

      for (const p of particles) {
        p.update(time)
        p.draw(ctx, time)
      }

      animRef.current = requestAnimationFrame(animate)
    }

    animRef.current = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [description, isDaytime])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full pointer-events-none z-0"
      style={{ opacity: 0.6 }}
    />
  )
}
