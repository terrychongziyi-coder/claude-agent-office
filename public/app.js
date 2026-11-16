import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const TOKEN = new URLSearchParams(location.search).get('token') ?? '';
const USER_NAME = 'Terry';
const USER_ID = '__user';

// ── Scene palette and layout ────────────────────────────────────────────────
const P = {
  floor: '#D8BC97', floorAlt: '#D2B48D', wall: '#F1E6D3', wallTrim: '#E4D3BA', wood: '#C9A27A', woodDark: '#A9825E',
  cream: '#F7F0E3', beige: '#E7D8C0', sage: '#9DB08A', sageDark: '#7E9470', terracotta: '#C98B6B', peach: '#E8B79A',
  teal: '#6E9E9B', tealDeep: '#5E8F8C', ochre: '#D4A64A', ink: '#3E3631', metal: '#8C8379',
};
const SKINS = ['#EBC3A0', '#D9A57E', '#B98463', '#F2D2B6'];
const HAIR_COLORS = ['#5B4636', '#8A5A3C', '#3F3A3A', '#C99A62', '#9C5B4A'];
const SLOTS = [[-3.4, -2.4], [0, -3], [3.4, -2.4], [-4.6, 1.1], [4.6, 1.1], [-5.6, -3.6], [5.7, -3.4], [-4.9, 4]];
const FACE_TARGET = new THREE.Vector3(0, 0, 1.9);
const SCREEN = { idle: ['#E9E2D6', .15], working: ['#BFDDD3', .5], waiting: ['#F0CC94', .5], error: ['#E9B2A3', .45], done: ['#C6DDB6', .5] };

const matCache = new Map();
const mat = (color, extra) => {
  if (extra) return new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0, flatShading: true, ...extra });
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0, flatShading: true }));
  return matCache.get(color);
};
const geoCache = new Map();
const geo = (key, make) => { if (!geoCache.has(key)) geoCache.set(key, make()); return geoCache.get(key); };
const mesh = (g, m, cast = true) => { const n = new THREE.Mesh(g, m); n.castShadow = cast; n.receiveShadow = true; return n; };
const box = (w, h, d, c) => mesh(geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)), typeof c === 'string' ? mat(c) : c);
const cyl = (rt, rb, h, seg, c) => mesh(geo(`c${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)), typeof c === 'string' ? mat(c) : c);
const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };
const glowDisc = (r, color, opacity) => {
  const n = new THREE.Mesh(new THREE.CircleGeometry(r, 16), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
  n.rotation.x = -Math.PI / 2;
  return n;
};

function desk(w = 1.5, d = .75) {
  const g = new THREE.Group();
  g.add(at(box(w, .07, d, P.wood), 0, .76, 0));
  for (const s of [-1, 1]) g.add(at(box(.07, .72, d - .08, P.woodDark), s * (w / 2 - .08), .38, 0));
  g.add(at(box(w - .2, .32, .04, P.woodDark), 0, .55, -d / 2 + .06));
  return g;
}

function chair(color) {
  const g = new THREE.Group();
  g.add(at(box(.56, .1, .52, color), 0, .48, 0));
  const back = at(box(.54, .62, .09, color), 0, .84, -.25);
  back.rotation.x = -.08;
  g.add(back);
  g.add(at(cyl(.04, .04, .36, 6, P.metal), 0, .27, 0));
  g.add(at(cyl(.3, .3, .05, 5, P.metal), 0, .06, 0));
  return g;
}

function monitor(w = .62) {
  const g = new THREE.Group();
  g.add(at(box(w, .4, .05, P.beige), 0, 1.17, 0));
  const screen = new THREE.MeshStandardMaterial({ color: '#E9E2D6', emissive: '#E9E2D6', emissiveIntensity: .15, roughness: 1 });
  const s = new THREE.Mesh(new THREE.PlaneGeometry(w - .07, .33), screen);
  s.position.set(0, 1.17, -.028);
  s.rotation.y = Math.PI;
  g.add(s);
  const glow = glowDisc(.5, '#BFDDD3', .35);
  glow.position.set(0, .801, -.3);
  g.add(glow);
  g.add(at(box(.06, .2, .05, P.beige), 0, .9, .02));
  g.add(at(box(.26, .03, .18, P.beige), 0, .81, .02));
  g.userData = { screen, glow };
  return g;
}

function keyboard() {
  const g = new THREE.Group();
  g.add(at(box(.46, .03, .15, P.cream), 0, .81, 0));
  g.add(at(box(.09, .03, .12, P.cream), .34, .81, 0));
  return g;
}

function mug(color) {
  const g = new THREE.Group();
  g.add(at(cyl(.05, .045, .11, 7, color), 0, .855, 0));
  return g;
}

function deskLamp() {
  const g = new THREE.Group();
  g.add(at(cyl(.09, .1, .03, 7, P.beige), 0, .81, 0));
  const arm = at(cyl(.018, .018, .42, 5, P.beige), 0, 1.02, 0);
  arm.rotation.z = .25;
  g.add(arm);
  const shadeMat = mat(P.cream, { emissive: '#E39A86', emissiveIntensity: 0 });
  g.add(at(mesh(new THREE.CylinderGeometry(.05, .13, .14, 7), shadeMat), -.07, 1.22, 0));
  const glow = glowDisc(.45, '#E39A86', .32);
  glow.position.set(-.1, .802, .05);
  g.add(glow);
  g.userData = { shadeMat, glow };
  return g;
}

function plant(scale = 1, color = P.sage) {
  const g = new THREE.Group();
  g.add(at(cyl(.22, .17, .36, 7, P.terracotta), 0, .18, 0));
  g.add(at(cyl(.2, .2, .03, 7, '#8B6A4E'), 0, .35, 0));
  for (const [x, y, z, r] of [[0, .72, 0, .34], [.16, .95, .05, .24], [-.14, .9, -.06, .26], [.02, 1.15, -.02, .2]]) {
    const leaf = mesh(geo(`i${r}`, () => new THREE.IcosahedronGeometry(r, 0)), mat(color));
    leaf.position.set(x, y, z);
    leaf.rotation.set(x * 3, y * 2, z * 5);
    g.add(leaf);
  }
  g.scale.setScalar(scale);
  return g;
}

function floorLamp() {
  const g = new THREE.Group();
  g.add(at(cyl(.22, .24, .05, 8, P.woodDark), 0, .03, 0));
  g.add(at(cyl(.025, .025, 1.6, 5, P.woodDark), 0, .83, 0));
  g.add(at(mesh(new THREE.CylinderGeometry(.2, .32, .36, 8), mat('#F6E3C4', { emissive: '#F6D7A8', emissiveIntensity: .55 })), 0, 1.72, 0));
  return g;
}

function bookshelf() {
  const g = new THREE.Group(), W = 1.6, H = 1.8, D = .38;
  for (const s of [-1, 1]) g.add(at(box(.06, H, D, P.wood), s * (W / 2), H / 2, 0));
  for (const y of [.04, .62, 1.2, 1.77]) g.add(at(box(W, .05, D, P.wood), 0, y, 0));
  const cols = [P.terracotta, P.sage, P.teal, P.peach, P.cream, P.ochre, '#B9A58C'];
  let r = 0;
  for (const y of [.065, .645]) {
    let x = -W / 2 + .12;
    while (x < W / 2 - .25) {
      const w = .07 + r * 37 % 5 * .012, h = .34 + r * 13 % 4 * .04;
      g.add(at(box(w, h, .26, cols[r % cols.length]), x + w / 2, y + h / 2, 0));
      x += w + .012;
      r++;
      if (r % 6 === 5) x += .18;
    }
  }
  const p = plant(.45);
  p.position.set(.45, 1.225, 0);
  g.add(p);
  g.add(at(box(.3, .22, .22, P.beige), -.4, 1.33, 0));
  return g;
}

function windowPane(w = 2.4, h = 1.6) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ color: '#FBE7C6', emissive: '#FBE1B6', emissiveIntensity: .85, roughness: 1 })));
  const c = P.cream;
  g.add(at(box(w + .16, .1, .12, c), 0, h / 2, .02));
  g.add(at(box(w + .26, .1, .22, c), 0, -h / 2, .06));
  g.add(at(box(.1, h, .12, c), -w / 2, 0, .02));
  g.add(at(box(.1, h, .12, c), w / 2, 0, .02));
  g.add(at(box(.06, h, .08, c), 0, 0, .02));
  g.add(at(box(w, .06, .08, c), 0, .1, .02));
  return g;
}

function character(o) {
  const root = new THREE.Group(), hip = .56, pants = o.user ? '#5E6A72' : '#7A6E66';
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(s * .13, hip, 0);
    leg.add(at(box(.17, .16, .44, pants), 0, 0, .2));
    leg.add(at(box(.16, .5, .16, pants), 0, -.25, .42));
    leg.add(at(box(.18, .08, .26, P.ink), 0, -.52, .48));
    root.add(leg);
  }
  const upper = new THREE.Group();
  upper.position.y = hip;
  root.add(upper);
  const add = (m, x, y, z) => { m.position.set(x, y - hip, z); upper.add(m); return m; };

  add(cyl(.25, .32, .62, 7, o.shirt), 0, hip + .31, 0);
  if (o.user) {
    add(cyl(.17, .2, .08, 7, '#F1E6D3'), 0, hip + .62, 0);
    const badge = add(box(.12, .15, .02, P.cream), .09, hip + .36, .3);
    badge.rotation.x = -.18;
    add(box(.08, .03, .025, P.tealDeep), .09, hip + .4, .31);
  }
  const hy = hip + .92;
  add(mesh(geo('head', () => new THREE.IcosahedronGeometry(.3, 1)), mat(o.skin)), 0, hy, 0);
  for (const s of [-1, 1]) {
    add(mesh(geo('eye', () => new THREE.SphereGeometry(.035, 6, 4)), mat(P.ink), false), s * .11, hy + .02, .27);
    const cheek = add(mesh(geo('cheek', () => new THREE.SphereGeometry(.045, 6, 4)), mat('#E9A68C'), false), s * .17, hy - .07, .23);
    cheek.scale.z = .4;
  }
  const hair = add(mesh(geo('hair', () => new THREE.SphereGeometry(.315, 8, 5, 0, Math.PI * 2, 0, Math.PI * .5)), mat(o.hairColor)), 0, hy + .02, 0);
  hair.rotation.x = -.25;
  if (o.hair === 'Ponytail') {
    const p = add(mesh(geo('pony', () => new THREE.ConeGeometry(.11, .38, 6)), mat(o.hairColor)), 0, hy - .05, -.32);
    p.rotation.x = -2.6;
  }
  if (o.hair === 'Bun') add(mesh(geo('bun', () => new THREE.IcosahedronGeometry(.13, 0)), mat(o.hairColor)), 0, hy + .33, -.06);
  if (o.hair === 'Bob') {
    const b = add(mesh(geo('bob', () => new THREE.CylinderGeometry(.33, .34, .3, 8, 1, true)), mat(o.hairColor, { side: THREE.DoubleSide })), 0, hy - .03, -.04);
    b.scale.z = .9;
  }
  if (o.acc === 'Headphones') {
    add(mesh(geo('hp', () => new THREE.TorusGeometry(.33, .03, 4, 12, Math.PI)), mat(P.cream)), 0, hy + .02, 0);
    for (const s of [-1, 1]) {
      const cup = add(cyl(.09, .09, .07, 8, P.tealDeep), s * .32, hy, 0);
      cup.rotation.z = Math.PI / 2;
    }
  }
  if (o.acc === 'Glasses') {
    for (const s of [-1, 1]) add(mesh(geo('gl', () => new THREE.TorusGeometry(.075, .014, 4, 10)), mat(P.ink), false), s * .11, hy + .02, .29);
    add(box(.07, .015, .015, P.ink), 0, hy + .03, .3);
  }
  if (o.acc === 'Cap') {
    add(mesh(geo('cap', () => new THREE.SphereGeometry(.325, 8, 4, 0, Math.PI * 2, 0, Math.PI * .42)), mat(P.tealDeep)), 0, hy + .03, 0);
    const brim = add(box(.36, .03, .24, P.tealDeep), 0, hy + .13, .3);
    brim.rotation.x = .12;
  }
  if (o.acc === 'Beanie') {
    add(mesh(geo('bn', () => new THREE.SphereGeometry(.33, 8, 4, 0, Math.PI * 2, 0, Math.PI * .45)), mat(P.cream)), 0, hy + .04, 0);
    add(cyl(.335, .335, .08, 8, P.beige), 0, hy + .1, 0);
    add(mesh(geo('pom', () => new THREE.IcosahedronGeometry(.07, 0)), mat(P.terracotta)), 0, hy + .37, 0);
  }
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(s * .33, .56, 0);
    const sleeve = mesh(geo('arm', () => new THREE.CapsuleGeometry(.075, .3, 2, 6)), mat(o.shirt));
    sleeve.position.y = -.2;
    arm.add(sleeve);
    const hand = mesh(geo('hand', () => new THREE.IcosahedronGeometry(.07, 0)), mat(o.skin));
    hand.position.y = -.42;
    arm.add(hand);
    upper.add(arm);
    arms.push(arm);
  }
  root.scale.setScalar(o.user ? 1.08 : 1);
  return { group: root, upper, L: arms[0], R: arms[1], headTop: hy + .45 };
}

function pose(rig, status, t, ph) {
  const { upper, L, R } = rig;
  upper.rotation.set(0, 0, 0);
  upper.position.y = .56;
  L.rotation.set(0, 0, -.08);
  R.rotation.set(0, 0, .08);
  switch (status) {
    case 'idle':
      upper.position.y += Math.sin(t * 1.6 + ph) * .012;
      upper.rotation.x = -.05;
      L.rotation.z = .12;
      R.rotation.set(-.9, 0, .35);
      break;
    case 'working':
      upper.rotation.x = .04;
      L.rotation.set(-1.25 + Math.sin(t * 16 + ph) * .07, 0, .12);
      R.rotation.set(-1.25 + Math.sin(t * 16 + ph + Math.PI) * .07, 0, -.12);
      break;
    case 'waiting':
      R.rotation.set(-.2, 0, 2.95 + Math.sin(t * 4 + ph) * .14);
      L.rotation.set(-1, 0, .1);
      break;
    case 'error':
      upper.rotation.set(.3, 0, .06);
      L.rotation.set(-.75, 0, -.25);
      R.rotation.set(-.75, 0, .25);
      break;
    case 'done': {
      const a = 2.45 + Math.sin(t * 1.4 + ph) * .08;
      L.rotation.set(-.15, 0, -a);
      R.rotation.set(-.15, 0, a);
      break;
    }
  }
}

class Office {
  constructor(el, h) {
    this.h = h;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(this.renderer.domElement);
    this.labels = new CSS2DRenderer();
    this.labels.domElement.className = 'labels';
    el.appendChild(this.labels.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#F3EBDD');
    this.camera = new THREE.PerspectiveCamera(30, 1, .5, 200);
    this.camera.position.set(11.2, 11.6, 14.2);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(.4, .3, -.4);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.minDistance = 10;
    this.controls.maxDistance = 30;
    this.controls.minPolarAngle = .35;
    this.controls.maxPolarAngle = 1.25;
    this.controls.update();
    this.lights();
    this.room();
    this.stations = new Map();
    this.ring = new THREE.Group();
    const torus = new THREE.Mesh(new THREE.TorusGeometry(1.25, .045, 4, 40), new THREE.MeshBasicMaterial({ color: P.tealDeep }));
    torus.rotation.x = -Math.PI / 2;
    torus.position.y = .04;
    this.ring.add(torus);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.25, 40), new THREE.MeshBasicMaterial({ color: P.teal, transparent: true, opacity: .22, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = .035;
    this.ring.add(disc);
    this.ring.visible = false;
    this.scene.add(this.ring);
    this.ray = new THREE.Raycaster();
    this.ptr = new THREE.Vector2();
    this.bindPointer();
    this.clock = new THREE.Clock();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.renderer.setAnimationLoop(() => this.tick());
  }

  lights() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight('#FFF6E8', '#E2C4A0', 2));
    s.add(new THREE.AmbientLight('#FFEBD6', .55));
    const key = new THREE.DirectionalLight('#FFD6A6', 2.3);
    key.position.set(-11, 8, -3);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 40 });
    key.shadow.radius = 4;
    key.shadow.bias = -6e-4;
    key.shadow.normalBias = .02;
    s.add(key);
    const fill = new THREE.DirectionalLight('#E9EEF0', .35);
    fill.position.set(8, 6, 10);
    s.add(fill);
  }

  room() {
    const s = this.scene, W = 14, D = 10;
    for (let i = 0; i < 12; i++) {
      const plank = mesh(new THREE.BoxGeometry(W / 12 - .015, .12, D), mat(i % 3 === 1 ? P.floorAlt : i % 3 === 2 ? '#DCC29F' : P.floor), false);
      plank.position.set(-W / 2 + W / 24 + i * W / 12, -.06, 0);
      s.add(plank);
    }
    s.add(at(mesh(new THREE.BoxGeometry(W + .3, .5, D + .3), mat('#CDB08A'), false), 0, -.37, 0));
    s.add(at(box(W + .3, 3.3, .22, P.wall), 0, 1.65, -D / 2 - .11));
    s.add(at(box(.22, 3.3, D + .3, P.wall), -W / 2 - .11, 1.65, 0));
    s.add(at(box(W + .3, .14, .06, P.wallTrim), 0, .07, -D / 2 + .02));
    s.add(at(box(.06, .14, D + .3, P.wallTrim), -W / 2 + .02, .07, 0));
    for (const z of [-2.3, 2]) {
      const w = windowPane();
      w.position.set(-W / 2 + .01, 1.75, z);
      w.rotation.y = Math.PI / 2;
      s.add(w);
    }
    for (const [x, y, w, h, c] of [[-5.2, 2.1, .9, .65, P.sage], [-4.1, 2.25, .55, .8, P.peach], [5, 2, 1.1, .7, P.teal]]) {
      s.add(at(box(w + .08, h + .08, .04, P.cream), x, y, -D / 2 + .02));
      s.add(at(box(w, h, .05, c), x, y, -D / 2 + .03));
    }
    for (const x of [-1.9, 1.9]) {
      const b = bookshelf();
      b.position.set(x, 0, -D / 2 + .25);
      s.add(b);
    }
    for (const [x, z] of [[-6.4, -1.5], [6.5, -1]]) {
      const l = floorLamp();
      l.position.set(x, 0, z);
      s.add(l);
    }
    for (const [x, z, sc, c] of [[-6.4, 2.6, 1, P.sageDark], [3.9, -4.4, .9, P.sageDark], [-3.9, -4.4, .85, P.sage], [6.4, 1.6, 1, P.sage]]) {
      const p = plant(sc, c);
      p.position.set(x, 0, z);
      s.add(p);
    }
    const rug = (r, c, x, y, z, sz) => {
      const m = mesh(new THREE.CylinderGeometry(r, r, .02, 12), mat(c), false);
      m.position.set(x, y, z);
      m.scale.z = sz;
      s.add(m);
    };
    rug(3.1, '#B9C4A6', 0, .011, 1.7, .75);
    rug(1.6, '#E6C9A3', 0, .025, 1.9, .8);
    s.add(at(mesh(new THREE.BoxGeometry(9.6, .02, 2.2), mat('#E9C9AE'), false), 0, .011, -2.6));
    const me = this.buildStation({ id: USER_ID, user: true, shirt: P.ochre, skin: SKINS[1], hairColor: HAIR_COLORS[2], hair: 'Short', acc: 'None' }, 'working');
    me.group.position.set(0, 0, 2);
    me.group.rotation.y = Math.PI;
    s.add(me.group);
    this.userStation = me;
  }

  buildStation(o, status) {
    const g = new THREE.Group(), user = !!o.user;
    const d = desk(user ? 2.1 : 1.5, user ? .85 : .75);
    d.position.z = .62;
    g.add(d);
    const c = chair(user ? P.ochre : '#CDBBA0');
    c.position.z = -.08;
    g.add(c);
    const rig = character(o);
    g.add(rig.group);
    const mon = monitor();
    mon.position.z = .84;
    g.add(mon);
    if (user) {
      const m2 = monitor(.5);
      m2.position.set(.62, 0, .8);
      m2.rotation.y = -.35;
      g.add(m2);
      m2.userData.glow.visible = false;
    }
    const kb = keyboard();
    kb.position.set(-.04, 0, .47);
    g.add(kb);
    const cup = mug(user ? P.tealDeep : P.terracotta);
    cup.position.set(user ? -.75 : -.55, 0, .55);
    g.add(cup);
    const lamp = deskLamp();
    lamp.position.set(user ? .9 : .58, 0, .8);
    g.add(lamp);
    const pennant = new THREE.Group();
    pennant.add(at(cyl(.012, .012, .36, 4, P.woodDark), -.42, .98, .85));
    const flag = mesh(new THREE.ConeGeometry(.08, .2, 3), mat('#A9C49A'));
    flag.position.set(-.33, 1.1, .85);
    flag.rotation.z = -Math.PI / 2;
    pennant.add(flag);
    g.add(pennant);
    const st = { group: g, rig, mon, lamp, pennant, ph: Math.random() * 6, status: null };
    g.traverse(n => { n.userData.stationId = o.id; });
    this.setVisual(st, status);
    const el = document.createElement('div');
    el.className = 'tag-anchor';
    const label = new CSS2DObject(el);
    label.center.set(.5, 1);
    label.position.set(0, rig.headTop + .05, 0);
    rig.group.add(label);
    if (user) {
      el.innerHTML = `<div class="tag user"><span class="ic user-ic">${this.h.icon('person', 16)}</span><span class="nm">${esc(USER_NAME)}</span><span class="you">You</span></div><span class="stem"></span>`;
    } else {
      st.label = label;
      st.el = el;
      el.addEventListener('click', e => { e.stopPropagation(); this.h.onSelect(o.id); });
    }
    return st;
  }

  setVisual(st, status) {
    st.status = status;
    const [color, intensity] = SCREEN[status];
    const scr = st.mon.userData.screen;
    scr.color.set(color);
    scr.emissive.set(color);
    scr.emissiveIntensity = intensity;
    const glow = st.mon.userData.glow;
    glow.visible = status !== 'idle';
    glow.material.color.set(color);
    st.lamp.userData.shadeMat.emissiveIntensity = status === 'error' ? .9 : 0;
    st.lamp.userData.shadeMat.color.set(status === 'error' ? '#E39A86' : P.cream);
    st.lamp.userData.glow.visible = status === 'error';
    st.pennant.visible = status === 'done';
  }

  upsert(w) {
    let st = this.stations.get(w.id);
    const key = JSON.stringify([w.shirt, w.hair, w.acc, w.skin, w.hairColor]);
    if (st && st.key === key) { this.place(st, w.slot); return st; }
    if (st) this.remove(w.id);
    st = this.buildStation(w, w.status);
    st.key = key;
    this.place(st, w.slot);
    this.scene.add(st.group);
    this.stations.set(w.id, st);
    return st;
  }

  place(st, slot) {
    const [x, z] = SLOTS[slot];
    st.group.position.set(x, 0, z);
    const dir = FACE_TARGET.clone().sub(st.group.position);
    st.group.rotation.y = Math.atan2(dir.x, dir.z);
    if (this.selected && this.stations.get(this.selected) === st) this.ring.position.set(x, 0, z);
  }

  remove(id) {
    const st = this.stations.get(id);
    if (!st) return;
    if (st.label) { st.label.element.remove(); st.label.removeFromParent(); }
    this.scene.remove(st.group);
    this.stations.delete(id);
  }

  select(id) {
    this.selected = id;
    const st = id && this.stations.get(id);
    this.ring.visible = !!st;
    if (st) this.ring.position.set(st.group.position.x, 0, st.group.position.z);
  }

  bindPointer() {
    const c = this.renderer.domElement;
    let down = null;
    c.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
    c.addEventListener('pointerup', e => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
      const id = this.pick(e);
      this.h.onSelect(id && id !== USER_ID ? id : null);
    });
    c.addEventListener('pointermove', e => {
      if (e.buttons) return;
      const id = this.pick(e);
      c.style.cursor = id && id !== USER_ID ? 'pointer' : 'grab';
    });
  }

  pick(e) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ptr.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ptr, this.camera);
    const hit = this.ray.intersectObjects([...this.stations.values()].map(s => s.group), true)[0];
    return hit ? hit.object.userData.stationId : null;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    this.applyOffset();
  }

  applyOffset() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.setViewOffset(w, h, Math.round(this.offX || 0), 0, w, h);
    this.camera.updateProjectionMatrix();
  }

  tick() {
    const t = this.clock.getElapsedTime(), target = this.targetOffX ?? 0;
    if (Math.abs((this.offX || 0) - target) > .5) {
      this.offX = (this.offX || 0) + (target - (this.offX || 0)) * .12;
      this.applyOffset();
    }
    for (const st of this.stations.values()) pose(st.rig, st.status, t, st.ph);
    pose(this.userStation.rig, 'working', t * .6, 0);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }
}

// ── UI helpers ──────────────────────────────────────────────────────────────
const ICONS = {
  idle: '<path d="M5 9h11v4.5A4.5 4.5 0 0 1 11.5 18h-2A4.5 4.5 0 0 1 5 13.5z"/><path d="M16 10.5h1.5a2.25 2.25 0 0 1 0 4.5H16"/><path d="M8.5 4.5v2"/><path d="M12 4.5v2"/>',
  working: '<path d="M9 7l-5 5 5 5"/><path d="M15 7l5 5-5 5"/>',
  waiting: '<path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12"/><path d="M11 11V5a1.5 1.5 0 0 1 3 0v6"/><path d="M14 11V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-.5a5.5 5.5 0 0 1-4.6-2.5L4.5 15a1.5 1.5 0 0 1 2.4-1.8L8 14.5"/>',
  error: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v4.5"/><path d="M12 16h.01"/>',
  done: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  close: '<path d="M6 6l12 12"/><path d="M18 6L6 18"/>',
  send: '<path d="M5 12h13"/><path d="M13 6l6 6-6 6"/>',
  person: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  manage: '<circle cx="9" cy="8" r="3"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M16 11h5"/><path d="M18.5 8.5v5"/>',
  terminal: '<path d="M5 7l4 5-4 5"/><path d="M12 17h7"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4.5h6V7"/><path d="M6.5 7l1 12.5h9l1-12.5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>',
  orbit: '<circle cx="12" cy="12" r="3"/><path d="M3 12c0-2.5 4-4.5 9-4.5s9 2 9 4.5-4 4.5-9 4.5c-2 0-3.8-.3-5.3-.9"/><path d="M7.5 18.5L6 16.5l2.4-.6"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  folder: '<path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  sparkle: '<path d="M12 3v4"/><path d="M12 17v4"/><path d="M3 12h4"/><path d="M17 12h4"/>',
};
const icon = (n, s = 16, w = 2) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); }
const $ = s => document.querySelector(s);
// Skips identical re-renders so entry animations don't replay on every backend event.
const setHTML = (el, html, key = html) => { if (el._key !== key) { el._key = key; el.innerHTML = html; } };
const STATUS = { idle: { label: 'Idle' }, working: { label: 'Working' }, waiting: { label: 'Waiting for permission', short: 'Waiting' }, error: { label: 'Error' }, done: { label: 'Done' } };
const badge = (s, text) => `<span class="badge s-${s}">${icon(s, 14, 2.2)}${esc(text || STATUS[s].short || STATUS[s].label)}</span>`;
const SHIRTS = [['Muted teal', '#6E9E9B'], ['Dusty terracotta', '#C98B6B'], ['Sage', '#9DB08A'], ['Dusty plum', '#A88A9A'], ['Dusty blue', '#8E9BB5'], ['Soft peach', '#E8B79A']];
const HAIR_STYLES = ['Short', 'Bun', 'Bob', 'Ponytail'];
const ACCESSORIES = ['None', 'Headphones', 'Glasses', 'Cap', 'Beanie'];
const LOG_CLASS = { Read: 'c-read', Grep: 'c-read', Glob: 'c-read', Edit: 'c-edit', Write: 'c-edit', MultiEdit: 'c-edit', NotebookEdit: 'c-edit', Bash: 'c-bash', Result: 'c-ok', Summary: 'c-sum', Fail: 'c-err', Waiting: 'c-bash', You: 'c-you', Approve: 'c-ok', Deny: 'c-err', Info: 'c-read' };
const clock = at => new Date(at).toTimeString().slice(0, 8);
const shortId = id => String(id ?? '').slice(0, 8);
const ago = ms => {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1e3));
  return s < 60 ? `${s} s ago` : s < 3600 ? `${Math.floor(s / 60)} min ago` : `${Math.floor(s / 3600)} h ago`;
};
const hash = s => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const newId = () => crypto.randomUUID?.() ?? (Date.now().toString(36) + Math.random().toString(36).slice(2));

// ── State (from the backend) ────────────────────────────────────────────────
let workers = [];          // normalised config workers
let sessions = {};         // session_id -> snapshot from backend
const localLog = {};       // session_id -> UI-only entries (instructions sent, decisions)
let selectedId = null;
let connected = false;

function setWorkers(list) {
  const used = new Set();
  workers = (list ?? []).map(w => {
    const h = hash(w.id);
    return {
      role: '', hair: HAIR_STYLES[h % 4], acc: 'None', skin: SKINS[h % 4], hairColor: HAIR_COLORS[h % 5],
      ...w,
      shirt: w.shirt || w.color || SHIRTS[h % 6][1],
    };
  });
  for (const w of workers) {
    if (Number.isInteger(w.slot) && w.slot >= 0 && w.slot < SLOTS.length && !used.has(w.slot)) used.add(w.slot);
    else w.slot = null;
  }
  // ponytail: legacy workers without a slot get the first free desk client-side; persisted on next save
  for (const w of workers) {
    if (w.slot !== null) continue;
    const free = SLOTS.findIndex((_, i) => !used.has(i));
    if (free >= 0) { w.slot = free; used.add(free); }
  }
}

const sess = id => (id ? sessions[id] : null);
const ensureSession = id => (sessions[id] ??= { session_id: id, status: 'idle', output: [], pending_permission: null, first_seen: new Date().toISOString() });
const getWorker = id => workers.find(w => w.id === id);
const statusOf = w => sess(w.session_id)?.status ?? 'idle';
const dirOf = w => sess(w.session_id)?.cwd || '';
const roleOf = w => w.role || 'Claude Code session';
const view = w => ({ ...w, status: statusOf(w) });

function pendingOf(w) {
  const p = sess(w.session_id)?.pending_permission;
  if (!p) return null;
  const input = p.tool_input ?? {};
  const bash = p.tool_name === 'Bash';
  const body = bash ? (input.command ?? '') : (input.file_path ?? input.path ?? input.url ?? input.pattern ?? JSON.stringify(input, null, 2));
  return { ...p, bash, body: String(body), at: Date.parse(p.requested_at) || Date.now(), dir: p.cwd || dirOf(w) };
}

function detected() {
  const bound = new Set(workers.map(w => w.session_id).filter(Boolean));
  return Object.values(sessions)
    .filter(s => !bound.has(s.session_id))
    .map(s => ({ session: s.session_id, dir: s.cwd || 'unknown directory', started: Date.parse(s.first_seen) || Date.now() }));
}

function inputSummary(tool, raw) {
  if (raw == null) return '';
  let o = null;
  try { o = JSON.parse(raw); } catch { /* summarised input may be truncated JSON */ }
  const keys = ['command', 'file_path', 'notebook_path', 'path', 'pattern', 'url', 'query', 'description', 'prompt'];
  if (o && typeof o === 'object') {
    for (const k of keys) if (o[k]) return String(o[k]);
    return raw;
  }
  for (const k of keys) {
    const m = String(raw).match(new RegExp(`"${k}":"((?:[^"\\\\]|\\\\.)*)`));
    if (m) return m[1].replace(/\\n/g, ' ').replace(/\\"/g, '"');
  }
  return String(raw);
}

const firstLine = (s, n = 160) => { const l = String(s ?? '').split('\n')[0]; return l.length > n ? l.slice(0, n) + '…' : l; };

function logRows(w) {
  const s = sess(w.session_id);
  const rows = (s?.output ?? []).map(e => {
    switch (e.kind) {
      case 'tool_start': return { at: e.t, tool: e.tool_name || 'Tool', msg: inputSummary(e.tool_name, e.input) };
      case 'tool_done': return { at: e.t, tool: 'Result', msg: firstLine(e.output) || `${e.tool_name} finished` };
      case 'tool_fail': return { at: e.t, tool: 'Fail', msg: firstLine(e.output) || `${e.tool_name} failed` };
      case 'summary': return { at: e.t, tool: 'Summary', msg: e.message };
      case 'notification': return { at: e.t, tool: 'Info', msg: e.message };
      default: return { at: e.t, tool: 'Info', msg: e.kind };
    }
  });
  return rows.concat(localLog[w.session_id] ?? []).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

function pushLocal(sessionId, tool, msg, sub) {
  const list = (localLog[sessionId] ??= []);
  list.push({ at: new Date().toISOString(), tool, msg, sub });
  if (list.length > 200) list.shift();
}

async function api(path, body) {
  try {
    const r = await fetch(`${path}?token=${encodeURIComponent(TOKEN)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    return r.ok ? { ok: true, ...j } : { ok: false, error: j.error || `HTTP ${r.status}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── Rendering ───────────────────────────────────────────────────────────────
const office = new Office($('#stage'), { onSelect: id => select(id), icon });

function syncStations() {
  const ids = new Set();
  for (const w of workers) {
    if (w.slot === null) continue;
    ids.add(w.id);
    const v = view(w);
    const st = office.upsert(v);
    if (st.status !== v.status) office.setVisual(st, v.status);
  }
  for (const id of [...office.stations.keys()]) if (!ids.has(id)) office.remove(id);
  office.select(selectedId);
}

function renderTags() {
  for (const w of workers) {
    const st = office.stations.get(w.id);
    if (!st) continue;
    const s = statusOf(w);
    const chip = s === 'waiting' ? '<div class="chip s-waiting">Needs your permission</div>' : s === 'error' ? '<div class="chip s-error">Stopped on an error</div>' : '';
    const fx = s === 'waiting' ? '<span class="pulse"></span><span class="pulse p2"></span>' : s === 'done' ? `<span class="spark">${icon('sparkle', 14, 2.2)}</span>` : '';
    setHTML(st.el, `${chip}<button type="button" class="tag ${w.id === selectedId ? 'sel' : ''}" aria-label="Select ${esc(w.name)}, ${esc(STATUS[s].label)}">
      <span class="ic s-${s}">${fx}${icon(s, 16, 2.2)}</span><span class="tx"><span class="nm">${esc(w.name)}</span><span class="rl">${esc(roleOf(w))}</span></span></button><span class="stem"></span>`);
  }
}

const avatar = (w, size = 36) => `<span class="av" style="width:${size}px;height:${size}px;background:${esc(w.shirt)};font-size:${Math.round(size * .42)}px" aria-hidden="true">${esc((w.name || '?')[0])}</span>`;

function renderOverview() {
  const n = s => workers.filter(w => statusOf(w) === s).length;
  const sum = [['waiting', `${n('waiting')} need${n('waiting') === 1 ? 's' : ''} you`], ['error', `${n('error')} error`], ['working', `${n('working')} working`], ['done', `${n('done')} done`]]
    .filter(([s]) => n(s)).map(([s, t]) => `<span class="sum s-${s}">${t}</span>`).join('');
  const order = { waiting: 0, error: 1, done: 2, working: 3, idle: 4 };
  $('#ov-count').textContent = `${workers.length} worker${workers.length === 1 ? '' : 's'}`;
  $('#ov-sum').innerHTML = sum;
  $('#ov-list').innerHTML = [...workers].sort((a, b) => order[statusOf(a)] - order[statusOf(b)]).map(w => `
    <button type="button" class="row ${w.id === selectedId ? 'sel' : ''} ${statusOf(w) === 'waiting' ? 'wait' : ''}" data-id="${esc(w.id)}" aria-pressed="${w.id === selectedId}">
      ${avatar(w)}<span class="who"><span class="nm">${esc(w.name)}</span><span class="rl">${esc(roleOf(w))}</span></span>${badge(statusOf(w))}</button>`).join('')
    || '<p class="empty">No workers yet. Use Manage workers to add one.</p>';
}

function renderLog(keepScroll) {
  const w = getWorker(selectedId);
  if (!w) return;
  const el = $('#log');
  const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  setHTML(el, logRows(w).map(r => `<div class="ln"><span class="t">${clock(r.at)}</span><span class="tool ${LOG_CLASS[r.tool] || ''}">${esc(r.tool)}</span><span class="m${r.tool === 'Summary' || r.tool === 'You' ? ' full' : ''}">${esc(r.msg)}${r.sub ? `<span class="sub">${esc(r.sub)}</span>` : ''}</span></div>`).join('')
    + (statusOf(w) === 'working' ? '<div class="ln typing"><span class="t"></span><span class="tool c-read">…</span><span class="m dots"><i></i><i></i><i></i></span></div>' : ''));
  if (!keepScroll || atBottom) el.scrollTop = el.scrollHeight;
}

let hintOverride = null; // { text, err } after a send attempt; cleared on selection change

function renderPanel() {
  const w = getWorker(selectedId), panel = $('#panel');
  if (!w) {
    panel.hidden = true;
    document.body.classList.remove('panel-open');
    office.targetOffX = -190;
    return;
  }
  panel.hidden = false;
  document.body.classList.add('panel-open');
  office.targetOffX = 140;
  const s = statusOf(w), dir = dirOf(w);
  $('#p-av').innerHTML = avatar(w, 52);
  $('#p-name').textContent = w.name;
  $('#p-role').textContent = roleOf(w);
  $('#p-badge').innerHTML = badge(s, STATUS[s].label);
  $('#p-sess').innerHTML = w.session_id
    ? `<span title="${esc(w.session_id)}">${icon('link', 14)}session ${esc(shortId(w.session_id))}</span><span>${icon('folder', 14)}${esc(dir || 'unknown directory')}</span>`
    : `<span>${icon('link', 14)}no session bound</span>`;

  const p = pendingOf(w);
  setHTML($('#perm'), p ? `<div class="perm" role="region" aria-label="Pending permission">
      <div class="perm-h"><span class="ic s-waiting">${icon('waiting', 18, 2.2)}</span><div><div class="pt">${esc(w.name)} ${p.bash ? 'wants to run a shell command' : `wants to use ${esc(p.tool_name)}`}</div><div class="ps">Requested <span id="p-ago">${ago(p.at)}</span> · tool: ${esc(p.tool_name)}</div></div></div>
      <pre>${p.bash ? '<span class="pr">$ </span>' : ''}${esc(p.body)}</pre>
      <div class="pdir">${icon('folder', 14)}<span>${esc(p.dir)}</span></div>
      <div class="pact"><button type="button" class="btn sec" id="deny">Deny</button><button type="button" class="btn pri" id="approve">${icon('done', 18, 2.6)}Approve</button></div></div>`
    : `<div class="noperm">${icon('waiting', 18)}No pending permission requests</div>`, `${w.id}|${p?.request_id ?? ''}`);
  if (p) {
    $('#approve').onclick = () => decide(w, p, 'allow');
    $('#deny').onclick = () => decide(w, p, 'deny');
  }

  const ta = $('#instr'), blocked = !!p || !w.session_id;
  ta.disabled = blocked;
  $('#send').disabled = blocked;
  ta.placeholder = p ? 'Respond to the permission request first' : !w.session_id ? 'Bind a session in Manage workers first' : `Add an instruction for ${w.name}`;
  const hint = $('#hint');
  const noPane = w.session_id && !sess(w.session_id)?.pane;
  const h = p ? { text: 'Paused while waiting for you' }
    : hintOverride ?? (noPane ? { text: 'No tmux pane bound yet. Start Claude inside tmux.', err: true } : { text: 'Ctrl/Cmd + Enter to send' });
  hint.textContent = h.text;
  hint.classList.toggle('err', !!h.err);
  renderLog(true);
}

function renderAll() {
  syncStations();
  renderTags();
  renderOverview();
  renderPanel();
  renderHintChip();
  if (editor) renderEditor();
}

function renderHintChip() {
  $('#hintchip').innerHTML = icon('orbit', 18) + '<span>Drag to orbit</span><span aria-hidden="true">·</span><span>Scroll to zoom</span><span aria-hidden="true">·</span><span>Click a worker</span>'
    + (connected ? '' : '<span class="mock">Disconnected, reconnecting…</span>');
}

function select(id) {
  if (id && !getWorker(id)) id = null;
  if (id !== selectedId) { $('#instr').value = ''; hintOverride = null; histIdx = -1; }
  selectedId = id;
  office.select(id);
  renderTags();
  renderOverview();
  renderPanel();
  if (id) renderLog(false);
}

setInterval(() => {
  const el = $('#p-ago'), w = getWorker(selectedId), p = w && pendingOf(w);
  if (el && p) el.textContent = ago(p.at);
}, 1000);

// ── Actions ─────────────────────────────────────────────────────────────────
async function decide(w, p, behavior) {
  $('#approve').disabled = $('#deny').disabled = true;
  const r = await api('/api/decision', { request_id: p.request_id, behavior });
  if (!r.ok) {
    hintOverride = { text: `Decision failed: ${r.error}`, err: true };
    $('#approve').disabled = $('#deny').disabled = false;
    renderPanel();
    return;
  }
  if (behavior === 'allow') pushLocal(w.session_id, 'Approve', `Approved by ${USER_NAME}`, firstLine(p.body));
  else pushLocal(w.session_id, 'Deny', `Denied by ${USER_NAME}`);
  renderPanel();
}

const history = [];
let histIdx = -1, histDraft = '';

async function sendInstruction() {
  const w = getWorker(selectedId), ta = $('#instr'), text = ta.value.trim();
  if (!w || !text || !w.session_id || pendingOf(w)) return;
  if (history[history.length - 1] !== text) { history.push(text); if (history.length > 100) history.shift(); }
  histIdx = -1;
  ta.value = '';
  pushLocal(w.session_id, 'You', text);
  hintOverride = null;
  renderPanel();
  const r = await api('/api/send', { session_id: w.session_id, text });
  if (!r.ok) {
    const msg = r.error === 'pane_gone' ? 'The tmux pane is gone. Restart Claude in tmux.'
      : /no pane bound/.test(r.error) ? 'No tmux pane bound. Start Claude Code inside tmux.'
        : `Send failed: ${r.error}`;
    pushLocal(w.session_id, 'Fail', msg);
    hintOverride = { text: msg, err: true };
  }
  if (selectedId === w.id) renderPanel();
}

$('#ov-list').addEventListener('click', e => { const r = e.target.closest('.row'); if (r) select(r.dataset.id); });
$('#p-close').onclick = () => select(null);
$('#send').onclick = sendInstruction;
$('#instr').addEventListener('keydown', e => {
  const ta = e.target;
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendInstruction(); return; }
  if (ta.value.includes('\n')) return;
  if (e.key === 'ArrowUp' && history.length) {
    e.preventDefault();
    if (histIdx === -1) { histDraft = ta.value; histIdx = history.length - 1; } else if (histIdx > 0) histIdx--;
    ta.value = history[histIdx];
  } else if (e.key === 'ArrowDown' && histIdx !== -1) {
    e.preventDefault();
    if (histIdx < history.length - 1) ta.value = history[++histIdx];
    else { histIdx = -1; ta.value = histDraft; }
  }
});

// ── Worker editor ───────────────────────────────────────────────────────────
let editor = null; // { id, draft, confirmRemove, error }

const freeSlots = exceptId => {
  const taken = new Set(workers.filter(w => w.id !== exceptId).map(w => w.slot));
  return SLOTS.map((_, i) => i).filter(i => !taken.has(i));
};

function blankDraft(sessionId = '') {
  return { name: '', role: '', shirt: SHIRTS[workers.length % 6][1], hair: 'Short', acc: 'None', slot: freeSlots(null)[0], session_id: sessionId };
}

function openEditor(id) {
  const w = id ? getWorker(id) : null;
  editor = w
    ? { id, draft: { name: w.name, role: w.role, shirt: w.shirt, hair: w.hair, acc: w.acc, slot: w.slot, session_id: w.session_id || '' } }
    : { id: null, draft: blankDraft() };
  editor.confirmRemove = false;
  editor.error = '';
  $('#editor').hidden = false;
  renderEditor();
}

function newFromSession(sessionId) {
  if (!freeSlots(null).length) return;
  editor = { id: null, draft: blankDraft(sessionId), confirmRemove: false, error: '' };
  $('#editor').hidden = false;
  renderEditor();
  setTimeout(() => $('#f-name')?.focus(), 0);
}

function closeEditor() { $('#editor').hidden = true; editor = null; }

function sessionChoices() {
  const w = editor.id ? getWorker(editor.id) : null, list = [];
  if (w?.session_id) list.push({ session: w.session_id, dir: dirOf(w) || 'unknown directory' });
  return list.concat(detected());
}

function plan() {
  const px = ([x, z]) => [270 + x * 35, 112 + z * 21];
  let html = '<span class="win w1"></span><span class="win w2"></span><span class="prug"></span>';
  const [ux, uy] = px([0, 2]);
  html += `<span class="youslot" style="left:${ux - 30}px;top:${uy - 20}px">You</span>`;
  SLOTS.forEach((pos, i) => {
    const [x, y] = px(pos);
    const occ = workers.find(w => w.slot === i && w.id !== editor.id);
    if (occ) html += `<span class="slot occ" style="left:${x - 22}px;top:${y - 22}px;background:${esc(occ.shirt)}" title="${esc(occ.name)}">${esc(occ.name[0])}</span>`;
    else if (editor.draft.slot === i) html += `<button type="button" class="slot mine" data-slot="${i}" style="left:${x - 22}px;top:${y - 22}px;background:${esc(editor.draft.shirt)}" aria-label="Selected desk slot ${i + 1}">${esc((editor.draft.name || '?')[0])}</button>`;
    else html += `<button type="button" class="slot free" data-slot="${i}" style="left:${x - 22}px;top:${y - 22}px" aria-label="Free desk slot ${i + 1}">${icon('plus', 18)}</button>`;
  });
  return html + '<span class="plan-cap">Top-down plan · window wall on the left</span>';
}

function renderEditor() {
  const d = editor.draft, full = !freeSlots(null).length, editing = editor.id ? getWorker(editor.id) : null;
  if (editor.id && !editing) { closeEditor(); return; }
  $('#ed-list').innerHTML = workers.map(w => `<button type="button" class="row ${w.id === editor.id ? 'sel' : ''}" data-id="${esc(w.id)}" aria-pressed="${w.id === editor.id}">${avatar(w)}<span class="who"><span class="nm">${esc(w.name)}</span><span class="rl">${esc(roleOf(w))}</span></span>${icon('edit', 16)}</button>`).join('');
  $('#ed-add').disabled = full;
  $('#ed-add').title = full ? 'All desks are taken' : '';
  const choices = sessionChoices();
  if (!d.session_id && choices.length) d.session_id = choices[0].session;
  const focused = document.activeElement?.id;
  $('#ed-form').innerHTML = `
    <div class="fh">${avatar({ shirt: d.shirt, name: d.name || '+' }, 48)}<div><div class="ft">${editing ? 'Edit ' + esc(editing.name) : 'New worker'}</div><div class="fs">Changes apply to the office when you save.</div></div></div>
    <div class="frow"><label class="fld">Name<input id="f-name" type="text" maxlength="20" value="${esc(d.name)}"></label><label class="fld">Role<input id="f-role" type="text" maxlength="32" value="${esc(d.role)}"></label></div>
    <fieldset><legend>Outfit colour</legend><div class="sw">${SHIRTS.map(([n, c]) => `<label class="swl ${d.shirt === c ? 'on' : ''}"><input type="radio" name="shirt" value="${c}" aria-label="${n}" ${d.shirt === c ? 'checked' : ''}><span style="background:${c}"></span></label>`).join('')}</div></fieldset>
    <div class="frow2"><div><div class="lbl">Hair</div><div class="chips" data-k="hair">${HAIR_STYLES.map(s => `<button type="button" class="chipb ${d.hair === s ? 'on' : ''}" aria-pressed="${d.hair === s}" data-v="${s}">${s}</button>`).join('')}</div></div>
    <div><div class="lbl">Accessory</div><div class="chips" data-k="acc">${ACCESSORIES.map(s => `<button type="button" class="chipb ${d.acc === s ? 'on' : ''}" aria-pressed="${d.acc === s}" data-v="${s}">${s}</button>`).join('')}</div></div></div>
    <div><div class="lbl">Desk position <span class="lbls">Pick a free slot</span></div><div class="plan">${plan()}</div></div>
    <label class="fld">Bound session<select id="f-sess">${choices.length ? '' : '<option value="">No sessions available</option>'}${choices.map(s => `<option value="${esc(s.session)}" ${s.session === d.session_id ? 'selected' : ''}>session ${esc(shortId(s.session))} · ${esc(s.dir)}</option>`).join('')}</select></label>
    ${editor.error ? `<p class="ferr" role="alert">${esc(editor.error)}</p>` : ''}`;
  if (focused === 'f-name' || focused === 'f-role') {
    const el = $('#' + focused);
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }
  const det = detected();
  $('#ed-detected').innerHTML = det.length ? det.map(s => `<div class="sess"><div class="sh"><span class="sic">${icon('terminal', 16)}</span><div class="mono"><div class="sid" title="${esc(s.session)}">session ${esc(shortId(s.session))}</div><div class="sdir">${esc(s.dir)}</div></div></div>
      <div class="sst">${icon('clock', 14)}Started ${ago(s.started)}</div>
      <div class="sbtn"><button type="button" class="btn pri sm" data-new="${esc(s.session)}" ${full ? 'disabled' : ''}>${icon('plus', 16, 2.4)}New worker</button>${editing ? `<button type="button" class="btn sec sm" data-assign="${esc(s.session)}">Assign to ${esc(editing.name)}</button>` : ''}</div></div>`).join('')
    : '<p class="empty">All running sessions have a desk.</p>';
  $('#ed-detected-n').textContent = det.length;
  const rm = $('#ed-remove');
  rm.hidden = !editing;
  if (editing) rm.innerHTML = icon('trash', 18) + (editor.confirmRemove ? `Confirm remove ${esc(editing.name)}` : `Remove ${esc(editing.name)}`);
  rm.classList.toggle('confirm', !!editor.confirmRemove);
  $('#ed-save').textContent = editing ? 'Save changes' : 'Add worker';
}

$('#ov-manage').onclick = () => openEditor(selectedId || workers[0]?.id || null);
$('#ed-close').onclick = $('#ed-cancel').onclick = closeEditor;
$('#ed-add').onclick = () => { openEditor(null); setTimeout(() => $('#f-name')?.focus(), 0); };
$('#ed-list').addEventListener('click', e => { const r = e.target.closest('.row'); if (r) openEditor(r.dataset.id); });
$('#ed-form').addEventListener('input', e => {
  const d = editor.draft, t = e.target;
  if (t.id === 'f-name') d.name = t.value;
  else if (t.id === 'f-role') d.role = t.value;
  else if (t.name === 'shirt') { d.shirt = t.value; renderEditor(); }
  else if (t.id === 'f-sess') d.session_id = t.value;
});
$('#ed-form').addEventListener('change', e => { if (e.target.id === 'f-sess') editor.draft.session_id = e.target.value; });
$('#ed-form').addEventListener('click', e => {
  const chip = e.target.closest('.chipb');
  if (chip) { editor.draft[chip.parentElement.dataset.k] = chip.dataset.v; renderEditor(); return; }
  const slot = e.target.closest('.slot[data-slot]');
  if (slot) { editor.draft.slot = +slot.dataset.slot; renderEditor(); }
});
$('#ed-detected').addEventListener('click', e => {
  const n = e.target.closest('[data-new]');
  if (n) { newFromSession(n.dataset.new); return; }
  const a = e.target.closest('[data-assign]');
  if (a && editor.id) { editor.draft.session_id = a.dataset.assign; renderEditor(); }
});
$('#ed-remove').onclick = async () => {
  if (!editor?.id) return;
  if (!editor.confirmRemove) { editor.confirmRemove = true; renderEditor(); return; }
  const id = editor.id;
  const r = await api('/api/workers', { op: 'delete', worker: { id } });
  if (!r.ok) { editor.error = `Remove failed: ${r.error}`; renderEditor(); return; }
  workers = workers.filter(w => w.id !== id);
  if (selectedId === id) select(null);
  openEditor(workers[0]?.id || null);
  renderAll();
};
$('#ed-save').onclick = async () => {
  const d = editor.draft;
  d.name = d.name.trim();
  d.role = d.role.trim();
  if (!d.name || !d.role) { editor.error = 'Name and role are required.'; renderEditor(); return; }
  if (workers.some(w => w.id !== editor.id && w.name.toLowerCase() === d.name.toLowerCase())) { editor.error = `A worker named ${d.name} already exists.`; renderEditor(); return; }
  if (!d.session_id) { editor.error = 'Bind a session first. Start a coding session, then it appears under Detected.'; renderEditor(); return; }
  if (d.slot == null) { editor.error = 'Pick a free desk slot.'; renderEditor(); return; }
  const existing = editor.id ? getWorker(editor.id) : null;
  const h = hash(editor.id ?? d.name);
  const worker = {
    ...(existing ?? { skin: SKINS[h % 4], hairColor: HAIR_COLORS[h % 5] }),
    id: editor.id ?? newId(),
    name: d.name, role: d.role, shirt: d.shirt, color: d.shirt, hair: d.hair, acc: d.acc, slot: d.slot, session_id: d.session_id,
  };
  const r = await api('/api/workers', { op: 'upsert', worker });
  if (!r.ok) { editor.error = `Save failed: ${r.error}`; renderEditor(); return; }
  setWorkers(workers.filter(w => w.id !== worker.id).concat(worker));
  closeEditor();
  renderAll();
  select(worker.id);
};

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!$('#editor').hidden) closeEditor();
  else if (selectedId) select(null);
});

// ── Backend connection ──────────────────────────────────────────────────────
function handle(msg) {
  switch (msg.type) {
    case 'state':
      sessions = {};
      for (const s of msg.sessions ?? []) sessions[s.session_id] = s;
      setWorkers(msg.workers);
      break;
    case 'status': {
      const s = ensureSession(msg.session_id);
      s.status = msg.status;
      if (msg.cwd) s.cwd = msg.cwd;
      break;
    }
    case 'output': {
      const s = ensureSession(msg.session_id);
      (s.output ??= []).push(msg.entry);
      if (s.output.length > 200) s.output.shift();
      break;
    }
    case 'pane_registered': {
      const s = ensureSession(msg.session_id);
      s.pane = msg.pane;
      if (msg.cwd) s.cwd = msg.cwd;
      break;
    }
    case 'workers_updated':
      setWorkers(msg.workers);
      break;
    case 'permission_request': {
      const s = ensureSession(msg.session_id);
      s.status = 'waiting';
      s.pending_permission = { request_id: msg.request_id, tool_name: msg.tool_name, tool_input: msg.tool_input, cwd: msg.cwd, requested_at: msg.requested_at };
      break;
    }
    case 'permission_resolved': {
      const s = ensureSession(msg.session_id);
      s.pending_permission = null;
      s.status = msg.status;
      break;
    }
    default:
      return;
  }
  if (selectedId && !getWorker(selectedId)) selectedId = null;
  renderAll();
}

function connect() {
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?token=${encodeURIComponent(TOKEN)}`);
  ws.onopen = () => { connected = true; renderHintChip(); };
  ws.onclose = () => { connected = false; renderHintChip(); setTimeout(connect, 2000); };
  ws.onmessage = ev => handle(JSON.parse(ev.data));
}

$('#ov-manage').innerHTML = icon('manage', 18) + 'Manage workers';
$('#p-close').innerHTML = icon('close', 20);
$('#ed-close').innerHTML = icon('close', 20);
$('#ed-add').innerHTML = icon('plus', 18) + 'Add worker';
$('#send').innerHTML = 'Send' + icon('send', 18, 2.4);
renderAll();
connect();
