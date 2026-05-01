import { CompiledShader } from '../engine/Compiler';

export interface PassState {
  shader: CompiledShader;
  program: WebGLProgram;
  uniformLocations: Map<string, WebGLUniformLocation>;
  fboRead: WebGLFramebuffer | null;
  fboWrite: WebGLFramebuffer | null;
  texRead: WebGLTexture | null;
  texWrite: WebGLTexture | null;
}

export class WebGLRenderer {
  private gl: WebGL2RenderingContext;
  private passes: PassState[] = [];
  private vao: WebGLVertexArrayObject | null = null;
  private animationFrameId: number = 0;
  private uniformsData: Record<string, { type: string; value: any }> = {};

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: false });
    if (!gl) {
      throw new Error('WebGL2 not supported');
    }
    this.gl = gl;
    
    // Extensions for floating point textures if needed
    gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');
    
    this.setupGeometry();
  }

  private setupGeometry() {
    const gl = this.gl;
    const positions = new Float32Array([
      -1, -1,  1, -1, -1,  1,
       1, -1,  1,  1, -1,  1,
    ]);

    const uvs = new Float32Array([
      0, 0,  1, 0,  0, 1,
      1, 0,  1, 1,  0, 1,
    ]);

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const uvBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);
  }

  private createFBO(width: number, height: number): { fbo: WebGLFramebuffer, tex: WebGLTexture } {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return { fbo, tex };
  }

  private compileShader(type: number, source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Cannot create shader');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(shader));
      console.log(source);
      gl.deleteShader(shader);
      throw new Error('Shader compilation failed');
    }
    return shader;
  }

  public setShaders(compiledPasses: CompiledShader[]) {
    const gl = this.gl;
    
    // Clean up old passes
    this.passes.forEach(p => {
      gl.deleteProgram(p.program);
      if (p.fboRead) gl.deleteFramebuffer(p.fboRead);
      if (p.fboWrite) gl.deleteFramebuffer(p.fboWrite);
      if (p.texRead) gl.deleteTexture(p.texRead);
      if (p.texWrite) gl.deleteTexture(p.texWrite);
    });
    this.passes = [];
    this.uniformsData = {};

    const width = gl.canvas.width;
    const height = gl.canvas.height;

    compiledPasses.forEach((compiled, index) => {
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
      Object.entries(compiled.uniforms).forEach(([name, data]) => {
        const loc = gl.getUniformLocation(program, name);
        if (loc) uniformLocations.set(name, loc);
        this.uniformsData[name] = data; // Merge all uniforms
      });

      let fboRead = null, fboWrite = null, texRead = null, texWrite = null;
      if (!compiled.isFinal) {
         // Create Ping-Pong FBOs for intermediate passes
         const fbo1 = this.createFBO(width, height);
         const fbo2 = this.createFBO(width, height);
         fboRead = fbo1.fbo; texRead = fbo1.tex;
         fboWrite = fbo2.fbo; texWrite = fbo2.tex;
      }

      this.passes.push({
        shader: compiled,
        program,
        uniformLocations,
        fboRead,
        fboWrite,
        texRead,
        texWrite
      });
    });
  }

  public updateUniforms(newValues: Record<string, any>) {
    Object.entries(newValues).forEach(([name, value]) => {
      if (this.uniformsData[name]) {
        this.uniformsData[name].value = value;
      }
    });
  }

  public render() {
    if (this.passes.length === 0 || !this.vao) return;
    const gl = this.gl;
    
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    this.passes.forEach((pass, index) => {
      if (pass.shader.isFinal) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      } else {
        gl.bindFramebuffer(gl.FRAMEBUFFER, pass.fboWrite);
      }

      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.useProgram(pass.program);

      // Apply uniforms
      let textureUnit = 0;
      Object.entries(pass.shader.uniforms).forEach(([name, data]) => {
        const loc = pass.uniformLocations.get(name);
        if (!loc) return;
        const currentData = this.uniformsData[name] || data;

        if (name.endsWith('_previousFrameTex')) {
           gl.activeTexture(gl.TEXTURE0 + textureUnit);
           gl.bindTexture(gl.TEXTURE_2D, pass.texRead);
           gl.uniform1i(loc, textureUnit);
           textureUnit++;
        } else if (name.endsWith('_passTex')) {
           // Find the pass that generated this texture
           const srcPassId = name.match(/u_(.*)_passTex/)?.[1];
           const srcPass = this.passes.find(p => p.shader.passId === srcPassId);
           if (srcPass) {
             gl.activeTexture(gl.TEXTURE0 + textureUnit);
             gl.bindTexture(gl.TEXTURE_2D, srcPass.texRead); // Read from what was written last frame or earlier this frame
             gl.uniform1i(loc, textureUnit);
             textureUnit++;
           }
        } else {
          switch (currentData.type) {
            case 'float': gl.uniform1f(loc, currentData.value); break;
            case 'int': gl.uniform1i(loc, currentData.value); break;
            case 'vec2': gl.uniform2fv(loc, currentData.value); break;
            case 'vec3':
              if (typeof currentData.value === 'string') gl.uniform3fv(loc, hexToRgb(currentData.value));
              else gl.uniform3fv(loc, currentData.value);
              break;
          }
        }
      });

      gl.bindVertexArray(this.vao);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    });

    // Swap FBOs for ping-ponging
    this.passes.forEach(pass => {
      if (!pass.shader.isFinal) {
        const tempFbo = pass.fboRead;
        const tempTex = pass.texRead;
        pass.fboRead = pass.fboWrite;
        pass.texRead = pass.texWrite;
        pass.fboWrite = tempFbo;
        pass.texWrite = tempTex;
      }
    });
  }

  public startLoop(onFrame?: (renderer: WebGLRenderer) => void) {
    const loop = () => {
      if (onFrame) onFrame(this);
      this.render();
      this.animationFrameId = requestAnimationFrame(loop);
    };
    this.stopLoop();
    loop();
  }

  public stopLoop() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  public resize(width: number, height: number) {
    this.gl.canvas.width = width;
    this.gl.canvas.height = height;
    
    // Recreate FBOs for new size
    this.passes.forEach(p => {
       if (!p.shader.isFinal) {
          if (p.fboRead) this.gl.deleteFramebuffer(p.fboRead);
          if (p.fboWrite) this.gl.deleteFramebuffer(p.fboWrite);
          if (p.texRead) this.gl.deleteTexture(p.texRead);
          if (p.texWrite) this.gl.deleteTexture(p.texWrite);
          
          const fbo1 = this.createFBO(width, height);
          const fbo2 = this.createFBO(width, height);
          p.fboRead = fbo1.fbo; p.texRead = fbo1.tex;
          p.fboWrite = fbo2.fbo; p.texWrite = fbo2.tex;
       }
    });
    
    this.render();
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\\d]{2})([a-f\\d]{2})([a-f\\d]{2})$/i.exec(hex);
  return result ? [
    parseInt(result[1], 16) / 255,
    parseInt(result[2], 16) / 255,
    parseInt(result[3], 16) / 255
  ] : [0, 0, 0];
}
