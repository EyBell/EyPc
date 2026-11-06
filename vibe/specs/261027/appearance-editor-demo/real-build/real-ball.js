// @__NO_SIDE_EFFECTS__
function Xn(e) {
  const t = /* @__PURE__ */ Object.create(null);
  for (const n of e.split(",")) t[n] = 1;
  return (n) => n in t;
}
const W = {}, ct = [], Me = () => {
}, ts = () => !1, un = (e) => e.charCodeAt(0) === 111 && e.charCodeAt(1) === 110 && // uppercase letter
(e.charCodeAt(2) > 122 || e.charCodeAt(2) < 97), fn = (e) => e.startsWith("onUpdate:"), Z = Object.assign, Zn = (e, t) => {
  const n = e.indexOf(t);
  n > -1 && e.splice(n, 1);
}, ui = Object.prototype.hasOwnProperty, N = (e, t) => ui.call(e, t), M = Array.isArray, at = (e) => $t(e) === "[object Map]", ns = (e) => $t(e) === "[object Set]", vr = (e) => $t(e) === "[object Date]", B = (e) => typeof e == "function", G = (e) => typeof e == "string", De = (e) => typeof e == "symbol", j = (e) => e !== null && typeof e == "object", rs = (e) => (j(e) || B(e)) && B(e.then) && B(e.catch), ss = Object.prototype.toString, $t = (e) => ss.call(e), fi = (e) => $t(e).slice(8, -1), is = (e) => $t(e) === "[object Object]", er = (e) => G(e) && e !== "NaN" && e[0] !== "-" && "" + parseInt(e, 10) === e, Ct = /* @__PURE__ */ Xn(
  // the leading comma is intentional so empty string "" is also included
  ",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"
), dn = (e) => {
  const t = /* @__PURE__ */ Object.create(null);
  return ((n) => t[n] || (t[n] = e(n)));
}, di = /-\w/g, me = dn(
  (e) => e.replace(di, (t) => t.slice(1).toUpperCase())
), pi = /\B([A-Z])/g, it = dn(
  (e) => e.replace(pi, "-$1").toLowerCase()
), os = dn((e) => e.charAt(0).toUpperCase() + e.slice(1)), Cn = dn(
  (e) => e ? `on${os(e)}` : ""
), Ie = (e, t) => !Object.is(e, t), wn = (e, ...t) => {
  for (let n = 0; n < e.length; n++)
    e[n](...t);
}, ls = (e, t, n, r = !1) => {
  Object.defineProperty(e, t, {
    configurable: !0,
    enumerable: !1,
    writable: r,
    value: n
  });
}, hi = (e) => {
  const t = parseFloat(e);
  return isNaN(t) ? e : t;
};
let Cr;
const pn = () => Cr || (Cr = typeof globalThis < "u" ? globalThis : typeof self < "u" ? self : typeof window < "u" ? window : typeof global < "u" ? global : {});
function hn(e) {
  if (M(e)) {
    const t = {};
    for (let n = 0; n < e.length; n++) {
      const r = e[n], s = G(r) ? yi(r) : hn(r);
      if (s)
        for (const i in s)
          t[i] = s[i];
    }
    return t;
  } else if (G(e) || j(e))
    return e;
}
const gi = /;(?![^(]*\))/g, mi = /:([^]+)/, bi = /\/\*[^]*?\*\//g;
function yi(e) {
  const t = {};
  return e.replace(bi, "").split(gi).forEach((n) => {
    if (n) {
      const r = n.split(mi);
      r.length > 1 && (t[r[0].trim()] = r[1].trim());
    }
  }), t;
}
function nt(e) {
  let t = "";
  if (G(e))
    t = e;
  else if (M(e))
    for (let n = 0; n < e.length; n++) {
      const r = nt(e[n]);
      r && (t += r + " ");
    }
  else if (j(e))
    for (const n in e)
      e[n] && (t += n + " ");
  return t.trim();
}
const xi = "itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly", _i = /* @__PURE__ */ Xn(xi);
function cs(e) {
  return !!e || e === "";
}
function Fi(e, t) {
  if (e.length !== t.length) return !1;
  let n = !0;
  for (let r = 0; n && r < e.length; r++)
    n = tr(e[r], t[r]);
  return n;
}
function tr(e, t) {
  if (e === t) return !0;
  let n = vr(e), r = vr(t);
  if (n || r)
    return n && r ? e.getTime() === t.getTime() : !1;
  if (n = De(e), r = De(t), n || r)
    return e === t;
  if (n = M(e), r = M(t), n || r)
    return n && r ? Fi(e, t) : !1;
  if (n = j(e), r = j(t), n || r) {
    if (!n || !r)
      return !1;
    const s = Object.keys(e).length, i = Object.keys(t).length;
    if (s !== i)
      return !1;
    for (const o in e) {
      const l = e.hasOwnProperty(o), a = t.hasOwnProperty(o);
      if (l && !a || !l && a || !tr(e[o], t[o]))
        return !1;
    }
  }
  return String(e) === String(t);
}
const as = (e) => !!(e && e.__v_isRef === !0), et = (e) => G(e) ? e : e == null ? "" : M(e) || j(e) && (e.toString === ss || !B(e.toString)) ? as(e) ? et(e.value) : JSON.stringify(e, us, 2) : String(e), us = (e, t) => as(t) ? us(e, t.value) : at(t) ? {
  [`Map(${t.size})`]: [...t.entries()].reduce(
    (n, [r, s], i) => (n[An(r, i) + " =>"] = s, n),
    {}
  )
} : ns(t) ? {
  [`Set(${t.size})`]: [...t.values()].map((n) => An(n))
} : De(t) ? An(t) : j(t) && !M(t) && !is(t) ? String(t) : t, An = (e, t = "") => {
  var n;
  return (
    // Symbol.description in es2019+ so we need to cast here to pass
    // the lib: es2016 check
    De(e) ? `Symbol(${(n = e.description) != null ? n : t})` : e
  );
};
let X;
class vi {
  // TODO isolatedDeclarations "__v_skip"
  constructor(t = !1) {
    this.detached = t, this._active = !0, this._on = 0, this.effects = [], this.cleanups = [], this._isPaused = !1, this._warnOnRun = !0, this.__v_skip = !0, !t && X && (X.active ? (this.parent = X, this.index = (X.scopes || (X.scopes = [])).push(
      this
    ) - 1) : (this._active = !1, this._warnOnRun = !1));
  }
  get active() {
    return this._active;
  }
  pause() {
    if (this._active) {
      this._isPaused = !0;
      let t, n;
      if (this.scopes)
        for (t = 0, n = this.scopes.length; t < n; t++)
          this.scopes[t].pause();
      for (t = 0, n = this.effects.length; t < n; t++)
        this.effects[t].pause();
    }
  }
  /**
   * Resumes the effect scope, including all child scopes and effects.
   */
  resume() {
    if (this._active && this._isPaused) {
      this._isPaused = !1;
      let t, n;
      if (this.scopes)
        for (t = 0, n = this.scopes.length; t < n; t++)
          this.scopes[t].resume();
      for (t = 0, n = this.effects.length; t < n; t++)
        this.effects[t].resume();
    }
  }
  run(t) {
    if (this._active) {
      const n = X;
      try {
        return X = this, t();
      } finally {
        X = n;
      }
    }
  }
  /**
   * This should only be called on non-detached scopes
   * @internal
   */
  on() {
    ++this._on === 1 && (this.prevScope = X, X = this);
  }
  /**
   * This should only be called on non-detached scopes
   * @internal
   */
  off() {
    if (this._on > 0 && --this._on === 0) {
      if (X === this)
        X = this.prevScope;
      else {
        let t = X;
        for (; t; ) {
          if (t.prevScope === this) {
            t.prevScope = this.prevScope;
            break;
          }
          t = t.prevScope;
        }
      }
      this.prevScope = void 0;
    }
  }
  stop(t) {
    if (this._active) {
      this._active = !1;
      let n, r;
      for (n = 0, r = this.effects.length; n < r; n++)
        this.effects[n].stop();
      for (this.effects.length = 0, n = 0, r = this.cleanups.length; n < r; n++)
        this.cleanups[n]();
      if (this.cleanups.length = 0, this.scopes) {
        for (n = 0, r = this.scopes.length; n < r; n++)
          this.scopes[n].stop(!0);
        this.scopes.length = 0;
      }
      if (!this.detached && this.parent && !t) {
        const s = this.parent.scopes.pop();
        s && s !== this && (this.parent.scopes[this.index] = s, s.index = this.index);
      }
      this.parent = void 0;
    }
  }
}
function Ci() {
  return X;
}
let K;
const Sn = /* @__PURE__ */ new WeakSet();
class fs {
  constructor(t) {
    this.fn = t, this.deps = void 0, this.depsTail = void 0, this.flags = 5, this.next = void 0, this.cleanup = void 0, this.scheduler = void 0, X && (X.active ? X.effects.push(this) : this.flags &= -2);
  }
  pause() {
    this.flags |= 64;
  }
  resume() {
    this.flags & 64 && (this.flags &= -65, Sn.has(this) && (Sn.delete(this), this.trigger()));
  }
  /**
   * @internal
   */
  notify() {
    this.flags & 2 && !(this.flags & 32) || this.flags & 8 || ps(this);
  }
  run() {
    if (!(this.flags & 1))
      return this.fn();
    this.flags |= 2, wr(this), hs(this);
    const t = K, n = be;
    K = this, be = !0;
    try {
      return this.fn();
    } finally {
      gs(this), K = t, be = n, this.flags &= -3;
    }
  }
  stop() {
    if (this.flags & 1) {
      for (let t = this.deps; t; t = t.nextDep)
        sr(t);
      this.deps = this.depsTail = void 0, wr(this), this.onStop && this.onStop(), this.flags &= -2;
    }
  }
  trigger() {
    this.flags & 64 ? Sn.add(this) : this.scheduler ? this.scheduler() : this.runIfDirty();
  }
  /**
   * @internal
   */
  runIfDirty() {
    Ln(this) && this.run();
  }
  get dirty() {
    return Ln(this);
  }
}
let ds = 0, wt, At;
function ps(e, t = !1) {
  if (e.flags |= 8, t) {
    e.next = At, At = e;
    return;
  }
  e.next = wt, wt = e;
}
function nr() {
  ds++;
}
function rr() {
  if (--ds > 0)
    return;
  if (At) {
    let t = At;
    for (At = void 0; t; ) {
      const n = t.next;
      t.next = void 0, t.flags &= -9, t = n;
    }
  }
  let e;
  for (; wt; ) {
    let t = wt;
    for (wt = void 0; t; ) {
      const n = t.next;
      if (t.next = void 0, t.flags &= -9, t.flags & 1)
        try {
          t.trigger();
        } catch (r) {
          e || (e = r);
        }
      t = n;
    }
  }
  if (e) throw e;
}
function hs(e) {
  for (let t = e.deps; t; t = t.nextDep)
    t.version = -1, t.prevActiveLink = t.dep.activeLink, t.dep.activeLink = t;
}
function gs(e) {
  let t, n = e.depsTail, r = n;
  for (; r; ) {
    const s = r.prevDep;
    r.version === -1 ? (r === n && (n = s), sr(r), wi(r)) : t = r, r.dep.activeLink = r.prevActiveLink, r.prevActiveLink = void 0, r = s;
  }
  e.deps = t, e.depsTail = n;
}
function Ln(e) {
  for (let t = e.deps; t; t = t.nextDep)
    if (t.dep.version !== t.version || t.dep.computed && (ms(t.dep.computed) || t.dep.version !== t.version))
      return !0;
  return !!e._dirty;
}
function ms(e) {
  if (e.flags & 4 && !(e.flags & 16) || (e.flags &= -17, e.globalVersion === Mt) || (e.globalVersion = Mt, !e.isSSR && e.flags & 128 && (!e.deps && !e._dirty || !Ln(e))))
    return;
  e.flags |= 2;
  const t = e.dep, n = K, r = be;
  K = e, be = !0;
  try {
    hs(e);
    const s = e.fn(e._value);
    (t.version === 0 || Ie(s, e._value)) && (e.flags |= 128, e._value = s, t.version++);
  } catch (s) {
    throw t.version++, s;
  } finally {
    K = n, be = r, gs(e), e.flags &= -3;
  }
}
function sr(e, t = !1) {
  const { dep: n, prevSub: r, nextSub: s } = e;
  if (r && (r.nextSub = s, e.prevSub = void 0), s && (s.prevSub = r, e.nextSub = void 0), n.subs === e && (n.subs = r, !r && n.computed)) {
    n.computed.flags &= -5;
    for (let i = n.computed.deps; i; i = i.nextDep)
      sr(i, !0);
  }
  !t && !--n.sc && n.map && n.map.delete(n.key);
}
function wi(e) {
  const { prevDep: t, nextDep: n } = e;
  t && (t.nextDep = n, e.prevDep = void 0), n && (n.prevDep = t, e.nextDep = void 0);
}
let be = !0;
const bs = [];
function je() {
  bs.push(be), be = !1;
}
function Le() {
  const e = bs.pop();
  be = e === void 0 ? !0 : e;
}
function wr(e) {
  const { cleanup: t } = e;
  if (e.cleanup = void 0, t) {
    const n = K;
    K = void 0;
    try {
      t();
    } finally {
      K = n;
    }
  }
}
let Mt = 0;
class Ai {
  constructor(t, n) {
    this.sub = t, this.dep = n, this.version = n.version, this.nextDep = this.prevDep = this.nextSub = this.prevSub = this.prevActiveLink = void 0;
  }
}
class ys {
  // TODO isolatedDeclarations "__v_skip"
  constructor(t) {
    this.computed = t, this.version = 0, this.activeLink = void 0, this.subs = void 0, this.map = void 0, this.key = void 0, this.sc = 0, this.__v_skip = !0;
  }
  track(t) {
    if (!K || !be || K === this.computed)
      return;
    let n = this.activeLink;
    if (n === void 0 || n.sub !== K)
      n = this.activeLink = new Ai(K, this), K.deps ? (n.prevDep = K.depsTail, K.depsTail.nextDep = n, K.depsTail = n) : K.deps = K.depsTail = n, xs(n);
    else if (n.version === -1 && (n.version = this.version, n.nextDep)) {
      const r = n.nextDep;
      r.prevDep = n.prevDep, n.prevDep && (n.prevDep.nextDep = r), n.prevDep = K.depsTail, n.nextDep = void 0, K.depsTail.nextDep = n, K.depsTail = n, K.deps === n && (K.deps = r);
    }
    return n;
  }
  trigger(t) {
    this.version++, Mt++, this.notify(t);
  }
  notify(t) {
    nr();
    try {
      for (let n = this.subs; n; n = n.prevSub)
        n.sub.notify() && n.sub.dep.notify();
    } finally {
      rr();
    }
  }
}
function xs(e) {
  if (e.dep.sc++, e.sub.flags & 4) {
    const t = e.dep.computed;
    if (t && !e.dep.subs) {
      t.flags |= 20;
      for (let r = t.deps; r; r = r.nextDep)
        xs(r);
    }
    const n = e.dep.subs;
    n !== e && (e.prevSub = n, n && (n.nextSub = e)), e.dep.subs = e;
  }
}
const Hn = /* @__PURE__ */ new WeakMap(), rt = /* @__PURE__ */ Symbol(
  ""
), qn = /* @__PURE__ */ Symbol(
  ""
), Dt = /* @__PURE__ */ Symbol(
  ""
);
function te(e, t, n) {
  if (be && K) {
    let r = Hn.get(e);
    r || Hn.set(e, r = /* @__PURE__ */ new Map());
    let s = r.get(n);
    s || (r.set(n, s = new ys()), s.map = r, s.key = n), s.track();
  }
}
function $e(e, t, n, r, s, i) {
  const o = Hn.get(e);
  if (!o) {
    Mt++;
    return;
  }
  const l = (a) => {
    a && a.trigger();
  };
  if (nr(), t === "clear")
    o.forEach(l);
  else {
    const a = M(e), d = a && er(n);
    if (a && n === "length") {
      const u = Number(r);
      o.forEach((p, _) => {
        (_ === "length" || _ === Dt || !De(_) && _ >= u) && l(p);
      });
    } else
      switch ((n !== void 0 || o.has(void 0)) && l(o.get(n)), d && l(o.get(Dt)), t) {
        case "add":
          a ? d && l(o.get("length")) : (l(o.get(rt)), at(e) && l(o.get(qn)));
          break;
        case "delete":
          a || (l(o.get(rt)), at(e) && l(o.get(qn)));
          break;
        case "set":
          at(e) && l(o.get(rt));
          break;
      }
  }
  rr();
}
function ot(e) {
  const t = /* @__PURE__ */ H(e);
  return t === e ? t : (te(t, "iterate", Dt), /* @__PURE__ */ ye(e) ? t : t.map(He));
}
function gn(e) {
  return te(e = /* @__PURE__ */ H(e), "iterate", Dt), e;
}
function Oe(e, t) {
  return /* @__PURE__ */ ze(e) ? dt(/* @__PURE__ */ st(e) ? He(t) : t) : He(t);
}
const Si = {
  __proto__: null,
  [Symbol.iterator]() {
    return Pn(this, Symbol.iterator, (e) => Oe(this, e));
  },
  concat(...e) {
    return ot(this).concat(
      ...e.map((t) => M(t) ? ot(t) : t)
    );
  },
  entries() {
    return Pn(this, "entries", (e) => (e[1] = Oe(this, e[1]), e));
  },
  every(e, t) {
    return Be(this, "every", e, t, void 0, arguments);
  },
  filter(e, t) {
    return Be(
      this,
      "filter",
      e,
      t,
      (n) => n.map((r) => Oe(this, r)),
      arguments
    );
  },
  find(e, t) {
    return Be(
      this,
      "find",
      e,
      t,
      (n) => Oe(this, n),
      arguments
    );
  },
  findIndex(e, t) {
    return Be(this, "findIndex", e, t, void 0, arguments);
  },
  findLast(e, t) {
    return Be(
      this,
      "findLast",
      e,
      t,
      (n) => Oe(this, n),
      arguments
    );
  },
  findLastIndex(e, t) {
    return Be(this, "findLastIndex", e, t, void 0, arguments);
  },
  // flat, flatMap could benefit from ARRAY_ITERATE but are not straight-forward to implement
  forEach(e, t) {
    return Be(this, "forEach", e, t, void 0, arguments);
  },
  includes(...e) {
    return On(this, "includes", e);
  },
  indexOf(...e) {
    return On(this, "indexOf", e);
  },
  join(e) {
    return ot(this).join(e);
  },
  // keys() iterator only reads `length`, no optimization required
  lastIndexOf(...e) {
    return On(this, "lastIndexOf", e);
  },
  map(e, t) {
    return Be(this, "map", e, t, void 0, arguments);
  },
  pop() {
    return yt(this, "pop");
  },
  push(...e) {
    return yt(this, "push", e);
  },
  reduce(e, ...t) {
    return Ar(this, "reduce", e, t);
  },
  reduceRight(e, ...t) {
    return Ar(this, "reduceRight", e, t);
  },
  shift() {
    return yt(this, "shift");
  },
  // slice could use ARRAY_ITERATE but also seems to beg for range tracking
  some(e, t) {
    return Be(this, "some", e, t, void 0, arguments);
  },
  splice(...e) {
    return yt(this, "splice", e);
  },
  toReversed() {
    return ot(this).toReversed();
  },
  toSorted(e) {
    return ot(this).toSorted(e);
  },
  toSpliced(...e) {
    return ot(this).toSpliced(...e);
  },
  unshift(...e) {
    return yt(this, "unshift", e);
  },
  values() {
    return Pn(this, "values", (e) => Oe(this, e));
  }
};
function Pn(e, t, n) {
  const r = gn(e), s = r[t]();
  return r !== e && !/* @__PURE__ */ ye(e) && (s._next = s.next, s.next = () => {
    const i = s._next();
    return i.done || (i.value = n(i.value)), i;
  }), s;
}
const Pi = Array.prototype;
function Be(e, t, n, r, s, i) {
  const o = gn(e), l = o !== e && !/* @__PURE__ */ ye(e), a = o[t];
  if (a !== Pi[t]) {
    const p = a.apply(e, i);
    return l ? He(p) : p;
  }
  let d = n;
  o !== e && (l ? d = function(p, _) {
    return n.call(this, Oe(e, p), _, e);
  } : n.length > 2 && (d = function(p, _) {
    return n.call(this, p, _, e);
  }));
  const u = a.call(o, d, r);
  return l && s ? s(u) : u;
}
function Ar(e, t, n, r) {
  const s = gn(e), i = s !== e && !/* @__PURE__ */ ye(e);
  let o = n, l = !1;
  s !== e && (i ? (l = r.length === 0, o = function(d, u, p) {
    return l && (l = !1, d = Oe(e, d)), n.call(this, d, Oe(e, u), p, e);
  }) : n.length > 3 && (o = function(d, u, p) {
    return n.call(this, d, u, p, e);
  }));
  const a = s[t](o, ...r);
  return l ? Oe(e, a) : a;
}
function On(e, t, n) {
  const r = /* @__PURE__ */ H(e);
  te(r, "iterate", Dt);
  const s = r[t](...n);
  return (s === -1 || s === !1) && /* @__PURE__ */ lr(n[0]) ? (n[0] = /* @__PURE__ */ H(n[0]), r[t](...n)) : s;
}
function yt(e, t, n = []) {
  je(), nr();
  const r = (/* @__PURE__ */ H(e))[t].apply(e, n);
  return rr(), Le(), r;
}
const Oi = /* @__PURE__ */ Xn("__proto__,__v_isRef,__isVue"), _s = new Set(
  /* @__PURE__ */ Object.getOwnPropertyNames(Symbol).filter((e) => e !== "arguments" && e !== "caller").map((e) => Symbol[e]).filter(De)
);
function Ti(e) {
  De(e) || (e = String(e));
  const t = /* @__PURE__ */ H(this);
  return te(t, "has", e), t.hasOwnProperty(e);
}
class Fs {
  constructor(t = !1, n = !1) {
    this._isReadonly = t, this._isShallow = n;
  }
  get(t, n, r) {
    if (n === "__v_skip") return t.__v_skip;
    const s = this._isReadonly, i = this._isShallow;
    if (n === "__v_isReactive")
      return !s;
    if (n === "__v_isReadonly")
      return s;
    if (n === "__v_isShallow")
      return i;
    if (n === "__v_raw")
      return r === (s ? i ? ji : As : i ? ws : Cs).get(t) || // receiver is not the reactive proxy, but has the same prototype
      // this means the receiver is a user proxy of the reactive proxy
      Object.getPrototypeOf(t) === Object.getPrototypeOf(r) ? t : void 0;
    const o = M(t);
    if (!s) {
      let a;
      if (o && (a = Si[n]))
        return a;
      if (n === "hasOwnProperty")
        return Ti;
    }
    const l = Reflect.get(
      t,
      n,
      // if this is a proxy wrapping a ref, return methods using the raw ref
      // as receiver so that we don't have to call `toRaw` on the ref in all
      // its class methods
      /* @__PURE__ */ le(t) ? t : r
    );
    if ((De(n) ? _s.has(n) : Oi(n)) || (s || te(t, "get", n), i))
      return l;
    if (/* @__PURE__ */ le(l)) {
      const a = o && er(n) ? l : l.value;
      return s && j(a) ? /* @__PURE__ */ Kn(a) : a;
    }
    return j(l) ? s ? /* @__PURE__ */ Kn(l) : /* @__PURE__ */ mn(l) : l;
  }
}
class vs extends Fs {
  constructor(t = !1) {
    super(!1, t);
  }
  set(t, n, r, s) {
    let i = t[n];
    const o = M(t) && er(n);
    if (!this._isShallow) {
      const d = /* @__PURE__ */ ze(i);
      if (!/* @__PURE__ */ ye(r) && !/* @__PURE__ */ ze(r) && (i = /* @__PURE__ */ H(i), r = /* @__PURE__ */ H(r)), !o && /* @__PURE__ */ le(i) && !/* @__PURE__ */ le(r))
        return d || (i.value = r), !0;
    }
    const l = o ? Number(n) < t.length : N(t, n), a = Reflect.set(
      t,
      n,
      r,
      /* @__PURE__ */ le(t) ? t : s
    );
    return t === /* @__PURE__ */ H(s) && (l ? Ie(r, i) && $e(t, "set", n, r) : $e(t, "add", n, r)), a;
  }
  deleteProperty(t, n) {
    const r = N(t, n);
    t[n];
    const s = Reflect.deleteProperty(t, n);
    return s && r && $e(t, "delete", n, void 0), s;
  }
  has(t, n) {
    const r = Reflect.has(t, n);
    return (!De(n) || !_s.has(n)) && te(t, "has", n), r;
  }
  ownKeys(t) {
    return te(
      t,
      "iterate",
      M(t) ? "length" : rt
    ), Reflect.ownKeys(t);
  }
}
class Ei extends Fs {
  constructor(t = !1) {
    super(!0, t);
  }
  set(t, n) {
    return !0;
  }
  deleteProperty(t, n) {
    return !0;
  }
}
const Mi = /* @__PURE__ */ new vs(), Di = /* @__PURE__ */ new Ei(), Bi = /* @__PURE__ */ new vs(!0);
const Vn = (e) => e, Wt = (e) => Reflect.getPrototypeOf(e);
function ki(e, t, n) {
  return function(...r) {
    const s = this.__v_raw, i = /* @__PURE__ */ H(s), o = at(i), l = e === "entries" || e === Symbol.iterator && o, a = e === "keys" && o, d = s[e](...r), u = n ? Vn : t ? dt : He;
    return !t && te(
      i,
      "iterate",
      a ? qn : rt
    ), Z(
      // inheriting all iterator properties
      Object.create(d),
      {
        // iterator protocol
        next() {
          const { value: p, done: _ } = d.next();
          return _ ? { value: p, done: _ } : {
            value: l ? [u(p[0]), u(p[1])] : u(p),
            done: _
          };
        }
      }
    );
  };
}
function Ut(e) {
  return function(...t) {
    return e === "delete" ? !1 : e === "clear" ? void 0 : this;
  };
}
function Ri(e, t) {
  const n = {
    get(s) {
      const i = this.__v_raw, o = /* @__PURE__ */ H(i), l = /* @__PURE__ */ H(s);
      e || (Ie(s, l) && te(o, "get", s), te(o, "get", l));
      const { has: a } = Wt(o), d = t ? Vn : e ? dt : He;
      if (a.call(o, s))
        return d(i.get(s));
      if (a.call(o, l))
        return d(i.get(l));
      i !== o && i.get(s);
    },
    get size() {
      const s = this.__v_raw;
      return !e && te(/* @__PURE__ */ H(s), "iterate", rt), s.size;
    },
    has(s) {
      const i = this.__v_raw, o = /* @__PURE__ */ H(i), l = /* @__PURE__ */ H(s);
      return e || (Ie(s, l) && te(o, "has", s), te(o, "has", l)), s === l ? i.has(s) : i.has(s) || i.has(l);
    },
    forEach(s, i) {
      const o = this, l = o.__v_raw, a = /* @__PURE__ */ H(l), d = t ? Vn : e ? dt : He;
      return !e && te(a, "iterate", rt), l.forEach((u, p) => s.call(i, d(u), d(p), o));
    }
  };
  return Z(
    n,
    e ? {
      add: Ut("add"),
      set: Ut("set"),
      delete: Ut("delete"),
      clear: Ut("clear")
    } : {
      add(s) {
        const i = /* @__PURE__ */ H(this), o = Wt(i), l = /* @__PURE__ */ H(s), a = !t && !/* @__PURE__ */ ye(s) && !/* @__PURE__ */ ze(s) ? l : s;
        return o.has.call(i, a) || Ie(s, a) && o.has.call(i, s) || Ie(l, a) && o.has.call(i, l) || (i.add(a), $e(i, "add", a, a)), this;
      },
      set(s, i) {
        !t && !/* @__PURE__ */ ye(i) && !/* @__PURE__ */ ze(i) && (i = /* @__PURE__ */ H(i));
        const o = /* @__PURE__ */ H(this), { has: l, get: a } = Wt(o);
        let d = l.call(o, s);
        d || (s = /* @__PURE__ */ H(s), d = l.call(o, s));
        const u = a.call(o, s);
        return o.set(s, i), d ? Ie(i, u) && $e(o, "set", s, i) : $e(o, "add", s, i), this;
      },
      delete(s) {
        const i = /* @__PURE__ */ H(this), { has: o, get: l } = Wt(i);
        let a = o.call(i, s);
        a || (s = /* @__PURE__ */ H(s), a = o.call(i, s)), l && l.call(i, s);
        const d = i.delete(s);
        return a && $e(i, "delete", s, void 0), d;
      },
      clear() {
        const s = /* @__PURE__ */ H(this), i = s.size !== 0, o = s.clear();
        return i && $e(
          s,
          "clear",
          void 0,
          void 0
        ), o;
      }
    }
  ), [
    "keys",
    "values",
    "entries",
    Symbol.iterator
  ].forEach((s) => {
    n[s] = ki(s, e, t);
  }), n;
}
function ir(e, t) {
  const n = Ri(e, t);
  return (r, s, i) => s === "__v_isReactive" ? !e : s === "__v_isReadonly" ? e : s === "__v_raw" ? r : Reflect.get(
    N(n, s) && s in r ? n : r,
    s,
    i
  );
}
const Ii = {
  get: /* @__PURE__ */ ir(!1, !1)
}, $i = {
  get: /* @__PURE__ */ ir(!1, !0)
}, Ni = {
  get: /* @__PURE__ */ ir(!0, !1)
};
const Cs = /* @__PURE__ */ new WeakMap(), ws = /* @__PURE__ */ new WeakMap(), As = /* @__PURE__ */ new WeakMap(), ji = /* @__PURE__ */ new WeakMap();
function Li(e) {
  switch (e) {
    case "Object":
    case "Array":
      return 1;
    case "Map":
    case "Set":
    case "WeakMap":
    case "WeakSet":
      return 2;
    default:
      return 0;
  }
}
// @__NO_SIDE_EFFECTS__
function mn(e) {
  return /* @__PURE__ */ ze(e) ? e : or(
    e,
    !1,
    Mi,
    Ii,
    Cs
  );
}
// @__NO_SIDE_EFFECTS__
function Hi(e) {
  return or(
    e,
    !1,
    Bi,
    $i,
    ws
  );
}
// @__NO_SIDE_EFFECTS__
function Kn(e) {
  return or(
    e,
    !0,
    Di,
    Ni,
    As
  );
}
function or(e, t, n, r, s) {
  if (!j(e) || e.__v_raw && !(t && e.__v_isReactive) || e.__v_skip || !Object.isExtensible(e))
    return e;
  const i = s.get(e);
  if (i)
    return i;
  const o = Li(fi(e));
  if (o === 0)
    return e;
  const l = new Proxy(
    e,
    o === 2 ? r : n
  );
  return s.set(e, l), l;
}
// @__NO_SIDE_EFFECTS__
function st(e) {
  return /* @__PURE__ */ ze(e) ? /* @__PURE__ */ st(e.__v_raw) : !!(e && e.__v_isReactive);
}
// @__NO_SIDE_EFFECTS__
function ze(e) {
  return !!(e && e.__v_isReadonly);
}
// @__NO_SIDE_EFFECTS__
function ye(e) {
  return !!(e && e.__v_isShallow);
}
// @__NO_SIDE_EFFECTS__
function lr(e) {
  return e ? !!e.__v_raw : !1;
}
// @__NO_SIDE_EFFECTS__
function H(e) {
  const t = e && e.__v_raw;
  return t ? /* @__PURE__ */ H(t) : e;
}
function qi(e) {
  return !N(e, "__v_skip") && Object.isExtensible(e) && ls(e, "__v_skip", !0), e;
}
const He = (e) => j(e) ? /* @__PURE__ */ mn(e) : e, dt = (e) => j(e) ? /* @__PURE__ */ Kn(e) : e;
// @__NO_SIDE_EFFECTS__
function le(e) {
  return e ? e.__v_isRef === !0 : !1;
}
function Vi(e) {
  return /* @__PURE__ */ le(e) ? e.value : e;
}
const Ki = {
  get: (e, t, n) => t === "__v_raw" ? e : Vi(Reflect.get(e, t, n)),
  set: (e, t, n, r) => {
    const s = e[t];
    return /* @__PURE__ */ le(s) && !/* @__PURE__ */ le(n) ? (s.value = n, !0) : Reflect.set(e, t, n, r);
  }
};
function Ss(e) {
  return /* @__PURE__ */ st(e) ? e : new Proxy(e, Ki);
}
class Wi {
  constructor(t, n, r) {
    this.fn = t, this.setter = n, this._value = void 0, this.dep = new ys(this), this.__v_isRef = !0, this.deps = void 0, this.depsTail = void 0, this.flags = 16, this.globalVersion = Mt - 1, this.next = void 0, this.effect = this, this.__v_isReadonly = !n, this.isSSR = r;
  }
  /**
   * @internal
   */
  notify() {
    if (this.flags |= 16, !(this.flags & 8) && // avoid infinite self recursion
    K !== this)
      return ps(this, !0), !0;
  }
  get value() {
    const t = this.dep.track();
    return ms(this), t && (t.version = this.dep.version), this._value;
  }
  set value(t) {
    this.setter && this.setter(t);
  }
}
// @__NO_SIDE_EFFECTS__
function Ui(e, t, n = !1) {
  let r, s;
  return B(e) ? r = e : (r = e.get, s = e.set), new Wi(r, s, n);
}
const zt = {}, Zt = /* @__PURE__ */ new WeakMap();
let tt;
function zi(e, t = !1, n = tt) {
  if (n) {
    let r = Zt.get(n);
    r || Zt.set(n, r = []), r.push(e);
  }
}
function Gi(e, t, n = W) {
  const { immediate: r, deep: s, once: i, scheduler: o, augmentJob: l, call: a } = n, d = (T) => s ? T : /* @__PURE__ */ ye(T) || s === !1 || s === 0 ? Ue(T, 1) : Ue(T);
  let u, p, _, x, D = !1, S = !1;
  if (/* @__PURE__ */ le(e) ? (p = () => e.value, D = /* @__PURE__ */ ye(e)) : /* @__PURE__ */ st(e) ? (p = () => d(e), D = !0) : M(e) ? (S = !0, D = e.some((T) => /* @__PURE__ */ st(T) || /* @__PURE__ */ ye(T)), p = () => e.map((T) => {
    if (/* @__PURE__ */ le(T))
      return T.value;
    if (/* @__PURE__ */ st(T))
      return d(T);
    if (B(T))
      return a ? a(T, 2) : T();
  })) : B(e) ? t ? p = a ? () => a(e, 2) : e : p = () => {
    if (_) {
      je();
      try {
        _();
      } finally {
        Le();
      }
    }
    const T = tt;
    tt = u;
    try {
      return a ? a(e, 3, [x]) : e(x);
    } finally {
      tt = T;
    }
  } : p = Me, t && s) {
    const T = p, z = s === !0 ? 1 / 0 : s;
    p = () => Ue(T(), z);
  }
  const k = Ci(), $ = () => {
    u.stop(), k && k.active && Zn(k.effects, u);
  };
  if (i && t) {
    const T = t;
    t = (...z) => {
      const ce = T(...z);
      return $(), ce;
    };
  }
  let P = S ? new Array(e.length).fill(zt) : zt;
  const R = (T) => {
    if (!(!(u.flags & 1) || !u.dirty && !T))
      if (t) {
        const z = u.run();
        if (T || s || D || (S ? z.some((ce, Fe) => Ie(ce, P[Fe])) : Ie(z, P))) {
          _ && _();
          const ce = tt;
          tt = u;
          try {
            const Fe = [
              z,
              // pass undefined as the old value when it's changed for the first time
              P === zt ? void 0 : S && P[0] === zt ? [] : P,
              x
            ];
            P = z, a ? a(t, 3, Fe) : (
              // @ts-expect-error
              t(...Fe)
            );
          } finally {
            tt = ce;
          }
        }
      } else
        u.run();
  };
  return l && l(R), u = new fs(p), u.scheduler = o ? () => o(R, !1) : R, x = (T) => zi(T, !1, u), _ = u.onStop = () => {
    const T = Zt.get(u);
    if (T) {
      if (a)
        a(T, 4);
      else
        for (const z of T) z();
      Zt.delete(u);
    }
  }, t ? r ? R(!0) : P = u.run() : o ? o(R.bind(null, !0), !0) : u.run(), $.pause = u.pause.bind(u), $.resume = u.resume.bind(u), $.stop = $, $;
}
function Ue(e, t = 1 / 0, n) {
  if (t <= 0 || !j(e) || e.__v_skip || (n = n || /* @__PURE__ */ new Map(), (n.get(e) || 0) >= t))
    return e;
  if (n.set(e, t), t--, /* @__PURE__ */ le(e))
    Ue(e.value, t, n);
  else if (M(e))
    for (let r = 0; r < e.length; r++)
      Ue(e[r], t, n);
  else if (ns(e) || at(e))
    e.forEach((r) => {
      Ue(r, t, n);
    });
  else if (is(e)) {
    for (const r in e)
      Ue(e[r], t, n);
    for (const r of Object.getOwnPropertySymbols(e))
      Object.prototype.propertyIsEnumerable.call(e, r) && Ue(e[r], t, n);
  }
  return e;
}
function Nt(e, t, n, r) {
  try {
    return r ? e(...r) : e();
  } catch (s) {
    bn(s, t, n);
  }
}
function _e(e, t, n, r) {
  if (B(e)) {
    const s = Nt(e, t, n, r);
    return s && rs(s) && s.catch((i) => {
      bn(i, t, n);
    }), s;
  }
  if (M(e)) {
    const s = [];
    for (let i = 0; i < e.length; i++)
      s.push(_e(e[i], t, n, r));
    return s;
  }
}
function bn(e, t, n, r = !0) {
  const s = t ? t.vnode : null, { errorHandler: i, throwUnhandledErrorInProduction: o } = t && t.appContext.config || W;
  if (t) {
    let l = t.parent;
    const a = t.proxy, d = `https://vuejs.org/error-reference/#runtime-${n}`;
    for (; l; ) {
      const u = l.ec;
      if (u) {
        for (let p = 0; p < u.length; p++)
          if (u[p](e, a, d) === !1)
            return;
      }
      l = l.parent;
    }
    if (i) {
      je(), Nt(i, null, 10, [
        e,
        a,
        d
      ]), Le();
      return;
    }
  }
  Yi(e, n, s, r, o);
}
function Yi(e, t, n, r = !0, s = !1) {
  if (s)
    throw e;
  console.error(e);
}
const ie = [];
let Pe = -1;
const ut = [];
let We = null, lt = 0;
const Ps = /* @__PURE__ */ Promise.resolve();
let en = null;
function Ji(e) {
  const t = en || Ps;
  return e ? t.then(this ? e.bind(this) : e) : t;
}
function Qi(e) {
  let t = Pe + 1, n = ie.length;
  for (; t < n; ) {
    const r = t + n >>> 1, s = ie[r], i = Bt(s);
    i < e || i === e && s.flags & 2 ? t = r + 1 : n = r;
  }
  return t;
}
function cr(e) {
  if (!(e.flags & 1)) {
    const t = Bt(e), n = ie[ie.length - 1];
    !n || // fast path when the job id is larger than the tail
    !(e.flags & 2) && t >= Bt(n) ? ie.push(e) : ie.splice(Qi(t), 0, e), e.flags |= 1, Os();
  }
}
function Os() {
  en || (en = Ps.then(Es));
}
function Xi(e) {
  M(e) ? ut.push(...e) : We && e.id === -1 ? We.splice(lt + 1, 0, e) : e.flags & 1 || (ut.push(e), e.flags |= 1), Os();
}
function Sr(e, t, n = Pe + 1) {
  for (; n < ie.length; n++) {
    const r = ie[n];
    if (r && r.flags & 2) {
      if (e && r.id !== e.uid)
        continue;
      ie.splice(n, 1), n--, r.flags & 4 && (r.flags &= -2), r(), r.flags & 4 || (r.flags &= -2);
    }
  }
}
function Ts(e) {
  if (ut.length) {
    const t = [...new Set(ut)].sort(
      (n, r) => Bt(n) - Bt(r)
    );
    if (ut.length = 0, We) {
      We.push(...t);
      return;
    }
    for (We = t, lt = 0; lt < We.length; lt++) {
      const n = We[lt];
      n.flags & 4 && (n.flags &= -2), n.flags & 8 || n(), n.flags &= -2;
    }
    We = null, lt = 0;
  }
}
const Bt = (e) => e.id == null ? e.flags & 2 ? -1 : 1 / 0 : e.id;
function Es(e) {
  try {
    for (Pe = 0; Pe < ie.length; Pe++) {
      const t = ie[Pe];
      t && !(t.flags & 8) && (t.flags & 4 && (t.flags &= -2), Nt(
        t,
        t.i,
        t.i ? 15 : 14
      ), t.flags & 4 || (t.flags &= -2));
    }
  } finally {
    for (; Pe < ie.length; Pe++) {
      const t = ie[Pe];
      t && (t.flags &= -2);
    }
    Pe = -1, ie.length = 0, Ts(), en = null, (ie.length || ut.length) && Es();
  }
}
let Ee = null, Ms = null;
function tn(e) {
  const t = Ee;
  return Ee = e, Ms = e && e.type.__scopeId || null, t;
}
function Zi(e, t = Ee, n) {
  if (!t || e._n)
    return e;
  const r = (...s) => {
    r._d && sn(-1);
    const i = tn(t);
    let o;
    try {
      o = e(...s);
    } finally {
      tn(i), r._d && sn(1);
    }
    return o;
  };
  return r._n = !0, r._c = !0, r._d = !0, r;
}
function Xe(e, t, n, r) {
  const s = e.dirs, i = t && t.dirs;
  for (let o = 0; o < s.length; o++) {
    const l = s[o];
    i && (l.oldValue = i[o].value);
    let a = l.dir[r];
    a && (je(), _e(a, n, 8, [
      e.el,
      l,
      e,
      t
    ]), Le());
  }
}
function eo(e, t) {
  if (oe) {
    let n = oe.provides;
    const r = oe.parent && oe.parent.provides;
    r === n && (n = oe.provides = Object.create(r)), n[e] = t;
  }
}
function Qt(e, t, n = !1) {
  const r = nl();
  if (r || ft) {
    let s = ft ? ft._context.provides : r ? r.parent == null || r.ce ? r.vnode.appContext && r.vnode.appContext.provides : r.parent.provides : void 0;
    if (s && e in s)
      return s[e];
    if (arguments.length > 1)
      return n && B(t) ? t.call(r && r.proxy) : t;
  }
}
const to = /* @__PURE__ */ Symbol.for("v-scx"), no = () => Qt(to);
function Tn(e, t, n) {
  return Ds(e, t, n);
}
function Ds(e, t, n = W) {
  const { immediate: r, deep: s, flush: i, once: o } = n, l = Z({}, n), a = t && r || !t && i !== "post";
  let d;
  if (Rt) {
    if (i === "sync") {
      const x = no();
      d = x.__watcherHandles || (x.__watcherHandles = []);
    } else if (!a) {
      const x = () => {
      };
      return x.stop = Me, x.resume = Me, x.pause = Me, x;
    }
  }
  const u = oe;
  l.call = (x, D, S) => _e(x, u, D, S);
  let p = !1;
  i === "post" ? l.scheduler = (x) => {
    ue(x, u && u.suspense);
  } : i !== "sync" && (p = !0, l.scheduler = (x, D) => {
    D ? x() : cr(x);
  }), l.augmentJob = (x) => {
    t && (x.flags |= 4), p && (x.flags |= 2, u && (x.id = u.uid, x.i = u));
  };
  const _ = Gi(e, t, l);
  return Rt && (d ? d.push(_) : a && _()), _;
}
function ro(e, t, n) {
  const r = this.proxy, s = G(e) ? e.includes(".") ? Bs(r, e) : () => r[e] : e.bind(r, r);
  let i;
  B(t) ? i = t : (i = t.handler, n = t);
  const o = jt(this), l = Ds(s, i.bind(r), n);
  return o(), l;
}
function Bs(e, t) {
  const n = t.split(".");
  return () => {
    let r = e;
    for (let s = 0; s < n.length && r; s++)
      r = r[n[s]];
    return r;
  };
}
const so = /* @__PURE__ */ Symbol("_vte"), io = (e) => e.__isTeleport, En = /* @__PURE__ */ Symbol("_leaveCb");
function ar(e, t) {
  e.shapeFlag & 6 && e.component ? (e.transition = t, ar(e.component.subTree, t)) : e.shapeFlag & 128 ? (e.ssContent.transition = t.clone(e.ssContent), e.ssFallback.transition = t.clone(e.ssFallback)) : e.transition = t;
}
// @__NO_SIDE_EFFECTS__
function oo(e, t) {
  return B(e) ? (
    // #8236: extend call and options.name access are considered side-effects
    // by Rollup, so we have to wrap it in a pure-annotated IIFE.
    Z({ name: e.name }, t, { setup: e })
  ) : e;
}
function ks(e) {
  e.ids = [e.ids[0] + e.ids[2]++ + "-", 0, 0];
}
function Pr(e, t) {
  let n;
  return !!((n = Object.getOwnPropertyDescriptor(e, t)) && !n.configurable);
}
const nn = /* @__PURE__ */ new WeakMap();
function St(e, t, n, r, s = !1) {
  if (M(e)) {
    e.forEach(
      (S, k) => St(
        S,
        t && (M(t) ? t[k] : t),
        n,
        r,
        s
      )
    );
    return;
  }
  if (Pt(r) && !s) {
    r.shapeFlag & 512 && r.type.__asyncResolved && r.component.subTree.component && St(e, t, n, r.component.subTree);
    return;
  }
  const i = r.shapeFlag & 4 ? pr(r.component) : r.el, o = s ? null : i, { i: l, r: a } = e, d = t && t.r, u = l.refs === W ? l.refs = {} : l.refs, p = l.setupState, _ = /* @__PURE__ */ H(p), x = p === W ? ts : (S) => Pr(u, S) ? !1 : N(_, S), D = (S, k) => !(k && Pr(u, k));
  if (d != null && d !== a) {
    if (Or(t), G(d))
      u[d] = null, x(d) && (p[d] = null);
    else if (/* @__PURE__ */ le(d)) {
      const S = t;
      D(d, S.k) && (d.value = null), S.k && (u[S.k] = null);
    }
  }
  if (B(a))
    Nt(a, l, 12, [o, u]);
  else {
    const S = G(a), k = /* @__PURE__ */ le(a);
    if (S || k) {
      const $ = () => {
        if (e.f) {
          const P = S ? x(a) ? p[a] : u[a] : D() || !e.k ? a.value : u[e.k];
          if (s)
            M(P) && Zn(P, i);
          else if (M(P))
            P.includes(i) || P.push(i);
          else if (S)
            u[a] = [i], x(a) && (p[a] = u[a]);
          else {
            const R = [i];
            D(a, e.k) && (a.value = R), e.k && (u[e.k] = R);
          }
        } else S ? (u[a] = o, x(a) && (p[a] = o)) : k && (D(a, e.k) && (a.value = o), e.k && (u[e.k] = o));
      };
      if (o) {
        const P = () => {
          $(), nn.delete(e);
        };
        P.id = -1, nn.set(e, P), ue(P, n);
      } else
        Or(e), $();
    }
  }
}
function Or(e) {
  const t = nn.get(e);
  t && (t.flags |= 8, nn.delete(e));
}
pn().requestIdleCallback;
pn().cancelIdleCallback;
const Pt = (e) => !!e.type.__asyncLoader, Rs = (e) => e.type.__isKeepAlive;
function lo(e, t) {
  Is(e, "a", t);
}
function co(e, t) {
  Is(e, "da", t);
}
function Is(e, t, n = oe) {
  const r = e.__wdc || (e.__wdc = () => {
    let s = n;
    for (; s; ) {
      if (s.isDeactivated)
        return;
      s = s.parent;
    }
    return e();
  });
  if (yn(t, r, n), n) {
    let s = n.parent;
    for (; s && s.parent; )
      Rs(s.parent.vnode) && ao(r, t, n, s), s = s.parent;
  }
}
function ao(e, t, n, r) {
  const s = yn(
    t,
    e,
    r,
    !0
    /* prepend */
  );
  $s(() => {
    Zn(r[t], s);
  }, n);
}
function yn(e, t, n = oe, r = !1) {
  if (n) {
    const s = n[e] || (n[e] = []), i = t.__weh || (t.__weh = (...o) => {
      je();
      const l = jt(n), a = _e(t, n, e, o);
      return l(), Le(), a;
    });
    return r ? s.unshift(i) : s.push(i), i;
  }
}
const qe = (e) => (t, n = oe) => {
  (!Rt || e === "sp") && yn(e, (...r) => t(...r), n);
}, uo = qe("bm"), fo = qe("m"), po = qe(
  "bu"
), ho = qe("u"), go = qe(
  "bum"
), $s = qe("um"), mo = qe(
  "sp"
), bo = qe("rtg"), yo = qe("rtc");
function xo(e, t = oe) {
  yn("ec", e, t);
}
const _o = /* @__PURE__ */ Symbol.for("v-ndc");
function Tr(e, t, n, r) {
  let s;
  const i = n, o = M(e);
  if (o || G(e)) {
    const l = o && /* @__PURE__ */ st(e);
    let a = !1, d = !1;
    l && (a = !/* @__PURE__ */ ye(e), d = /* @__PURE__ */ ze(e), e = gn(e)), s = new Array(e.length);
    for (let u = 0, p = e.length; u < p; u++)
      s[u] = t(
        a ? d ? dt(He(e[u])) : He(e[u]) : e[u],
        u,
        void 0,
        i
      );
  } else if (typeof e == "number") {
    s = new Array(e);
    for (let l = 0; l < e; l++)
      s[l] = t(l + 1, l, void 0, i);
  } else if (j(e))
    if (e[Symbol.iterator])
      s = Array.from(
        e,
        (l, a) => t(l, a, void 0, i)
      );
    else {
      const l = Object.keys(e);
      s = new Array(l.length);
      for (let a = 0, d = l.length; a < d; a++) {
        const u = l[a];
        s[a] = t(e[u], u, a, i);
      }
    }
  else
    s = [];
  return s;
}
const Wn = (e) => e ? ri(e) ? pr(e) : Wn(e.parent) : null, Ot = (
  // Move PURE marker to new line to workaround compiler discarding it
  // due to type annotation
  /* @__PURE__ */ Z(/* @__PURE__ */ Object.create(null), {
    $: (e) => e,
    $el: (e) => e.vnode.el,
    $data: (e) => e.data,
    $props: (e) => e.props,
    $attrs: (e) => e.attrs,
    $slots: (e) => e.slots,
    $refs: (e) => e.refs,
    $parent: (e) => Wn(e.parent),
    $root: (e) => Wn(e.root),
    $host: (e) => e.ce,
    $emit: (e) => e.emit,
    $options: (e) => js(e),
    $forceUpdate: (e) => e.f || (e.f = () => {
      cr(e.update);
    }),
    $nextTick: (e) => e.n || (e.n = Ji.bind(e.proxy)),
    $watch: (e) => ro.bind(e)
  })
), Mn = (e, t) => e !== W && !e.__isScriptSetup && N(e, t), Fo = {
  get({ _: e }, t) {
    if (t === "__v_skip")
      return !0;
    const { ctx: n, setupState: r, data: s, props: i, accessCache: o, type: l, appContext: a } = e;
    if (t[0] !== "$") {
      const _ = o[t];
      if (_ !== void 0)
        switch (_) {
          case 1:
            return r[t];
          case 2:
            return s[t];
          case 4:
            return n[t];
          case 3:
            return i[t];
        }
      else {
        if (Mn(r, t))
          return o[t] = 1, r[t];
        if (s !== W && N(s, t))
          return o[t] = 2, s[t];
        if (N(i, t))
          return o[t] = 3, i[t];
        if (n !== W && N(n, t))
          return o[t] = 4, n[t];
        Un && (o[t] = 0);
      }
    }
    const d = Ot[t];
    let u, p;
    if (d)
      return t === "$attrs" && te(e.attrs, "get", ""), d(e);
    if (
      // css module (injected by vue-loader)
      (u = l.__cssModules) && (u = u[t])
    )
      return u;
    if (n !== W && N(n, t))
      return o[t] = 4, n[t];
    if (
      // global properties
      p = a.config.globalProperties, N(p, t)
    )
      return p[t];
  },
  set({ _: e }, t, n) {
    const { data: r, setupState: s, ctx: i } = e;
    return Mn(s, t) ? (s[t] = n, !0) : r !== W && N(r, t) ? (r[t] = n, !0) : N(e.props, t) || t[0] === "$" && t.slice(1) in e ? !1 : (i[t] = n, !0);
  },
  has({
    _: { data: e, setupState: t, accessCache: n, ctx: r, appContext: s, props: i, type: o }
  }, l) {
    let a;
    return !!(n[l] || e !== W && l[0] !== "$" && N(e, l) || Mn(t, l) || N(i, l) || N(r, l) || N(Ot, l) || N(s.config.globalProperties, l) || (a = o.__cssModules) && a[l]);
  },
  defineProperty(e, t, n) {
    return n.get != null ? e._.accessCache[t] = 0 : N(n, "value") && this.set(e, t, n.value, null), Reflect.defineProperty(e, t, n);
  }
};
function Er(e) {
  return M(e) ? e.reduce(
    (t, n) => (t[n] = null, t),
    {}
  ) : e;
}
let Un = !0;
function vo(e) {
  const t = js(e), n = e.proxy, r = e.ctx;
  Un = !1, t.beforeCreate && Mr(t.beforeCreate, e, "bc");
  const {
    // state
    data: s,
    computed: i,
    methods: o,
    watch: l,
    provide: a,
    inject: d,
    // lifecycle
    created: u,
    beforeMount: p,
    mounted: _,
    beforeUpdate: x,
    updated: D,
    activated: S,
    deactivated: k,
    beforeDestroy: $,
    beforeUnmount: P,
    destroyed: R,
    unmounted: T,
    render: z,
    renderTracked: ce,
    renderTriggered: Fe,
    errorCaptured: Ve,
    serverPrefetch: Lt,
    // public API
    expose: Ye,
    inheritAttrs: ht,
    // assets
    components: Ht,
    directives: qt,
    filters: Fn
  } = t;
  if (d && Co(d, r, null), o)
    for (const U in o) {
      const V = o[U];
      B(V) && (r[U] = V.bind(n));
    }
  if (s) {
    const U = s.call(n, n);
    j(U) && (e.data = /* @__PURE__ */ mn(U));
  }
  if (Un = !0, i)
    for (const U in i) {
      const V = i[U], Je = B(V) ? V.bind(n, n) : B(V.get) ? V.get.bind(n, n) : Me, Vt = !B(V) && B(V.set) ? V.set.bind(n) : Me, Qe = ee({
        get: Je,
        set: Vt
      });
      Object.defineProperty(r, U, {
        enumerable: !0,
        configurable: !0,
        get: () => Qe.value,
        set: (ve) => Qe.value = ve
      });
    }
  if (l)
    for (const U in l)
      Ns(l[U], r, n, U);
  if (a) {
    const U = B(a) ? a.call(n) : a;
    Reflect.ownKeys(U).forEach((V) => {
      eo(V, U[V]);
    });
  }
  u && Mr(u, e, "c");
  function ne(U, V) {
    M(V) ? V.forEach((Je) => U(Je.bind(n))) : V && U(V.bind(n));
  }
  if (ne(uo, p), ne(fo, _), ne(po, x), ne(ho, D), ne(lo, S), ne(co, k), ne(xo, Ve), ne(yo, ce), ne(bo, Fe), ne(go, P), ne($s, T), ne(mo, Lt), M(Ye))
    if (Ye.length) {
      const U = e.exposed || (e.exposed = {});
      Ye.forEach((V) => {
        Object.defineProperty(U, V, {
          get: () => n[V],
          set: (Je) => n[V] = Je,
          enumerable: !0
        });
      });
    } else e.exposed || (e.exposed = {});
  z && e.render === Me && (e.render = z), ht != null && (e.inheritAttrs = ht), Ht && (e.components = Ht), qt && (e.directives = qt), Lt && ks(e);
}
function Co(e, t, n = Me) {
  M(e) && (e = zn(e));
  for (const r in e) {
    const s = e[r];
    let i;
    j(s) ? "default" in s ? i = Qt(
      s.from || r,
      s.default,
      !0
    ) : i = Qt(s.from || r) : i = Qt(s), /* @__PURE__ */ le(i) ? Object.defineProperty(t, r, {
      enumerable: !0,
      configurable: !0,
      get: () => i.value,
      set: (o) => i.value = o
    }) : t[r] = i;
  }
}
function Mr(e, t, n) {
  _e(
    M(e) ? e.map((r) => r.bind(t.proxy)) : e.bind(t.proxy),
    t,
    n
  );
}
function Ns(e, t, n, r) {
  let s = r.includes(".") ? Bs(n, r) : () => n[r];
  if (G(e)) {
    const i = t[e];
    B(i) && Tn(s, i);
  } else if (B(e))
    Tn(s, e.bind(n));
  else if (j(e))
    if (M(e))
      e.forEach((i) => Ns(i, t, n, r));
    else {
      const i = B(e.handler) ? e.handler.bind(n) : t[e.handler];
      B(i) && Tn(s, i, e);
    }
}
function js(e) {
  const t = e.type, { mixins: n, extends: r } = t, {
    mixins: s,
    optionsCache: i,
    config: { optionMergeStrategies: o }
  } = e.appContext, l = i.get(t);
  let a;
  return l ? a = l : !s.length && !n && !r ? a = t : (a = {}, s.length && s.forEach(
    (d) => rn(a, d, o, !0)
  ), rn(a, t, o)), j(t) && i.set(t, a), a;
}
function rn(e, t, n, r = !1) {
  const { mixins: s, extends: i } = t;
  i && rn(e, i, n, !0), s && s.forEach(
    (o) => rn(e, o, n, !0)
  );
  for (const o in t)
    if (!(r && o === "expose")) {
      const l = wo[o] || n && n[o];
      e[o] = l ? l(e[o], t[o]) : t[o];
    }
  return e;
}
const wo = {
  data: Dr,
  props: Br,
  emits: Br,
  // objects
  methods: Ft,
  computed: Ft,
  // lifecycle
  beforeCreate: re,
  created: re,
  beforeMount: re,
  mounted: re,
  beforeUpdate: re,
  updated: re,
  beforeDestroy: re,
  beforeUnmount: re,
  destroyed: re,
  unmounted: re,
  activated: re,
  deactivated: re,
  errorCaptured: re,
  serverPrefetch: re,
  // assets
  components: Ft,
  directives: Ft,
  // watch
  watch: So,
  // provide / inject
  provide: Dr,
  inject: Ao
};
function Dr(e, t) {
  return t ? e ? function() {
    return Z(
      B(e) ? e.call(this, this) : e,
      B(t) ? t.call(this, this) : t
    );
  } : t : e;
}
function Ao(e, t) {
  return Ft(zn(e), zn(t));
}
function zn(e) {
  if (M(e)) {
    const t = {};
    for (let n = 0; n < e.length; n++)
      t[e[n]] = e[n];
    return t;
  }
  return e;
}
function re(e, t) {
  return e ? [...new Set([].concat(e, t))] : t;
}
function Ft(e, t) {
  return e ? Z(/* @__PURE__ */ Object.create(null), e, t) : t;
}
function Br(e, t) {
  return e ? M(e) && M(t) ? [.../* @__PURE__ */ new Set([...e, ...t])] : Z(
    /* @__PURE__ */ Object.create(null),
    Er(e),
    Er(t ?? {})
  ) : t;
}
function So(e, t) {
  if (!e) return t;
  if (!t) return e;
  const n = Z(/* @__PURE__ */ Object.create(null), e);
  for (const r in t)
    n[r] = re(e[r], t[r]);
  return n;
}
function Ls() {
  return {
    app: null,
    config: {
      isNativeTag: ts,
      performance: !1,
      globalProperties: {},
      optionMergeStrategies: {},
      errorHandler: void 0,
      warnHandler: void 0,
      compilerOptions: {}
    },
    mixins: [],
    components: {},
    directives: {},
    provides: /* @__PURE__ */ Object.create(null),
    optionsCache: /* @__PURE__ */ new WeakMap(),
    propsCache: /* @__PURE__ */ new WeakMap(),
    emitsCache: /* @__PURE__ */ new WeakMap()
  };
}
let Po = 0;
function Oo(e, t) {
  return function(r, s = null) {
    B(r) || (r = Z({}, r)), s != null && !j(s) && (s = null);
    const i = Ls(), o = /* @__PURE__ */ new WeakSet(), l = [];
    let a = !1;
    const d = i.app = {
      _uid: Po++,
      _component: r,
      _props: s,
      _container: null,
      _context: i,
      _instance: null,
      version: cl,
      get config() {
        return i.config;
      },
      set config(u) {
      },
      use(u, ...p) {
        return o.has(u) || (u && B(u.install) ? (o.add(u), u.install(d, ...p)) : B(u) && (o.add(u), u(d, ...p))), d;
      },
      mixin(u) {
        return i.mixins.includes(u) || i.mixins.push(u), d;
      },
      component(u, p) {
        return p ? (i.components[u] = p, d) : i.components[u];
      },
      directive(u, p) {
        return p ? (i.directives[u] = p, d) : i.directives[u];
      },
      mount(u, p, _) {
        if (!a) {
          const x = d._ceVNode || he(r, s);
          return x.appContext = i, _ === !0 ? _ = "svg" : _ === !1 && (_ = void 0), e(x, u, _), a = !0, d._container = u, u.__vue_app__ = d, pr(x.component);
        }
      },
      onUnmount(u) {
        l.push(u);
      },
      unmount() {
        a && (_e(
          l,
          d._instance,
          16
        ), e(null, d._container), delete d._container.__vue_app__);
      },
      provide(u, p) {
        return i.provides[u] = p, d;
      },
      runWithContext(u) {
        const p = ft;
        ft = d;
        try {
          return u();
        } finally {
          ft = p;
        }
      }
    };
    return d;
  };
}
let ft = null;
const To = (e, t) => t === "modelValue" || t === "model-value" ? e.modelModifiers : e[`${t}Modifiers`] || e[`${me(t)}Modifiers`] || e[`${it(t)}Modifiers`];
function Eo(e, t, ...n) {
  if (e.isUnmounted) return;
  const r = e.vnode.props || W;
  let s = n;
  const i = t.startsWith("update:"), o = i && To(r, t.slice(7));
  o && (o.trim && (s = n.map((u) => G(u) ? u.trim() : u)), o.number && (s = n.map(hi)));
  let l, a = r[l = Cn(t)] || // also try camelCase event handler (#2249)
  r[l = Cn(me(t))];
  !a && i && (a = r[l = Cn(it(t))]), a && _e(
    a,
    e,
    6,
    s
  );
  const d = r[l + "Once"];
  if (d) {
    if (!e.emitted)
      e.emitted = {};
    else if (e.emitted[l])
      return;
    e.emitted[l] = !0, _e(
      d,
      e,
      6,
      s
    );
  }
}
const Mo = /* @__PURE__ */ new WeakMap();
function Hs(e, t, n = !1) {
  const r = n ? Mo : t.emitsCache, s = r.get(e);
  if (s !== void 0)
    return s;
  const i = e.emits;
  let o = {}, l = !1;
  if (!B(e)) {
    const a = (d) => {
      const u = Hs(d, t, !0);
      u && (l = !0, Z(o, u));
    };
    !n && t.mixins.length && t.mixins.forEach(a), e.extends && a(e.extends), e.mixins && e.mixins.forEach(a);
  }
  return !i && !l ? (j(e) && r.set(e, null), null) : (M(i) ? i.forEach((a) => o[a] = null) : Z(o, i), j(e) && r.set(e, o), o);
}
function xn(e, t) {
  return !e || !un(t) ? !1 : (t = t.slice(2).replace(/Once$/, ""), N(e, t[0].toLowerCase() + t.slice(1)) || N(e, it(t)) || N(e, t));
}
function kr(e) {
  const {
    type: t,
    vnode: n,
    proxy: r,
    withProxy: s,
    propsOptions: [i],
    slots: o,
    attrs: l,
    emit: a,
    render: d,
    renderCache: u,
    props: p,
    data: _,
    setupState: x,
    ctx: D,
    inheritAttrs: S
  } = e, k = tn(e);
  let $, P;
  try {
    if (n.shapeFlag & 4) {
      const T = s || r, z = T;
      $ = Te(
        d.call(
          z,
          T,
          u,
          p,
          x,
          _,
          D
        )
      ), P = l;
    } else {
      const T = t;
      $ = Te(
        T.length > 1 ? T(
          p,
          { attrs: l, slots: o, emit: a }
        ) : T(
          p,
          null
        )
      ), P = t.props ? l : Do(l);
    }
  } catch (T) {
    Tt.length = 0, bn(T, e, 1), $ = he(Ge);
  }
  let R = $;
  if (P && S !== !1) {
    const T = Object.keys(P), { shapeFlag: z } = R;
    T.length && z & 7 && (i && T.some(fn) && (P = Bo(
      P,
      i
    )), R = pt(R, P, !1, !0));
  }
  return n.dirs && (R = pt(R, null, !1, !0), R.dirs = R.dirs ? R.dirs.concat(n.dirs) : n.dirs), n.transition && ar(R, n.transition), $ = R, tn(k), $;
}
const Do = (e) => {
  let t;
  for (const n in e)
    (n === "class" || n === "style" || un(n)) && ((t || (t = {}))[n] = e[n]);
  return t;
}, Bo = (e, t) => {
  const n = {};
  for (const r in e)
    (!fn(r) || !(r.slice(9) in t)) && (n[r] = e[r]);
  return n;
};
function ko(e, t, n) {
  const { props: r, children: s, component: i } = e, { props: o, children: l, patchFlag: a } = t, d = i.emitsOptions;
  if (t.dirs || t.transition)
    return !0;
  if (n && a >= 0) {
    if (a & 1024)
      return !0;
    if (a & 16)
      return r ? Rr(r, o, d) : !!o;
    if (a & 8) {
      const u = t.dynamicProps;
      for (let p = 0; p < u.length; p++) {
        const _ = u[p];
        if (qs(o, r, _) && !xn(d, _))
          return !0;
      }
    }
  } else
    return (s || l) && (!l || !l.$stable) ? !0 : r === o ? !1 : r ? o ? Rr(r, o, d) : !0 : !!o;
  return !1;
}
function Rr(e, t, n) {
  const r = Object.keys(t);
  if (r.length !== Object.keys(e).length)
    return !0;
  for (let s = 0; s < r.length; s++) {
    const i = r[s];
    if (qs(t, e, i) && !xn(n, i))
      return !0;
  }
  return !1;
}
function qs(e, t, n) {
  const r = e[n], s = t[n];
  return n === "style" && j(r) && j(s) ? !tr(r, s) : r !== s;
}
function Ro({ vnode: e, parent: t, suspense: n }, r) {
  for (; t; ) {
    const s = t.subTree;
    if (s.suspense && s.suspense.activeBranch === e && (s.suspense.vnode.el = s.el = r, e = s), s === e)
      (e = t.vnode).el = r, t = t.parent;
    else
      break;
  }
  n && n.activeBranch === e && (n.vnode.el = r);
}
const Vs = {}, Ks = () => Object.create(Vs), Ws = (e) => Object.getPrototypeOf(e) === Vs;
function Io(e, t, n, r = !1) {
  const s = {}, i = Ks();
  e.propsDefaults = /* @__PURE__ */ Object.create(null), Us(e, t, s, i);
  for (const o in e.propsOptions[0])
    o in s || (s[o] = void 0);
  n ? e.props = r ? s : /* @__PURE__ */ Hi(s) : e.type.props ? e.props = s : e.props = i, e.attrs = i;
}
function $o(e, t, n, r) {
  const {
    props: s,
    attrs: i,
    vnode: { patchFlag: o }
  } = e, l = /* @__PURE__ */ H(s), [a] = e.propsOptions;
  let d = !1;
  if (
    // always force full diff in dev
    // - #1942 if hmr is enabled with sfc component
    // - vite#872 non-sfc component used by sfc component
    (r || o > 0) && !(o & 16)
  ) {
    if (o & 8) {
      const u = e.vnode.dynamicProps;
      for (let p = 0; p < u.length; p++) {
        let _ = u[p];
        if (xn(e.emitsOptions, _))
          continue;
        const x = t[_];
        if (a)
          if (N(i, _))
            x !== i[_] && (i[_] = x, d = !0);
          else {
            const D = me(_);
            s[D] = Gn(
              a,
              l,
              D,
              x,
              e,
              !1
            );
          }
        else
          x !== i[_] && (i[_] = x, d = !0);
      }
    }
  } else {
    Us(e, t, s, i) && (d = !0);
    let u;
    for (const p in l)
      (!t || // for camelCase
      !N(t, p) && // it's possible the original props was passed in as kebab-case
      // and converted to camelCase (#955)
      ((u = it(p)) === p || !N(t, u))) && (a ? n && // for camelCase
      (n[p] !== void 0 || // for kebab-case
      n[u] !== void 0) && (s[p] = Gn(
        a,
        l,
        p,
        void 0,
        e,
        !0
      )) : delete s[p]);
    if (i !== l)
      for (const p in i)
        (!t || !N(t, p)) && (delete i[p], d = !0);
  }
  d && $e(e.attrs, "set", "");
}
function Us(e, t, n, r) {
  const [s, i] = e.propsOptions;
  let o = !1, l;
  if (t)
    for (let a in t) {
      if (Ct(a))
        continue;
      const d = t[a];
      let u;
      s && N(s, u = me(a)) ? !i || !i.includes(u) ? n[u] = d : (l || (l = {}))[u] = d : xn(e.emitsOptions, a) || (!(a in r) || d !== r[a]) && (r[a] = d, o = !0);
    }
  if (i) {
    const a = /* @__PURE__ */ H(n), d = l || W;
    for (let u = 0; u < i.length; u++) {
      const p = i[u];
      n[p] = Gn(
        s,
        a,
        p,
        d[p],
        e,
        !N(d, p)
      );
    }
  }
  return o;
}
function Gn(e, t, n, r, s, i) {
  const o = e[n];
  if (o != null) {
    const l = N(o, "default");
    if (l && r === void 0) {
      const a = o.default;
      if (o.type !== Function && !o.skipFactory && B(a)) {
        const { propsDefaults: d } = s;
        if (n in d)
          r = d[n];
        else {
          const u = jt(s);
          r = d[n] = a.call(
            null,
            t
          ), u();
        }
      } else
        r = a;
      s.ce && s.ce._setProp(n, r);
    }
    o[
      0
      /* shouldCast */
    ] && (i && !l ? r = !1 : o[
      1
      /* shouldCastTrue */
    ] && (r === "" || r === it(n)) && (r = !0));
  }
  return r;
}
const No = /* @__PURE__ */ new WeakMap();
function zs(e, t, n = !1) {
  const r = n ? No : t.propsCache, s = r.get(e);
  if (s)
    return s;
  const i = e.props, o = {}, l = [];
  let a = !1;
  if (!B(e)) {
    const u = (p) => {
      a = !0;
      const [_, x] = zs(p, t, !0);
      Z(o, _), x && l.push(...x);
    };
    !n && t.mixins.length && t.mixins.forEach(u), e.extends && u(e.extends), e.mixins && e.mixins.forEach(u);
  }
  if (!i && !a)
    return j(e) && r.set(e, ct), ct;
  if (M(i))
    for (let u = 0; u < i.length; u++) {
      const p = me(i[u]);
      Ir(p) && (o[p] = W);
    }
  else if (i)
    for (const u in i) {
      const p = me(u);
      if (Ir(p)) {
        const _ = i[u], x = o[p] = M(_) || B(_) ? { type: _ } : Z({}, _), D = x.type;
        let S = !1, k = !0;
        if (M(D))
          for (let $ = 0; $ < D.length; ++$) {
            const P = D[$], R = B(P) && P.name;
            if (R === "Boolean") {
              S = !0;
              break;
            } else R === "String" && (k = !1);
          }
        else
          S = B(D) && D.name === "Boolean";
        x[
          0
          /* shouldCast */
        ] = S, x[
          1
          /* shouldCastTrue */
        ] = k, (S || N(x, "default")) && l.push(p);
      }
    }
  const d = [o, l];
  return j(e) && r.set(e, d), d;
}
function Ir(e) {
  return e[0] !== "$" && !Ct(e);
}
const ur = (e) => e === "_" || e === "_ctx" || e === "$stable", fr = (e) => M(e) ? e.map(Te) : [Te(e)], jo = (e, t, n) => {
  if (t._n)
    return t;
  const r = Zi((...s) => fr(t(...s)), n);
  return r._c = !1, r;
}, Gs = (e, t, n) => {
  const r = e._ctx;
  for (const s in e) {
    if (ur(s)) continue;
    const i = e[s];
    if (B(i))
      t[s] = jo(s, i, r);
    else if (i != null) {
      const o = fr(i);
      t[s] = () => o;
    }
  }
}, Ys = (e, t) => {
  const n = fr(t);
  e.slots.default = () => n;
}, Js = (e, t, n) => {
  for (const r in t)
    (n || !ur(r)) && (e[r] = t[r]);
}, Lo = (e, t, n) => {
  const r = e.slots = Ks();
  if (e.vnode.shapeFlag & 32) {
    const s = t._;
    s ? (Js(r, t, n), n && ls(r, "_", s, !0)) : Gs(t, r);
  } else t && Ys(e, t);
}, Ho = (e, t, n) => {
  const { vnode: r, slots: s } = e;
  let i = !0, o = W;
  if (r.shapeFlag & 32) {
    const l = t._;
    l ? n && l === 1 ? i = !1 : Js(s, t, n) : (i = !t.$stable, Gs(t, s)), o = t;
  } else t && (Ys(e, t), o = { default: 1 });
  if (i)
    for (const l in s)
      !ur(l) && o[l] == null && delete s[l];
}, ue = Uo;
function qo(e) {
  return Vo(e);
}
function Vo(e, t) {
  const n = pn();
  n.__VUE__ = !0;
  const {
    insert: r,
    remove: s,
    patchProp: i,
    createElement: o,
    createText: l,
    createComment: a,
    setText: d,
    setElementText: u,
    parentNode: p,
    nextSibling: _,
    setScopeId: x = Me,
    insertStaticContent: D
  } = e, S = (c, f, h, y = null, m = null, g = null, C = void 0, v = null, F = !!f.dynamicChildren) => {
    if (c === f)
      return;
    c && !xt(c, f) && (y = Kt(c), ve(c, m, g, !0), c = null), f.patchFlag === -2 && (F = !1, f.dynamicChildren = null);
    const { type: b, ref: O, shapeFlag: w } = f;
    switch (b) {
      case _n:
        k(c, f, h, y);
        break;
      case Ge:
        $(c, f, h, y);
        break;
      case Bn:
        c == null && P(f, h, y, C);
        break;
      case de:
        Ht(
          c,
          f,
          h,
          y,
          m,
          g,
          C,
          v,
          F
        );
        break;
      default:
        w & 1 ? z(
          c,
          f,
          h,
          y,
          m,
          g,
          C,
          v,
          F
        ) : w & 6 ? qt(
          c,
          f,
          h,
          y,
          m,
          g,
          C,
          v,
          F
        ) : (w & 64 || w & 128) && b.process(
          c,
          f,
          h,
          y,
          m,
          g,
          C,
          v,
          F,
          mt
        );
    }
    O != null && m ? St(O, c && c.ref, g, f || c, !f) : O == null && c && c.ref != null && St(c.ref, null, g, c, !0);
  }, k = (c, f, h, y) => {
    if (c == null)
      r(
        f.el = l(f.children),
        h,
        y
      );
    else {
      const m = f.el = c.el;
      f.children !== c.children && d(m, f.children);
    }
  }, $ = (c, f, h, y) => {
    c == null ? r(
      f.el = a(f.children || ""),
      h,
      y
    ) : f.el = c.el;
  }, P = (c, f, h, y) => {
    [c.el, c.anchor] = D(
      c.children,
      f,
      h,
      y,
      c.el,
      c.anchor
    );
  }, R = ({ el: c, anchor: f }, h, y) => {
    let m;
    for (; c && c !== f; )
      m = _(c), r(c, h, y), c = m;
    r(f, h, y);
  }, T = ({ el: c, anchor: f }) => {
    let h;
    for (; c && c !== f; )
      h = _(c), s(c), c = h;
    s(f);
  }, z = (c, f, h, y, m, g, C, v, F) => {
    if (f.type === "svg" ? C = "svg" : f.type === "math" && (C = "mathml"), c == null)
      ce(
        f,
        h,
        y,
        m,
        g,
        C,
        v,
        F
      );
    else {
      const b = c.el && c.el._isVueCE ? c.el : null;
      try {
        b && b._beginPatch(), Lt(
          c,
          f,
          m,
          g,
          C,
          v,
          F
        );
      } finally {
        b && b._endPatch();
      }
    }
  }, ce = (c, f, h, y, m, g, C, v) => {
    let F, b;
    const { props: O, shapeFlag: w, transition: A, dirs: E } = c;
    if (F = c.el = o(
      c.type,
      g,
      O && O.is,
      O
    ), w & 8 ? u(F, c.children) : w & 16 && Ve(
      c.children,
      F,
      null,
      y,
      m,
      Dn(c, g),
      C,
      v
    ), E && Xe(c, null, y, "created"), Fe(F, c, c.scopeId, C, y), O) {
      for (const q in O)
        q !== "value" && !Ct(q) && i(F, q, null, O[q], g, y);
      "value" in O && i(F, "value", null, O.value, g), (b = O.onVnodeBeforeMount) && Se(b, y, c);
    }
    E && Xe(c, null, y, "beforeMount");
    const I = Ko(m, A);
    I && A.beforeEnter(F), r(F, f, h), ((b = O && O.onVnodeMounted) || I || E) && ue(() => {
      b && Se(b, y, c), I && A.enter(F), E && Xe(c, null, y, "mounted");
    }, m);
  }, Fe = (c, f, h, y, m) => {
    if (h && x(c, h), y)
      for (let g = 0; g < y.length; g++)
        x(c, y[g]);
    if (m) {
      let g = m.subTree;
      if (f === g || ei(g.type) && (g.ssContent === f || g.ssFallback === f)) {
        const C = m.vnode;
        Fe(
          c,
          C,
          C.scopeId,
          C.slotScopeIds,
          m.parent
        );
      }
    }
  }, Ve = (c, f, h, y, m, g, C, v, F = 0) => {
    for (let b = F; b < c.length; b++) {
      const O = c[b] = v ? Re(c[b]) : Te(c[b]);
      S(
        null,
        O,
        f,
        h,
        y,
        m,
        g,
        C,
        v
      );
    }
  }, Lt = (c, f, h, y, m, g, C) => {
    const v = f.el = c.el;
    let { patchFlag: F, dynamicChildren: b, dirs: O } = f;
    F |= c.patchFlag & 16;
    const w = c.props || W, A = f.props || W;
    let E;
    if (h && Ze(h, !1), (E = A.onVnodeBeforeUpdate) && Se(E, h, f, c), O && Xe(f, c, h, "beforeUpdate"), h && Ze(h, !0), (w.innerHTML && A.innerHTML == null || w.textContent && A.textContent == null) && u(v, ""), b ? Ye(
      c.dynamicChildren,
      b,
      v,
      h,
      y,
      Dn(f, m),
      g
    ) : C || V(
      c,
      f,
      v,
      null,
      h,
      y,
      Dn(f, m),
      g,
      !1
    ), F > 0) {
      if (F & 16)
        ht(v, w, A, h, m);
      else if (F & 2 && w.class !== A.class && i(v, "class", null, A.class, m), F & 4 && i(v, "style", w.style, A.style, m), F & 8) {
        const I = f.dynamicProps;
        for (let q = 0; q < I.length; q++) {
          const L = I[q], J = w[L], Q = A[L];
          (Q !== J || L === "value") && i(v, L, J, Q, m, h);
        }
      }
      F & 1 && c.children !== f.children && u(v, f.children);
    } else !C && b == null && ht(v, w, A, h, m);
    ((E = A.onVnodeUpdated) || O) && ue(() => {
      E && Se(E, h, f, c), O && Xe(f, c, h, "updated");
    }, y);
  }, Ye = (c, f, h, y, m, g, C) => {
    for (let v = 0; v < f.length; v++) {
      const F = c[v], b = f[v], O = (
        // oldVNode may be an errored async setup() component inside Suspense
        // which will not have a mounted element
        F.el && // - In the case of a Fragment, we need to provide the actual parent
        // of the Fragment itself so it can move its children.
        (F.type === de || // - In the case of different nodes, there is going to be a replacement
        // which also requires the correct parent container
        !xt(F, b) || // - In the case of a component, it could contain anything.
        F.shapeFlag & 198) ? p(F.el) : (
          // In other cases, the parent container is not actually used so we
          // just pass the block element here to avoid a DOM parentNode call.
          h
        )
      );
      S(
        F,
        b,
        O,
        null,
        y,
        m,
        g,
        C,
        !0
      );
    }
  }, ht = (c, f, h, y, m) => {
    if (f !== h) {
      if (f !== W)
        for (const g in f)
          !Ct(g) && !(g in h) && i(
            c,
            g,
            f[g],
            null,
            m,
            y
          );
      for (const g in h) {
        if (Ct(g)) continue;
        const C = h[g], v = f[g];
        C !== v && g !== "value" && i(c, g, v, C, m, y);
      }
      "value" in h && i(c, "value", f.value, h.value, m);
    }
  }, Ht = (c, f, h, y, m, g, C, v, F) => {
    const b = f.el = c ? c.el : l(""), O = f.anchor = c ? c.anchor : l("");
    let { patchFlag: w, dynamicChildren: A, slotScopeIds: E } = f;
    E && (v = v ? v.concat(E) : E), c == null ? (r(b, h, y), r(O, h, y), Ve(
      // #10007
      // such fragment like `<></>` will be compiled into
      // a fragment which doesn't have a children.
      // In this case fallback to an empty array
      f.children || [],
      h,
      O,
      m,
      g,
      C,
      v,
      F
    )) : w > 0 && w & 64 && A && // #2715 the previous fragment could've been a BAILed one as a result
    // of renderSlot() with no valid children
    c.dynamicChildren && c.dynamicChildren.length === A.length ? (Ye(
      c.dynamicChildren,
      A,
      h,
      m,
      g,
      C,
      v
    ), // #2080 if the stable fragment has a key, it's a <template v-for> that may
    //  get moved around. Make sure all root level vnodes inherit el.
    // #2134 or if it's a component root, it may also get moved around
    // as the component is being moved.
    (f.key != null || m && f === m.subTree) && Qs(
      c,
      f,
      !0
      /* shallow */
    )) : V(
      c,
      f,
      h,
      O,
      m,
      g,
      C,
      v,
      F
    );
  }, qt = (c, f, h, y, m, g, C, v, F) => {
    f.slotScopeIds = v, c == null ? f.shapeFlag & 512 ? m.ctx.activate(
      f,
      h,
      y,
      C,
      F
    ) : Fn(
      f,
      h,
      y,
      m,
      g,
      C,
      F
    ) : mr(c, f, F);
  }, Fn = (c, f, h, y, m, g, C) => {
    const v = c.component = tl(
      c,
      y,
      m
    );
    if (Rs(c) && (v.ctx.renderer = mt), rl(v, !1, C), v.asyncDep) {
      if (m && m.registerDep(v, ne, C), !c.el) {
        const F = v.subTree = he(Ge);
        $(null, F, f, h), c.placeholder = F.el;
      }
    } else
      ne(
        v,
        c,
        f,
        h,
        m,
        g,
        C
      );
  }, mr = (c, f, h) => {
    const y = f.component = c.component;
    if (ko(c, f, h))
      if (y.asyncDep && !y.asyncResolved) {
        U(y, f, h);
        return;
      } else
        y.next = f, y.update();
    else
      f.el = c.el, y.vnode = f;
  }, ne = (c, f, h, y, m, g, C) => {
    const v = () => {
      if (c.isMounted) {
        let { next: w, bu: A, u: E, parent: I, vnode: q } = c;
        {
          const we = Xs(c);
          if (we) {
            w && (w.el = q.el, U(c, w, C)), we.asyncDep.then(() => {
              ue(() => {
                c.isUnmounted || b();
              }, m);
            });
            return;
          }
        }
        let L = w, J;
        Ze(c, !1), w ? (w.el = q.el, U(c, w, C)) : w = q, A && wn(A), (J = w.props && w.props.onVnodeBeforeUpdate) && Se(J, I, w, q), Ze(c, !0);
        const Q = kr(c), Ce = c.subTree;
        c.subTree = Q, S(
          Ce,
          Q,
          // parent may have changed if it's in a teleport
          p(Ce.el),
          // anchor may have changed if it's in a fragment
          Kt(Ce),
          c,
          m,
          g
        ), w.el = Q.el, L === null && Ro(c, Q.el), E && ue(E, m), (J = w.props && w.props.onVnodeUpdated) && ue(
          () => Se(J, I, w, q),
          m
        );
      } else {
        let w;
        const { el: A, props: E } = f, { bm: I, m: q, parent: L, root: J, type: Q } = c, Ce = Pt(f);
        Ze(c, !1), I && wn(I), !Ce && (w = E && E.onVnodeBeforeMount) && Se(w, L, f), Ze(c, !0);
        {
          J.ce && J.ce._hasShadowRoot() && J.ce._injectChildStyle(
            Q,
            c.parent ? c.parent.type : void 0
          );
          const we = c.subTree = kr(c);
          S(
            null,
            we,
            h,
            y,
            c,
            m,
            g
          ), f.el = we.el;
        }
        if (q && ue(q, m), !Ce && (w = E && E.onVnodeMounted)) {
          const we = f;
          ue(
            () => Se(w, L, we),
            m
          );
        }
        (f.shapeFlag & 256 || L && Pt(L.vnode) && L.vnode.shapeFlag & 256) && c.a && ue(c.a, m), c.isMounted = !0, f = h = y = null;
      }
    };
    c.scope.on();
    const F = c.effect = new fs(v);
    c.scope.off();
    const b = c.update = F.run.bind(F), O = c.job = F.runIfDirty.bind(F);
    O.i = c, O.id = c.uid, F.scheduler = () => cr(O), Ze(c, !0), b();
  }, U = (c, f, h) => {
    f.component = c;
    const y = c.vnode.props;
    c.vnode = f, c.next = null, $o(c, f.props, y, h), Ho(c, f.children, h), je(), Sr(c), Le();
  }, V = (c, f, h, y, m, g, C, v, F = !1) => {
    const b = c && c.children, O = c ? c.shapeFlag : 0, w = f.children, { patchFlag: A, shapeFlag: E } = f;
    if (A > 0) {
      if (A & 128) {
        Vt(
          b,
          w,
          h,
          y,
          m,
          g,
          C,
          v,
          F
        );
        return;
      } else if (A & 256) {
        Je(
          b,
          w,
          h,
          y,
          m,
          g,
          C,
          v,
          F
        );
        return;
      }
    }
    E & 8 ? (O & 16 && gt(b, m, g), w !== b && u(h, w)) : O & 16 ? E & 16 ? Vt(
      b,
      w,
      h,
      y,
      m,
      g,
      C,
      v,
      F
    ) : gt(b, m, g, !0) : (O & 8 && u(h, ""), E & 16 && Ve(
      w,
      h,
      y,
      m,
      g,
      C,
      v,
      F
    ));
  }, Je = (c, f, h, y, m, g, C, v, F) => {
    c = c || ct, f = f || ct;
    const b = c.length, O = f.length, w = Math.min(b, O);
    let A;
    for (A = 0; A < w; A++) {
      const E = f[A] = F ? Re(f[A]) : Te(f[A]);
      S(
        c[A],
        E,
        h,
        null,
        m,
        g,
        C,
        v,
        F
      );
    }
    b > O ? gt(
      c,
      m,
      g,
      !0,
      !1,
      w
    ) : Ve(
      f,
      h,
      y,
      m,
      g,
      C,
      v,
      F,
      w
    );
  }, Vt = (c, f, h, y, m, g, C, v, F) => {
    let b = 0;
    const O = f.length;
    let w = c.length - 1, A = O - 1;
    for (; b <= w && b <= A; ) {
      const E = c[b], I = f[b] = F ? Re(f[b]) : Te(f[b]);
      if (xt(E, I))
        S(
          E,
          I,
          h,
          null,
          m,
          g,
          C,
          v,
          F
        );
      else
        break;
      b++;
    }
    for (; b <= w && b <= A; ) {
      const E = c[w], I = f[A] = F ? Re(f[A]) : Te(f[A]);
      if (xt(E, I))
        S(
          E,
          I,
          h,
          null,
          m,
          g,
          C,
          v,
          F
        );
      else
        break;
      w--, A--;
    }
    if (b > w) {
      if (b <= A) {
        const E = A + 1, I = E < O ? f[E].el : y;
        for (; b <= A; )
          S(
            null,
            f[b] = F ? Re(f[b]) : Te(f[b]),
            h,
            I,
            m,
            g,
            C,
            v,
            F
          ), b++;
      }
    } else if (b > A)
      for (; b <= w; )
        ve(c[b], m, g, !0), b++;
    else {
      const E = b, I = b, q = /* @__PURE__ */ new Map();
      for (b = I; b <= A; b++) {
        const fe = f[b] = F ? Re(f[b]) : Te(f[b]);
        fe.key != null && q.set(fe.key, b);
      }
      let L, J = 0;
      const Q = A - I + 1;
      let Ce = !1, we = 0;
      const bt = new Array(Q);
      for (b = 0; b < Q; b++) bt[b] = 0;
      for (b = E; b <= w; b++) {
        const fe = c[b];
        if (J >= Q) {
          ve(fe, m, g, !0);
          continue;
        }
        let Ae;
        if (fe.key != null)
          Ae = q.get(fe.key);
        else
          for (L = I; L <= A; L++)
            if (bt[L - I] === 0 && xt(fe, f[L])) {
              Ae = L;
              break;
            }
        Ae === void 0 ? ve(fe, m, g, !0) : (bt[Ae - I] = b + 1, Ae >= we ? we = Ae : Ce = !0, S(
          fe,
          f[Ae],
          h,
          null,
          m,
          g,
          C,
          v,
          F
        ), J++);
      }
      const xr = Ce ? Wo(bt) : ct;
      for (L = xr.length - 1, b = Q - 1; b >= 0; b--) {
        const fe = I + b, Ae = f[fe], _r = f[fe + 1], Fr = fe + 1 < O ? (
          // #13559, #14173 fallback to el placeholder for unresolved async component
          _r.el || Zs(_r)
        ) : y;
        bt[b] === 0 ? S(
          null,
          Ae,
          h,
          Fr,
          m,
          g,
          C,
          v,
          F
        ) : Ce && (L < 0 || b !== xr[L] ? Qe(Ae, h, Fr, 2) : L--);
      }
    }
  }, Qe = (c, f, h, y, m = null) => {
    const { el: g, type: C, transition: v, children: F, shapeFlag: b } = c;
    if (b & 6) {
      Qe(c.component.subTree, f, h, y);
      return;
    }
    if (b & 128) {
      c.suspense.move(f, h, y);
      return;
    }
    if (b & 64) {
      C.move(c, f, h, mt);
      return;
    }
    if (C === de) {
      r(g, f, h);
      for (let w = 0; w < F.length; w++)
        Qe(F[w], f, h, y);
      r(c.anchor, f, h);
      return;
    }
    if (C === Bn) {
      R(c, f, h);
      return;
    }
    if (y !== 2 && b & 1 && v)
      if (y === 0)
        v.persisted && !g[En] ? r(g, f, h) : (v.beforeEnter(g), r(g, f, h), ue(() => v.enter(g), m));
      else {
        const { leave: w, delayLeave: A, afterLeave: E } = v, I = () => {
          c.ctx.isUnmounted ? s(g) : r(g, f, h);
        }, q = () => {
          const L = g._isLeaving || !!g[En];
          g._isLeaving && g[En](
            !0
            /* cancelled */
          ), v.persisted && !L ? I() : w(g, () => {
            I(), E && E();
          });
        };
        A ? A(g, I, q) : q();
      }
    else
      r(g, f, h);
  }, ve = (c, f, h, y = !1, m = !1) => {
    const {
      type: g,
      props: C,
      ref: v,
      children: F,
      dynamicChildren: b,
      shapeFlag: O,
      patchFlag: w,
      dirs: A,
      cacheIndex: E,
      memo: I
    } = c;
    if (w === -2 && (m = !1), v != null && (je(), St(v, null, h, c, !0), Le()), E != null && (f.renderCache[E] = void 0), O & 256) {
      f.ctx.deactivate(c);
      return;
    }
    const q = O & 1 && A, L = !Pt(c);
    let J;
    if (L && (J = C && C.onVnodeBeforeUnmount) && Se(J, f, c), O & 6)
      ai(c.component, h, y);
    else {
      if (O & 128) {
        c.suspense.unmount(h, y);
        return;
      }
      q && Xe(c, null, f, "beforeUnmount"), O & 64 ? c.type.remove(
        c,
        f,
        h,
        mt,
        y
      ) : b && // #5154
      // when v-once is used inside a block, setBlockTracking(-1) marks the
      // parent block with hasOnce: true
      // so that it doesn't take the fast path during unmount - otherwise
      // components nested in v-once are never unmounted.
      !b.hasOnce && // #1153: fast path should not be taken for non-stable (v-for) fragments
      (g !== de || w > 0 && w & 64) ? gt(
        b,
        f,
        h,
        !1,
        !0
      ) : (g === de && w & 384 || !m && O & 16) && gt(F, f, h), y && br(c);
    }
    const Q = I != null && E == null;
    (L && (J = C && C.onVnodeUnmounted) || q || Q) && ue(() => {
      J && Se(J, f, c), q && Xe(c, null, f, "unmounted"), Q && (c.el = null);
    }, h);
  }, br = (c) => {
    const { type: f, el: h, anchor: y, transition: m } = c;
    if (f === de) {
      ci(h, y);
      return;
    }
    if (f === Bn) {
      T(c);
      return;
    }
    const g = () => {
      s(h), m && !m.persisted && m.afterLeave && m.afterLeave();
    };
    if (c.shapeFlag & 1 && m && !m.persisted) {
      const { leave: C, delayLeave: v } = m, F = () => C(h, g);
      v ? v(c.el, g, F) : F();
    } else
      g();
  }, ci = (c, f) => {
    let h;
    for (; c !== f; )
      h = _(c), s(c), c = h;
    s(f);
  }, ai = (c, f, h) => {
    const { bum: y, scope: m, job: g, subTree: C, um: v, m: F, a: b } = c;
    $r(F), $r(b), y && wn(y), m.stop(), g && (g.flags |= 8, ve(C, c, f, h)), v && ue(v, f), ue(() => {
      c.isUnmounted = !0;
    }, f);
  }, gt = (c, f, h, y = !1, m = !1, g = 0) => {
    for (let C = g; C < c.length; C++)
      ve(c[C], f, h, y, m);
  }, Kt = (c) => {
    if (c.shapeFlag & 6)
      return Kt(c.component.subTree);
    if (c.shapeFlag & 128)
      return c.suspense.next();
    const f = _(c.anchor || c.el), h = f && f[so];
    return h ? _(h) : f;
  };
  let vn = !1;
  const yr = (c, f, h) => {
    let y;
    c == null ? f._vnode && (ve(f._vnode, null, null, !0), y = f._vnode.component) : S(
      f._vnode || null,
      c,
      f,
      null,
      null,
      null,
      h
    ), f._vnode = c, vn || (vn = !0, Sr(y), Ts(), vn = !1);
  }, mt = {
    p: S,
    um: ve,
    m: Qe,
    r: br,
    mt: Fn,
    mc: Ve,
    pc: V,
    pbc: Ye,
    n: Kt,
    o: e
  };
  return {
    render: yr,
    hydrate: void 0,
    createApp: Oo(yr)
  };
}
function Dn({ type: e, props: t }, n) {
  return n === "svg" && e === "foreignObject" || n === "mathml" && e === "annotation-xml" && t && t.encoding && t.encoding.includes("html") ? void 0 : n;
}
function Ze({ effect: e, job: t }, n) {
  n ? (e.flags |= 32, t.flags |= 4) : (e.flags &= -33, t.flags &= -5);
}
function Ko(e, t) {
  return (!e || e && !e.pendingBranch) && t && !t.persisted;
}
function Qs(e, t, n = !1) {
  const r = e.children, s = t.children;
  if (M(r) && M(s))
    for (let i = 0; i < r.length; i++) {
      const o = r[i];
      let l = s[i];
      l.shapeFlag & 1 && !l.dynamicChildren && ((l.patchFlag <= 0 || l.patchFlag === 32) && (l = s[i] = Re(s[i]), l.el = o.el), !n && l.patchFlag !== -2 && Qs(o, l)), l.type === _n && (l.patchFlag === -1 && (l = s[i] = Re(l)), l.el = o.el), l.type === Ge && !l.el && (l.el = o.el);
    }
}
function Wo(e) {
  const t = e.slice(), n = [0];
  let r, s, i, o, l;
  const a = e.length;
  for (r = 0; r < a; r++) {
    const d = e[r];
    if (d !== 0) {
      if (s = n[n.length - 1], e[s] < d) {
        t[r] = s, n.push(r);
        continue;
      }
      for (i = 0, o = n.length - 1; i < o; )
        l = i + o >> 1, e[n[l]] < d ? i = l + 1 : o = l;
      d < e[n[i]] && (i > 0 && (t[r] = n[i - 1]), n[i] = r);
    }
  }
  for (i = n.length, o = n[i - 1]; i-- > 0; )
    n[i] = o, o = t[o];
  return n;
}
function Xs(e) {
  const t = e.subTree.component;
  if (t)
    return t.asyncDep && !t.asyncResolved ? t : Xs(t);
}
function $r(e) {
  if (e)
    for (let t = 0; t < e.length; t++)
      e[t].flags |= 8;
}
function Zs(e) {
  if (e.placeholder)
    return e.placeholder;
  const t = e.component;
  return t ? Zs(t.subTree) : null;
}
const ei = (e) => e.__isSuspense;
function Uo(e, t) {
  t && t.pendingBranch ? M(e) ? t.effects.push(...e) : t.effects.push(e) : Xi(e);
}
const de = /* @__PURE__ */ Symbol.for("v-fgt"), _n = /* @__PURE__ */ Symbol.for("v-txt"), Ge = /* @__PURE__ */ Symbol.for("v-cmt"), Bn = /* @__PURE__ */ Symbol.for("v-stc"), Tt = [];
let pe = null;
function se(e = !1) {
  Tt.push(pe = e ? null : []);
}
function zo() {
  Tt.pop(), pe = Tt[Tt.length - 1] || null;
}
let kt = 1;
function sn(e, t = !1) {
  kt += e, e < 0 && pe && t && (pe.hasOnce = !0);
}
function ti(e) {
  return e.dynamicChildren = kt > 0 ? pe || ct : null, zo(), kt > 0 && pe && pe.push(e), e;
}
function ae(e, t, n, r, s, i) {
  return ti(
    Y(
      e,
      t,
      n,
      r,
      s,
      i,
      !0
    )
  );
}
function Go(e, t, n, r, s) {
  return ti(
    he(
      e,
      t,
      n,
      r,
      s,
      !0
    )
  );
}
function on(e) {
  return e ? e.__v_isVNode === !0 : !1;
}
function xt(e, t) {
  return e.type === t.type && e.key === t.key;
}
const ni = ({ key: e }) => e ?? null, Xt = ({
  ref: e,
  ref_key: t,
  ref_for: n
}) => (typeof e == "number" && (e = "" + e), e != null ? G(e) || /* @__PURE__ */ le(e) || B(e) ? { i: Ee, r: e, k: t, f: !!n } : e : null);
function Y(e, t = null, n = null, r = 0, s = null, i = e === de ? 0 : 1, o = !1, l = !1) {
  const a = {
    __v_isVNode: !0,
    __v_skip: !0,
    type: e,
    props: t,
    key: t && ni(t),
    ref: t && Xt(t),
    scopeId: Ms,
    slotScopeIds: null,
    children: n,
    component: null,
    suspense: null,
    ssContent: null,
    ssFallback: null,
    dirs: null,
    transition: null,
    el: null,
    anchor: null,
    target: null,
    targetStart: null,
    targetAnchor: null,
    staticCount: 0,
    shapeFlag: i,
    patchFlag: r,
    dynamicProps: s,
    dynamicChildren: null,
    appContext: null,
    ctx: Ee
  };
  return l ? (dr(a, n), i & 128 && e.normalize(a)) : n && (a.shapeFlag |= G(n) ? 8 : 16), kt > 0 && // avoid a block node from tracking itself
  !o && // has current parent block
  pe && // presence of a patch flag indicates this node needs patching on updates.
  // component nodes also should always be patched, because even if the
  // component doesn't need to update, it needs to persist the instance on to
  // the next vnode so that it can be properly unmounted later.
  (a.patchFlag > 0 || i & 6) && // the EVENTS flag is only for hydration and if it is the only flag, the
  // vnode should not be considered dynamic due to handler caching.
  a.patchFlag !== 32 && pe.push(a), a;
}
const he = Yo;
function Yo(e, t = null, n = null, r = 0, s = null, i = !1) {
  if ((!e || e === _o) && (e = Ge), on(e)) {
    const l = pt(
      e,
      t,
      !0
      /* mergeRef: true */
    );
    return n && dr(l, n), kt > 0 && !i && pe && (l.shapeFlag & 6 ? pe[pe.indexOf(e)] = l : pe.push(l)), l.patchFlag = -2, l;
  }
  if (ll(e) && (e = e.__vccOpts), t) {
    t = Jo(t);
    let { class: l, style: a } = t;
    l && !G(l) && (t.class = nt(l)), j(a) && (/* @__PURE__ */ lr(a) && !M(a) && (a = Z({}, a)), t.style = hn(a));
  }
  const o = G(e) ? 1 : ei(e) ? 128 : io(e) ? 64 : j(e) ? 4 : B(e) ? 2 : 0;
  return Y(
    e,
    t,
    n,
    r,
    s,
    o,
    i,
    !0
  );
}
function Jo(e) {
  return e ? /* @__PURE__ */ lr(e) || Ws(e) ? Z({}, e) : e : null;
}
function pt(e, t, n = !1, r = !1) {
  const { props: s, ref: i, patchFlag: o, children: l, transition: a } = e, d = t ? Xo(s || {}, t) : s, u = {
    __v_isVNode: !0,
    __v_skip: !0,
    type: e.type,
    props: d,
    key: d && ni(d),
    ref: t && t.ref ? (
      // #2078 in the case of <component :is="vnode" ref="extra"/>
      // if the vnode itself already has a ref, cloneVNode will need to merge
      // the refs so the single vnode can be set on multiple refs
      n && i ? M(i) ? i.concat(Xt(t)) : [i, Xt(t)] : Xt(t)
    ) : i,
    scopeId: e.scopeId,
    slotScopeIds: e.slotScopeIds,
    children: l,
    target: e.target,
    targetStart: e.targetStart,
    targetAnchor: e.targetAnchor,
    staticCount: e.staticCount,
    shapeFlag: e.shapeFlag,
    // if the vnode is cloned with extra props, we can no longer assume its
    // existing patch flag to be reliable and need to add the FULL_PROPS flag.
    // note: preserve flag for fragments since they use the flag for children
    // fast paths only.
    patchFlag: t && e.type !== de ? o === -1 ? 16 : o | 16 : o,
    dynamicProps: e.dynamicProps,
    dynamicChildren: e.dynamicChildren,
    appContext: e.appContext,
    dirs: e.dirs,
    transition: a,
    // These should technically only be non-null on mounted VNodes. However,
    // they *should* be copied for kept-alive vnodes. So we just always copy
    // them since them being non-null during a mount doesn't affect the logic as
    // they will simply be overwritten.
    component: e.component,
    suspense: e.suspense,
    ssContent: e.ssContent && pt(e.ssContent),
    ssFallback: e.ssFallback && pt(e.ssFallback),
    placeholder: e.placeholder,
    el: e.el,
    anchor: e.anchor,
    ctx: e.ctx,
    ce: e.ce
  };
  return a && r && ar(
    u,
    a.clone(u)
  ), u;
}
function Qo(e = " ", t = 0) {
  return he(_n, null, e, t);
}
function _t(e = "", t = !1) {
  return t ? (se(), Go(Ge, null, e)) : he(Ge, null, e);
}
function Te(e) {
  return e == null || typeof e == "boolean" ? he(Ge) : M(e) ? he(
    de,
    null,
    // #3666, avoid reference pollution when reusing vnode
    e.slice()
  ) : on(e) ? Re(e) : he(_n, null, String(e));
}
function Re(e) {
  return e.el === null && e.patchFlag !== -1 || e.memo ? e : pt(e);
}
function dr(e, t) {
  let n = 0;
  const { shapeFlag: r } = e;
  if (t == null)
    t = null;
  else if (M(t))
    n = 16;
  else if (typeof t == "object")
    if (r & 65) {
      const s = t.default;
      s && (s._c && (s._d = !1), dr(e, s()), s._c && (s._d = !0));
      return;
    } else {
      n = 32;
      const s = t._;
      !s && !Ws(t) ? t._ctx = Ee : s === 3 && Ee && (Ee.slots._ === 1 ? t._ = 1 : (t._ = 2, e.patchFlag |= 1024));
    }
  else B(t) ? (t = { default: t, _ctx: Ee }, n = 32) : (t = String(t), r & 64 ? (n = 16, t = [Qo(t)]) : n = 8);
  e.children = t, e.shapeFlag |= n;
}
function Xo(...e) {
  const t = {};
  for (let n = 0; n < e.length; n++) {
    const r = e[n];
    for (const s in r)
      if (s === "class")
        t.class !== r.class && (t.class = nt([t.class, r.class]));
      else if (s === "style")
        t.style = hn([t.style, r.style]);
      else if (un(s)) {
        const i = t[s], o = r[s];
        o && i !== o && !(M(i) && i.includes(o)) ? t[s] = i ? [].concat(i, o) : o : o == null && i == null && // mergeProps({ 'onUpdate:modelValue': undefined }) should not retain
        // the model listener.
        !fn(s) && (t[s] = o);
      } else s !== "" && (t[s] = r[s]);
  }
  return t;
}
function Se(e, t, n, r = null) {
  _e(e, t, 7, [
    n,
    r
  ]);
}
const Zo = Ls();
let el = 0;
function tl(e, t, n) {
  const r = e.type, s = (t ? t.appContext : e.appContext) || Zo, i = {
    uid: el++,
    vnode: e,
    type: r,
    parent: t,
    appContext: s,
    root: null,
    // to be immediately set
    next: null,
    subTree: null,
    // will be set synchronously right after creation
    effect: null,
    update: null,
    // will be set synchronously right after creation
    job: null,
    scope: new vi(
      !0
      /* detached */
    ),
    render: null,
    proxy: null,
    exposed: null,
    exposeProxy: null,
    withProxy: null,
    provides: t ? t.provides : Object.create(s.provides),
    ids: t ? t.ids : ["", 0, 0],
    accessCache: null,
    renderCache: [],
    // local resolved assets
    components: null,
    directives: null,
    // resolved props and emits options
    propsOptions: zs(r, s),
    emitsOptions: Hs(r, s),
    // emit
    emit: null,
    // to be set immediately
    emitted: null,
    // props default value
    propsDefaults: W,
    // inheritAttrs
    inheritAttrs: r.inheritAttrs,
    // state
    ctx: W,
    data: W,
    props: W,
    attrs: W,
    slots: W,
    refs: W,
    setupState: W,
    setupContext: null,
    // suspense related
    suspense: n,
    suspenseId: n ? n.pendingId : 0,
    asyncDep: null,
    asyncResolved: !1,
    // lifecycle hooks
    // not using enums here because it results in computed properties
    isMounted: !1,
    isUnmounted: !1,
    isDeactivated: !1,
    bc: null,
    c: null,
    bm: null,
    m: null,
    bu: null,
    u: null,
    um: null,
    bum: null,
    da: null,
    a: null,
    rtg: null,
    rtc: null,
    ec: null,
    sp: null
  };
  return i.ctx = { _: i }, i.root = t ? t.root : i, i.emit = Eo.bind(null, i), e.ce && e.ce(i), i;
}
let oe = null;
const nl = () => oe || Ee;
let ln, Yn;
{
  const e = pn(), t = (n, r) => {
    let s;
    return (s = e[n]) || (s = e[n] = []), s.push(r), (i) => {
      s.length > 1 ? s.forEach((o) => o(i)) : s[0](i);
    };
  };
  ln = t(
    "__VUE_INSTANCE_SETTERS__",
    (n) => oe = n
  ), Yn = t(
    "__VUE_SSR_SETTERS__",
    (n) => Rt = n
  );
}
const jt = (e) => {
  const t = oe;
  return ln(e), e.scope.on(), () => {
    e.scope.off(), ln(t);
  };
}, Nr = () => {
  oe && oe.scope.off(), ln(null);
};
function ri(e) {
  return e.vnode.shapeFlag & 4;
}
let Rt = !1;
function rl(e, t = !1, n = !1) {
  t && Yn(t);
  const { props: r, children: s } = e.vnode, i = ri(e);
  Io(e, r, i, t), Lo(e, s, n || t);
  const o = i ? sl(e, t) : void 0;
  return t && Yn(!1), o;
}
function sl(e, t) {
  const n = e.type;
  e.accessCache = /* @__PURE__ */ Object.create(null), e.proxy = new Proxy(e.ctx, Fo);
  const { setup: r } = n;
  if (r) {
    je();
    const s = e.setupContext = r.length > 1 ? ol(e) : null, i = jt(e), o = Nt(
      r,
      e,
      0,
      [
        e.props,
        s
      ]
    ), l = rs(o);
    if (Le(), i(), (l || e.sp) && !Pt(e) && ks(e), l) {
      if (o.then(Nr, Nr), t)
        return o.then((a) => {
          jr(e, a);
        }).catch((a) => {
          bn(a, e, 0);
        });
      e.asyncDep = o;
    } else
      jr(e, o);
  } else
    si(e);
}
function jr(e, t, n) {
  B(t) ? e.type.__ssrInlineRender ? e.ssrRender = t : e.render = t : j(t) && (e.setupState = Ss(t)), si(e);
}
function si(e, t, n) {
  const r = e.type;
  e.render || (e.render = r.render || Me);
  {
    const s = jt(e);
    je();
    try {
      vo(e);
    } finally {
      Le(), s();
    }
  }
}
const il = {
  get(e, t) {
    return te(e, "get", ""), e[t];
  }
};
function ol(e) {
  const t = (n) => {
    e.exposed = n || {};
  };
  return {
    attrs: new Proxy(e.attrs, il),
    slots: e.slots,
    emit: e.emit,
    expose: t
  };
}
function pr(e) {
  return e.exposed ? e.exposeProxy || (e.exposeProxy = new Proxy(Ss(qi(e.exposed)), {
    get(t, n) {
      if (n in t)
        return t[n];
      if (n in Ot)
        return Ot[n](e);
    },
    has(t, n) {
      return n in t || n in Ot;
    }
  })) : e.proxy;
}
function ll(e) {
  return B(e) && "__vccOpts" in e;
}
const ee = (e, t) => /* @__PURE__ */ Ui(e, t, Rt);
function Ke(e, t, n) {
  try {
    sn(-1);
    const r = arguments.length;
    return r === 2 ? j(t) && !M(t) ? on(t) ? he(e, null, [t]) : he(e, t) : he(e, null, t) : (r > 3 ? n = Array.prototype.slice.call(arguments, 2) : r === 3 && on(n) && (n = [n]), he(e, t, n));
  } finally {
    sn(1);
  }
}
const cl = "3.5.38";
let Jn;
const Lr = typeof window < "u" && window.trustedTypes;
if (Lr)
  try {
    Jn = /* @__PURE__ */ Lr.createPolicy("vue", {
      createHTML: (e) => e
    });
  } catch {
  }
const ii = Jn ? (e) => Jn.createHTML(e) : (e) => e, al = "http://www.w3.org/2000/svg", ul = "http://www.w3.org/1998/Math/MathML", ke = typeof document < "u" ? document : null, Hr = ke && /* @__PURE__ */ ke.createElement("template"), fl = {
  insert: (e, t, n) => {
    t.insertBefore(e, n || null);
  },
  remove: (e) => {
    const t = e.parentNode;
    t && t.removeChild(e);
  },
  createElement: (e, t, n, r) => {
    const s = t === "svg" ? ke.createElementNS(al, e) : t === "mathml" ? ke.createElementNS(ul, e) : n ? ke.createElement(e, { is: n }) : ke.createElement(e);
    return e === "select" && r && r.multiple != null && s.setAttribute("multiple", r.multiple), s;
  },
  createText: (e) => ke.createTextNode(e),
  createComment: (e) => ke.createComment(e),
  setText: (e, t) => {
    e.nodeValue = t;
  },
  setElementText: (e, t) => {
    e.textContent = t;
  },
  parentNode: (e) => e.parentNode,
  nextSibling: (e) => e.nextSibling,
  querySelector: (e) => ke.querySelector(e),
  setScopeId(e, t) {
    e.setAttribute(t, "");
  },
  // __UNSAFE__
  // Reason: innerHTML.
  // Static content here can only come from compiled templates.
  // As long as the user only uses trusted templates, this is safe.
  insertStaticContent(e, t, n, r, s, i) {
    const o = n ? n.previousSibling : t.lastChild;
    if (s && (s === i || s.nextSibling))
      for (; t.insertBefore(s.cloneNode(!0), n), !(s === i || !(s = s.nextSibling)); )
        ;
    else {
      Hr.innerHTML = ii(
        r === "svg" ? `<svg>${e}</svg>` : r === "mathml" ? `<math>${e}</math>` : e
      );
      const l = Hr.content;
      if (r === "svg" || r === "mathml") {
        const a = l.firstChild;
        for (; a.firstChild; )
          l.appendChild(a.firstChild);
        l.removeChild(a);
      }
      t.insertBefore(l, n);
    }
    return [
      // first
      o ? o.nextSibling : t.firstChild,
      // last
      n ? n.previousSibling : t.lastChild
    ];
  }
}, dl = /* @__PURE__ */ Symbol("_vtc");
function pl(e, t, n) {
  const r = e[dl];
  r && (t = (t ? [t, ...r] : [...r]).join(" ")), t == null ? e.removeAttribute("class") : n ? e.setAttribute("class", t) : e.className = t;
}
const qr = /* @__PURE__ */ Symbol("_vod"), hl = /* @__PURE__ */ Symbol("_vsh"), gl = /* @__PURE__ */ Symbol(""), ml = /(?:^|;)\s*display\s*:/;
function bl(e, t, n) {
  const r = e.style, s = G(n);
  let i = !1;
  if (n && !s) {
    if (t)
      if (G(t))
        for (const o of t.split(";")) {
          const l = o.slice(0, o.indexOf(":")).trim();
          n[l] == null && vt(r, l, "");
        }
      else
        for (const o in t)
          n[o] == null && vt(r, o, "");
    for (const o in n) {
      o === "display" && (i = !0);
      const l = n[o];
      l != null ? xl(
        e,
        o,
        !G(t) && t ? t[o] : void 0,
        l
      ) || vt(r, o, l) : vt(r, o, "");
    }
  } else if (s) {
    if (t !== n) {
      const o = r[gl];
      o && (n += ";" + o), r.cssText = n, i = ml.test(n);
    }
  } else t && e.removeAttribute("style");
  qr in e && (e[qr] = i ? r.display : "", e[hl] && (r.display = "none"));
}
const Vr = /\s*!important$/;
function vt(e, t, n) {
  if (M(n))
    n.forEach((r) => vt(e, t, r));
  else if (n == null && (n = ""), t.startsWith("--"))
    e.setProperty(t, n);
  else {
    const r = yl(e, t);
    Vr.test(n) ? e.setProperty(
      it(r),
      n.replace(Vr, ""),
      "important"
    ) : e[r] = n;
  }
}
const Kr = ["Webkit", "Moz", "ms"], kn = {};
function yl(e, t) {
  const n = kn[t];
  if (n)
    return n;
  let r = me(t);
  if (r !== "filter" && r in e)
    return kn[t] = r;
  r = os(r);
  for (let s = 0; s < Kr.length; s++) {
    const i = Kr[s] + r;
    if (i in e)
      return kn[t] = i;
  }
  return t;
}
function xl(e, t, n, r) {
  return e.tagName === "TEXTAREA" && (t === "width" || t === "height") && G(r) && n === r;
}
const Wr = "http://www.w3.org/1999/xlink";
function Ur(e, t, n, r, s, i = _i(t)) {
  r && t.startsWith("xlink:") ? n == null ? e.removeAttributeNS(Wr, t.slice(6, t.length)) : e.setAttributeNS(Wr, t, n) : n == null || i && !cs(n) ? e.removeAttribute(t) : e.setAttribute(
    t,
    i ? "" : De(n) ? String(n) : n
  );
}
function zr(e, t, n, r, s) {
  if (t === "innerHTML" || t === "textContent") {
    n != null && (e[t] = t === "innerHTML" ? ii(n) : n);
    return;
  }
  const i = e.tagName;
  if (t === "value" && i !== "PROGRESS" && // custom elements may use _value internally
  !i.includes("-")) {
    const l = i === "OPTION" ? e.getAttribute("value") || "" : e.value, a = n == null ? (
      // #11647: value should be set as empty string for null and undefined,
      // but <input type="checkbox"> should be set as 'on'.
      e.type === "checkbox" ? "on" : ""
    ) : String(n);
    (l !== a || !("_value" in e)) && (e.value = a), n == null && e.removeAttribute(t), e._value = n;
    return;
  }
  let o = !1;
  if (n === "" || n == null) {
    const l = typeof e[t];
    l === "boolean" ? n = cs(n) : n == null && l === "string" ? (n = "", o = !0) : l === "number" && (n = 0, o = !0);
  }
  try {
    e[t] = n;
  } catch {
  }
  o && e.removeAttribute(s || t);
}
function _l(e, t, n, r) {
  e.addEventListener(t, n, r);
}
function Fl(e, t, n, r) {
  e.removeEventListener(t, n, r);
}
const Gr = /* @__PURE__ */ Symbol("_vei");
function vl(e, t, n, r, s = null) {
  const i = e[Gr] || (e[Gr] = {}), o = i[t];
  if (r && o)
    o.value = r;
  else {
    const [l, a] = Cl(t);
    if (r) {
      const d = i[t] = Sl(
        r,
        s
      );
      _l(e, l, d, a);
    } else o && (Fl(e, l, o, a), i[t] = void 0);
  }
}
const Yr = /(?:Once|Passive|Capture)$/;
function Cl(e) {
  let t;
  if (Yr.test(e)) {
    t = {};
    let r;
    for (; r = e.match(Yr); )
      e = e.slice(0, e.length - r[0].length), t[r[0].toLowerCase()] = !0;
  }
  return [e[2] === ":" ? e.slice(3) : it(e.slice(2)), t];
}
let Rn = 0;
const wl = /* @__PURE__ */ Promise.resolve(), Al = () => Rn || (wl.then(() => Rn = 0), Rn = Date.now());
function Sl(e, t) {
  const n = (r) => {
    if (!r._vts)
      r._vts = Date.now();
    else if (r._vts <= n.attached)
      return;
    const s = n.value;
    if (M(s)) {
      const i = r.stopImmediatePropagation;
      r.stopImmediatePropagation = () => {
        i.call(r), r._stopped = !0;
      };
      const o = s.slice(), l = [r];
      for (let a = 0; a < o.length && !r._stopped; a++) {
        const d = o[a];
        d && _e(
          d,
          t,
          5,
          l
        );
      }
    } else
      _e(
        s,
        t,
        5,
        [r]
      );
  };
  return n.value = e, n.attached = Al(), n;
}
const Jr = (e) => e.charCodeAt(0) === 111 && e.charCodeAt(1) === 110 && // lowercase letter
e.charCodeAt(2) > 96 && e.charCodeAt(2) < 123, Pl = (e, t, n, r, s, i) => {
  const o = s === "svg";
  t === "class" ? pl(e, r, o) : t === "style" ? bl(e, n, r) : un(t) ? fn(t) || vl(e, t, n, r, i) : (t[0] === "." ? (t = t.slice(1), !0) : t[0] === "^" ? (t = t.slice(1), !1) : Ol(e, t, r, o)) ? (zr(e, t, r), !e.tagName.includes("-") && (t === "value" || t === "checked" || t === "selected") && Ur(e, t, r, o, i, t !== "value")) : /* #11081 force set props for possible async custom element */ e._isVueCE && // #12408 check if it's declared prop or it's async custom element
  (Tl(e, t) || // @ts-expect-error _def is private
  e._def.__asyncLoader && (/[A-Z]/.test(t) || !G(r))) ? zr(e, me(t), r, i, t) : (t === "true-value" ? e._trueValue = r : t === "false-value" && (e._falseValue = r), Ur(e, t, r, o));
};
function Ol(e, t, n, r) {
  if (r)
    return !!(t === "innerHTML" || t === "textContent" || t in e && Jr(t) && B(n));
  if (t === "spellcheck" || t === "draggable" || t === "translate" || t === "autocorrect" || t === "sandbox" && e.tagName === "IFRAME" || t === "form" || t === "list" && e.tagName === "INPUT" || t === "type" && e.tagName === "TEXTAREA")
    return !1;
  if (t === "width" || t === "height") {
    const s = e.tagName;
    if (s === "IMG" || s === "VIDEO" || s === "CANVAS" || s === "SOURCE")
      return !1;
  }
  return Jr(t) && G(n) ? !1 : t in e;
}
function Tl(e, t) {
  const n = (
    // @ts-expect-error _def is private
    e._def.props
  );
  if (!n)
    return !1;
  const r = me(t);
  return Array.isArray(n) ? n.some((s) => me(s) === r) : Object.keys(n).some((s) => me(s) === r);
}
const El = /* @__PURE__ */ Z({ patchProp: Pl }, fl);
let Qr;
function Ml() {
  return Qr || (Qr = qo(El));
}
const Dl = ((...e) => {
  const t = Ml().createApp(...e), { mount: n } = t;
  return t.mount = (r) => {
    const s = kl(r);
    if (!s) return;
    const i = t._component;
    !B(i) && !i.render && !i.template && (i.template = s.innerHTML), s.nodeType === 1 && (s.textContent = "");
    const o = n(s, !1, Bl(s));
    return s instanceof Element && (s.removeAttribute("v-cloak"), s.setAttribute("data-v-app", "")), o;
  }, t;
});
function Bl(e) {
  if (e instanceof SVGElement)
    return "svg";
  if (typeof MathMLElement == "function" && e instanceof MathMLElement)
    return "mathml";
}
function kl(e) {
  return G(e) ? document.querySelector(e) : e;
}
const Rl = /^#[0-9a-f]{6}$/i;
ge({ healthy: "#23B5A5", card: "#F7F9F7", cardForeground: "#07161D" }), ge({ healthy: "#3B8FD4", card: "#F2F4F3", cardForeground: "#07161D" }), ge({ healthy: "#5B6BD6", card: "#FAF7F0", cardForeground: "#07161D" }), ge({ healthy: "#46A8E9", card: "#F3F7FF", cardForeground: "#0A1428" }), ge({ healthy: "#D88A26", card: "#FAF3E8", cardForeground: "#24180E" }), ge({ healthy: "#1DB8C4", card: "#F0FBFC", cardForeground: "#062028" }), ge({ healthy: "#E85A4F", card: "#FFF5F3", cardForeground: "#2A0F14" }), ge({ healthy: "#2FAF7A", card: "#F3FFF8", cardForeground: "#06241A" }), ge({ healthy: "#7B6FD4", card: "#F7F4FF", cardForeground: "#161022" }), ge({ healthy: "#E09A2B", card: "#FFF8EB", cardForeground: "#2A1A08" }), ge({ healthy: "#3BA4D8", card: "#F2F9FF", cardForeground: "#0A1C2C" }), ge({ healthy: "#D46A9A", card: "#FFF1F7", cardForeground: "#2A0F1C" });
function cn(e) {
  const t = hr(e) || "#000000";
  return [1, 3, 5].map((n) => Number.parseInt(t.slice(n, n + 2), 16));
}
function oi(e) {
  return Math.round(Math.max(0, Math.min(255, e))).toString(16).padStart(2, "0").toUpperCase();
}
function hr(e) {
  return typeof e == "string" && Rl.test(e) ? e.toUpperCase() : null;
}
function an(e, t, n) {
  return Math.max(t, Math.min(n, Number.isFinite(e) ? e : t));
}
function Il(e) {
  const t = hr(e);
  if (!t) return null;
  const [n, r, s] = cn(t).map((p) => p / 255), i = Math.max(n, r, s), o = Math.min(n, r, s), l = i - o, a = (i + o) / 2;
  let d = 0;
  l > 0 && (i === n ? d = (r - s) / l % 6 : i === r ? d = (s - n) / l + 2 : d = (n - r) / l + 4, d *= 60, d < 0 && (d += 360));
  const u = l === 0 ? 0 : l / (1 - Math.abs(2 * a - 1));
  return { h: d, s: u * 100, l: a * 100 };
}
function Qn(e) {
  const t = (e.h % 360 + 360) % 360, n = an(e.s, 0, 100) / 100, r = an(e.l, 0, 100) / 100, s = (1 - Math.abs(2 * r - 1)) * n, i = t / 60, o = s * (1 - Math.abs(i % 2 - 1)), [l, a, d] = i < 1 ? [s, o, 0] : i < 2 ? [o, s, 0] : i < 3 ? [0, s, o] : i < 4 ? [0, o, s] : i < 5 ? [o, 0, s] : [s, 0, o], u = r - s / 2;
  return `#${[l, a, d].map((p) => oi((p + u) * 255)).join("")}`;
}
function $l(e, t, n = 4.5) {
  const r = hr(t), s = {
    h: (e.h % 360 + 360) % 360,
    s: an(e.s, 0, 100),
    l: an(e.l, 0, 100)
  };
  if (!r || Ne(Qn(s), r) >= n) return s;
  let i = null, o = Number.POSITIVE_INFINITY, l = 0;
  for (let a = 0; a <= 1e3; a += 1) {
    const d = a / 10, u = { ...s, l: d }, p = Ne(Qn(u), r);
    if (p < n) continue;
    const _ = Math.abs(d - s.l);
    (_ < o || _ === o && p > l) && (i = u, o = _, l = p);
  }
  return i || { ...s, l: Ne("#000000", r) >= Ne("#FFFFFF", r) ? 0 : 100 };
}
function xe(e, t, n) {
  const r = cn(e), s = cn(t), i = Math.max(0, Math.min(1, n));
  return `#${r.map((o, l) => oi(o + (s[l] - o) * i)).join("")}`;
}
function Gt(e) {
  const t = cn(e).map((n) => {
    const r = n / 255;
    return r <= 0.04045 ? r / 12.92 : ((r + 0.055) / 1.055) ** 2.4;
  });
  return t[0] * 0.2126 + t[1] * 0.7152 + t[2] * 0.0722;
}
function Ne(e, t) {
  const n = Math.max(Gt(e), Gt(t)), r = Math.min(Gt(e), Gt(t));
  return (n + 0.05) / (r + 0.05);
}
function Nl(e) {
  const t = "#07161D", n = "#F8FCFB";
  return Ne(e, t) >= Ne(e, n) ? t : n;
}
function In(e) {
  return Ne(e, "#000000") >= Ne(e, "#FFFFFF") ? "#000000" : "#FFFFFF";
}
function Xr(e, t, n) {
  let r = 0, s = 1;
  for (let i = 0; i < 18; i += 1) {
    const o = (r + s) / 2;
    Ne(e, xe(e, t, o)) >= n ? s = o : r = o;
  }
  return xe(e, t, Math.min(1, s + 0.035));
}
function ge(e) {
  return {
    surface: e.card,
    surfaceRaised: xe(e.card, e.cardForeground, 0.025),
    foreground: e.cardForeground,
    secondary: xe(e.card, e.cardForeground, 0.52),
    border: xe(e.card, e.cardForeground, 0.28),
    focus: e.healthy,
    accent: e.healthy,
    running: "#2F7CC0",
    pending: "#C6631A",
    ...jl(e)
  };
}
function jl(e) {
  return {
    codexQuota: Et(e.healthy, e.card, 0),
    claudeQuota: Et(e.healthy, e.card, 150)
  };
}
function Et(e, t, n) {
  const r = Il(e);
  return r ? Qn($l({ h: r.h + n, s: Math.max(r.s, 45), l: r.l }, t, 4.5)) : e;
}
function Ll(e, t) {
  return e <= 20 ? t.critical : e <= 50 ? t.warning : t.healthy;
}
function Hl(e, t, n = 100) {
  const r = t.water, s = Nl(r), i = Ll(n, t), o = t.warning, l = t.critical, a = "#2F7CC0", d = "#C6631A", u = xe(r, i, 0.56), p = xe(r, i, 0.68);
  return {
    style: e,
    surface: r,
    surfaceRaised: xe(r, s, 0.06),
    foreground: s,
    secondary: Xr(r, s, 4.5),
    border: Xr(r, s, 3),
    focus: i,
    accent: i,
    liquid: u,
    liquidCrest: p,
    warning: o,
    critical: l,
    running: a,
    pending: d,
    onAccent: In(i),
    onRunning: In(a),
    onPending: In(d),
    // The compact skin has no quota row; these keep the token set complete so a
    // shared stylesheet never resolves an undefined variable mid-transition.
    quotaCodex: Et(t.healthy, r, 0),
    quotaClaude: Et(t.healthy, r, 150),
    quotaCursor: Et(t.healthy, r, 255)
  };
}
function ql(e, t, n = 100, r = n) {
  const s = {
    static: ["0s", "0s"],
    slow: ["10s", "12s"],
    normal: ["6.4s", "7.8s"],
    fast: ["4.8s", "5.8s"]
  }, [i, o] = s[e.inner.motion], l = e.outer.colorMode === "quota" ? Hl("water", t, r).accent : e.outer.progressColor, a = xe(e.inner.fillColorB, t.healthy, 0.52), d = xe(e.inner.fillColorA, t.warning, 0.36), u = e.inner.palette === "solid" ? e.inner.fillColorA : e.inner.palette === "aurora" ? `linear-gradient(115deg, ${e.inner.fillColorA} 0%, ${e.inner.fillColorB} 52%, ${xe(e.inner.fillColorB, t.healthy, 0.28)} 100%)` : `linear-gradient(135deg, ${e.inner.fillColorA}, ${e.inner.fillColorB})`, p = e.outer.glow === "strong" ? `drop-shadow(0 0 5px ${l})` : e.outer.glow === "soft" ? `drop-shadow(0 0 2px ${l})` : "none";
  return {
    "--water-base": t.water,
    "--water-base-opacity": String(e.inner.baseOpacity / 100),
    "--water-fill": u,
    "--water-fill-color-a": e.inner.fillColorA,
    "--water-fill-color-b": e.inner.fillColorB,
    "--water-aurora-accent": a,
    "--water-aurora-glow": d,
    "--water-opacity": String(e.inner.opacity / 100),
    "--water-amplitude": `${e.inner.amplitude}px`,
    "--water-wave-a-duration": i,
    "--water-wave-b-duration": o,
    "--water-wave-a-delay": e.inner.motion === "static" ? "0s" : `-${Number.parseFloat(i) * 0.18}s`,
    "--water-wave-b-delay": e.inner.motion === "static" ? "0s" : `-${Number.parseFloat(o) * 0.57}s`,
    "--ring-width": String(e.outer.thickness),
    "--ring-progress": l,
    "--ring-track": e.outer.trackColor,
    "--ring-glow": p
  };
}
const Vl = ["codex", "claude", "cursor", "orca"], Kl = { codex: { id: "codex", label: "Codex", enabledByDefault: !0, taskKind: "codex-thread", relationMode: "exact", topologySources: ["app-server"], capabilities: ["open", "archive", "pause", "resume", "execute-plan", "topology"], pin: { inbound: !0, outbound: !0, appLabel: "Codex", pinNoun: "置顶" } }, claude: { id: "claude", label: "Claude", enabledByDefault: !1, taskKind: "claude-session", relationMode: "exact", topologySources: ["hooks"], capabilities: ["open", "archive", "topology"], pin: { inbound: !0, outbound: !1, appLabel: "Claude App", pinNoun: "星标" } }, cursor: { id: "cursor", label: "Cursor", enabledByDefault: !1, taskKind: "cursor-session", relationMode: "exact", topologySources: ["hooks", "inventory"], capabilities: ["open", "archive", "topology"], pin: { inbound: !0, outbound: !1, appLabel: "Cursor", pinNoun: "置顶" } }, orca: { id: "orca", label: "Orca", enabledByDefault: !1, taskKind: "orca-session", relationMode: "exact", topologySources: ["inventory"], capabilities: ["open", "archive", "topology"], pin: { inbound: !0, outbound: !0, appLabel: "Orca", pinNoun: "置顶" } } }, It = {
  order: Vl,
  providers: Kl
}, gr = Object.freeze(
  It.order.filter((e) => e in It.providers)
);
Object.freeze(Object.fromEntries(
  gr.map((e) => [e, It.providers[e].label])
));
Object.freeze(Object.fromEntries(
  gr.map((e) => [e, Object.freeze({ ...It.providers[e].pin })])
));
Object.freeze(Object.fromEntries(
  gr.map((e) => [e, It.providers[e].enabledByDefault])
));
function Wl(e, t) {
  return e?.kind === "weekly" ? e : t?.kind === "weekly" ? t : null;
}
const Ul = ["role", "aria-hidden", "aria-label"], zl = {
  class: "codex-water-ball__surface",
  "aria-hidden": "true"
}, Gl = {
  key: 0,
  class: "codex-water-ball__liquid"
}, Yl = {
  key: 0,
  class: "codex-water-ball__ring",
  viewBox: "0 0 100 100",
  "aria-hidden": "true"
}, Jl = ["transform"], Ql = {
  key: 0,
  class: "codex-water-ball__grid",
  "aria-hidden": "true"
}, Xl = ["title"], Zl = { class: "codex-water-ball__grid-label" }, ec = { class: "codex-water-ball__grid-value" }, tc = {
  key: 0,
  class: "codex-water-ball__spark",
  "aria-hidden": "true"
}, nc = {
  key: 1,
  class: "codex-water-ball__pair"
}, rc = { key: 2 }, sc = {
  key: 3,
  class: "codex-water-ball__percent-source"
}, $n = "M0 12 C12.5 0 37.5 0 50 12 S87.5 24 100 12 C112.5 0 137.5 0 150 12 S187.5 24 200 12 L200 24 L0 24 Z", ic = /* @__PURE__ */ oo({
  __name: "CodexWaterBall",
  props: {
    primary: {},
    secondary: {},
    stateLabel: {},
    label: {},
    appearance: {},
    colors: {},
    taskCount: { default: 0 },
    signal: { default: "quiet" },
    decorative: { type: Boolean, default: !1 },
    percentOverride: { default: null },
    scopedPercent: { default: null },
    percentProviderLabel: { default: "" },
    liquidPercent: { default: null },
    ringPercent: { default: null },
    quotaGrid: { default: null }
  },
  setup(e) {
    const t = e, n = ee(() => t.primary?.bucket.remainingPercent ?? 0), r = ee(() => typeof t.liquidPercent == "number" && Number.isFinite(t.liquidPercent)), s = ee(() => r.value ? t.liquidPercent : n.value), i = ee(() => typeof t.percentOverride == "number" && Number.isFinite(t.percentOverride)), o = ee(() => i.value ? t.percentOverride : t.primary?.bucket.remainingPercent ?? null), l = ee(() => i.value && typeof t.scopedPercent == "number" && Number.isFinite(t.scopedPercent) ? { scoped: t.scopedPercent, primary: t.percentOverride } : null), a = ee(() => Array.isArray(t.quotaGrid) && t.quotaGrid.length === 4), d = ee(() => Wl(t.primary, t.secondary)), u = ee(() => typeof t.ringPercent == "number" && Number.isFinite(t.ringPercent)), p = ee(() => u.value ? t.ringPercent : d.value?.bucket.remainingPercent ?? 0), _ = ee(() => d.value !== null || u.value), x = ee(() => Math.ceil(p.value / 5)), D = ee(() => t.appearance.inner.percentTextStyle === "bold" || t.appearance.inner.percentTextStyle === "bold-italic"), S = ee(() => t.appearance.inner.percentTextStyle === "italic" || t.appearance.inner.percentTextStyle === "bold-italic"), k = ee(() => ({
      ...ql(t.appearance, t.colors, s.value, _.value ? p.value : s.value),
      "--water-level": `${s.value}%`,
      "--weekly-ring": String(p.value),
      "--water-percent-size": `${t.appearance.inner.percentSize}px`,
      "--water-percent-color": t.appearance.inner.percentColor,
      "--water-percent-font-weight": D.value ? "700" : "400",
      "--water-percent-font-style": S.value ? "italic" : "normal"
    }));
    return ($, P) => (se(), ae("div", {
      class: nt(["codex-water-ball", [`palette-${e.appearance.inner.palette}`, `ring-${e.appearance.outer.style}`, `motion-${e.appearance.inner.motion}`, `signal-${e.signal}`]]),
      style: hn(k.value),
      role: e.decorative ? void 0 : "img",
      "aria-hidden": e.decorative ? "true" : void 0,
      "aria-label": e.decorative ? void 0 : e.label
    }, [
      Y("div", zl, [
        P[1] || (P[1] = Y(
          "i",
          { class: "refraction refraction-a" },
          null,
          -1
          /* CACHED */
        )),
        P[2] || (P[2] = Y(
          "i",
          { class: "refraction refraction-b" },
          null,
          -1
          /* CACHED */
        )),
        s.value > 0 ? (se(), ae("div", Gl, [
          P[0] || (P[0] = Y(
            "i",
            { class: "liquid-base" },
            null,
            -1
            /* CACHED */
          )),
          Y("svg", {
            class: "liquid-wave wave-a",
            viewBox: "0 0 200 24",
            preserveAspectRatio: "none"
          }, [
            Y("path", { d: $n })
          ]),
          Y("svg", {
            class: "liquid-wave wave-b",
            viewBox: "0 0 200 24",
            preserveAspectRatio: "none"
          }, [
            Y("path", { d: $n })
          ]),
          Y("svg", {
            class: "liquid-wave wave-c",
            viewBox: "0 0 200 24",
            preserveAspectRatio: "none"
          }, [
            Y("path", { d: $n })
          ])
        ])) : _t("v-if", !0),
        P[3] || (P[3] = Y(
          "i",
          { class: "glass-highlight" },
          null,
          -1
          /* CACHED */
        ))
      ]),
      _.value ? (se(), ae("svg", Yl, [
        e.appearance.outer.style === "segmented" ? (se(), ae(
          de,
          { key: 0 },
          Tr(20, (R) => Y("line", {
            key: R,
            class: nt(["segment", { active: R <= x.value }]),
            x1: "50",
            y1: "5",
            x2: "50",
            y2: "11",
            transform: `rotate(${(R - 1) * 18} 50 50)`
          }, null, 10, Jl)),
          64
          /* STABLE_FRAGMENT */
        )) : (se(), ae(
          de,
          { key: 1 },
          [
            P[4] || (P[4] = Y(
              "circle",
              {
                class: "track",
                cx: "50",
                cy: "50",
                r: "45"
              },
              null,
              -1
              /* CACHED */
            )),
            P[5] || (P[5] = Y(
              "circle",
              {
                class: "value",
                cx: "50",
                cy: "50",
                r: "45"
              },
              null,
              -1
              /* CACHED */
            ))
          ],
          64
          /* STABLE_FRAGMENT */
        ))
      ])) : _t("v-if", !0),
      !e.primary || e.appearance.inner.showPercent ? (se(), ae(
        "div",
        {
          key: 1,
          class: nt(["codex-water-ball__value", [`percent-${e.appearance.inner.percentPosition}`, { empty: !e.primary && !i.value }]])
        },
        [
          a.value ? (se(), ae("div", Ql, [
            (se(!0), ae(
              de,
              null,
              Tr(e.quotaGrid, (R) => (se(), ae("div", {
                key: R.key,
                class: nt(["codex-water-ball__grid-cell", [`kind-${R.kind}`]]),
                title: R.detail
              }, [
                Y(
                  "span",
                  Zl,
                  et(R.label),
                  1
                  /* TEXT */
                ),
                Y(
                  "strong",
                  ec,
                  et(R.text),
                  1
                  /* TEXT */
                )
              ], 10, Xl))),
              128
              /* KEYED_FRAGMENT */
            ))
          ])) : (se(), ae(
            de,
            { key: 1 },
            [
              e.primary?.family === "spark" && !r.value ? (se(), ae("span", tc, "S")) : _t("v-if", !0),
              l.value ? (se(), ae("strong", nc, [
                Y(
                  "span",
                  null,
                  et(l.value.scoped),
                  1
                  /* TEXT */
                ),
                P[6] || (P[6] = Y(
                  "i",
                  { "aria-hidden": "true" },
                  "/",
                  -1
                  /* CACHED */
                )),
                Y(
                  "span",
                  null,
                  et(l.value.primary),
                  1
                  /* TEXT */
                )
              ])) : (se(), ae(
                "strong",
                rc,
                et(o.value === null ? e.stateLabel : `${o.value}%`),
                1
                /* TEXT */
              )),
              i.value && e.percentProviderLabel ? (se(), ae(
                "em",
                sc,
                et(e.percentProviderLabel),
                1
                /* TEXT */
              )) : _t("v-if", !0)
            ],
            64
            /* STABLE_FRAGMENT */
          ))
        ],
        2
        /* CLASS */
      )) : _t("v-if", !0)
    ], 14, Ul));
  }
}), oc = (e, t) => {
  const n = e.__vccOpts || e;
  for (const [r, s] of t)
    n[r] = s;
  return n;
}, Zr = /* @__PURE__ */ oc(ic, [["__scopeId", "data-v-f4d5a474"]]), lc = {
  enabled: !1,
  status: "idle",
  updatedAt: 0,
  cells: [],
  ariaSuffix: ""
};
function cc(e) {
  return Math.max(0, Math.min(100, Math.round(e)));
}
function ac(e) {
  return typeof e == "number" && Number.isFinite(e) ? e : null;
}
function Nn(e, t) {
  return Array.isArray(e) ? e.find((n) => n?.provider === t) ?? null : null;
}
function Yt(e, t) {
  const n = e?.windows;
  if (!Array.isArray(n)) return null;
  const r = n.find((i) => i?.name === t), s = ac(r?.remaining);
  return s === null ? null : cc(s);
}
function li(e) {
  if (typeof e != "string") return null;
  const t = e.trim().match(/([\d,.]+)/);
  if (!t) return null;
  const n = Number(t[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}
function uc(e) {
  const t = li(e);
  if (t === null) return "—";
  if (t >= 1e4) {
    const n = t / 1e4;
    return `${n >= 10 ? Math.round(n) : n.toFixed(1).replace(/\.0$/, "")}W`;
  }
  if (t >= 1e3) {
    const n = t / 1e3;
    return `${n >= 10 ? Math.round(n) : n.toFixed(1).replace(/\.0$/, "")}k`;
  }
  return t % 1 === 0 ? String(t) : t.toFixed(1);
}
function fc(e) {
  return Array.isArray(e) ? e : e && typeof e == "object" && Array.isArray(e.data) ? e.data : [];
}
function Jt(e, t, n) {
  return { key: e, label: t, kind: "missing", percent: null, text: "—", detail: n };
}
function jn(e, t, n, r) {
  return { key: e, label: t, kind: "percent", percent: n, text: String(n), detail: r };
}
function dc(e, t = {}) {
  if (!(t.enabled === !0)) return lc;
  const r = t.status || "idle", s = t.updatedAt || 0, i = fc(e), o = Nn(i, "codex"), l = Nn(i, "grok"), a = Nn(i, "cursor"), d = Yt(o, "7 days"), u = Yt(l, "7 days"), p = Yt(a, "Cursor Models"), _ = Yt(a, "Other Models"), x = o?.balance ?? null, D = uc(x), S = li(x), k = d === 0 && S !== null ? {
    key: "token",
    label: "Token",
    kind: "token",
    percent: null,
    text: D,
    detail: typeof x == "string" ? `Codex Token 余量 ${x}` : `Codex Token 余量 ${D}`
  } : d === null ? Jt("token", "Token", "Codex 周额度暂不可用") : {
    key: "token",
    label: "额度",
    kind: "placeholder",
    percent: null,
    text: "—",
    detail: "Codex 周额度由外圈显示"
  }, $ = u === null ? Jt("grok", "Grok", "Grok 7 天额度暂不可用") : jn("grok", "Grok", u, `Grok 7 天剩余 ${u}%`), P = p === null ? Jt("cursor-models", "C", "Cursor Models 额度暂不可用") : jn("cursor-models", "C", p, `Cursor Models 剩余 ${p}%`), R = _ === null ? Jt("cursor-other", "O", "Cursor Other Models 额度暂不可用") : jn("cursor-other", "O", _, `Cursor Other Models 剩余 ${_}%`), T = [k, $, P, R], z = T.filter((ce) => ce.kind !== "placeholder").map((ce) => ce.detail);
  return {
    enabled: !0,
    status: r,
    updatedAt: s,
    ...t.errorMessage ? { errorMessage: t.errorMessage } : {},
    cells: T,
    ariaSuffix: z.length ? `，${z.join("；")}` : ""
  };
}
const pc = [
  { id: "base", name: "球体与高光", x: -70, y: -24, z: -55 },
  { id: "liquid", name: "三层水波", x: 70, y: 18, z: 35 },
  { id: "track", name: "外环轨道", x: -44, y: -74, z: 4 },
  { id: "ring", name: "额度外环", x: 56, y: -72, z: 78 },
  { id: "reading", name: "中心额度", x: 0, y: 76, z: 115 }
];
function es(e, t) {
  return Number.isFinite(t) ? { kind: e, family: "normal", label: e === "weekly" ? "Weekly" : "5h", longLabel: e === "weekly" ? "周限额" : "5 小时限额", limitName: "", bucket: { remainingPercent: t } } : null;
}
function gc(e, t) {
  const n = /* @__PURE__ */ mn({ visible: !0, expanded: [], selected: null, hovered: null, colors: {}, params: {}, sizes: {}, sources: {}, magpie: null, quota: null, claude: null, counts: null, yaw: 0, pitch: 0 });
  let r = null;
  function s() {
    const u = n.params, p = n.colors, _ = n.sources.Codex ? n.quota : null, x = es("weekly", _?.weekly), D = es(_?.primaryKind || "short", _?.primary), S = dc(n.magpie, { enabled: n.sources.Magpie === !0, status: n.magpie ? "ok" : "loading" }), k = n.sources.Claude && !n.sources.Codex && n.claude?.status === "fresh";
    return {
      primary: D,
      secondary: D?.kind === "short" ? x : null,
      stateLabel: "暂无额度",
      label: "实际水球样式预览",
      decorative: !0,
      appearance: { inner: { palette: u.palette, fillColorA: p.liquid, fillColorB: u.fillColorB, opacity: u.opacity, amplitude: u.amplitude, motion: u.motion, baseOpacity: u.baseOpacity, showPercent: u.showPercent, percentPosition: u.percentPosition, percentSize: u.percentSize, percentTextStyle: u.percentTextStyle, percentColor: p.reading }, outer: { style: u.ringStyle, thickness: u.ringThickness, colorMode: u.colorMode, progressColor: p.ring, trackColor: p.track, glow: u.glow } },
      colors: { healthy: p.healthy, warning: p.warning, critical: p.critical, water: p.base, card: p.card, cardForeground: p.ink },
      quotaGrid: S.enabled ? S.cells : null,
      percentOverride: k ? n.claude.primary : null,
      liquidPercent: k ? n.claude.primary : null,
      ringPercent: k ? n.claude.weekly : null
    };
  }
  function i(u) {
    const p = u.target;
    return p instanceof Element ? p.closest(".codex-water-ball__value") ? "reading" : p.closest(".codex-water-ball__ring") ? "ring" : p.closest(".codex-water-ball__liquid") ? "liquid" : p.closest(".codex-water-ball") ? "base" : null : null;
  }
  function o(u) {
    u.button === 0 && (r = { x: u.clientX, y: u.clientY, yaw: n.yaw, pitch: n.pitch, moved: !1, id: u.target.closest?.("[data-part]")?.dataset.part || i(u) }, u.currentTarget.setPointerCapture(u.pointerId));
  }
  function l(u) {
    if (r) {
      const _ = u.clientX - r.x, x = u.clientY - r.y;
      Math.hypot(_, x) > 4 && (r.moved = !0), r.moved && t.rotate(r.yaw + _ * 6e-3, Math.max(-0.8, Math.min(0.8, r.pitch - x * 6e-3)));
      return;
    }
    const p = u.target.closest?.("[data-part]")?.dataset.part || i(u);
    t.hover(p || null);
  }
  function a(u) {
    if (r) {
      if (!r.moved) {
        const p = r.id;
        p && t.select(p);
      }
      r = null;
    }
  }
  const d = Dl({ render() {
    if (!n.visible) return null;
    const u = n.expanded.length > 0, p = u ? pc.map((x) => {
      const D = n.expanded.includes(x.id), S = { transform: `translate3d(${D ? x.x : 0}px,${D ? x.y : 0}px,${D ? x.z : 0}px) scale(${(n.sizes[x.id] || 100) / 100})` }, k = s(), $ = D && (x.id === "liquid" && !(k.liquidPercent ?? k.primary?.bucket?.remainingPercent) || x.id === "ring" && !(k.ringPercent ?? (k.primary?.kind === "weekly" ? k.primary?.bucket?.remainingPercent : k.secondary?.bucket?.remainingPercent)));
      return $ && x.id === "liquid" && (k.liquidPercent = 62), $ && x.id === "ring" && (k.ringPercent = 62), Ke("div", { class: ["real-ball-layer", "layer-" + x.id, { selected: n.selected === x.id, hovered: n.hovered === x.id }], style: S, "data-part": x.id }, [Ke(Zr, k), D ? Ke("button", { class: "real-ball-chip", type: "button", "data-part": x.id, onClick: (P) => {
        P.stopPropagation(), t.select(x.id);
      } }, x.name + ($ ? " · 示例" : "")) : null]);
    }) : [Ke("div", { class: ["real-ball-complete", n.selected ? "selected-" + n.selected : "", n.hovered ? "hovered-" + n.hovered : ""] }, [Ke(Zr, s())])], _ = n.counts ? ["input", "active", "unread"].filter((x) => n.counts[x] > 0).map((x) => Ke("button", { class: ["real-counter", x], "data-part": x, style: { background: n.colors[x] }, onClick: (D) => {
      D.stopPropagation(), t.select(x);
    } }, String(n.counts[x]))) : [];
    return Ke("div", { class: "real-ball-stage", onPointerdown: o, onPointermove: l, onPointerup: a, onPointercancel: () => {
      r = null;
    }, onPointerleave: () => t.hover(null), onDblclick: (x) => {
      x.preventDefault(), t.toggle();
    } }, [Ke("div", { class: ["real-ball-scene", { exploded: u }], style: { transform: `rotateX(${n.pitch}rad) rotateY(${n.yaw}rad)` } }, [...p, ..._])]);
  } });
  return d.mount(e), { update(u) {
    Object.assign(n, u);
  }, destroy() {
    d.unmount();
  } };
}
export {
  gc as mountRealBall
};
