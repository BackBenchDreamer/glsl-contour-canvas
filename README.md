# Perlin Noise Contours - WebGL2

This is a Next.js web application that renders a full-screen, interactive Perlin noise contour shader using raw WebGL2. 
It features a minimal UI built with `leva` for tweaking shader parameters in real time without reloading the page.

## Inspiration
The original GLSL shader was created by [alx-m24](https://github.com/alx-m24/Perlin-Noise-Contours). The Shadertoy-style code was adapted to a WebGL2 pipeline and enhanced with a suite of interactive controls ("personal touches").

## Features (Personal Touches)
- **Palette Selector**: Choose between multiple color palettes ("Warm", "Ice", "Mono", "Neon").
- **Seed Control**: An integer input that alters the perlin noise pattern deterministically.
- **Speed Control**: A slider to adjust the flow of time.
- **Contour Resolution Control**: A slider affecting the banding frequency.
- **Lines Only Toggle**: Switch between filled contour bands or thin contour lines.
- **Vignette & Grain Toggle**: Add a subtle film grain and vignette effect.

## Local Development

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Deployment

This project is optimized to be easily deployed on [Vercel](https://vercel.com/new).

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FBackBenchDreamer%2Fglsl-contour-canvas)
