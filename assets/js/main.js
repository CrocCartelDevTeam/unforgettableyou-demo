/* =========================================================
   Unforgettable You — interactions + WebGL hero
   ========================================================= */
(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---- Page loader ---- */
  window.addEventListener("load", function () {
    var loader = document.getElementById("loader");
    if (loader) setTimeout(function () { loader.classList.add("is-hidden"); }, 900);
  });

  /* ---- Nav scroll state + scroll progress ---- */
  var nav = document.getElementById("nav");
  var progress = document.getElementById("scrollProgress");

  function onScroll() {
    var y = window.scrollY || window.pageYOffset;
    if (nav) nav.classList.toggle("is-scrolled", y > 40);
    if (progress) {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.width = (h > 0 ? (y / h) * 100 : 0) + "%";
    }
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  /* ---- Mobile menu ---- */
  var toggle = document.getElementById("navToggle");
  var navLinks = document.getElementById("navLinks");
  function closeMenu() {
    if (!navLinks) return;
    navLinks.classList.remove("is-open");
    nav.classList.remove("is-menu-open");
  }
  if (toggle && navLinks) {
    toggle.addEventListener("click", function () {
      var open = navLinks.classList.toggle("is-open");
      nav.classList.toggle("is-menu-open", open);
    });
    navLinks.querySelectorAll("a").forEach(function (a) { a.addEventListener("click", closeMenu); });
  }

  /* ---- Reveal on scroll ---- */
  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { entry.target.classList.add("is-visible"); io.unobserve(entry.target); }
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -8% 0px" });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("is-visible"); });
  }

  /* ---- Light starfield parallax ---- */
  var starLayer = document.querySelector(".hero__bg-layer--2");
  if (starLayer && !reduceMotion) {
    window.addEventListener("scroll", function () {
      var y = window.scrollY || window.pageYOffset;
      if (y < window.innerHeight) starLayer.style.transform = "translateY(" + y * 0.18 + "px)";
    }, { passive: true });
  }


  /* =========================================================
     WebGL hero — a slow, flowing "golden nebula" shader.
     Domain-warped fractal noise in the brand palette, with
     gentle mouse parallax. Falls back to CSS gradient.
     ========================================================= */
  (function initHeroWebGL() {
    var canvas = document.getElementById("heroCanvas");
    if (!canvas || reduceMotion) return;

    var gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl) return; // CSS fallback layer remains visible

    canvas.classList.add("is-on");

    var vert =
      "attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}";

    var frag = [
      "precision highp float;",
      "uniform vec2 u_res;",
      "uniform float u_time;",
      "uniform vec2 u_mouse;",
      "float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}",
      "float noise(vec2 p){",
      "  vec2 i=floor(p),f=fract(p);",
      "  float a=hash(i),b=hash(i+vec2(1.0,0.0)),c=hash(i+vec2(0.0,1.0)),d=hash(i+vec2(1.0,1.0));",
      "  vec2 u=f*f*(3.0-2.0*f);",
      "  return mix(a,b,u.x)+(c-a)*u.y*(1.0-u.x)+(d-b)*u.x*u.y;",
      "}",
      "float fbm(vec2 p){",
      "  float v=0.0,a=0.5;",
      "  for(int i=0;i<5;i++){v+=a*noise(p);p*=2.02;a*=0.5;}",
      "  return v;",
      "}",
      "void main(){",
      "  vec2 uv=gl_FragCoord.xy/u_res.xy;",
      "  vec2 p=uv; p.x*=u_res.x/u_res.y;",
      "  float t=u_time*0.025;",
      "  vec2 m=(u_mouse-0.5)*0.25;",
      "  vec2 q=vec2(fbm(p+t+m), fbm(p+vec2(5.2,1.3)-t));",
      "  float n=fbm(p+q*1.6+m);",
      "  float n2=fbm(p*1.7-t*0.6);",
      "  vec3 navy=vec3(0.043,0.071,0.129);",
      "  vec3 navy2=vec3(0.094,0.129,0.212);",
      "  vec3 gold=vec3(0.69,0.553,0.341);",
      "  vec3 rose=vec3(0.71,0.455,0.42);",
      "  vec3 col=mix(navy,navy2,smoothstep(0.15,0.85,n));",
      "  col=mix(col,gold,smoothstep(0.55,0.98,n)*0.55);",
      "  col=mix(col,rose,smoothstep(0.62,1.0,n2)*0.20);",
      "  float spark=pow(fbm(p*3.0+t*1.5),6.0)*0.7;",
      "  col+=gold*spark;",
      "  float v=smoothstep(1.25,0.25,length(uv-0.5));",
      "  col*=0.55+0.45*v;",
      "  gl_FragColor=vec4(col,1.0);",
      "}"
    ].join("\n");

    function compile(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { return null; }
      return s;
    }

    var vs = compile(gl.VERTEX_SHADER, vert);
    var fs = compile(gl.FRAGMENT_SHADER, frag);
    if (!vs || !fs) { canvas.classList.remove("is-on"); return; }

    var prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.classList.remove("is-on"); return; }
    gl.useProgram(prog);

    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    var uRes = gl.getUniformLocation(prog, "u_res");
    var uTime = gl.getUniformLocation(prog, "u_time");
    var uMouse = gl.getUniformLocation(prog, "u_mouse");

    var mouse = { x: 0.5, y: 0.5 }, target = { x: 0.5, y: 0.5 };
    window.addEventListener("mousemove", function (e) {
      target.x = e.clientX / window.innerWidth;
      target.y = 1.0 - e.clientY / window.innerHeight;
    }, { passive: true });

    var dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    function resize() {
      var w = canvas.clientWidth, h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    window.addEventListener("resize", resize);
    resize();

    var start = performance.now(), running = true, raf;
    function render(now) {
      if (!running) return;
      mouse.x += (target.x - mouse.x) * 0.05;
      mouse.y += (target.y - mouse.y) * 0.05;
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, (now - start) / 1000);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(render);
    }
    raf = requestAnimationFrame(render);

    // Pause when hero scrolled out of view (saves battery)
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting && !running) { running = true; start = performance.now(); raf = requestAnimationFrame(render); }
          else if (!en.isIntersecting) { running = false; cancelAnimationFrame(raf); }
        });
      }, { threshold: 0.01 }).observe(canvas);
    }
  })();
})();
