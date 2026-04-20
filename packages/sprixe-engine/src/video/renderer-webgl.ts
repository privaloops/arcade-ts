/**
 * Sprixe — WebGL2 Renderer
 *
 * Uploads the 384×224 RGBA framebuffer as a GPU texture each frame,
 * then draws a fullscreen quad. Much faster than Canvas 2D putImageData
 * because the upload + draw happens via DMA, not pixel-by-pixel JS copy.
 */

import { SCREEN_WIDTH, SCREEN_HEIGHT } from './renderer';
import type { RendererInterface } from '../types';

export class WebGLRenderer implements RendererInterface {
  private readonly canvas: HTMLCanvasElement;
  private readonly gl: WebGL2RenderingContext;
  private readonly texture: WebGLTexture;
  private readonly program: WebGLProgram;
  private texWidth: number;
  private texHeight: number;

  constructor(canvas: HTMLCanvasElement, width = SCREEN_WIDTH, height = SCREEN_HEIGHT) {
    this.texWidth = width;
    this.texHeight = height;
    canvas.width = width;
    canvas.height = height;

    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 not available');

    this.canvas = canvas;
    this.gl = gl;

    // Fullscreen quad (2 triangles, clip space)
    const verts = new Float32Array([
      -1, -1,  0, 1,
       1, -1,  1, 1,
      -1,  1,  0, 0,
       1,  1,  1, 0,
    ]);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);

    // Shaders
    const vs = this.compileShader(gl.VERTEX_SHADER, `#version 300 es
      layout(location=0) in vec2 aPos;
      layout(location=1) in vec2 aUV;
      out vec2 vUV;
      void main() {
        gl_Position = vec4(aPos, 0.0, 1.0);
        vUV = aUV;
      }
    `);

    const fs = this.compileShader(gl.FRAGMENT_SHADER, `#version 300 es
      precision mediump float;
      in vec2 vUV;
      out vec4 fragColor;
      uniform sampler2D uTex;
      void main() {
        fragColor = texture(uTex, vUV);
      }
    `);

    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('Shader link failed: ' + gl.getProgramInfoLog(prog));
    }
    this.program = prog;

    // VAO
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

    // Texture
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // Allocate texture storage
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    this.texture = tex;

    gl.useProgram(prog);
    gl.viewport(0, 0, width, height);
  }

  /**
   * Resize the renderer for a different resolution (e.g., Neo-Geo 320x224).
   * Reallocates the GPU texture and updates the viewport.
   */
  resize(width: number, height: number): void {
    this.texWidth = width;
    this.texHeight = height;
    this.canvas.width = width;
    this.canvas.height = height;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.viewport(0, 0, width, height);
  }

  /**
   * Upload framebuffer to GPU texture and draw.
   */
  render(framebuffer: Uint8Array): void {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.texWidth, this.texHeight, gl.RGBA, gl.UNSIGNED_BYTE, framebuffer);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** Draw text overlay (fallback to 2D overlay canvas if needed) */
  drawText(_text: string, _x: number, _y: number): void {
    // Skip for now — FPS overlay can use a separate HTML element
  }

  private compileShader(type: number, source: string): WebGLShader {
    const gl = this.gl;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error('Shader compile failed: ' + gl.getShaderInfoLog(shader));
    }
    return shader;
  }
}
