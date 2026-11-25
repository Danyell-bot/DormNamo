/* ==========================================================
   argon2id.js - Argon2id password hashing (RFC 9106), pure JavaScript
   No libraries or network needed. Defaults follow OWASP guidance:
   19 MiB memory, 2 passes, 1 lane, 32-byte tag.
   Verified against the reference implementation (see README).
   ========================================================== */
var Argon2id = (function () {
  var DEFAULTS = { m: 19456, t: 2 }; // m is in KiB

  // ---------- BLAKE2b (BigInt; only used for a few small hashes) ----------
  var MASK = (1n << 64n) - 1n;
  var IV = [
    0x6a09e667f3bcc908n,
    0xbb67ae8584caa73bn,
    0x3c6ef372fe94f82bn,
    0xa54ff53a5f1d36f1n,
    0x510e527fade682d1n,
    0x9b05688c2b3e6c1fn,
    0x1f83d9abfb41bd6bn,
    0x5be0cd19137e2179n,
  ];
  var SIGMA = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    [14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3],
    [11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4],
    [7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8],
    [9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13],
    [2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9],
    [12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11],
    [13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10],
    [6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5],
    [10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0],
  ];

  function rotr(x, n) {
    return ((x >> n) | (x << (64n - n))) & MASK;
  }

  function blake2b(data, outLen) {
    var h = IV.slice();
    h[0] ^= 0x01010000n ^ BigInt(outLen);
    var blocks = Math.max(1, Math.ceil(data.length / 128)),
      t = 0n;
    for (var b = 0; b < blocks; b++) {
      var chunk = data.subarray(b * 128, Math.min(data.length, (b + 1) * 128));
      var buf = new Uint8Array(128);
      buf.set(chunk);
      t += BigInt(chunk.length);
      var m = [],
        v = h.concat(IV),
        i,
        r;
      for (i = 0; i < 16; i++) {
        var w = 0n;
        for (var k = 7; k >= 0; k--) w = (w << 8n) | BigInt(buf[i * 8 + k]);
        m.push(w);
      }
      v[12] ^= t & MASK;
      if (b === blocks - 1) v[14] ^= MASK;
      for (r = 0; r < 12; r++) {
        var s = SIGMA[r % 10];
        var g = function (a, b2, c, d, x, y) {
          v[a] = (v[a] + v[b2] + x) & MASK;
          v[d] = rotr(v[d] ^ v[a], 32n);
          v[c] = (v[c] + v[d]) & MASK;
          v[b2] = rotr(v[b2] ^ v[c], 24n);
          v[a] = (v[a] + v[b2] + y) & MASK;
          v[d] = rotr(v[d] ^ v[a], 16n);
          v[c] = (v[c] + v[d]) & MASK;
          v[b2] = rotr(v[b2] ^ v[c], 63n);
        };
        g(0, 4, 8, 12, m[s[0]], m[s[1]]);
        g(1, 5, 9, 13, m[s[2]], m[s[3]]);
        g(2, 6, 10, 14, m[s[4]], m[s[5]]);
        g(3, 7, 11, 15, m[s[6]], m[s[7]]);
        g(0, 5, 10, 15, m[s[8]], m[s[9]]);
        g(1, 6, 11, 12, m[s[10]], m[s[11]]);
        g(2, 7, 8, 13, m[s[12]], m[s[13]]);
        g(3, 4, 9, 14, m[s[14]], m[s[15]]);
      }
      for (i = 0; i < 8; i++) h[i] ^= v[i] ^ v[i + 8];
    }
    var out = new Uint8Array(64);
    for (var i2 = 0; i2 < 64; i2++) out[i2] = Number((h[i2 >> 3] >> BigInt(8 * (i2 & 7))) & 255n);
    return out.slice(0, outLen);
  }

  function le32(x) {
    return new Uint8Array([x & 255, (x >>> 8) & 255, (x >>> 16) & 255, (x >>> 24) & 255]);
  }
  function cat() {
    var parts = Array.prototype.slice.call(arguments),
      n = 0,
      o = 0;
    parts.forEach(function (p) {
      n += p.length;
    });
    var out = new Uint8Array(n);
    parts.forEach(function (p) {
      out.set(p, o);
      o += p.length;
    });
    return out;
  }

  /** Argon2's variable-length hash H' */
  function hprime(input, T) {
    var pre = cat(le32(T), input);
    if (T <= 64) return blake2b(pre, T);
    var r = Math.ceil(T / 32) - 2,
      out = new Uint8Array(T),
      v = blake2b(pre, 64);
    out.set(v.subarray(0, 32), 0);
    for (var i = 1; i < r; i++) {
      v = blake2b(v, 64);
      out.set(v.subarray(0, 32), i * 32);
    }
    out.set(blake2b(v, T - 32 * r), 32 * r);
    return out;
  }

  // ---------- 64-bit math on pairs of 32-bit words (fast path) ----------
  // A block is 1024 bytes = 256 Uint32 values; 64-bit word k = [2k] (low), [2k+1] (high).
  function mulHi(a, b) {
    // high 32 bits of a*b
    var a0 = a & 65535,
      a1 = a >>> 16,
      b0 = b & 65535,
      b1 = b >>> 16;
    var mid = a0 * b1 + a1 * b0 + ((a0 * b0) >>> 16);
    return (a1 * b1 + Math.floor(mid / 65536)) >>> 0;
  }
  function mulAdd(R, x, y) {
    // R[x] = R[x] + R[y] + 2 * lo(R[x]) * lo(R[y])
    var xl = R[2 * x],
      xh = R[2 * x + 1],
      yl = R[2 * y],
      yh = R[2 * y + 1];
    var a0 = xl & 65535,
      a1 = xl >>> 16,
      b0 = yl & 65535,
      b1 = yl >>> 16;
    var p00 = a0 * b0,
      mid = a0 * b1 + a1 * b0 + (p00 >>> 16);
    var pl = (((mid & 65535) << 16) | (p00 & 65535)) >>> 0;
    var ph = (a1 * b1 + Math.floor(mid / 65536)) >>> 0;
    var dl = (pl << 1) >>> 0,
      dh = ((ph << 1) | (pl >>> 31)) >>> 0;
    var l = xl + yl + dl;
    R[2 * x] = l >>> 0;
    R[2 * x + 1] = (xh + yh + dh + Math.floor(l / 4294967296)) >>> 0;
  }
  function xorRot(R, d, a, n) {
    // R[d] = rotr64(R[d] ^ R[a], n)
    var l = R[2 * d] ^ R[2 * a],
      h = R[2 * d + 1] ^ R[2 * a + 1],
      nl,
      nh,
      t;
    if (n >= 32) {
      t = l;
      l = h;
      h = t;
      n -= 32;
    }
    if (n === 0) {
      nl = l;
      nh = h;
    } else {
      nl = (l >>> n) | (h << (32 - n));
      nh = (h >>> n) | (l << (32 - n));
    }
    R[2 * d] = nl >>> 0;
    R[2 * d + 1] = nh >>> 0;
  }
  function gb(R, a, b, c, d) {
    mulAdd(R, a, b);
    xorRot(R, d, a, 32);
    mulAdd(R, c, d);
    xorRot(R, b, c, 24);
    mulAdd(R, a, b);
    xorRot(R, d, a, 16);
    mulAdd(R, c, d);
    xorRot(R, b, c, 63);
  }
  function round16(R, v) {
    // one BLAKE2 round on 16 word indices
    gb(R, v[0], v[4], v[8], v[12]);
    gb(R, v[1], v[5], v[9], v[13]);
    gb(R, v[2], v[6], v[10], v[14]);
    gb(R, v[3], v[7], v[11], v[15]);
    gb(R, v[0], v[5], v[10], v[15]);
    gb(R, v[1], v[6], v[11], v[12]);
    gb(R, v[2], v[7], v[8], v[13]);
    gb(R, v[3], v[4], v[9], v[14]);
  }
  var R = new Uint32Array(256),
    TMP = new Uint32Array(256),
    IDX = new Array(16);

  /** out = G(A, B) (xored into the old out when xorOut is set) */
  function compress(out, o, A, a, B, b, xorOut) {
    var k, i, j;
    for (k = 0; k < 256; k++) {
      R[k] = A[a + k] ^ B[b + k];
      TMP[k] = R[k];
    }
    if (xorOut) for (k = 0; k < 256; k++) TMP[k] ^= out[o + k];
    for (i = 0; i < 8; i++) {
      for (j = 0; j < 16; j++) IDX[j] = 16 * i + j;
      round16(R, IDX);
    }
    for (i = 0; i < 8; i++) {
      for (j = 0; j < 8; j++) {
        IDX[2 * j] = 2 * i + 16 * j;
        IDX[2 * j + 1] = 2 * i + 16 * j + 1;
      }
      round16(R, IDX);
    }
    for (k = 0; k < 256; k++) out[o + k] = TMP[k] ^ R[k];
  }

  /** Raw 32-byte Argon2id tag. password: string, salt: Uint8Array */
  function raw(password, salt, o) {
    var m = o.m,
      t = o.t,
      pw = new TextEncoder().encode(password);
    var h0 = blake2b(
      cat(
        le32(1),
        le32(32),
        le32(m),
        le32(t),
        le32(0x13),
        le32(2),
        le32(pw.length),
        pw,
        le32(salt.length),
        salt,
        le32(0),
        le32(0),
      ),
      64,
    );
    var mp = 4 * Math.floor(m / 4),
      seg = mp / 4,
      mem = new Uint32Array(mp * 256);
    function put(n, bytes) {
      mem.set(new Uint32Array(bytes.buffer, 0, 256), n * 256);
    }
    put(0, hprime(cat(h0, le32(0), le32(0)), 1024));
    put(1, hprime(cat(h0, le32(1), le32(0)), 1024));

    var addr = new Uint32Array(256),
      inp = new Uint32Array(256),
      zero = new Uint32Array(256);
    function nextAddr() {
      inp[12]++;
      compress(addr, 0, zero, 0, inp, 0, false);
      compress(addr, 0, zero, 0, addr, 0, false);
    }

    for (var pass = 0; pass < t; pass++) {
      for (var slice = 0; slice < 4; slice++) {
        var indep = pass === 0 && slice < 2; // Argon2id: data-independent first half
        if (indep) {
          inp.fill(0);
          inp[0] = pass;
          inp[4] = slice;
          inp[6] = mp;
          inp[8] = t;
          inp[10] = 2;
        }
        var start = pass === 0 && slice === 0 ? 2 : 0;
        if (indep && start) nextAddr();
        for (var i = start; i < seg; i++) {
          var cur = slice * seg + i,
            prev = cur === 0 ? mp - 1 : cur - 1,
            j1;
          if (indep) {
            if (i % 128 === 0) nextAddr();
            j1 = addr[2 * (i % 128)];
          } else j1 = mem[prev * 256];
          var area = pass === 0 ? (slice === 0 ? i - 1 : slice * seg + i - 1) : mp - seg + i - 1;
          var rel = area - 1 - mulHi(area, mulHi(j1, j1));
          var first = pass === 0 ? 0 : slice === 3 ? 0 : (slice + 1) * seg;
          compress(mem, cur * 256, mem, prev * 256, mem, ((first + rel) % mp) * 256, pass > 0);
        }
      }
    }
    var last = new Uint8Array(1024),
      view = new Uint32Array(last.buffer);
    view.set(mem.subarray((mp - 1) * 256, mp * 256));
    return hprime(last, 32);
  }

  // ---------- PHC string helpers ----------
  function b64(bytes) {
    var s = "";
    bytes.forEach(function (b) {
      s += String.fromCharCode(b);
    });
    return btoa(s).replace(/=+$/, "");
  }
  function unb64(str) {
    var s = atob(str),
      o = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) o[i] = s.charCodeAt(i);
    return o;
  }
  function later(fn) {
    return new Promise(function (res) {
      setTimeout(function () {
        res(fn());
      }, 30);
    });
  } // let the UI repaint first

  return {
    raw: raw,
    /** -> Promise of "$argon2id$v=19$m=...,t=...,p=1$salt$hash" */
    hash: function (password, opts) {
      var o = { m: (opts && opts.m) || DEFAULTS.m, t: (opts && opts.t) || DEFAULTS.t };
      var salt = crypto.getRandomValues(new Uint8Array(16));
      return later(function () {
        return (
          "$argon2id$v=19$m=" + o.m + ",t=" + o.t + ",p=1$" + b64(salt) + "$" + b64(raw(password, salt, o))
        );
      });
    },
    /** -> Promise of true/false */
    verify: function (password, encoded) {
      var p = encoded.split("$"); // ["", "argon2id", "v=19", "m=..,t=..,p=1", salt, hash]
      if (p[1] !== "argon2id") return Promise.resolve(false);
      var m = /m=(\d+),t=(\d+)/.exec(p[3]);
      return later(function () {
        var got = raw(password, unb64(p[4]), { m: +m[1], t: +m[2] }),
          want = unb64(p[5]),
          diff = got.length ^ want.length;
        for (var i = 0; i < got.length; i++) diff |= got[i] ^ want[i];
        return diff === 0;
      });
    },
    needsRehash: function (encoded) {
      return encoded.indexOf("m=" + DEFAULTS.m + ",t=" + DEFAULTS.t + ",") < 0;
    },
  };
})();
