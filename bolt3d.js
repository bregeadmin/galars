/* Образец покрытия в секции «Что делаем» — настоящий 3D-болт (Three.js, уже есть в vendor/).
   Шестигранная головка с фасками, резьба геометрией, металл с отражениями студийного окружения.
   Покрытие ложится на модель: слева — уровень поднимается снизу (ванна), справа — плёнка идёт сверху
   (напыление). Болт доворачивается к руке — те же --rx/--ry, что what.js ставит на .hang.
   Рендер только когда что-то меняется. Без WebGL остаётся CSS-болт. */
import * as THREE from 'three';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';

const M = { // тон и блеск покрытий — те же коды, что в what.js
  ni:{c:'#B7B2A7',sp:.55}, nip:{c:'#A8A49B',sp:.40}, cr:{c:'#E6EAEE',sp:.74}, zn:{c:'#A3ABB4',sp:.30}, cd:{c:'#A4A49E',sp:.26},
  ag:{c:'#EDEDE8',sp:.44}, cu:{c:'#C1713F',sp:.52}, sn:{c:'#C3C4C5',sp:.34}, an:{c:'#B9BDBF',sp:.20,met:.7}, anh:{c:'#5A5D5A',sp:.12,met:.6},
  ep:{c:'#DCDCD9',sp:.64}, ph:{c:'#4F4F4C',sp:.08,met:.4}, ox:{c:'#23272C',sp:.22,met:.7}, ti:{c:'#8C9095',sp:.45}, tin:{c:'#D5A94B',sp:.62},
  tio:{c:'#CACCC6',sp:.36,met:.6}, ss:{c:'#D2D5D8',sp:.58}, cuv:{c:'#C87746',sp:.56}, cu3n:{c:'#5E5661',sp:.20,met:.7}, cu2o:{c:'#8A3F2E',sp:.18,met:.6}
};
const STEEL = { c:'#8E949B', sp:.30 };
const RM = matchMedia('(prefers-reduced-motion: reduce)');

function webgl(){ try{ const c=document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2')||c.getContext('webgl'))); }catch(e){ return false; } }
if (!webgl()) { /* оставляем CSS-болт */ } else { init(); }

/* геометрия болта: головка + стержень с резьбой, ось Y, головка сверху */
function boltGeometry(){
  const parts = [];
  // головка — шестигранник с фаской
  const hex = new THREE.Shape(); const R = 1.0;
  for (let i=0;i<6;i++){ const a = Math.PI/6 + i*Math.PI/3; const x=R*Math.cos(a), y=R*Math.sin(a); i?hex.lineTo(x,y):hex.moveTo(x,y); } hex.closePath();
  const head = new THREE.ExtrudeGeometry(hex, { depth:.62, bevelEnabled:true, bevelThickness:.07, bevelSize:.07, bevelSegments:3, curveSegments:1 });
  head.rotateX(Math.PI/2); head.translate(0, .62+.07, 0); // верх головки на y≈0.69, низ на y≈0
  parts.push(head);
  // стержень: профиль (r, y) → тело вращения; резьба — V-канавки кольцами
  const pts = []; const r=.5, ri=.40;
  pts.push(new THREE.Vector2(0, 0)); pts.push(new THREE.Vector2(r, 0)); pts.push(new THREE.Vector2(r, -.45));
  let y=-.45; const pitch=.075;
  while (y > -2.95) { pts.push(new THREE.Vector2(ri, y - pitch/2)); pts.push(new THREE.Vector2(r, y - pitch)); y -= pitch; }
  pts.push(new THREE.Vector2(r, -3.0)); pts.push(new THREE.Vector2(.33, -3.22)); pts.push(new THREE.Vector2(0, -3.24));
  const shank = new THREE.LatheGeometry(pts, 72);
  parts.push(shank);
  return parts;
}

function material(o, clip){
  const m = new THREE.MeshPhysicalMaterial({ color:new THREE.Color().setStyle(o.c), metalness:o.met??.96, roughness:Math.max(.12, .78 - o.sp*.9), envMapIntensity:2.1, clearcoat:0 });
  if (clip) m.clippingPlanes = [clip];
  return m;
}

function init(){
  document.querySelectorAll('.pl.bolt').forEach(setup);
}

function setup(pl){
  const isVac = pl.classList.contains('vac');
  const hang = pl.closest('.hang'), scene3 = pl.closest('.scene');
  pl.classList.add('b3d');
  const canvas = document.createElement('canvas'); canvas.className = 'b3d-canvas'; pl.appendChild(canvas);
  const rnd = new THREE.WebGLRenderer({ canvas, antialias:true, alpha:true, powerPreference:'low-power' });
  rnd.setPixelRatio(Math.min(devicePixelRatio, 2)); rnd.outputColorSpace = THREE.SRGBColorSpace;
  rnd.toneMapping = THREE.ACESFilmicToneMapping; rnd.toneMappingExposure = 1.45; rnd.localClippingEnabled = true;
  // студия: комната + большой софтбокс сверху-спереди, чтобы зеркальным покрытиям (хром) было что отражать
  const room = new RoomEnvironment();
  const soft = new THREE.Mesh(new THREE.PlaneGeometry(9, 5), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  soft.position.set(-2, 6.5, 6); soft.lookAt(0, 0, 0); room.add(soft);
  const soft2 = new THREE.Mesh(new THREE.PlaneGeometry(4, 8), new THREE.MeshBasicMaterial({ color: 0xdfe6ec }));
  soft2.position.set(7, 1, 2); soft2.lookAt(0, 0, 0); room.add(soft2);
  const pm = new THREE.PMREMGenerator(rnd); const envTex = pm.fromScene(room, .04).texture; pm.dispose();
  const scene = new THREE.Scene(); scene.environment = envTex;
  const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(-3, 6, 5); scene.add(key);
  const fill = new THREE.DirectionalLight(0xdfe8f0, .9); fill.position.set(4, 1, 3);
  const rim = new THREE.DirectionalLight(0xffffff, .8); rim.position.set(2, -3, -4); scene.add(rim); scene.add(fill);
  const cam = new THREE.PerspectiveCamera(24, 1, .1, 50); cam.position.set(0, -1.0, 10.2); cam.lookAt(0, -1.35, 0);

  const group = new THREE.Group(); scene.add(group);
  const geos = boltGeometry();
  const base = geos.map(g => new THREE.Mesh(g, material(STEEL)));
  base.forEach(m => group.add(m));
  // слой покрытия: тот же болт чуть больше, с плоскостью отсечения
  const plane = new THREE.Plane(new THREE.Vector3(0, isVac ? 1 : -1, 0), 0);
  const Y0 = -3.3, Y1 = .75;
  const coatCur = geos.map(g => new THREE.Mesh(g, material(STEEL)));   // текущее покрытие (целиком)
  const coatNext = geos.map(g => new THREE.Mesh(g, material(STEEL, plane))); // следующее (растёт)
  coatCur.concat(coatNext).forEach(m => { m.scale.setScalar(1.018); m.renderOrder = 2; group.add(m); });
  base.forEach(m => { m.material.polygonOffset = true; m.material.polygonOffsetFactor = 2; m.material.polygonOffsetUnits = 2; m.renderOrder = 1; });
  coatCur.forEach(m => m.visible = false); coatNext.forEach(m => m.visible = false);

  let rotT = { x:.10, y:-.35 }, rot = { x:.10, y:-.35 }, anim = null, needs = true;
  function setLevel(t){ // t: 0 → 1
    if (isVac) { const lvl = Y1 - (Y1 - Y0) * t; plane.constant = -lvl; }   // плёнка сверху вниз: видно y ≥ lvl
    else { const lvl = Y0 + (Y1 - Y0) * t; plane.constant = lvl; }         // уровень ванны снизу вверх: видно y ≤ lvl
  }
  function coat(code, instant){
    const o = M[code]; if (!o) return;
    if (anim) { finish(); }
    const mat = material(o, plane);
    base.forEach(m => m.visible = true);
    coatNext.forEach(m => { m.material.dispose(); m.material = mat; m.visible = true; });
    if (instant || RM.matches) { setLevel(1); finish(); needs = true; return; }
    anim = { t0: performance.now(), dur: 440, mat };
    needs = true; loop();
  }
  function finish(){
    const mat = coatNext[0].material;
    const full = mat.clone(); full.clippingPlanes = [];
    coatCur.forEach(m => { m.material.dispose(); m.material = full; m.visible = true; });
    coatNext.forEach(m => m.visible = false); base.forEach(m => m.visible = false); anim = null;
  }
  function size(){
    const r = pl.getBoundingClientRect(); const w = Math.max(1, Math.round(r.width * 1.5)), h = Math.max(1, Math.round(r.height * 1.18));
    rnd.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); needs = true;
  }
  new ResizeObserver(() => { size(); loop(); }).observe(pl); size();

  let raf = 0;
  function loop(){ if (raf) return; raf = requestAnimationFrame(frame); }
  function frame(now){
    raf = 0;
    // поворот к руке: читаем то, что what.js ставит на .hang
    const cs = getComputedStyle(hang);
    const ry = parseFloat(cs.getPropertyValue('--ry')) || 0, rx = parseFloat(cs.getPropertyValue('--rx')) || 0;
    rotT.y = -.35 + ry * (Math.PI/180) * 3.2; rotT.x = .10 + rx * (Math.PI/180) * 2.2;
    const k = RM.matches ? 1 : .14;
    rot.x += (rotT.x - rot.x) * k; rot.y += (rotT.y - rot.y) * k;
    group.rotation.set(rot.x, rot.y, .02);
    if (anim) { const t = Math.min(1, (now - anim.t0) / anim.dur); setLevel(1 - Math.pow(1 - t, 3)); if (t >= 1) finish(); }
    rnd.render(scene, cam);
    needs = false;
    if (anim || Math.abs(rotT.x - rot.x) > 1e-3 || Math.abs(rotT.y - rot.y) > 1e-3) loop();
  }
  // следим за what.js: он меняет data-c у слоёв .cl и класс up
  const z1 = pl.querySelector('.cl.z1'), z2 = pl.querySelector('.cl.z2');
  let last = z1.dataset.c || '';
  new MutationObserver(() => {
    const code = (z2.classList.contains('up') ? z2.dataset.c : z1.dataset.c) || z1.dataset.c;
    if (code && code !== last) { last = code; coat(code, false); }
  }).observe(pl, { attributes: true, subtree: true, attributeFilter: ['class', 'data-c', 'style'] });
  if (last) coat(last, true);
  // рука над стендом → перерисовка
  const bench = pl.closest('.bench'); if (bench) { bench.addEventListener('pointermove', loop, { passive:true }); bench.addEventListener('pointerleave', () => { setTimeout(loop, 0); setTimeout(loop, 450); }); }
  loop();
}
