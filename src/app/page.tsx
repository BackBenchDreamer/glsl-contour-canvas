import ShaderCanvas from '@/components/ShaderCanvas';

export default function Home() {
  return (
    <main>
      <ShaderCanvas />
      
      <div className="absolute top-4 left-4 p-6 bg-black/60 backdrop-blur-md text-white rounded-xl shadow-2xl border border-white/10 max-w-sm">
        <h1 className="text-3xl font-bold mb-2 tracking-tight bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">
          Perlin Contours
        </h1>
        <p className="text-sm text-gray-300 mb-4 leading-relaxed">
          Interactive GLSL Perlin noise contours rendered in real-time using WebGL2.
        </p>
        <div className="text-xs text-gray-400">
          <p>Play with the controls on the right to customize the parameters, color palette, and visual style.</p>
        </div>
      </div>
      
      <footer className="absolute bottom-4 left-4 text-xs text-white/50 bg-black/40 px-3 py-1.5 rounded-full backdrop-blur-sm border border-white/5">
        Inspired by <a href="https://github.com/alx-m24/Perlin-Noise-Contours" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 transition-colors underline">alx-m24/Perlin-Noise-Contours</a>
      </footer>
    </main>
  );
}
