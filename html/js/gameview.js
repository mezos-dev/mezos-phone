/* =========================================================
   Game view: draws the live game picture (without the UI) into a <canvas>,
   so the Camera shows its picture INSIDE the phone screen like a real phone.
   Uses FiveM's WebGL hook (the texture parameter sequence below binds the game frame).
   ========================================================= */
'use strict';

const GameView = {
    create(canvas) {
        const gl = canvas.getContext('webgl', { antialias: false, depth: false, stencil: false, alpha: false, desynchronized: true, preserveDrawingBuffer: false, failIfMajorPerformanceCaveat: false });
        if (!gl) return null;

        // texture that FiveM replaces with the game frame
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 255, 255]));
        gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
        gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
        const prog = gl.createProgram();
        gl.attachShader(prog, sh(gl.VERTEX_SHADER, 'attribute vec2 p;attribute vec2 t;varying highp vec2 v;void main(){gl_Position=vec4(p,0.0,1.0);v=t;}'));
        gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, 'varying highp vec2 v;uniform sampler2D tex;void main(){gl_FragColor=texture2D(tex,v);}'));
        gl.linkProgram(prog);
        gl.useProgram(prog);
        gl.uniform1i(gl.getUniformLocation(prog, 'tex'), 0);

        const pos = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, pos);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
        const pl = gl.getAttribLocation(prog, 'p');
        gl.vertexAttribPointer(pl, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(pl);

        const uv = gl.createBuffer();
        const tl = gl.getAttribLocation(prog, 't');

        const view = {
            canvas, gl, frame: 0, raf: 0, grab: null, onFrame: null,
            /** crop the (landscape) game frame to the canvas shape, centred */
            fit() {
                const r = canvas.getBoundingClientRect();
                // render at the game's real pixel size (the phone shows it scaled down) so a photo never needs a resize
                const aspect = Math.max(0.1, r.width / Math.max(1, r.height));
                const h = Math.max(2, Math.min(1440, Math.round(window.innerHeight * (window.devicePixelRatio || 1))));
                const w = Math.max(2, Math.round(h * aspect));
                if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
                this.setCrop(w / h);
            },
            setCrop(aspect) {
                const game = window.innerWidth / window.innerHeight;
                let u0 = 0, u1 = 1, v0 = 0, v1 = 1;
                if (aspect < game) { const f = aspect / game; u0 = 0.5 - f / 2; u1 = 0.5 + f / 2; }
                else { const f = game / aspect; v0 = 0.5 - f / 2; v1 = 0.5 + f / 2; }
                gl.bindBuffer(gl.ARRAY_BUFFER, uv);
                gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([u0, v0, u1, v0, u0, v1, u0, v1, u1, v0, u1, v1]), gl.DYNAMIC_DRAW);
                gl.vertexAttribPointer(tl, 2, gl.FLOAT, false, 0, 0);
                gl.enableVertexAttribArray(tl);
                gl.viewport(0, 0, canvas.width, canvas.height);
            },
            draw() {
                gl.bindTexture(gl.TEXTURE_2D, tex);
                gl.drawArrays(gl.TRIANGLES, 0, 6);
            },
            /** true when the hook works (the frame is not our blue placeholder pixel) */
            check() {
                const px = new Uint8Array(4);
                gl.readPixels(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
                return !(px[0] === 0 && px[1] === 0 && px[2] === 255);
            },
            /** photo of what the viewfinder shows - encoded in the background (no freeze) */
            snapshot(type = 'image/webp', quality = 0.9) {
                return new Promise((resolve) => {
                    // toBlob reads the picture now (right after draw) and encodes it off the main thread
                    canvas.toBlob((blob) => {
                        if (!blob) return resolve(null);
                        const fr = new FileReader();
                        fr.onload = () => resolve(fr.result);
                        fr.onerror = () => resolve(null);
                        fr.readAsDataURL(blob);
                    }, type, quality);
                });
            },
            /** small picture of the current frame (live video) - call right after draw() */
            small(width = 360, quality = 0.55) {
                if (!this._c2) { this._c2 = document.createElement('canvas'); this._x2 = this._c2.getContext('2d'); }
                const h = Math.round(width * canvas.height / canvas.width);
                if (this._c2.width !== width || this._c2.height !== h) { this._c2.width = width; this._c2.height = h; }
                try { this._x2.drawImage(canvas, 0, 0, width, h); return this._c2.toDataURL('image/webp', quality); } catch (e) { return null; }
            },
            loop() {
                this.draw();
                this.frame++;
                if (this.onFrame) this.onFrame(this.frame);
                if (this.tap) this.tap();
                if (this.grab) { const g = this.grab; this.grab = null; this.snapshot().then(g); }
                this.raf = requestAnimationFrame(() => this.loop());
            },
            start() { this.fit(); cancelAnimationFrame(this.raf); this.loop(); },
            stop() { cancelAnimationFrame(this.raf); this.raf = 0; },
            /** resolves with a data url of the next frame */
            capture() { return new Promise((resolve) => { this.grab = resolve; }); },
        };
        return view;
    },
};
