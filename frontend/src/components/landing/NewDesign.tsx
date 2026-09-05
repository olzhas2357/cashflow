import { useEffect, useRef } from 'react'
import { Mesh, Program, Renderer, Triangle } from 'ogl'
// import './GhostFibers.css'

type GhostFibersProps = {
  lineColor?: string
  glowColor?: string
  speed?: number
  scale?: number
  rotation?: number
  rotationSpeed?: number
  layers?: number
  waveAmplitude?: number
  waveFrequency?: number
  waveSpeed?: number
  layerSpeed?: number
  twist?: number
  twistFrequency?: number
  twistSpeed?: number
  lineFrequency?: number
  lineSpacing?: number
  lineSharpness?: number
  glowFalloff?: number
  glowIntensity?: number
  brightness?: number
  blueBoost?: number
  vignette?: number
  grain?: number
  lightMode?: boolean
  dpr?: number
  fps?: number
  paused?: boolean
  className?: string
}

const hexToRgb = (hex: string) => {
  const value = hex.trim().replace(/^#/, '')
  const normalized =
    value.length === 3
      ? value.replace(/./g, (channel) => channel + channel)
      : value

  const match = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(normalized)

  if (!match) return [1, 1, 1]

  return [
    parseInt(match[1], 16) / 255,
    parseInt(match[2], 16) / 255,
    parseInt(match[3], 16) / 255,
  ]
}

const setColor = (uniform: any, hex: string) => {
  const color = hexToRgb(hex)

  uniform.value[0] = color[0]
  uniform.value[1] = color[1]
  uniform.value[2] = color[2]
}

const vertex = `#version 300 es

in vec2 position;

void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const fragment = `#version 300 es

precision highp float;

uniform vec2 uResolution;
uniform vec2 uMouse;
uniform float uMouseStrength;

uniform float uTime;
uniform float uSpeed;
uniform float uScale;
uniform float uRotation;
uniform float uLayers;

uniform float uWaveAmplitude;
uniform float uWaveFrequency;
uniform float uWaveSpeed;
uniform float uLayerSpeed;

uniform float uTwist;
uniform float uTwistFrequency;
uniform float uTwistSpeed;

uniform float uLineFrequency;
uniform float uLineSpacing;
uniform float uLineSharpness;

uniform float uGlowFalloff;
uniform float uGlowIntensity;
uniform float uBrightness;

uniform float uBlueBoost;
uniform float uVignette;
uniform float uGrain;
uniform float uRotationSpeed;
uniform float uLightMode;

uniform vec3 uLineColor;
uniform vec3 uGlowColor;

out vec4 fragColor;

#define MAX_LAYERS 10

mat2 rotate2d(float angle) {
  float sine = sin(angle);
  float cosine = cos(angle);

  return mat2(
    cosine,
    -sine,
    sine,
    cosine
  );
}

float grainHash(vec2 point) {
  point = floor(point);

  float hash =
    52.9829189 *
    fract(dot(point, vec2(0.065, 0.005)));

  return fract(hash);
}

float layeredGrain(vec2 fragmentPixel) {
  vec2 point =
    mod(
      fragmentPixel +
      vec2(uTime * 30.0, -uTime * 21.0),
      1024.0
    );

  vec2 rotated =
    mat2(0.8, -0.5, 0.5, 0.8) *
    point;

  float grain = 0.0;

  grain += 0.40 * grainHash(rotated);
  grain += 0.25 * grainHash(rotated * 2.0 + 17.0);
  grain += 0.20 * grainHash(rotated * 4.0 + 47.0);
  grain += 0.10 * grainHash(rotated * 8.0 + 113.0);
  grain += 0.05 * grainHash(rotated * 16.0 + 191.0);

  return grain;
}

void main() {

  vec2 resolution =
    max(uResolution, vec2(1.0));

  vec2 uv =
    (2.0 * gl_FragCoord.xy - resolution)
    / resolution.y;

  float time = uTime * uSpeed;

  vec3 backdrop =
    mix(
      vec3(0.070588, 0.058824, 0.090196),
      vec3(1.0),
      step(0.5, uLightMode)
    );

  vec3 centerTone =
    max(
      uLineColor * 0.85567 -
      uGlowColor * 0.06186,
      vec3(0.0)
    );

  vec3 cloudTone =
    uLineColor * 0.19588 +
    uGlowColor * 0.2268;

  // ----------------------------------------
  // MOUSE INTERACTION
  // ----------------------------------------

  float mouseDistance =
    distance(uv, uMouse);

  float mouseInfluence =
    exp(
      -mouseDistance *
      mouseDistance *
      4.0
    );

  // Плавное искривление волокон возле мыши
  vec2 mouseDirection =
    normalize(
      uv - uMouse +
      vec2(0.0001)
    );

  vec2 mouseWarp =
    mouseDirection *
    mouseInfluence *
    uMouseStrength;

  vec2 p = uv;

  p += mouseWarp;

  p /= max(uScale, 0.05);

  p =
    rotate2d(
      radians(uRotation) +
      time * uRotationSpeed
    ) * p;

  vec3 color = vec3(0.0);

  float fiberField = 0.0;

  // ----------------------------------------
  // FIBERS
  // ----------------------------------------

  for (int index = 0; index < MAX_LAYERS; index++) {

    float fi = float(index) + 1.0;

    if (fi > uLayers) break;

    p +=
      uWaveAmplitude *
      sin(
        p.yx *
        fi *
        uWaveFrequency +
        time *
        (
          uWaveSpeed +
          fi * uLayerSpeed
        )
      );

    float radius = length(p);

    float polarAngle =
      atan(p.y, p.x);

    polarAngle +=
      sin(
        radius *
        uTwistFrequency -
        time *
        uTwistSpeed +
        fi
      ) *
      uTwist;

    p =
      vec2(
        cos(polarAngle),
        sin(polarAngle)
      ) *
      radius;

    float lines =
      abs(
        sin(
          p.x *
          (
            uLineFrequency +
            fi * uLineSpacing
          ) +
          sin(
            p.y * 3.0 +
            time
          )
        )
      );

    lines =
      pow(
        max(0.0, 1.0 - lines),
        uLineSharpness
      );

    fiberField += lines / fi;

    color +=
      uLineColor *
      lines /
      fi;

    float glow =
      exp(
        -uGlowFalloff *
        abs(
          sin(
            p.x * 3.0 +
            time +
            fi
          )
        )
      );

    color +=
      uGlowColor *
      glow *
      uGlowIntensity /
      (fi * 2.0);
  }

  // ----------------------------------------
  // MOUSE GLOW
  // ----------------------------------------

  float mouseGlow =
    exp(
      -mouseDistance *
      mouseDistance *
      8.0
    );

  color +=
    uGlowColor *
    mouseGlow *
    0.35;

  // ----------------------------------------
  // CENTER
  // ----------------------------------------

  float center =
    exp(
      -2.2 *
      dot(uv, uv)
    );

  color +=
    centerTone *
    center;

  // ----------------------------------------
  // ATMOSPHERE
  // ----------------------------------------

  float cloud =
    exp(
      -1.5 *
      length(
        uv +
        vec2(
          sin(time * 0.3) * 0.25,
          cos(time * 0.25) * 0.18
        )
      )
    );

  color +=
    cloudTone *
    cloud *
    0.45;

  // ----------------------------------------
  // VIGNETTE
  // ----------------------------------------

  float vignette =
    1.0 -
    smoothstep(
      0.35,
      1.45,
      length(uv)
    );

  color *=
    mix(
      1.0 - uVignette,
      1.0,
      vignette
    );

  color =
    1.0 -
    exp(
      -color *
      uBrightness
    );

  color.b *= uBlueBoost;

  vec3 outputColor;

  if (uLightMode > 0.5) {

    float edgeFade =
      mix(
        1.0 - uVignette,
        1.0,
        vignette
      );

    float fibers =
      pow(
        smoothstep(
          0.12,
          1.05,
          fiberField
        ) *
        edgeFade,
        1.5
      );

    float atmosphere =
      (
        center * 0.025 +
        cloud * 0.015
      ) *
      edgeFade;

    vec3 fiberInk =
      mix(
        backdrop,
        uLineColor,
        0.52
      );

    vec3 airColor =
      mix(
        backdrop,
        uGlowColor,
        0.16
      );

    outputColor =
      mix(
        backdrop,
        airColor,
        atmosphere
      );

    outputColor =
      mix(
        outputColor,
        fiberInk,
        fibers * 0.3
      );

  } else {

    outputColor =
      backdrop +
      color;
  }

  // Дополнительное свечение вокруг мыши
  outputColor +=
    uGlowColor *
    mouseGlow *
    0.08;

  float noise =
    (
      layeredGrain(
        gl_FragCoord.xy
      ) -
      0.5
    ) *
    uGrain;

  outputColor =
    clamp(
      outputColor + noise,
      0.0,
      1.0
    );

  fragColor =
    vec4(
      outputColor,
      1.0
    );
}
`

const contexts = new WeakMap<any, any>()

const GhostFibers = ({
  lineColor = '#16a34a',
  glowColor = '#22c55e',

  // Очень медленное движение
  speed = 0.06,

  scale = 2.2,

  rotation = 0,
  rotationSpeed = 0,

  layers = 3,

  waveAmplitude = 0.01,
  waveFrequency = 3,
  waveSpeed = 0.04,
  layerSpeed = 0.02,

  twist = 0.06,
  twistFrequency = 5,
  twistSpeed = 0.4,

  lineFrequency = 5,
  lineSpacing = 2,
  lineSharpness = 18,

  glowFalloff = 12,
  glowIntensity = 1.15,
  brightness = 1.4,

  blueBoost = 1,

  vignette = 0.7,
  grain = 0.015,

  lightMode = false,

  dpr = 1,
  fps = 60,
  paused = false,

  className = '',
}: GhostFibersProps) => {

  const containerRef =
    useRef<HTMLDivElement | null>(null)

  useEffect(() => {

    const container =
      containerRef.current

    if (!container) return

    const renderer =
      new Renderer({
        webgl: 2,
        alpha: false,
        antialias: false,
        dpr: Math.min(
          Math.max(dpr, 0.5),
          2
        ),
      })

    const gl = renderer.gl

    const canvas =
      gl.canvas as HTMLCanvasElement

    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.display = 'block'

    canvas.setAttribute(
      'aria-hidden',
      'true'
    )

    container.appendChild(canvas)

    const geometry =
      new Triangle(gl)

    const program =
      new Program(gl, {

        vertex,

        fragment,

        uniforms: {

          uResolution: {
            value:
              new Float32Array([1, 1]),
          },

          // Позиция мыши
          uMouse: {
            value:
              new Float32Array([0, 0]),
          },

          uMouseStrength: {
            value: 0.14,
          },

          uTime: {
            value: 0,
          },

          uSpeed: {
            value: speed,
          },

          uScale: {
            value: scale,
          },

          uRotation: {
            value: rotation,
          },

          uRotationSpeed: {
            value: rotationSpeed,
          },

          uLayers: {
            value: layers,
          },

          uWaveAmplitude: {
            value: waveAmplitude,
          },

          uWaveFrequency: {
            value: waveFrequency,
          },

          uWaveSpeed: {
            value: waveSpeed,
          },

          uLayerSpeed: {
            value: layerSpeed,
          },

          uTwist: {
            value: twist,
          },

          uTwistFrequency: {
            value: twistFrequency,
          },

          uTwistSpeed: {
            value: twistSpeed,
          },

          uLineFrequency: {
            value: lineFrequency,
          },

          uLineSpacing: {
            value: lineSpacing,
          },

          uLineSharpness: {
            value: lineSharpness,
          },

          uGlowFalloff: {
            value: glowFalloff,
          },

          uGlowIntensity: {
            value: glowIntensity,
          },

          uBrightness: {
            value: brightness,
          },

          uBlueBoost: {
            value: blueBoost,
          },

          uVignette: {
            value: vignette,
          },

          uGrain: {
            value: grain,
          },

          uLightMode: {
            value:
              lightMode ? 1 : 0,
          },

          uLineColor: {
            value:
              new Float32Array(
                hexToRgb(lineColor)
              ),
          },

          uGlowColor: {
            value:
              new Float32Array(
                hexToRgb(glowColor)
              ),
          },
        },
      })

    const mesh =
      new Mesh(gl, {
        geometry,
        program,
      })

    let frameId = 0

    let elapsed = 0
    let previousTime =
      performance.now()

    let lastRenderTime = 0

    let frameRate = fps

    let isPaused = paused
    let isVisible = true

    let isPageVisible =
      !document.hidden

    const reducedMotion =
      window.matchMedia(
        '(prefers-reduced-motion: reduce)'
      )

    // ----------------------------------------
    // MOUSE
    // ----------------------------------------

    const mouse =
      new Float32Array([0, 0])

    const targetMouse =
      new Float32Array([0, 0])

    const handleMouseMove =
      (event: MouseEvent) => {

        const rect =
          container.getBoundingClientRect()

        const x =
          (event.clientX - rect.left) /
          rect.width

        const y =
          (event.clientY - rect.top) /
          rect.height

        // -1 ... +1
        targetMouse[0] =
          (x * 2 - 1)

        // WebGL Y направлен снизу вверх
        targetMouse[1] =
          (1 - y * 2)
      }

    const handleMouseLeave =
      () => {

        targetMouse[0] = 0
        targetMouse[1] = 0
      }

    container.addEventListener(
      'mousemove',
      handleMouseMove
    )

    container.addEventListener(
      'mouseleave',
      handleMouseLeave
    )

    // ----------------------------------------
    // RENDER
    // ----------------------------------------

    const render =
      () =>
        renderer.render({
          scene: mesh,
        })

    const stop = () => {

      if (frameId !== 0) {
        cancelAnimationFrame(frameId)
      }

      frameId = 0
    }

    const canAnimate =
      () =>
        isVisible &&
        isPageVisible &&
        !isPaused &&
        !reducedMotion.matches

    const loop =
      (now: number) => {

        frameId = 0

        if (!canAnimate()) {
          return
        }

        const delta =
          Math.min(
            (now - previousTime) / 1000,
            0.1
          )

        previousTime = now

        elapsed += delta

        // ------------------------------------
        // Плавное следование за мышью
        // ------------------------------------

        const mouseEase =
          1 -
          Math.pow(
            0.0001,
            delta
          )

        mouse[0] +=
          (
            targetMouse[0] -
            mouse[0]
          ) *
          mouseEase

        mouse[1] +=
          (
            targetMouse[1] -
            mouse[1]
          ) *
          mouseEase

        program.uniforms.uMouse.value[0] =
          mouse[0]

        program.uniforms.uMouse.value[1] =
          mouse[1]

        if (
          now - lastRenderTime >=
          1000 / frameRate - 0.5
        ) {

          program.uniforms.uTime.value =
            elapsed

          render()

          lastRenderTime = now
        }

        frameId =
          requestAnimationFrame(loop)
      }

    const start = () => {

      if (
        !canAnimate() ||
        frameId !== 0
      ) {
        return
      }

      previousTime =
        performance.now()

      frameId =
        requestAnimationFrame(loop)
    }

    // ----------------------------------------
    // RESIZE
    // ----------------------------------------

    const setSize = () => {

      const rect =
        container.getBoundingClientRect()

      renderer.setSize(
        Math.max(
          1,
          Math.floor(rect.width)
        ),
        Math.max(
          1,
          Math.floor(rect.height)
        )
      )

      program.uniforms
        .uResolution.value[0] =
        gl.drawingBufferWidth

      program.uniforms
        .uResolution.value[1] =
        gl.drawingBufferHeight

      render()
    }

    // ----------------------------------------
    // VISIBILITY
    // ----------------------------------------

    const handleVisibility =
      () => {

        isPageVisible =
          !document.hidden

        if (canAnimate()) {
          start()
        } else {
          stop()
        }
      }

    const handleReducedMotion =
      () => {

        if (canAnimate()) {
          start()
        } else {
          stop()
          render()
        }
      }

    const resizeObserver =
      new ResizeObserver(
        setSize
      )

    resizeObserver.observe(
      container
    )

    const intersectionObserver =
      new IntersectionObserver(
        ([entry]) => {

          isVisible =
            entry.isIntersecting

          if (canAnimate()) {
            start()
          } else {
            stop()
          }
        },
        {
          threshold: 0,
        }
      )

    intersectionObserver.observe(
      container
    )

    document.addEventListener(
      'visibilitychange',
      handleVisibility
    )

    reducedMotion.addEventListener(
      'change',
      handleReducedMotion
    )

    contexts.set(
      container,
      {
        renderer,
        program,
        mesh,
        render,

        setPaused(value: boolean) {

          isPaused = value

          if (canAnimate()) {
            start()
          } else {
            stop()
            render()
          }
        },

        setFps(value: number) {

          frameRate =
            Math.min(
              Math.max(value, 1),
              120
            )
        },
      }
    )

    setSize()
    start()

    return () => {

      stop()

      resizeObserver.disconnect()

      intersectionObserver.disconnect()

      document.removeEventListener(
        'visibilitychange',
        handleVisibility
      )

      reducedMotion.removeEventListener(
        'change',
        handleReducedMotion
      )

      container.removeEventListener(
        'mousemove',
        handleMouseMove
      )

      container.removeEventListener(
        'mouseleave',
        handleMouseLeave
      )

      contexts.delete(
        container
      )

      if (
        canvas.parentNode ===
        container
      ) {
        container.removeChild(
          canvas
        )
      }

      gl
        .getExtension(
          'WEBGL_lose_context'
        )
        ?.loseContext()
    }

  }, [dpr])

  // ----------------------------------------
  // UPDATE PROPS
  // ----------------------------------------

  useEffect(() => {

    const container =
      containerRef.current

    if (!container) return

    const context =
      contexts.get(container)

    if (!context) return

    const uniforms =
      context.program.uniforms

    setColor(
      uniforms.uLineColor,
      lineColor
    )

    setColor(
      uniforms.uGlowColor,
      glowColor
    )

    uniforms.uSpeed.value =
      speed

    uniforms.uScale.value =
      scale

    uniforms.uRotation.value =
      rotation

    uniforms.uRotationSpeed.value =
      rotationSpeed

    uniforms.uLayers.value =
      Math.min(
        Math.max(
          Math.round(layers),
          1
        ),
        10
      )

    uniforms.uWaveAmplitude.value =
      waveAmplitude

    uniforms.uWaveFrequency.value =
      waveFrequency

    uniforms.uWaveSpeed.value =
      waveSpeed

    uniforms.uLayerSpeed.value =
      layerSpeed

    uniforms.uTwist.value =
      twist

    uniforms.uTwistFrequency.value =
      twistFrequency

    uniforms.uTwistSpeed.value =
      twistSpeed

    uniforms.uLineFrequency.value =
      lineFrequency

    uniforms.uLineSpacing.value =
      lineSpacing

    uniforms.uLineSharpness.value =
      lineSharpness

    uniforms.uGlowFalloff.value =
      glowFalloff

    uniforms.uGlowIntensity.value =
      glowIntensity

    uniforms.uBrightness.value =
      brightness

    uniforms.uBlueBoost.value =
      blueBoost

    uniforms.uVignette.value =
      vignette

    uniforms.uGrain.value =
      grain

    uniforms.uLightMode.value =
      lightMode ? 1 : 0

    context.setFps(fps)

    context.setPaused(paused)

    context.render()

  }, [
    lineColor,
    glowColor,
    speed,
    scale,
    rotation,
    rotationSpeed,
    layers,
    waveAmplitude,
    waveFrequency,
    waveSpeed,
    layerSpeed,
    twist,
    twistFrequency,
    twistSpeed,
    lineFrequency,
    lineSpacing,
    lineSharpness,
    glowFalloff,
    glowIntensity,
    brightness,
    blueBoost,
    vignette,
    grain,
    lightMode,
    fps,
    paused,
    dpr,
  ])

  return (
    <div
      ref={containerRef}
      className={`ghost-fibers-container ${className}`.trim()}
    />
  )
}

export default GhostFibers