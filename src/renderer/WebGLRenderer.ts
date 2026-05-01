import { CompiledShader } from '../engine/Compiler';

export interface PassState {
  shader: CompiledShader;
  program: WebGLProgram;
  uniformLocations: Map<string, WebGLUniformLocation>;
  fboA: WebGLFramebuffer | null;
  fboB: WebGLFramebuffer | null;
  texA: WebGLTexture | null;
  texB: WebGLTexture | null;
  /** true = next write goes to fboB, read from texA */
  pingPong: boolean;
}

export class WebGLRenderer {
  private gl: WebGL2RenderingContext;
  private passes: PassState[] = [];
  private vao: WebGLVertexArrayObject | null = null;
  private animationFrameId: number = 0;
  private uniformsData: Record<string, { type: string; value: any }> = {};
  private useFloatFBO = true;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: false });
    if (!gl) throw new Error('WebGL2 not supported');
    this.gl = gl;

    // Attempt to enable float FBOs; fall back to RGBA8 if unsupported.
    const extCBF = gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');
    if (!extCBF) {
      console.warn('EXT_color_buffer_float not available — falling back to RGBA8 FBOs');
      this.useFloatFBO = false;
    }

    this.setupGeometry();
  }

  /* ---- geometry (fullscreen quad) ---- */
  private setupGeometry() {
    const gl = this.gl;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    const buf = gl.createBuffer();
    // interleaved: pos.xy, uv.xy
    const data = new Float32Array([
      -1, -1, 0, 0,
       1, -1, 1, 0,
      -1,  1, 0, 1,
       1, -1, 1, 0,
       1,  1, 1, 1,
      -1,  1, 0, 1,
    ]);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

    gl.bindVertexArray(null);
  }

  /* ---- FBO helpers ---- */
  private createFBO(w: number, h: number): { fbo: WebGLFramebuffer; tex: WebGLTexture } {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (this.useFloatFBO) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, null);
    } else {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);

    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      console.error('Framebuffer incomplete:', status);
      // try RGBA8 fallback
      if (this.useFloatFBO) {
        this.useFloatFBO = false;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.deleteTexture(tex);
        gl.deleteFramebuffer(fbo);
        return this.createFBO(w, h);
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { fbo, tex };
  }

  /* ---- shader compile ---- */
  private compileShader(type: number, source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader);
      console.error('Shader compile error:\n', log, '\n--- source ---\n', source);
      gl.deleteShader(shader);
      throw new Error('Shader compilation failed');
    }
    return shader;
  }

  /* ---- public API ---- */
  public setShaders(compiledPasses: CompiledShader[]) {
    const gl = this.gl;
    // Clean up
    this.passes.forEach(p => {
      gl.deleteProgram(p.program);
      if (p.fboA) gl.deleteFramebuffer(p.fboA);
      if (p.fboB) gl.deleteFramebuffer(p.fboB);
      if (p.texA) gl.deleteTexture(p.texA);
      if (p.texB) gl.deleteTexture(p.texB);
    });
    this.passes = [];
    this.uniformsData = {};

    const w = gl.canvas.width || 1;
    const h = gl.canvas.height || 1;

    for (const compiled of compiledPasses) {
      const vs = this.compileShader(gl.VERTEX_SHADER, compiled.vertexShader);
      const fs = this.compileShader(gl.FRAGMENT_SHADER, compiled.fragmentShader);

      const program = gl.createProgram()!;
      gl.bindAttribLocation(program, 0, 'aPosition');
      gl.bindAttribLocation(program, 1, 'aUv');
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);

      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(program));
        throw new Error('Program linking failed');
      }
      gl.deleteShader(vs);
      gl.deleteShader(fs);

      const uniformLocations = new Map<string, WebGLUniformLocation>();
      gl.useProgram(program);
      for (const [name, data] of Object.entries(compiled.uniforms)) {
        const loc = gl.getUniformLocation(program, name);
        if (loc) uniformLocations.set(name, loc);
        this.uniformsData[name] = { ...data };
      }

      let fboA: WebGLFramebuffer | null = null;
      let fboB: WebGLFramebuffer | null = null;
      let texA: WebGLTexture | null = null;
      let texB: WebGLTexture | null = null;

      if (!compiled.isFinal) {
        const a = this.createFBO(w, h);
        const b = this.createFBO(w, h);
        fboA = a.fbo; texA = a.tex;
        fboB = b.fbo; texB = b.tex;
      }

      this.passes.push({
        shader: compiled,
        program,
        uniformLocations,
        fboA, fboB, texA, texB,
        pingPong: false
      });
    }
  }

  public updateUniforms(newValues: Record<string, any>) {
    for (const [name, value] of Object.entries(newValues)) {
      if (this.uniformsData[name]) {
        this.uniformsData[name].value = value;
      }
    }
  }

  public render() {
    if (this.passes.length === 0 || !this.vao) return;
    const gl = this.gl;
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    for (const pass of this.passes) {
      // Determine write / read targets
      const writeFbo = pass.shader.isFinal
        ? null
        : (pass.pingPong ? pass.fboB : pass.fboA);
      const readTex = pass.pingPong ? pass.texA : pass.texB;
      // (read = opposite of write for ping-pong; on first frame texB is blank which is fine)

      gl.bindFramebuffer(gl.FRAMEBUFFER, writeFbo);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(pass.program);

      let textureUnit = 0;
      for (const [name] of Object.entries(pass.shader.uniforms)) {
        const loc = pass.uniformLocations.get(name);
        if (!loc) continue;
        const data = this.uniformsData[name] || pass.shader.uniforms[name];

        if (name.endsWith('_previousFrameTex')) {
          gl.activeTexture(gl.TEXTURE0 + textureUnit);
          gl.bindTexture(gl.TEXTURE_2D, readTex);
          gl.uniform1i(loc, textureUnit);
          textureUnit++;
        } else if (name.endsWith('_passTex')) {
          const srcPassId = name.match(/u_(.+)_passTex/)?.[1];
          const srcPass = this.passes.find(p => p.shader.passId === srcPassId);
          if (srcPass) {
            // After the source pass has been rendered this frame, its latest output
            // is in the write target (which just got swapped to read side).
            const srcTex = srcPass.pingPong ? srcPass.texB : srcPass.texA;
            gl.activeTexture(gl.TEXTURE0 + textureUnit);
            gl.bindTexture(gl.TEXTURE_2D, srcTex);
            gl.uniform1i(loc, textureUnit);
            textureUnit++;
          }
        } else {
          this.applyUniformValue(gl, loc, data);
        }
      }

      gl.bindVertexArray(this.vao);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      // Flip ping-pong for this pass
      if (!pass.shader.isFinal) {
        pass.pingPong = !pass.pingPong;
      }
    }
  }

  private applyUniformValue(
    gl: WebGL2RenderingContext,
    loc: WebGLUniformLocation,
    data: { type: string; value: any }
  ) {
    switch (data.type) {
      case 'float': gl.uniform1f(loc, data.value); break;
      case 'int':   gl.uniform1i(loc, data.value); break;
      case 'vec2':  gl.uniform2fv(loc, data.value); break;
      case 'vec3':
        if (typeof data.value === 'string') gl.uniform3fv(loc, hexToRgb(data.value));
        else gl.uniform3fv(loc, data.value);
        break;
    }
  }

  public startLoop(onFrame?: (renderer: WebGLRenderer) => void) {
    this.stopLoop();
    const loop = () => {
      if (onFrame) onFrame(this);
      this.render();
      this.animationFrameId = requestAnimationFrame(loop);
    };
    loop();
  }

  public stopLoop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = 0;
    }
  }

  public resize(width: number, height: number) {
    if (width < 1 || height < 1) return;
    const gl = this.gl;
    (gl.canvas as HTMLCanvasElement).width = width;
    (gl.canvas as HTMLCanvasElement).height = height;

    // Recreate FBOs
    for (const p of this.passes) {
      if (p.shader.isFinal) continue;
      if (p.fboA) gl.deleteFramebuffer(p.fboA);
      if (p.fboB) gl.deleteFramebuffer(p.fboB);
      if (p.texA) gl.deleteTexture(p.texA);
      if (p.texB) gl.deleteTexture(p.texB);
      const a = this.createFBO(width, height);
      const b = this.createFBO(width, height);
      p.fboA = a.fbo; p.texA = a.tex;
      p.fboB = b.fbo; p.texB = b.tex;
      p.pingPong = false;
    }
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? [parseInt(result[1], 16) / 255, parseInt(result[2], 16) / 255, parseInt(result[3], 16) / 255]
    : [0, 0, 0];
}
