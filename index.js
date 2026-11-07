// 酷狗音乐概念版 (Kugou Lite) plugin for MyGo Music.
// Protocol details follow MakcRe/KuGouMusicApi (MIT) with platform=lite,
// and the daily VIP claim follows develop202/kgcheckin.

const APPID = 3116;
const CLIENTVER = 11440;
const SRCAPPID = 2919;
const SALT = "LnT6xpN3khm36zse0QzvmgTZ3waWdRSA"; // lite android signature salt
const WEB_SALT = "NVPh5oo715z5DIWAeQlhMDsWXXQV4hwt";
const KEY_SALT = "185672dd44712f60bb1736df5a377e82"; // lite song url key salt
const GATEWAY = "https://gateway.kugou.com";
const LIKES = "https://mlike.kugou.com"; // comment likes answer here, not on the gateway
const LIKE_SALT = "949ad1dac503e48ad6e86bb841383485"; // the salt the comment page signs its likes with
const UA = "Android15-1070-11083-46-0-DiscoveryDRADProtocol-wifi";
const WEB_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const PAGE = 100;
const SEARCH_PAGE = 30;
// lite RSA public key (1024 bit)
const RSA_N = BigInt(
  "0xc40a2d0da76511f3bb1cc2bbd3afbd8bea83b4d6b05b6c13eb8920c53f1af7679b32ba0d0edb843240ef1b836efed3ee240734c14c1399fd6594d16af22f52525d14d72e0155c6dcc8638d4f7bb94f3a0b1f4c29f991972f2a160a25eb0a9e724336be7f69bbd319ffab1c6dd8470b021dc434f3faba89f4a2a01b33bdbdd08b",
);
const RSA_E = 65537n;
const RSA_LEN = 128;

// ----------------------------------------------------------------- text ----

function tr(text, values) {
  const translated = host.t(text);
  if (!values) return translated;
  return translated.replace(/\{(\w+)\}/g, (token, key) =>
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : token);
}
function fail(code, message) {
  return Object.assign(new Error(message || code), { code });
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function offsetOf(value = 0) {
  if (!Number.isSafeInteger(value) || value < 0) throw fail("unavailable", tr("Invalid page offset"));
  return value;
}
let retryID = 0;
function retrySection(title, page, error) {
  const target = `${page}${page.includes("?") ? "&" : "?"}retry=${++retryID}`;
  return {
    title,
    links: [{
      title: tr("Retry"),
      subtitle: error instanceof Error ? error.message : String(error),
      page: target,
    }],
  };
}

// ---------------------------------------------------------------- bytes ----

const enc = new TextEncoder();
const dec = new TextDecoder();
const utf8 = (s) => enc.encode(s);
const unutf8 = (b) => dec.decode(b);
const toHex = (b) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
function fromHex(h) {
  const out = new Uint8Array(h.length >> 1);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}
function toB64(b) {
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}
function fromB64(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const md5 = (s) => host.crypto.md5(s);
function randomString(len = 16) {
  const chars = "1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let s = "";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// ------------------------------------------------------------------ AES ----
// A small AES (128/192/256) with CBC and PKCS#7, since the host only offers ECB.

const SBOX = new Uint8Array(256);
const INV = new Uint8Array(256);
(() => {
  let p = 1, q = 1;
  do {
    p = p ^ ((p << 1) & 0xff) ^ (p & 0x80 ? 0x1b : 0);
    q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 0xff;
    if (q & 0x80) q ^= 0x09;
    const x = q ^ ((q << 1) | (q >> 7)) ^ ((q << 2) | (q >> 6)) ^ ((q << 3) | (q >> 5)) ^ ((q << 4) | (q >> 4));
    SBOX[p] = (x ^ 0x63) & 0xff;
  } while (p !== 1);
  SBOX[0] = 0x63;
  for (let i = 0; i < 256; i++) INV[SBOX[i]] = i;
})();
const xt = (a) => ((a << 1) ^ (a & 0x80 ? 0x1b : 0)) & 0xff;
const mul = (a, b) => { let r = 0; while (b) { if (b & 1) r ^= a; a = xt(a); b >>= 1; } return r; };

function expandKey(key) {
  const nk = key.length / 4, nr = nk + 6, w = new Uint8Array(16 * (nr + 1));
  w.set(key);
  let rcon = 1;
  for (let i = nk; i < 4 * (nr + 1); i++) {
    let t0 = w[4 * i - 4], t1 = w[4 * i - 3], t2 = w[4 * i - 2], t3 = w[4 * i - 1];
    if (i % nk === 0) {
      [t0, t1, t2, t3] = [SBOX[t1] ^ rcon, SBOX[t2], SBOX[t3], SBOX[t0]];
      rcon = xt(rcon);
    } else if (nk > 6 && i % nk === 4) {
      t0 = SBOX[t0]; t1 = SBOX[t1]; t2 = SBOX[t2]; t3 = SBOX[t3];
    }
    const j = 4 * (i - nk);
    w[4 * i] = w[j] ^ t0; w[4 * i + 1] = w[j + 1] ^ t1; w[4 * i + 2] = w[j + 2] ^ t2; w[4 * i + 3] = w[j + 3] ^ t3;
  }
  return { w, nr };
}
function encBlock(s, { w, nr }) {
  for (let i = 0; i < 16; i++) s[i] ^= w[i];
  for (let r = 1; r <= nr; r++) {
    for (let i = 0; i < 16; i++) s[i] = SBOX[s[i]];
    let t = s[1]; s[1] = s[5]; s[5] = s[9]; s[9] = s[13]; s[13] = t;
    t = s[2]; s[2] = s[10]; s[10] = t; t = s[6]; s[6] = s[14]; s[14] = t;
    t = s[3]; s[3] = s[15]; s[15] = s[11]; s[11] = s[7]; s[7] = t;
    if (r !== nr) for (let c = 0; c < 16; c += 4) {
      const a0 = s[c], a1 = s[c + 1], a2 = s[c + 2], a3 = s[c + 3], x = a0 ^ a1 ^ a2 ^ a3;
      s[c] ^= x ^ xt(a0 ^ a1); s[c + 1] ^= x ^ xt(a1 ^ a2); s[c + 2] ^= x ^ xt(a2 ^ a3); s[c + 3] ^= x ^ xt(a3 ^ a0);
    }
    for (let i = 0; i < 16; i++) s[i] ^= w[16 * r + i];
  }
}
function decBlock(s, { w, nr }) {
  for (let i = 0; i < 16; i++) s[i] ^= w[16 * nr + i];
  for (let r = nr - 1; r >= 0; r--) {
    let t = s[13]; s[13] = s[9]; s[9] = s[5]; s[5] = s[1]; s[1] = t;
    t = s[2]; s[2] = s[10]; s[10] = t; t = s[6]; s[6] = s[14]; s[14] = t;
    t = s[3]; s[3] = s[7]; s[7] = s[11]; s[11] = s[15]; s[15] = t;
    for (let i = 0; i < 16; i++) s[i] = INV[s[i]];
    for (let i = 0; i < 16; i++) s[i] ^= w[16 * r + i];
    if (r !== 0) for (let c = 0; c < 16; c += 4) {
      const a0 = s[c], a1 = s[c + 1], a2 = s[c + 2], a3 = s[c + 3];
      s[c] = mul(a0, 14) ^ mul(a1, 11) ^ mul(a2, 13) ^ mul(a3, 9);
      s[c + 1] = mul(a0, 9) ^ mul(a1, 14) ^ mul(a2, 11) ^ mul(a3, 13);
      s[c + 2] = mul(a0, 13) ^ mul(a1, 9) ^ mul(a2, 14) ^ mul(a3, 11);
      s[c + 3] = mul(a0, 11) ^ mul(a1, 13) ^ mul(a2, 9) ^ mul(a3, 14);
    }
  }
}
function aesCbcEncrypt(data, key, iv) {
  const k = expandKey(key), pad = 16 - (data.length % 16);
  const out = new Uint8Array(data.length + pad);
  out.set(data); out.fill(pad, data.length);
  let prev = iv;
  for (let o = 0; o < out.length; o += 16) {
    const b = out.subarray(o, o + 16);
    for (let i = 0; i < 16; i++) b[i] ^= prev[i];
    encBlock(b, k);
    prev = b;
  }
  return out;
}
function aesCbcDecrypt(data, key, iv) {
  const k = expandKey(key), out = new Uint8Array(data.length);
  let prev = iv;
  for (let o = 0; o < data.length; o += 16) {
    const b = data.slice(o, o + 16);
    decBlock(b, k);
    for (let i = 0; i < 16; i++) out[o + i] = b[i] ^ prev[i];
    prev = data.subarray(o, o + 16);
  }
  const pad = out[out.length - 1];
  return pad > 0 && pad <= 16 ? out.subarray(0, out.length - pad) : out;
}

// The two AES schemes Kugou uses. In both, the key and iv are the UTF-8 bytes
// of hex strings.
function aesEncrypt(data, opt = {}) {
  const text = typeof data === "string" ? data : JSON.stringify(data);
  if (opt.key && opt.iv) return toHex(aesCbcEncrypt(utf8(text), utf8(opt.key), utf8(opt.iv)));
  const temp = opt.key || randomString(16).toLowerCase();
  const key = md5(temp).substring(0, 32);
  const iv = key.substring(16);
  return { str: toHex(aesCbcEncrypt(utf8(text), utf8(key), utf8(iv))), key: temp };
}
function aesDecrypt(hex, temp) {
  const key = md5(temp).substring(0, 32);
  const text = unutf8(aesCbcDecrypt(fromHex(hex), utf8(key), utf8(key.substring(16))));
  try { return JSON.parse(text); } catch { return text; }
}
function playlistAesEncrypt(data) {
  const text = typeof data === "string" ? data : JSON.stringify(data);
  const temp = randomString(6).toLowerCase();
  const h = md5(temp);
  return { key: temp, str: toB64(aesCbcEncrypt(utf8(text), utf8(h.substring(0, 16)), utf8(h.substring(16)))) };
}
function playlistAesDecrypt(bytes, temp) {
  const h = md5(temp);
  const text = unutf8(aesCbcDecrypt(bytes, utf8(h.substring(0, 16)), utf8(h.substring(16))));
  try { return JSON.parse(text); } catch { return text; }
}

// ------------------------------------------------------------------ RSA ----

function modPow(b, e, m) {
  let r = 1n; b %= m;
  while (e > 0n) { if (e & 1n) r = (r * b) % m; b = (b * b) % m; e >>= 1n; }
  return r;
}
const bytesToBig = (b) => BigInt("0x" + (toHex(b) || "0"));
// Raw RSA over the data padded with zeros on the right to the key's length.
function rsaRaw(data) {
  const b = utf8(typeof data === "string" ? data : JSON.stringify(data));
  const padded = new Uint8Array(RSA_LEN);
  padded.set(b);
  return modPow(bytesToBig(padded), RSA_E, RSA_N).toString(16).padStart(RSA_LEN * 2, "0");
}
// RSA with PKCS#1 v1.5 padding.
function rsaPkcs1(data) {
  const b = utf8(typeof data === "string" ? data : JSON.stringify(data));
  const m = new Uint8Array(RSA_LEN);
  m[1] = 2;
  const ps = RSA_LEN - 3 - b.length;
  for (let i = 0; i < ps; i++) m[2 + i] = 1 + Math.floor(Math.random() * 255);
  m.set(b, RSA_LEN - b.length);
  return modPow(bytesToBig(m), RSA_E, RSA_N).toString(16).padStart(RSA_LEN * 2, "0");
}

// -------------------------------------------------------------- session ----

const state = { epoch: 0 };
const load = (k, d) => host.storage.get(k) ?? d;
const save = (k, v) => host.storage.set(k, v);
const session = () => load("session", null);
// Today in China, where Kugou's day turns.
const today = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

let listsCache = null;
const names = new Map();
const commentPools = new Map(); // song id → comment pool id, for likes
function resetSession() {
  state.epoch++;
  listsCache = null;
  names.clear();
  commentPools.clear();
  for (const key of ["session", "profile", "vip", "vipInfo", "liked", "recent", "smsSent", "smsUsed"])
    host.storage.remove(key);
}
// What a request started for an account that has since changed must not write.
function still(generation) {
  if (generation !== state.epoch) throw new Error(tr("The account changed. Reload this page."));
}
function needSession() {
  const s = session();
  if (!s) throw fail("signIn", tr("Sign in to Kugou first"));
  return s;
}
const forgetLists = () => { listsCache = null; };

function device() {
  let d = load("device", null);
  if (!d) {
    const guid = md5(randomString(32) + Date.now());
    d = {
      guid,
      mid: BigInt("0x" + md5(guid)).toString(),
      dev: randomString(10),
      mac: "02:00:00:00:00:00",
      dfid: "-",
    };
    save("device", d);
  }
  return d;
}

// ------------------------------------------------------------- requests ----

function signAndroid(params, body) {
  const s = Object.keys(params).sort()
    .map((k) => `${k}=${typeof params[k] === "object" ? JSON.stringify(params[k]) : params[k]}`).join("");
  return md5(`${SALT}${s}${body || ""}${SALT}`);
}
function signWeb(params, body) {
  const s = Object.keys(params).map((k) => `${k}=${params[k]}`).sort().join("");
  return md5(`${WEB_SALT}${s}${body || ""}${WEB_SALT}`);
}

// A request that never answers leaves the page it belongs to waiting forever.
const TIMEOUT = 15000;
async function send(url, options = {}) {
  if (typeof AbortController !== "function") return fetch(url, options);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError" || error?.name === "TimeoutError")
      throw fail("unavailable", tr("Kugou did not answer in time"));
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function kgHeaders(d, clienttime, extra = {}) {
  return {
    "User-Agent": UA, dfid: d.dfid, clienttime: String(clienttime), mid: d.mid,
    "kg-rc": "1", "kg-thash": "5d816a0", "kg-rec": "1", "kg-rf": "B9EDA08A64250DEFFBCADDEE00F8F25F",
    ...extra,
  };
}
const asQuery = (params) =>
  Object.keys(params).map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join("&");

async function request({
  method = "GET", base = GATEWAY, path, params = {}, data, headers = {},
  sign = "android", clearDefault = false, encryptKey = false, binary = false, anonymous = false,
}) {
  const d = device();
  const s = anonymous ? null : session();
  const clienttime = Math.floor(Date.now() / 1000);
  const p = clearDefault ? { ...params } : {
    dfid: d.dfid, mid: d.mid, uuid: "-", appid: APPID, clientver: CLIENTVER, clienttime,
    ...(s?.token ? { token: s.token } : {}),
    ...(s?.userid ? { userid: s.userid } : {}),
    ...params,
  };
  if (encryptKey) p.key = md5(`${p.hash}${KEY_SALT}${p.appid}${p.mid}${p.userid || 0}`);
  const body = data == null ? "" : typeof data === "string" ? data : JSON.stringify(data);
  if (!p.signature && sign) p.signature = sign === "web" ? signWeb(p, body) : signAndroid(p, body);
  const h = kgHeaders(d, p.clienttime ?? clienttime, headers);
  if (data != null && !Object.keys(h).some((k) => k.toLowerCase() === "content-type")) {
    h["Content-Type"] = typeof data === "string" ? "application/x-www-form-urlencoded" : "application/json";
  }
  const res = await send(`${base}${path}?${asQuery(p)}`, {
    method, headers: h, body: method === "GET" ? undefined : body,
  });
  if (binary) return new Uint8Array(await res.arrayBuffer());
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { status: 0, error: text.slice(0, 200), http: res.status }; }
}

// The cloud playlist service takes an AES body and answers with one.
async function cloudRequest(path, data) {
  const d = device();
  const s = session() || {};
  const clienttime = Math.floor(Date.now() / 1000);
  const key6 = randomString(6).toLowerCase();
  const h = md5(key6);
  const key = h.substring(0, 16), iv = h.substring(16);
  const body = aesCbcEncrypt(utf8(JSON.stringify(data)), utf8(key), utf8(iv));
  const p = {
    appid: APPID, clientver: CLIENTVER, mid: d.mid, clienttime,
    key: md5(`${APPID}${SALT}${CLIENTVER}${clienttime}`), dfid: d.dfid,
    p: rsaPkcs1({ aes: key6, uid: s.userid || 0, token: s.token || "" }).toUpperCase(),
  };
  const res = await send(`${GATEWAY}${path}?${asQuery(p)}`, {
    method: "POST",
    headers: kgHeaders(d, clienttime, { "Content-Type": "application/json;charset=utf-8", "x-router": "cloudlist.service.kugou.com" }),
    body,
  });
  const raw = new Uint8Array(await res.arrayBuffer());
  return cloudAnswer(raw, key, iv);
}

// The older cloudlist form: the same AES body, but sent as base64 text with the
// usual Android signature over the query. /v2/delete_list answers only to this.
async function cloudLegacy(path, data) {
  const me = needSession();
  const d = device();
  const clienttime = Math.floor(Date.now() / 1000);
  const key6 = randomString(6).toLowerCase();
  const h = md5(key6);
  const key = h.substring(0, 16), iv = h.substring(16);
  const body = toB64(aesCbcEncrypt(utf8(JSON.stringify(data)), utf8(key), utf8(iv)));
  const p = {
    dfid: d.dfid, mid: d.mid, uuid: "-", appid: APPID, clientver: CLIENTVER, clienttime,
    token: me.token, userid: me.userid,
    key: md5(`${APPID}${SALT}${CLIENTVER}${clienttime}`), last_area: "gztx", last_time: clienttime,
    p: rsaPkcs1({ aes: key6, uid: me.userid, token: me.token }).toUpperCase(),
  };
  p.signature = signAndroid(p, body);
  const res = await send(`${GATEWAY}${path}?${asQuery(p)}`, {
    method: "POST",
    headers: kgHeaders(d, clienttime, { "Content-Type": "application/json;charset=utf-8", "x-router": "cloudlist.service.kugou.com" }),
    body,
  });
  return cloudAnswer(new Uint8Array(await res.arrayBuffer()), key, iv);
}

// The answer is encrypted only when it's a whole number of blocks, and a
// refusal comes back as plain JSON, which decrypting would turn to noise.
function cloudAnswer(raw, key, iv) {
  let text = "";
  if (raw.length % 16 === 0) {
    try {
      const opened = unutf8(aesCbcDecrypt(raw, utf8(key), utf8(iv)));
      if (opened.trimStart().startsWith("{")) text = opened;
    } catch { /* not encrypted */ }
  }
  if (!text) text = unutf8(raw);
  try { return JSON.parse(text); } catch { return { status: 0, error: text.slice(0, 200) }; }
}

const ok = (r) => r && r.status !== 0 && !(r.error_code && r.error_code !== 0);
function must(r, what) {
  if (ok(r)) return r;
  const code = r?.error_code ?? r?.errcode;
  if (code === 20018 || code === 51002) throw fail("signIn", tr("Kugou signed you out. Sign in again"));
  const detail = r?.error_msg || r?.error || r?.errmsg || r?.msg || (typeof r?.data === "string" ? r.data : "");
  throw fail("", detail ? tr("{what} failed: {message}", { what, message: detail }) : tr("{what} failed", { what }));
}

// Registers this device for a dfid, which the song URLs need.
async function ensureDfid() {
  const d = device();
  if (d.dfid && d.dfid !== "-") return d;
  const s = session();
  const info = {
    availableRamSize: 4983533568, availableRomSize: 48114719, availableSDSize: 48114717, basebandVer: "",
    batteryLevel: 100, batteryStatus: 3, brand: "Redmi", buildSerial: "unknown", device: "marble",
    imei: d.guid, imsi: "", manufacturer: "Xiaomi", uuid: d.guid,
    accelerometer: false, accelerometerValue: "", gravity: false, gravityValue: "", gyroscope: false, gyroscopeValue: "",
    light: false, lightValue: "", magnetic: false, magneticValue: "", orientation: false, orientationValue: "",
    pressure: false, pressureValue: "", step_counter: false, step_counterValue: "", temperature: false, temperatureValue: "",
  };
  const encrypted = playlistAesEncrypt(info);
  const p = rsaPkcs1({ aes: encrypted.key, uid: s?.userid || 0, token: s?.token || "" });
  const raw = await request({
    method: "POST", base: "https://userservice.kugou.com", path: "/risk/v3/r_register_dev",
    params: { part: 1, platid: 1, p }, data: encrypted.str, binary: true,
  });
  let body;
  try { body = playlistAesDecrypt(fromB64(unutf8(raw).trim()), encrypted.key); } catch { body = null; }
  if (!body?.data?.dfid) {
    // Some responses come back as raw bytes rather than base64 text.
    try { body = playlistAesDecrypt(raw, encrypted.key); } catch { /* keep null */ }
  }
  if (body?.data?.dfid) {
    d.dfid = body.data.dfid;
    save("device", d);
  }
  return d;
}

// ---------------------------------------------------------------- login ----

async function finishLogin(data, temp) {
  let extra = {};
  if (data?.secu_params && temp) {
    const got = aesDecrypt(data.secu_params, temp);
    extra = typeof got === "object" ? got : { token: got };
  }
  const all = { ...data, ...extra };
  if (!all.token || !all.userid) throw new Error(tr("Sign-in did not return a token"));
  save("session", {
    token: all.token, userid: Number(all.userid), t1: all.t1 || "", vip_type: all.vip_type || 0,
    vip_token: all.vip_token || "", refreshed: Date.now(),
  });
  await ensureDfid().catch(() => {});
  await loadProfile().catch(() => {});
  startDaily();
  return account();
}

async function sendSmsCode(mobile) {
  const r = await request({
    method: "POST", base: "http://login.user.kugou.com", path: "/v7/send_mobile_code",
    data: { businessid: 5, mobile: String(mobile), plat: 3 }, anonymous: true,
  });
  must(r, tr("Sending the SMS code"));
  save("smsSent", { mobile: String(mobile), at: Date.now() });
}

function liteT1T2(now, t1) {
  const d = device();
  const t2 = aesEncrypt(`${d.guid}|0f607264fc6318a92b9e13c65db7cd3c|${d.mac}|${d.dev}|${now}`,
    { key: "fd14b35e3f81af3817a20ae7adae7020", iv: "17a20ae7adae7020" });
  const t1e = aesEncrypt(t1 ? `${t1}|${now}` : `|${now}`, { key: "5e4ef500e9597fe004bd09a46d8add98", iv: "04bd09a46d8add98" });
  return { t1: t1e, t2 };
}

async function smsLogin(mobile, code) {
  const d = await ensureDfid();
  const now = Date.now();
  const e = aesEncrypt({ mobile: String(mobile), code: String(code) });
  const m = String(mobile);
  const data = {
    plat: 1, support_multi: 1, ...liteT1T2(now),
    clienttime_ms: now,
    mobile: `${m.substring(0, 2)}*****${m.substring(10, 11)}`,
    key: md5(`${APPID}${SALT}${CLIENTVER}${now}`),
    pk: rsaRaw({ clienttime_ms: now, key: e.key }).toUpperCase(),
    params: e.str,
    dfid: d.dfid, dev: d.dev, gitversion: "5f0b7c4",
  };
  const r = await request({
    method: "POST", base: "https://loginserviceretry.kugou.com", path: "/v7/login_by_verifycode",
    data, headers: { "support-calm": "1", "User-Agent": "Android16-1070-11440-130-0-LOGIN-wifi" }, anonymous: true,
  });
  if (r?.status !== 1) must({ ...r, status: 0 }, tr("Signing in"));
  save("smsUsed", `${m}:${code}`);
  return finishLogin(r.data, e.key);
}

async function refreshToken() {
  const s = session();
  if (!s) return;
  const d = device();
  const now = Date.now();
  const p3 = aesEncrypt({ clienttime: Math.floor(now / 1000), token: s.token },
    { key: "c24f74ca2820225badc01946dba4fdf7", iv: "adc01946dba4fdf7" });
  const params = aesEncrypt({});
  const data = {
    dfid: d.dfid, p3, plat: 1, ...liteT1T2(now, s.t1), t3: "MCwwLDAsMCwwLDAsMCwwLDA=",
    pk: rsaRaw({ clienttime_ms: now, key: params.key }), params: params.str,
    userid: s.userid, clienttime_ms: now, dev: d.dev,
  };
  const r = await request({ method: "POST", base: "http://login.user.kugou.com", path: "/v5/login_by_token", data });
  if (r?.status === 1) {
    let extra = {};
    if (r.data?.secu_params) {
      const got = aesDecrypt(r.data.secu_params, params.key);
      extra = typeof got === "object" ? got : { token: got };
    }
    const all = { ...r.data, ...extra };
    save("session", { ...s, token: all.token || s.token, t1: all.t1 || s.t1, refreshed: Date.now() });
  } else {
    save("session", { ...s, refreshed: Date.now() - 6 * 86400e3 }); // try again tomorrow
  }
}

async function qrCreate() {
  const r = await request({
    base: "https://login-user.kugou.com", path: "/v2/qrcode", sign: "web", anonymous: true,
    params: { appid: 1001, type: 1, plat: 4, qrcode_txt: `https://h5.kugou.com/apps/loginQRCode/html/index.html?appid=${APPID}&`, srcappid: SRCAPPID },
  });
  return must(r, tr("Getting a QR code")).data.qrcode;
}
async function qrCheck(key) {
  const r = await request({
    base: "https://login-user.kugou.com", path: "/v2/get_userinfo_qrcode", sign: "web", anonymous: true,
    params: { plat: 4, appid: APPID, srcappid: SRCAPPID, qrcode: key, dev: device().dev },
  });
  return r?.data || {};
}

async function myInfo() {
  const s = needSession();
  const now = Math.floor(Date.now() / 1000);
  const r = await request({
    method: "POST", path: "/v3/get_my_info", params: { plat: 1 }, headers: { "x-router": "usercenter.kugou.com" },
    data: { visit_time: now, usertype: 1, p: rsaRaw({ token: s.token, clienttime: now }).toUpperCase(), userid: s.userid },
  });
  if (!ok(r) || !r.data) throw must(r, tr("Your profile"));
  return r.data;
}

async function loadProfile() {
  const s = session();
  if (!s) return null;
  const info = await myInfo().catch(() => null);
  if (!info) return load("profile", null);
  const profile = { name: info.nickname || String(s.userid), imageUrl: picture(info.pic) };
  save("profile", profile);
  return profile;
}

// ----------------------------------------------------- daily VIP claim ----
// The Concept app gives away a day of VIP for listening, and a little more for
// the day's ad. Both are one call each, so this doesn't post an ad report every
// 31 seconds in the background. It's on unless autoVip is "0" in settings.json:
// MyGo's plugin settings are text fields, too clumsy a thing to turn off.

let dailyRunning = false;
const RETRY_AFTER = 10 * 60e3;

function vipState() {
  const st = load("vip", null);
  return st && st.date === today() ? st : { date: today(), done: false };
}

async function claimDaily() {
  if (dailyRunning || !session()) return;
  if (String(host.setting("autoVip") ?? "").trim() === "0") return;
  dailyRunning = true;
  try {
    const s = session();
    let st = vipState();
    if (st.done) return;
    if (st.triedAt && Date.now() - st.triedAt < RETRY_AFTER) return;
    if (Date.now() - (s.refreshed || 0) > 7 * 86400e3) await refreshToken().catch(() => {});
    await ensureDfid().catch(() => {});
    const r = await request({
      method: "POST", path: "/youth/v1/recharge/receive_vip_listen_song",
      params: { source_id: 90139, receive_day: today() },
    }).catch((e) => ({ error: e.message }));
    const code = Number(r?.error_code || 0);
    st = { ...vipState(), triedAt: Date.now() };
    // 131001 is Kugou's "today's is already yours".
    if (ok(r)) st.note = "claimed";
    else if (code === 131001) st.note = "already";
    else st.error = String(r?.error_msg || r?.error || `code ${code}`).slice(0, 80);
    st.done = st.note === "claimed" || st.note === "already";
    save("vip", st);
    if (st.done) {
      await request({
        method: "POST", path: "/youth/v1/listen_song/upgrade_vip_reward",
        params: { kugouid: Number(s.userid), ad_type: 1 },
      }).catch(() => {});
      await vipInfo().catch(() => {});
    }
  } finally {
    dailyRunning = false;
  }
}

async function vipInfo() {
  const r = await request({ base: "https://kugouvip.kugou.com", path: "/v1/get_union_vip", params: { busi_type: "concept" } });
  if (!ok(r)) return null;
  const v = (r.data?.busi_vip || [])[0];
  const info = { end: v?.vip_end_time || "", is_vip: r.data?.is_vip ?? (v ? 1 : 0), checked: Date.now() };
  save("vipInfo", info);
  return info;
}

function startDaily() {
  claimDaily().catch(() => {});
}

// --------------------------------------------------------------- shapes ----

// Kugou puts a picture's size in its path: /stdmusic/400/2023…/x.jpg, and its
// CDNs are imge.kugou.com, singerimg.kugou.com and c1.kgimg.com. Hand that slot
// to the app as {size}, so a 40-pixel row asks for 40 pixels. Without it a page
// fetches every cover at 400 and up, which is most of the memory it uses.
const PICTURE = /^(https:\/\/[^/]*(?:kugou|kgimg)\.com\/.*?\/)\d{2,4}\//i;
function picture(value) {
  if (!value) return undefined;
  const text = Array.isArray(value) ? String(value[0] || "") : String(value);
  const secure = text.replace(/^http:\/\//, "https://");
  if (/\{size\}|%7Bsize%7D/i.test(secure)) return secure;
  const head = PICTURE.exec(secure);
  return head ? secure.replace(head[0], `${head[1]}{size}/`) : secure;
}

const trackId = (hash, mix, album) => `${String(hash || "").toUpperCase()}_${mix || 0}_${album || 0}`;
function parseId(id) {
  const text = String(id || "");
  if (!/^[0-9A-Fa-f]{32}_\d+_\d+$/.test(text)) throw fail("unavailable", tr("Invalid Kugou track ID"));
  const [hash, mix, album] = text.split("_");
  return { hash: hash.toUpperCase(), mix: Number(mix) || 0, album: Number(album) || 0 };
}
function splitArtists(name) {
  return String(name || "").split(/、|&|,|，|\//).map((x) => x.trim()).filter(Boolean).map((n) => ({ id: "", name: n }));
}
function toArtist(a = {}) {
  const name = a.name || a.author_name || "";
  return { id: String(a.id ?? a.author_id ?? ""), name, imageUrl: picture(a.avatar || a.sizable_avatar) };
}

// One mapper for the many song shapes Kugou answers with.
function toTrack(s) {
  if (!s) return null;
  const ai = s.audio_info || {};
  const base = s.base || {};
  const hash = s.FileHash || s.hash || ai.hash_128 || ai.hash || s.audio_hash || "";
  if (!hash) return null;
  const mix = s.MixSongID || s.mixsongid || s.album_audio_id || base.album_audio_id || s.add_mixsongid || s.audio_id || 0;
  const albumId = s.AlbumID || s.album_id || base.album_id || s.albuminfo?.id || 0;
  let name = s.OriSongName || s.SongName || s.songname || s.audio_name || base.audio_name || s.song_name || "";
  const singers = s.Singers || s.singerinfo || s.authors || s.singers;
  let artists = Array.isArray(singers) && singers.length ? singers.map(toArtist).filter((a) => a.name) : [];
  const fileName = s.name || s.filename || s.FileName || "";
  if (!name && fileName.includes(" - ")) name = fileName.split(" - ").slice(1).join(" - ");
  if (!name) name = fileName;
  if (!artists.length) {
    // "Artist - Name" in one string, as the detail endpoint answers.
    const byName = splitArtists(s.SingerName || s.author_name || base.author_name || s.singername || "");
    if (byName.length) artists = byName;
    else if (name.includes(" - ")) {
      artists = splitArtists(name.split(" - ")[0]);
      name = name.split(" - ").slice(1).join(" - ");
    }
  }
  const durRaw = s.timelen || s.timelength || s.time_length || ai.duration || ai.duration_128 || (s.Duration || s.duration || 0) * 1000;
  const duration = durRaw > 0 && durRaw < 20000 ? durRaw * 1000 : durRaw;
  const id = trackId(hash, mix, albumId);
  if (names.size > 5000) names.clear();
  names.set(id, `${artists.map((a) => a.name).join("、")} - ${name}`);
  return {
    id,
    name,
    artists,
    album: {
      id: String(albumId || ""),
      name: s.AlbumName || s.album_name || s.albuminfo?.name || s.album_info?.album_name || s.remark || "",
      imageUrl: picture(s.trans_param?.union_cover || s.album_info?.sizable_cover || s.album_info?.cover || s.cover || s.sizable_cover || s.Image || s.img),
    },
    duration: Math.round(Number(duration) || 0),
    url: `https://www.kugou.com/song/#hash=${String(hash).toLowerCase()}&album_id=${albumId || 0}`,
  };
}
const tracksOf = (list) => (list || []).map(toTrack).filter(Boolean);

function toAlbum(a = {}) {
  return {
    id: String(a.id ?? a.album_id ?? ""),
    name: a.name || a.album_name || "",
    imageUrl: picture(a.imageUrl || a.sizable_cover || a.img || a.cover),
    artists: a.artists || splitArtists(a.author_name || a.singer),
    released: a.released || a.publish_date || "",
    ...(a.saved === undefined ? {} : { saved: !!a.saved }),
  };
}

// A saved album is one more entry in the same list of lists, marked source 2,
// where the album's own id stands for the list it was made from.
const isAlbumRow = (p) => Number(p?.source) === 2;
const albumRowID = (p) => String(p?.musiclib_id || p?.list_create_listid || "");
function toSavedAlbum(p = {}) {
  return {
    id: albumRowID(p),
    name: p.name || "",
    imageUrl: picture(p.pic),
    artists: p.list_create_username
      ? [{ id: String(p.list_create_userid || ""), name: p.list_create_username }]
      : [],
    released: "",
    saved: true,
  };
}

function toPlaylist(p = {}, me) {
  const mine = !!me && Number(p.list_create_userid) === Number(me.userid);
  return {
    // A saved list is a copy under our own id: the list it came from is the one
    // in list_create_gid, and going by it keeps the sidebar and the page on the
    // same playlist.
    id: String(p.list_create_gid || p.global_collection_id || p.listid || ""),
    name: p.name || "",
    imageUrl: picture(p.pic),
    description: p.intro || "",
    owner: p.list_create_username || "",
    trackCount: Number(p.count || p.song_count || 0),
    mine,
    fixed: !!isLikedList(p),
    saved: !mine,
  };
}

// ------------------------------------------------------------- accounts ----

export async function signIn() {
  resetSession();
  const generation = state.epoch;
  await ensureDfid().catch(() => {});
  let key = await qrCreate();
  const show = (text) => host.signInPrompt({ qr: `https://h5.kugou.com/apps/loginQRCode/html/index.html?qrcode=${key}`, text });
  const hint = tr("Scan with the Kugou Concept app, or fill in your phone number in this plugin's settings to get a code by SMS");
  show(hint);
  const started = Date.now();
  while (Date.now() - started < 290e3) {
    if (generation !== state.epoch) throw new Error(tr("Sign-in cancelled"));
    if (session()) return account();
    const phone = (host.setting("phone") || "").trim();
    const code = (host.setting("smsCode") || "").trim();
    if (/^1\d{10}$/.test(phone)) {
      const sent = load("smsSent", null);
      if (/^\d{4,6}$/.test(code) && load("smsUsed", "") !== `${phone}:${code}` && sent?.mobile === phone) {
        return smsLogin(phone, code);
      }
      if (!sent || sent.mobile !== phone || Date.now() - sent.at > 5 * 60e3) {
        await sendSmsCode(phone).catch((e) => show(e.message));
        show(tr("Code sent by SMS. Fill it in this plugin's settings, or scan the QR code"));
      }
    }
    const st = await qrCheck(key).catch(() => ({}));
    if (st.status === 4 && st.token) return finishLogin({ token: st.token, userid: st.userid });
    if (st.status === 2) show(tr("Scanned. Confirm on your phone"));
    if (st.status === 0) { key = await qrCreate(); show(hint); }
    await sleep(2000);
  }
  throw new Error(tr("Sign-in timed out"));
}

export function signOut() {
  resetSession();
}

export async function account() {
  let s = session();
  if (!s) {
    // A code filled in the settings while the plugin wasn't listening.
    const phone = (host.setting("phone") || "").trim(), code = (host.setting("smsCode") || "").trim();
    const sent = load("smsSent", null);
    if (/^1\d{10}$/.test(phone) && /^\d{4,6}$/.test(code) && sent?.mobile === phone && Date.now() - sent.at < 10 * 60e3 && load("smsUsed", "") !== `${phone}:${code}`) {
      try { await smsLogin(phone, code); } catch { /* shown when they sign in */ }
      s = session();
    }
    if (!s) return null;
  }
  startDaily();
  const p = load("profile", null) || (await loadProfile().catch(() => null));
  return { id: String(s.userid), name: p?.name || String(s.userid), imageUrl: p?.imageUrl, page: "profile" };
}

export async function setSetting({ key, value }) {
  const v = String(value || "").trim();
  if (key === "phone") {
    if (!v) return;
    if (!/^1\d{10}$/.test(v)) throw fail("setup", tr("Enter an 11-digit mainland China phone number"));
    const sent = load("smsSent", null);
    if (sent?.mobile === v && Date.now() - sent.at < 60e3) return;
    await sendSmsCode(v);
  } else if (key === "smsCode") {
    if (!v || session()) return;
    const phone = (host.setting("phone") || "").trim();
    if (!/^1\d{10}$/.test(phone)) throw fail("setup", tr("Fill in the phone number first"));
    if (!/^\d{4,6}$/.test(v)) throw fail("setup", tr("The code is 6 digits"));
    await smsLogin(phone, v);
  }
}

// ------------------------------------------------------------- browsing ----

async function rankTracks(rankid = 8888, page = 1, pagesize = PAGE) {
  const r = await request({
    method: "POST", path: "/openapi/kmr/v2/rank/audio", headers: { "kg-tid": "369" },
    data: { show_portrait_mv: 1, show_type_total: 1, filter_original_remarks: 1, area_code: 1, pagesize, rank_cid: 0, type: 1, page, rank_id: rankid },
  });
  const d = must(r, tr("The chart")).data || {};
  const tracks = tracksOf(d.songlist);
  const total = Number(d.total || d.song_total || 0);
  return { tracks, total, more: tracks.length >= pagesize && (!total || page * pagesize < total) };
}

// A whole chart at once: 500 songs for the TOP500, ten pages at most.
async function rankAll(rankid) {
  const first = await rankTracks(rankid, 1, PAGE);
  const pages = Math.min(Math.ceil((first.total || first.tracks.length) / PAGE), 10);
  const rest = await Promise.all(Array.from({ length: Math.max(pages - 1, 0) }, (_, i) =>
    rankTracks(rankid, i + 2, PAGE).then((r) => r.tracks).catch(() => [])));
  return [...first.tracks, ...rest.flat()];
}

async function dailyRecommend() {
  const r = await request({ method: "POST", path: "/everyday_song_recommend", params: { platform: "ios" }, headers: { "x-router": "everydayrec.service.kugou.com" } });
  return tracksOf(r?.data?.song_list || r?.data?.list || r?.data?.songs);
}

// Charts are tried as playlists, as they are in other sources: the app then
// shows one page with its cover, Play and Shuffle, rather than a list that
// ends in a "next page" card.
async function rankList() {
  const r = await request({ path: "/ocean/v6/rank/list", params: { withsong: 0, parentid: 0 } });
  return (r?.data?.info || []).filter((x) => x.rankid).map((x) => {
    const intro = String(x.intro || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 2).join("\n");
    return {
      id: `rank:${x.rankid}`,
      name: x.rankname || tr("Chart"),
      imageUrl: picture(x.imgurl || x.banner_9 || x.album_img_9),
      owner: tr("Kugou Music"),
      description: [x.update_frequency ? tr("{frequency} update", { frequency: x.update_frequency }) : "", intro].filter(Boolean).join("\n"),
      trackCount: Number(x.songcount || x.song_count || 0) || undefined,
      // Kept by Kugou, so the app offers no rename, no save, no adding to it.
      mine: true,
      fixed: true,
    };
  });
}

// Kugou's own picks, which fill the home page and the playlist shelf.
async function recommendedPlaylists(pagesize = 30) {
  const clienttime = String(Math.floor(Date.now() / 1000));
  const body = {
    appid: APPID, mid: device().mid, clientver: CLIENTVER, platform: "android", clienttime,
    userid: String(session()?.userid || 0), module_id: 1, page: 1, pagesize,
    key: md5(`${APPID}${SALT}${CLIENTVER}${clienttime}`),
    special_recommend: { withtag: 1, withsong: 1, sort: 1, ugc: 1, is_selected: 0, withrecommend: 1, area_code: 1, categoryid: 0 },
    req_multi: 1, retrun_min: 5, return_special_falg: 1,
  };
  const r = await request({ method: "POST", path: "/v2/special_recommend", headers: { "x-router": "specialrec.service.kugou.com" }, data: body });
  const items = r?.data?.special_list || r?.data?.list || [];
  return items.filter((p) => p.global_collection_id || p.specialid).map((p) => ({
    id: String(p.global_collection_id || `special:${p.specialid}`),
    name: p.specialname || p.name || "",
    imageUrl: picture(p.flexible_cover || p.imgurl || p.pic),
    description: p.intro || "",
    owner: p.nickname || "",
    trackCount: Number(p.songcount || p.count || p.song_count || 0) || undefined,
  }));
}

function vipLine() {
  const st = load("vip", null);
  const info = load("vipInfo", null);
  const parts = [];
  if (st?.date === today()) {
    if (st.note === "claimed") parts.push(tr("Today's VIP claimed"));
    else if (st.note === "already") parts.push(tr("Today's VIP was already claimed"));
    else if (st.error) parts.push(tr("Claiming today's VIP failed: {message}", { message: st.error }));
  }
  if (info?.end) parts.push(tr("VIP until {date}", { date: info.end }));
  return parts.join(" · ");
}

export async function home() {
  const generation = state.epoch;
  const signedIn = !!session();
  if (signedIn) startDaily();
  const [daily, top, fresh, charts, picks] = await Promise.allSettled([
    signedIn ? dailyRecommend() : Promise.resolve([]),
    rankTracks(8888, 1, SEARCH_PAGE),
    rankTracks(74534, 1, SEARCH_PAGE),
    rankList(),
    recommendedPlaylists(30),
  ]);
  still(generation);
  const sections = [];
  if (signedIn) {
    if (daily.status === "fulfilled" && daily.value.length) {
      sections.push({
        title: tr("Daily picks"),
        pageTitle: tr("Daily picks"),
        subtitle: vipLine(),
        tracks: daily.value,
      });
    } else if (daily.status === "rejected") {
      sections.push(retrySection(tr("Daily picks"), "daily", daily.reason));
    }
  }
  if (picks.status === "fulfilled" && picks.value.length) {
    sections.push({ title: tr("Recommended playlists"), playlists: picks.value, morePage: "picks" });
  } else if (picks.status === "rejected") {
    sections.push(retrySection(tr("Recommended playlists"), "picks", picks.reason));
  }
  if (top.status === "fulfilled" && top.value.tracks.length) {
    sections.push({ title: tr("Kugou TOP500"), tracks: top.value.tracks });
  } else if (top.status === "rejected") {
    sections.push(retrySection(tr("Kugou TOP500"), "charts", top.reason));
  }
  if (fresh.status === "fulfilled" && fresh.value.tracks.length) {
    sections.push({ title: tr("New songs"), tracks: fresh.value.tracks });
  } else if (fresh.status === "rejected") {
    sections.push(retrySection(tr("New songs"), "charts", fresh.reason));
  }
  if (charts.status === "fulfilled" && charts.value.length) {
    sections.push({ title: tr("Charts"), playlists: charts.value.slice(0, 4), morePage: "charts" });
  } else if (charts.status === "rejected") {
    sections.push(retrySection(tr("Charts"), "charts", charts.reason));
  }
  return {
    title: tr("Kugou Lite"),
    subtitle: signedIn ? vipLine() : tr("Sign in to claim free VIP every day"),
    sections,
  };
}

async function myPage() {
  const generation = state.epoch;
  const me = needSession();
  const [info, lists, recentTracks] = await Promise.allSettled([myInfo(), myLists(true), recentTracksOf(30)]);
  still(generation);
  const profile = info.status === "fulfilled" ? info.value : null;
  const sections = [];
  if (lists.status === "fulfilled") {
    sections.push({
      title: tr("My Playlists"),
      playlists: lists.value.map((p) => toPlaylist(p, me)),
      empty: tr("No playlists yet"),
    });
  } else {
    sections.push(retrySection(tr("My Playlists"), "profile", lists.reason));
  }
  if (recentTracks.status === "fulfilled" && recentTracks.value.length) {
    sections.push({ title: tr("Recently Played"), tracks: recentTracks.value, morePage: "recent" });
  }
  const vip = load("vipInfo", null);
  const stats = [
    profile?.vip_type || vip?.is_vip ? tr("VIP") : tr("Free account"),
    vip?.end ? tr("VIP until {date}", { date: vip.end }) : "",
    profile?.follows ? tr("{count} following", { count: profile.follows }) : "",
    profile?.fans ? tr("{count} followers", { count: profile.fans }) : "",
  ].filter(Boolean).join(" · ");
  return {
    title: profile?.nickname || load("profile", null)?.name || String(me.userid),
    subtitle: tr("My Page"),
    imageUrl: picture(profile?.pic) || load("profile", null)?.imageUrl,
    description: [stats, profile?.descri].filter(Boolean).join("\n"),
    sections,
  };
}

export async function browse({ page }) {
  const name = String(page || "").split("?")[0];
  if (name === "charts") {
    const lists = await rankList();
    return {
      title: tr("Charts"),
      subtitle: tr("Updated daily"),
      sections: lists.length > 4
        ? [{ title: tr("Official charts"), playlists: lists.slice(0, 4) }, { title: tr("All charts"), playlists: lists.slice(4) }]
        : [{ playlists: lists }],
    };
  }
  if (name === "daily") {
    needSession();
    const tracks = await dailyRecommend();
    return {
      title: tr("Daily picks"),
      subtitle: vipLine(),
      description: tr("{count} songs picked for you", { count: tracks.length }),
      sections: [{ tracks, empty: tr("No songs") }],
    };
  }
  if (name === "picks") {
    return {
      title: tr("Recommended playlists"),
      sections: [{ playlists: await recommendedPlaylists(PAGE), empty: tr("Nothing to recommend yet") }],
    };
  }
  if (name === "profile") return myPage();
  if (name === "recent") {
    return {
      title: tr("Recently Played"),
      sections: [{ tracks: await recentTracksOf(PAGE), empty: tr("Nothing played yet") }],
    };
  }
  throw fail("unavailable", tr("Page not found"));
}

export async function search({ query, kind = "tracks", offset = 0 }) {
  const text = String(query || "").trim();
  offsetOf(offset);
  const shapes = {
    tracks: () => ({ tracks: [], more: false }),
    albums: () => ({ albums: [], more: false }),
    artists: () => ({ artists: [], more: false }),
    playlists: () => ({ playlists: [], more: false }),
  };
  const empty = shapes[kind];
  if (!empty) throw fail("unsupported", tr("This search type is not supported"));
  if (!text) return empty();
  const page = Math.floor(offset / SEARCH_PAGE) + 1;
  const common = { keyword: text, page, pagesize: SEARCH_PAGE, platform: "AndroidFilter", iscorrection: 1 };
  const hdr = { "x-router": "complexsearch.kugou.com" };
  const more = (count, total) => count > 0 && page * SEARCH_PAGE < Number(total || 0);
  if (kind === "tracks") {
    const r = await request({ path: "/v2/search/song", params: { ...common, privilegefilter: 0, area_code: 1, dopicfull: 1, clientver: 201 }, headers: hdr });
    const d = must(r, tr("Search")).data || {};
    const tracks = tracksOf(d.lists);
    return { tracks, more: more(tracks.length, d.total) };
  }
  if (kind === "albums") {
    const r = await request({ path: "/v1/search/album", params: { ...common, category: "1", sorttype: 0, searchsong: 0, clientver: 201 }, headers: hdr });
    const d = must(r, tr("Search")).data || {};
    const albums = (d.lists || []).map((a) => toAlbum({
      id: a.albumid, name: a.albumname, imageUrl: a.img, released: a.publish_time, singer: a.singer,
    }));
    return { albums, more: more(albums.length, d.total) };
  }
  if (kind === "artists") {
    const r = await request({ path: "/v1/search/author", params: { albumhide: 0, nocollect: 0, ...common }, headers: hdr });
    const d = must(r, tr("Search")).data || {};
    const artists = (d.lists || []).map((a) => ({ id: String(a.AuthorId), name: a.AuthorName, imageUrl: picture(a.Avatar) }));
    return { artists, more: more(artists.length, d.total) };
  }
  const r = await request({ path: "/v1/search/special", params: { albumhide: 0, nocollect: 0, ...common }, headers: hdr });
  const d = must(r, tr("Search")).data || {};
  const playlists = (d.lists || []).filter((p) => p.gid).map((p) => ({
    id: String(p.gid), name: p.specialname, imageUrl: picture(p.img), owner: p.nickname,
    trackCount: Number(p.song_count || 0), description: p.intro || "",
  }));
  return { playlists, more: more(playlists.length, d.total) };
}

export async function suggest({ query }) {
  const text = String(query || "").trim();
  if (!text) return [];
  const r = await request({
    path: "/v2/getSearchTip", headers: { "x-router": "searchtip.kugou.com" },
    params: { keyword: text, AlbumTipCount: 0, CorrectTipCount: 0, MVTipCount: 0, MusicTipCount: 10, radiotip: 1 },
  });
  const hints = (r?.data?.[0]?.RecordDatas || []).map((x) => x.HintInfo).filter(Boolean);
  return [...new Set(hints)].slice(0, 12);
}

export async function comments({ trackId, offset = 0 }) {
  const { mix } = parseId(trackId);
  offsetOf(offset);
  const page = Math.floor(offset / SEARCH_PAGE) + 1;
  const r = await commentList(mix, page);
  // This one answers at the top level rather than under data.
  const d = r?.data && Array.isArray(r.data.list) ? r.data : r || {};
  const items = d.list || [];
  const total = Number(d.count || d.combine_count || 0);
  return {
    comments: items.map(toComment).filter(Boolean),
    total: total || undefined,
    more: items.length > 0 && (total ? page * SEARCH_PAGE < total : items.length >= SEARCH_PAGE),
  };
}

const COMMENT_CODE = "fc4be23b4e972707f36b8a828a93ba8a";

function commentList(mix, page = 1, pagesize = SEARCH_PAGE) {
  return request({
    method: "POST", path: "/mcomment/v1/cmtlist",
    params: {
      ver: 6, mixsongid: mix, need_show_image: 1, p: page, pagesize,
      show_classify: 1, show_hotword_list: 1, extdata: "0", code: COMMENT_CODE,
    },
  });
}

function toComment(c = {}) {
  const text = String(c.content || "");
  if (!text) return null;
  return {
    id: String(c.id || c.cmtid || ""),
    author: String(c.user_name || c.username || ""),
    avatarUrl: picture(c.user_pic),
    text,
    time: c.addtime ? Date.parse(`${String(c.addtime).replace(" ", "T")}+08:00`) || undefined : undefined,
    likes: Number(c.like?.count || c.like_count || 0) || undefined,
    liked: !!Number(c.like?.haslike),
  };
}

// A like is addressed to the song's comment pool, which only the list knows.
async function commentPool(mix) {
  const hit = commentPools.get(mix);
  if (hit && Date.now() - hit.at < 10 * 60e3) return hit.id;
  const r = await commentList(mix, 1, 1);
  const id = String(r?.childrenid || r?.data?.childrenid || "");
  if (id) commentPools.set(mix, { id, at: Date.now() });
  return id;
}

// Kugou's like call is a toggle with no "off" form, so it is asked for the
// state the page wants and, if a stale page or a double tap left it on the
// wrong side, flipped once more.
export async function likeComment({ trackId, commentId, on }) {
  const me = needSession();
  const { mix } = parseId(trackId);
  const id = String(commentId ?? "").trim();
  if (!id) throw new Error(tr("The comment is missing"));
  const pool = await commentPool(mix);
  if (!pool) throw new Error(tr("Kugou did not return this song's comments"));
  const d = device();
  const flip = async () => {
    const clienttime = String(Math.floor(Date.now() / 1000));
    const params = {
      childrenid: pool, object: id, assign: md5(`${COMMENT_CODE}${clienttime}${LIKE_SALT}`),
      kugouid: me.userid, appid: APPID, clienttoken: me.token, mid: d.mid,
      timestamp: clienttime, modulecode: COMMENT_CODE, format: "jsonp", from: "phone",
    };
    const res = await send(`${LIKES}/like/handlelike?${asQuery(params)}`, {
      headers: { "User-Agent": WEB_UA, Referer: "https://www.kugou.com/" },
    });
    let r = null;
    try { r = JSON.parse(await res.text()); } catch { throw new Error(tr("Kugou did not accept the like")); }
    if (Number(r?.status) !== 1 || Number(r?.err_code) !== 0)
      throw new Error(String(r?.msg || r?.message || tr("Kugou did not accept the like")));
    return Number(r.islike) === 1;
  };
  const want = !!on;
  let liked = await flip();
  if (liked !== want) liked = await flip();
  if (liked !== want) throw new Error(tr("Kugou left the like unchanged"));
}

// Writing takes the track's comment pool id, which the list answers with; a
// track without one takes its own id instead. Both are tried.
export async function postComment({ trackId, text }) {
  const me = needSession();
  const { mix } = parseId(trackId);
  const content = String(text || "").trim();
  if (!content) throw new Error(tr("The comment is empty"));
  if (content.length > 500) throw new Error(tr("Keep the comment under 500 characters"));
  const pool = await commentList(mix, 1, 1)
    .then((r) => Number(r?.childrenid || r?.data?.childrenid) || 0)
    .catch(() => 0);
  const known = load("recent", []).find((t) => t.id === trackId);
  // Kugou files the comment under "artist - name", which needs a lookup when
  // the song hasn't been played yet.
  const childrenname = known
    ? `${known.artists.map((a) => a.name).join("、")} - ${known.name}`
    : (await audioDetail(parseId(trackId).hash).then((d) => d?.audio_name || "").catch(() => ""));
  const clienttime = Math.floor(Date.now() / 1000);
  const d = device();
  const body = JSON.stringify({ data: { content, album_audio_id: mix, images: [] } });
  const r = await request({
    method: "POST", path: "/index.php", clearDefault: true, sign: false,
    params: {
      r: "commentsv3/add", code: COMMENT_CODE, childrenid: pool || mix, childrenname,
      kugouid: me.userid, ver: 6, clienttoken: me.token, appid: APPID, clientver: CLIENTVER,
      mid: d.mid, clienttime, key: md5(`${APPID}${SALT}${CLIENTVER}${clienttime}${d.mid}${body}`),
      uuid: "-", dfid: d.dfid,
    },
    data: body,
    headers: { "x-router": "m.comment.service.kugou.com", "Content-Type": "application/json; charset=UTF-8" },
  });
  must(r, tr("Posting the comment"));
  const profile = load("profile", null);
  return {
    id: String(r?.addid || r?.data?.addid || ""),
    author: profile?.name || String(me.userid),
    avatarUrl: profile?.imageUrl,
    text: content,
    time: Date.now(),
  };
}

async function albumDetail(id) {
  const r = await request({
    method: "POST", path: "/kmr/v2/albums", headers: { "x-router": "openapi.kugou.com", "kg-tid": "255" },
    data: { data: [{ album_id: id }], is_buy: 0, fields: "album_id,album_name,publish_date,sizable_cover,intro,language,is_publish,heat,type,quality,authors,exclusive,author_name,trans_param" },
  });
  return (r?.data || [])[0] || {};
}

export async function album({ id }) {
  const [a, songs] = await Promise.all([albumDetail(id), albumSongs(id)]);
  return {
    album: toAlbum({
      id, name: a.album_name, imageUrl: a.sizable_cover, released: a.publish_date,
      artists: (a.authors || []).map(toArtist), singer: a.author_name,
      saved: session() ? await albumSaved(id).catch(() => false) : undefined,
    }),
    tracks: tracksOf(songs),
  };
}

async function albumSongs(id) {
  const out = [];
  for (let page = 1; page <= 20; page++) {
    const r = await request({ method: "POST", path: "/v1/album_audio/lite", headers: { "x-router": "openapi.kugou.com", "kg-tid": "255" }, data: { album_id: id, is_buy: "", page, pagesize: 50 } });
    const songs = r?.data?.songs || [];
    out.push(...songs);
    if (songs.length < 50 || out.length >= (r?.data?.total || 0)) break;
  }
  return out;
}

async function artistDetail(id) {
  const r = await request({ method: "POST", path: "/kmr/v3/author", headers: { "x-router": "openapi.kugou.com", "kg-tid": "36" }, data: { author_id: id } });
  const a = r?.data || {};
  if (!a.author_name && !a.sizable_avatar) throw fail("unavailable", tr("Artist not found"));
  return { id: String(id), name: a.author_name || "", imageUrl: picture(a.sizable_avatar) };
}

async function artistSongs(id) {
  const d = device();
  const now = Math.floor(Date.now() / 1000);
  const r = await request({
    method: "POST", base: "https://openapi.kugou.com", path: "/kmr/v1/audio_group/author",
    headers: { "x-router": "openapi.kugou.com", "kg-tid": "220" },
    data: { appid: APPID, clientver: CLIENTVER, mid: d.mid, clienttime: now, key: md5(`${APPID}${SALT}${CLIENTVER}${now}`), author_id: id, pagesize: 50, page: 1, sort: 1, area_code: "all" },
  });
  return tracksOf(r?.data);
}

// One page is 30, and a singer with a long career has a few of them: 周杰伦 has
// 49. Asking only the first left the album list short.
async function artistAlbums(id) {
  const out = [];
  const pagesize = 30;
  for (let page = 1; page <= 20; page++) {
    const r = await request({
      method: "POST", path: "/kmr/v1/author/albums", headers: { "x-router": "openapi.kugou.com", "kg-tid": "36" },
      data: { author_id: id, pagesize, page, sort: 1, category: 1, area_code: "all" },
    });
    const list = Array.isArray(r?.data) ? r.data : [];
    out.push(...list);
    if (list.length < pagesize || out.length >= Number(r?.total || 0)) break;
  }
  return out.map(toAlbum);
}

// Who the listener follows. The artist page itself says nothing about it, so
// the answer comes from the follow list, kept for a minute.
let followCache = null;
const forgetFollows = () => { followCache = null; };

async function followedSingers() {
  const me = session();
  if (!me) return new Set();
  if (followCache && Date.now() - followCache.at < 60e3) return followCache.ids;
  const clienttime = Math.floor(Date.now() / 1000);
  const r = await request({
    method: "POST", path: "/v4/follow_list", headers: { "x-router": "relationuser.kugou.com" },
    params: { plat: 1 },
    data: {
      merge: 2, need_iden_type: 1, ext_params: "k_pic,jumptype,singerid,score",
      userid: me.userid, type: 0, id_type: 0,
      p: rsaRaw({ clienttime, token: me.token }).toUpperCase(),
    },
  });
  if (!ok(r)) return new Set();
  // The follow list comes back either as the singers themselves or grouped by
  // kind, and the grouping has been seen both as an array and as an object.
  const groups = Array.isArray(r.data?.lists) ? r.data.lists : Object.values(r.data?.lists || {});
  const ids = new Set();
  for (const group of groups)
    for (const one of Array.isArray(group) ? group : [group])
      if (one?.singerid) ids.add(String(one.singerid));
  followCache = { at: Date.now(), ids };
  return ids;
}

export async function artist({ id }) {
  const [detail, tracks, albums, followed] = await Promise.all([
    artistDetail(id),
    artistSongs(id).catch(() => []),
    artistAlbums(id).catch(() => []),
    followedSingers().catch(() => new Set()),
  ]);
  return { artist: { ...detail, following: followed.has(String(id)) }, tracks, albums };
}

export async function followArtist({ id, on }) {
  const me = needSession();
  const singerid = Number(id);
  if (!Number.isSafeInteger(singerid) || singerid <= 0) throw fail("unavailable", tr("Artist not found"));
  const clienttime = Math.floor(Date.now() / 1000);
  const body = aesEncrypt({ singerid, token: me.token });
  const r = await request({
    method: "POST", params: { clienttime },
    path: on ? "/followservice/v3/follow_singer" : "/followservice/v3/unfollow_singer",
    data: {
      plat: 0, userid: Number(me.userid), singerid, source: 7,
      p: rsaPkcs1({ clienttime, key: body.key }), params: body.str,
    },
  });
  must(r, on ? tr("Following the artist") : tr("Unfollowing the artist"));
  forgetFollows();
}

// ------------------------------------------------------------ playlists ----

function likedRank(p) {
  if (Number(p.is_def) === 2) return 3;
  if (p.name === "我喜欢" || p.name === "我喜欢的音乐") return 2;
  if (p.name === "默认收藏" || Number(p.is_def) === 1) return 1;
  return 0;
}
const isLikedList = (p) => !!p && likedRank(p) > 0;
// A saved list has our own user id in its id, since the slot is ours; who made
// it is in list_create_userid, which wins when it's there.
function isMine(p, me) {
  if (!p || !me) return false;
  if (p.list_create_userid !== undefined && p.list_create_userid !== null) {
    return Number(p.list_create_userid) === Number(me.userid);
  }
  return !!ownList(p.global_collection_id || String(p.listid || ""), me);
}

async function myLists(fresh = false) {
  const s = needSession();
  if (!fresh && listsCache && Date.now() - listsCache.at < 30e3) return listsCache.lists;
  const r = await request({
    method: "POST", path: "/v7/get_all_list", headers: { "x-router": "cloudlist.service.kugou.com" },
    params: { plat: 1, userid: s.userid, token: s.token },
    data: { userid: s.userid, token: s.token, total_ver: 979, type: 2, page: 1, pagesize: 100 },
  });
  const lists = must(r, tr("Your playlists")).data?.info || [];
  listsCache = { at: Date.now(), lists };
  return lists;
}

// A list's own id says whose it is and which one: collection_3_<user>_<list>_0.
function ownList(id, me) {
  const m = /^collection_\d+_(\d+)_(\d+)_\d+$/.exec(String(id || ""));
  if (!m || Number(m[1]) !== Number(me?.userid)) return null;
  return { listid: Number(m[2]), type: 0, global_collection_id: String(id) };
}

async function resolveList(id) {
  const me = needSession();
  const own = ownList(id, me);
  const lists = await myLists().catch(() => []);
  const found = lists.find((p) =>
    String(p.global_collection_id) === String(id) || String(p.listid) === String(id) || String(p.gid) === String(id));
  // A list made a moment ago is in the answer that made it, not yet in the list
  // of lists, so its own id is what to go by.
  if (found) return found;
  if (own) return own;
  throw fail("unavailable", tr("This playlist is not one you can change"));
}

// A saved list is a copy under our own user id, so the list it was saved from
// is the one in list_create_gid, not the copy's own id.
async function findList(id, me, fresh = false) {
  if (!me) return null;
  const lists = await myLists(fresh).catch(() => []);
  return lists.find((p) =>
    String(p.global_collection_id) === String(id) || String(p.list_create_gid) === String(id)) || null;
}

async function listTracks(gid, max = 3000) {
  const out = [];
  const pagesize = 300;
  for (let begin = 0; begin < max; begin += pagesize) {
    const r = await request({
      path: "/pubsongs/v2/get_other_list_file_nofilt",
      params: { area_code: 1, begin_idx: begin, plat: 1, type: 1, mode: 1, personal_switch: 1, extend_fields: "abtags,hot_cmt,popularization", pagesize, global_collection_id: gid },
    });
    const d = must(r, tr("This playlist")).data || {};
    const songs = d.songs || d.info || [];
    out.push(...songs);
    if (!songs.length || out.length >= (d.count || 0)) return { songs: out, info: d.list_info || {} };
  }
  return { songs: out, info: {} };
}

export async function playlists() {
  const me = needSession();
  return (await myLists()).filter((p) => !isAlbumRow(p)).map((p) => toPlaylist(p, me));
}

export async function playlist({ id }) {
  // A chart reads as a playlist, so that its page has a cover, Play and
  // Shuffle, and every one of its songs at once.
  if (String(id).startsWith("rank:")) {
    const rankid = Number(String(id).slice(5));
    if (!Number.isSafeInteger(rankid) || rankid <= 0) throw fail("unavailable", tr("Page not found"));
    const [charts, tracks] = await Promise.all([rankList(), rankAll(rankid)]);
    const chart = charts.find((x) => x.id === String(id)) || {};
    return {
      id: String(id),
      name: chart.name || tr("Chart"),
      imageUrl: chart.imageUrl,
      description: chart.description,
      owner: chart.owner || tr("Kugou Music"),
      trackCount: tracks.length,
      mine: true,
      fixed: true,
      tracks,
    };
  }
  // A list made a moment ago answers as an empty one until the service catches
  // up, so ask again before believing it.
  let songs = [], info = {};
  for (let attempt = 0; attempt < 3 && !songs.length; attempt++) {
    if (attempt) await sleep(500);
    ({ songs, info } = await listTracks(id));
  }
  const me = session();
  // Whether it's saved is a fact about the listener's lists, not something to
  // guess: a public one that was never saved is not "saved".
  const entry = await findList(id, me);
  const known = Object.keys(info).length ? info : entry || {};
  const mine = entry ? isMine(entry, me) : !!ownList(id, me);
  const saved = !!entry && !mine;
  return {
    id: String(id),
    name: known.name || "",
    imageUrl: picture(known.pic),
    description: known.intro || "",
    owner: known.list_create_username || "",
    trackCount: Number(known.count || songs.length),
    mine,
    fixed: !!isLikedList(known),
    saved,
    tracks: tracksOf(songs),
  };
}

async function likedList() {
  const lists = (await myLists(true)).filter(isLikedList);
  if (!lists.length) throw fail("unavailable", tr("Your liked songs were not found"));
  return lists.sort((a, b) => likedRank(b) - likedRank(a))[0];
}

async function likedSongs(fresh = false) {
  needSession();
  const generation = state.epoch;
  const cached = load("liked", null);
  if (!fresh && cached && Date.now() - cached.at < 60e3) return cached;
  const p = await likedList();
  const { songs } = await listTracks(p.global_collection_id);
  still(generation);
  const value = {
    at: Date.now(), listid: p.listid,
    items: songs.map((x) => ({ hash: String(x.hash || "").toUpperCase(), mix: Number(x.mixsongid || x.add_mixsongid || 0), fileid: x.fileid })),
    // Kugou keeps a list oldest first; the liked songs read newest first.
    tracks: tracksOf(songs).reverse(),
  };
  save("liked", value);
  return value;
}

export async function liked({ offset = 0 }) {
  needSession();
  offsetOf(offset);
  const value = await likedSongs(offset === 0);
  return { tracks: value.tracks.slice(offset, offset + 200), more: offset + 200 < value.tracks.length };
}

export async function isLiked({ ids }) {
  const out = Object.fromEntries(ids.map((id) => [id, false]));
  if (!session()) return out;
  const value = await likedSongs();
  for (const id of ids) {
    try {
      const { hash, mix } = parseId(id);
      out[id] = value.items.some((x) => (mix && x.mix === mix) || x.hash === hash);
    } catch { /* not a Kugou id: leave it unliked */ }
  }
  return out;
}

// The name Kugou wants a song filed under, which it doesn't take from an id.
async function audioDetail(hash) {
  const now = Date.now();
  const d = device();
  const r = await request({
    method: "POST", path: "/v1/audio/audio", headers: { "x-router": "kmr.service.kugou.com" },
    data: { appid: APPID, clientver: CLIENTVER, clienttime: now, mid: d.mid, dfid: d.dfid, data: [{ hash, audio_id: 0 }], key: md5(`${APPID}${SALT}${CLIENTVER}${now}`) },
  });
  return (r?.data || [])[0] || null;
}

async function songName(id) {
  const cached = names.get(id);
  if (cached) return cached;
  const { hash } = parseId(id);
  const found = await audioDetail(hash).catch(() => null);
  const name = found?.audio_name || found?.filename || hash;
  names.set(id, name);
  return name;
}

async function addSongs(list, trackIds) {
  const me = needSession();
  const rows = [];
  for (const id of trackIds) {
    const { hash, mix, album } = parseId(id);
    rows.push({
      number: 1, name: await songName(id).catch(() => hash), hash: hash.toLowerCase(),
      size: 0, sort: 0, timelen: 0, bitrate: 0, album_id: album, mixsongid: mix,
    });
  }
  const r = await request({
    method: "POST", path: "/cloudlist.service/v6/add_song",
    params: { last_time: Math.floor(Date.now() / 1000), last_area: "gztx", userid: me.userid, token: me.token },
    data: { userid: me.userid, token: me.token, listid: list.listid, list_ver: 0, type: 0, slow_upload: 1, scene: "false;null", data: rows },
  });
  must(r, tr("Adding to the playlist"));
  forgetLists();
}

export async function like({ id, on }) {
  const me = needSession();
  const generation = state.epoch;
  const { hash, mix } = parseId(id);
  const value = await likedSongs(true);
  still(generation);
  if (on) {
    await addSongs({ listid: value.listid }, [id]);
  } else {
    const found = value.items.filter((x) => (mix && x.mix === mix) || x.hash === hash);
    if (!found.length) return;
    const r = await request({
      method: "POST", path: "/v4/delete_songs", headers: { "x-router": "cloudlist.service.kugou.com" },
      data: { listid: value.listid, userid: me.userid, data: found.map((x) => ({ fileid: Number(x.fileid) })), type: 0, token: me.token, list_ver: 0 },
    });
    must(r, tr("Removing from the liked songs"));
  }
  host.storage.remove("liked");
}

export async function createPlaylist({ name }) {
  const me = needSession();
  const clean = String(name || "").trim();
  if (!clean) throw new Error(tr("Playlist name cannot be empty"));
  const r = await request({
    method: "POST", path: "/cloudlist.service/v5/add_list",
    params: { last_time: Math.floor(Date.now() / 1000), last_area: "gztx", userid: me.userid, token: me.token },
    data: { userid: me.userid, token: me.token, total_ver: 0, name: clean, type: 0, source: 1, is_pri: 0, from_shupinmv: 0 },
  });
  must(r, tr("Creating the playlist"));
  forgetLists();
  const info = r?.data?.info;
  if (info) return { ...toPlaylist(info, me), tracks: [] };
  const created = (await myLists(true).catch(() => []))
    .filter((p) => p.name === clean && Number(p.list_create_userid) === Number(me.userid))
    .sort((a, b) => Number(b.create_time || 0) - Number(a.create_time || 0))[0];
  if (!created) return { id: "", name: clean, trackCount: 0, mine: true, tracks: [] };
  return { ...toPlaylist(created, me), tracks: [] };
}

export async function renamePlaylist({ id, name }) {
  const me = needSession();
  const clean = String(name || "").trim();
  if (!clean) throw new Error(tr("Playlist name cannot be empty"));
  const p = await resolveList(id);
  if (!isMine(p, me)) throw fail("unsupported", tr("This playlist is not one you can change"));
  if (isLikedList(p)) throw fail("unsupported", tr("This playlist keeps its name"));
  const r = await cloudRequest("/v1/modify_list", {
    total_ver: Number(p.list_ver || 0), listid: Number(p.listid), type: Number(p.type) || 0,
    sort: Number(p.sort) || 0, tags: p.tags || "", intro: p.intro || "", name: clean,
  });
  must(r, tr("Renaming the playlist"));
  forgetLists();
}

export async function deletePlaylist({ id }) {
  const me = needSession();
  const p = await resolveList(id);
  if (isLikedList(p)) throw fail("unsupported", tr("The liked songs can't be deleted"));
  // A list of someone else's is taken out of the library, not deleted.
  const r = isMine(p, me)
    ? await cloudRequest("/v1/delete_list", { listid: Number(p.listid), total_ver: 0, type: 0 })
    : await cloudLegacy("/v2/delete_list", { listid: Number(p.listid), total_ver: 0, type: 1 });
  must(r, tr("Deleting the playlist"));
  forgetLists();
}

// Taking someone else's playlist into the library, or out of it.
export async function savePlaylist({ id, on }) {
  const me = needSession();
  if (String(id).startsWith("rank:")) throw fail("unsupported", tr("A chart can't be saved"));
  if (on) {
    const { info } = await listTracks(id);
    const r = await request({
      method: "POST", path: "/cloudlist.service/v5/add_list",
      data: {
        userid: me.userid, token: me.token, total_ver: 0, name: info.name || "", type: 1, source: 1, is_pri: 0,
        list_create_userid: Number(info.list_create_userid || 0),
        list_create_listid: Number(info.list_create_listid || 0),
        list_create_gid: String(id), from_shupinmv: 0,
      },
    });
    must(r, tr("Saving the playlist"));
  } else {
    const found = await findList(id, me, true);
    if (!found || isMine(found, me)) return;
    const r = await cloudLegacy("/v2/delete_list", { listid: Number(found.listid), total_ver: 0, type: 1 });
    must(r, tr("Removing the saved playlist"));
  }
  forgetLists();
}

async function albumRows() {
  return (await myLists()).filter(isAlbumRow);
}

async function albumSaved(id) {
  const wanted = String(id);
  return (await albumRows()).some((p) => albumRowID(p) === wanted);
}

export async function savedAlbums({ offset = 0 } = {}) {
  needSession();
  offsetOf(offset);
  // The library comes as one list of lists, albums among the playlists.
  const rows = (await albumRows()).map(toSavedAlbum);
  return {
    albums: rows.slice(offset, offset + PAGE),
    more: offset + PAGE < rows.length,
  };
}

// Saving an album is saving a list whose source says it is an album: the
// artist is the list's creator and the album its list id. Removing it is
// removing that list.
export async function saveAlbum({ id, on }) {
  const me = needSession();
  const albumId = String(id ?? "").trim();
  if (!albumId) throw fail("unavailable", tr("Album not found"));
  const found = (await myLists(true).catch(() => [])).filter(isAlbumRow).find((p) => albumRowID(p) === albumId);
  if (on) {
    if (found) return;
    const a = await albumDetail(albumId);
    const name = a.album_name || "";
    if (!name) throw fail("unavailable", tr("Album not found"));
    const singer = (a.authors || [])[0] || {};
    const r = await request({
      method: "POST", path: "/cloudlist.service/v5/add_list",
      params: { last_time: Math.floor(Date.now() / 1000), last_area: "gztx", userid: me.userid, token: me.token },
      data: {
        userid: me.userid, token: me.token, total_ver: 0, name, type: 1, source: 2, is_pri: 0,
        list_create_userid: Number(singer.author_id || 0), list_create_listid: Number(albumId),
        list_create_gid: "", from_shupinmv: 0,
      },
    });
    must(r, tr("Saving the album"));
    // The list service answers with the new entry, which the page reads before
    // the list of lists catches up.
    const info = r?.data?.info;
    if (info && listsCache)
      listsCache.lists = [...listsCache.lists.filter((p) => String(p.listid) !== String(info.listid)), info];
  } else {
    if (!found) return;
    const r = await cloudLegacy("/v2/delete_list", { listid: Number(found.listid), total_ver: 0, type: 1 });
    must(r, tr("Removing the saved album"));
    if (listsCache) listsCache.lists = listsCache.lists.filter((p) => String(p.listid) !== String(found.listid));
  }
}

export async function addToPlaylist({ id, trackIds }) {
  const me = needSession();
  const p = await resolveList(id);
  if (!isMine(p, me)) throw fail("unsupported", tr("This playlist is not one you can change"));
  if (isLikedList(p)) throw fail("unsupported", tr("Use the heart to change your liked songs"));
  if (!trackIds?.length) return;
  await addSongs(p, trackIds);
}

export async function removeFromPlaylist({ id, trackIds }) {
  const me = needSession();
  const p = await resolveList(id);
  if (!isMine(p, me)) throw fail("unsupported", tr("This playlist is not one you can change"));
  const { songs } = await listTracks(p.global_collection_id || String(p.listid));
  const wanted = new Set((trackIds || []).map((x) => String(x).toUpperCase()));
  const fileids = songs
    .filter((x) => wanted.has(trackId(x.hash || x.FileHash, x.mixsongid, x.album_id)) || wanted.has(String(x.hash || "").toUpperCase()))
    .map((x) => Number(x.fileid))
    .filter(Boolean);
  if (!fileids.length) throw fail("unavailable", tr("Those songs are not in this playlist"));
  const r = await request({
    method: "POST", path: "/v4/delete_songs", headers: { "x-router": "cloudlist.service.kugou.com" },
    data: { listid: p.listid, userid: me.userid, data: fileids.map((fileid) => ({ fileid })), type: Number(p.type) || 0, token: me.token, list_ver: 0 },
  });
  must(r, tr("Removing from the playlist"));
  forgetLists();
}

export async function movePlaylistTrack({ id, from, to }) {
  const me = needSession();
  const p = await resolveList(id);
  if (!isMine(p, me)) throw fail("unsupported", tr("This playlist is not one you can change"));
  const { songs } = await listTracks(p.global_collection_id || String(p.listid));
  if (p.count !== undefined && songs.length !== Number(p.count)) throw new Error(tr("The track list is incomplete. Reordering was cancelled."));
  const rows = songs.map((x) => ({ fileid: Number(x.fileid), sort: 0 })).filter((x) => x.fileid);
  if (![from, to].every((n) => Number.isSafeInteger(n) && n >= 0 && n < rows.length)) throw new Error(tr("Invalid track position"));
  if (from === to) return;
  rows.splice(to, 0, rows.splice(from, 1)[0]);
  rows.forEach((row, i) => { row.sort = i + 1; });
  const r = await cloudRequest("/v1/modify_song_sort", {
    listid: Number(p.listid), list_ver: Number(p.list_ver || 0), type: Number(p.type) || 0, data: rows,
  });
  must(r, tr("Reordering the playlist"));
  forgetLists();
}

// --------------------------------------------------------------- recent ----

function rememberTrack(track) {
  if (!track?.id) return;
  save("recent", [track, ...load("recent", []).filter((t) => t.id !== track.id)].slice(0, 100));
}

// Kugou hands its history out a page at a time, and not in order across pages,
// so read a few and sort them by when each song was played.
async function remoteRecent(limit) {
  const me = session();
  if (!me) return [];
  const seen = new Map();
  let bp = "";
  for (let page = 0; page < 3; page++) {
    const data = { token: me.token, userid: Number(me.userid), source_classify: "app", to_subdivide_sr: 1 };
    if (bp) data.bp = bp;
    const r = await request({ method: "POST", path: "/playhistory/v1/get_songs", data });
    if (!ok(r)) break;
    for (const row of r.data?.songs || []) {
      const info = row.info || row.data || row;
      const key = String(row.mxid || info.mixsongid || info.hash || "");
      const at = Number(row.ot || 0);
      if (key && (!seen.has(key) || seen.get(key).at < at)) seen.set(key, { at, info });
    }
    const next = r.data?.bp;
    if (!Number(r.data?.has_more) || !next || next === bp) break;
    bp = next;
  }
  return [...seen.values()]
    .sort((a, b) => b.at - a.at)
    .map((x) => toTrack(x.info))
    .filter(Boolean)
    .slice(0, limit);
}

async function recentTracksOf(limit) {
  const local = load("recent", []).slice(0, limit);
  const remote = await remoteRecent(limit).catch(() => []);
  const all = [...local, ...remote];
  return all.filter((t, i) => all.findIndex((x) => x.id === t.id) === i).slice(0, limit);
}

export async function recent() {
  return recentTracksOf(PAGE);
}

export async function played({ id }) {
  const generation = state.epoch;
  let track = load("recent", []).find((t) => t.id === id);
  if (!track) {
    const identity = parseId(id);
    const found = await audioDetail(identity.hash).catch(() => null);
    still(generation);
    if (!found) return;
    track = toTrack({ ...found, MixSongID: identity.mix, AlbumID: identity.album });
    if (track) track.id = id;
  }
  rememberTrack(track);
  // Tell Kugou too, so the phone app's history and this one agree.
  const me = session();
  if (me?.token) {
    request({
      method: "POST", path: "/playhistory/v1/upload_songs", params: { plat: 3 },
      data: { songs: [{ mxid: parseId(id).mix, op: 1, ot: Math.floor(Date.now() / 1000), pc: 1 }], token: me.token, userid: Number(me.userid) },
    }).catch(() => {});
  }
}

// --------------------------------------------------------------- audio ----

const LADDER = {
  lossless: ["high", "flac", "320", "128"],
  high: ["320", "128"],
  standard: ["128"],
};

async function songUrl(hash, mix, albumId, quality, freePart = false) {
  const r = await request({
    path: "/v5/url", headers: { "x-router": "trackercdn.kugou.com" }, encryptKey: true,
    params: {
      album_id: albumId, area_code: 1, hash: hash.toLowerCase(), ssa_flag: "is_fromtrack", version: 11430, page_id: 967177915,
      quality, album_audio_id: mix, behavior: "play", pid: 411, cmd: 26, pidversion: 3001, IsFreePart: freePart ? 1 : 0,
      ppage_id: "356753938,823673182,967485191", cdnBackup: 1, module: "", clientver: 11430,
    },
  });
  const url = (r?.url || [])[0] || (r?.backupUrl || [])[0];
  return r?.status === 1 && url ? { ...r, url } : null;
}

export async function stream({ id, quality = "high" }) {
  const { hash, mix, album } = parseId(id);
  await ensureDfid();
  let found = null;
  for (const q of LADDER[quality] || LADDER.high) {
    found = await songUrl(hash, mix, album, q).catch(() => null);
    if (found) break;
  }
  // Without VIP, a preview is what Kugou gives, if anything.
  if (!found) found = await songUrl(hash, mix, album, "128", true).catch(() => null);
  if (!found) throw fail(session() ? "unavailable" : "signIn", tr("This song cannot be played"));
  // Kugou's file CDN answers on http only: its hosts have no certificate, so
  // asking for https fails before a byte is read.
  const url = String(found.url);
  const flac = /flac/i.test(found.extName || "") || /\.flac(\?|$)/i.test(url);
  const type = flac ? "flac" : "mp3";
  const kbps = found.bitRate ? Math.round(found.bitRate / (found.bitRate > 10000 ? 1000 : 1)) : 0;
  return {
    url,
    type,
    quality: flac ? "lossless" : kbps >= 300 ? "high" : "standard",
    bitRate: kbps || undefined,
    size: Number(found.fileSize) || undefined,
    gain: typeof found.volume === "number" ? found.volume : undefined,
  };
}

// ------------------------------------------------------------- stations ----

export function stations() {
  return [
    { id: "normal", name: tr("Private FM"), description: tr("Plays on, to your taste") },
    { id: "small", name: tr("Niche FM"), description: tr("Good songs few people know") },
  ];
}

// Kugou hands out five songs at a time; the app asks again when they run out.
export async function stationNext({ id = "normal" }) {
  const me = session();
  const clienttime = Date.now();
  const data = {
    appid: APPID, clienttime, mid: device().mid, action: "play", recommend_source_locked: 0,
    song_pool_id: 0, callerid: 0, m_type: 1, platform: "ios", area_code: 1, remain_songcnt: 0,
    clientver: CLIENTVER, is_overplay: 0, mode: String(id) === "small" ? "small" : "normal",
    fakem: "ca981cfc583a4c37f28d2d49000013c16a0a",
    key: md5(`${APPID}${SALT}${CLIENTVER}${clienttime}`),
  };
  if (me?.userid) Object.assign(data, { userid: Number(me.userid), kguid: Number(me.userid), token: me.token });
  const r = await request({
    method: "POST", path: "/v2/personal_recommend", headers: { "x-router": "persnfm.service.kugou.com" }, data,
  });
  must(r, tr("Private FM"));
  const songs = r?.data?.song_list || r?.data?.songs || r?.data?.list || (Array.isArray(r?.data) ? r.data : []);
  const tracks = tracksOf(songs);
  if (!tracks.length) throw fail("unavailable", tr("Private FM found nothing to play"));
  return tracks;
}

// --------------------------------------------------------------- lyrics ----
// KRC carries the timing of each word, which the app animates; LRC is the
// plain fallback for songs Kugou has only that for.

const KRC_KEY = [64, 71, 97, 119, 94, 50, 116, 71, 81, 54, 49, 45, 206, 210, 110, 105];

function inflate(bytes) {
  let size = 1 << 17;
  for (;;) {
    try {
      return tinf_uncompress(bytes, new Uint8Array(size));
    } catch {
      size *= 4;
      if (size > 1 << 23) throw fail("unavailable", tr("The lyric couldn't be read"));
    }
  }
}

// A KRC file is a 4-byte header, the body xored with a fixed key, then zlib.
function decodeKrc(content) {
  const bytes = fromB64(content).slice(4);
  for (let i = 0; i < bytes.length; i++) bytes[i] ^= KRC_KEY[i % 16];
  return unutf8(inflate(bytes.subarray(2)));
}

function krcLines(text) {
  const lines = [];
  let translated = [];
  for (const row of text.split(/\r?\n/)) {
    const lang = /^\[language:(.*)\]$/.exec(row);
    if (lang) {
      try {
        const data = JSON.parse(unutf8(fromB64(lang[1])));
        const found = (data.content || []).find((c) => Number(c.type) === 1);
        if (found) translated = found.lyricContent.map((line) => line.join(""));
      } catch { /* no translation this time */ }
      continue;
    }
    const m = /^\[(\d+),(\d+)\](.*)$/.exec(row);
    if (!m) continue;
    const start = Number(m[1]), end = start + Number(m[2]);
    const words = [];
    const re = /<(\d+),(\d+),\d+>([^<]*)/g;
    let w;
    while ((w = re.exec(m[3]))) {
      const at = start + Number(w[1]);
      words.push({ start: at, end: at + Number(w[2]), text: w[3] });
    }
    lines.push({
      start,
      end,
      text: words.length ? words.map((x) => x.text).join("") : m[3],
      words: words.length ? words : undefined,
    });
  }
  lines.forEach((line, i) => {
    const text = (translated[i] || "").trim();
    if (text && text !== "//") line.translation = translated[i];
  });
  return lines;
}

export async function lyrics({ id }) {
  const { hash, mix } = parseId(id);
  const search = await request({
    base: "https://lyrics.kugou.com", path: "/v1/search", clearDefault: true,
    params: { album_audio_id: mix, appid: APPID, clientver: CLIENTVER, duration: 0, hash, keyword: "", lrctxt: 1, man: "no" },
  });
  const c = (search?.candidates || [])[0];
  if (!c) return {};
  const base = { ver: 1, client: "android", id: c.id, accesskey: c.accesskey, charset: "utf8" };
  const krc = await request({
    base: "https://lyrics.kugou.com", path: "/download", clearDefault: true, params: { ...base, fmt: "krc" },
  }).catch(() => null);
  if (krc?.content) {
    try {
      const lines = krcLines(Number(krc.contenttype) === 0 ? decodeKrc(krc.content) : unutf8(fromB64(krc.content)));
      if (lines.length) return { lines };
    } catch { /* fall back to the plain text */ }
  }
  const lrc = await request({
    base: "https://lyrics.kugou.com", path: "/download", clearDefault: true, params: { ...base, fmt: "lrc" },
  });
  if (!lrc?.content) return {};
  return { lrc: unutf8(fromB64(lrc.content)) };
}


// -------------------------------------------------------------- inflate ----
// tiny-inflate 1.0.3, (c) 2015-present Devon Govett, MIT. Vendored as it was
// published: a KRC lyric is zlib-deflated and the host has no decompressor.

var TINF_OK = 0;
var TINF_DATA_ERROR = -3;

function Tree() {
  this.table = new Uint16Array(16);   /* table of code length counts */
  this.trans = new Uint16Array(288);  /* code -> symbol translation table */
}

function Data(source, dest) {
  this.source = source;
  this.sourceIndex = 0;
  this.tag = 0;
  this.bitcount = 0;
  
  this.dest = dest;
  this.destLen = 0;
  
  this.ltree = new Tree();  /* dynamic length/symbol tree */
  this.dtree = new Tree();  /* dynamic distance tree */
}

/* --------------------------------------------------- *
 * -- uninitialized global data (static structures) -- *
 * --------------------------------------------------- */

var sltree = new Tree();
var sdtree = new Tree();

/* extra bits and base tables for length codes */
var length_bits = new Uint8Array(30);
var length_base = new Uint16Array(30);

/* extra bits and base tables for distance codes */
var dist_bits = new Uint8Array(30);
var dist_base = new Uint16Array(30);

/* special ordering of code length codes */
var clcidx = new Uint8Array([
  16, 17, 18, 0, 8, 7, 9, 6,
  10, 5, 11, 4, 12, 3, 13, 2,
  14, 1, 15
]);

/* used by tinf_decode_trees, avoids allocations every call */
var code_tree = new Tree();
var lengths = new Uint8Array(288 + 32);

/* ----------------------- *
 * -- utility functions -- *
 * ----------------------- */

/* build extra bits and base tables */
function tinf_build_bits_base(bits, base, delta, first) {
  var i, sum;

  /* build bits table */
  for (i = 0; i < delta; ++i) bits[i] = 0;
  for (i = 0; i < 30 - delta; ++i) bits[i + delta] = i / delta | 0;

  /* build base table */
  for (sum = first, i = 0; i < 30; ++i) {
    base[i] = sum;
    sum += 1 << bits[i];
  }
}

/* build the fixed huffman trees */
function tinf_build_fixed_trees(lt, dt) {
  var i;

  /* build fixed length tree */
  for (i = 0; i < 7; ++i) lt.table[i] = 0;

  lt.table[7] = 24;
  lt.table[8] = 152;
  lt.table[9] = 112;

  for (i = 0; i < 24; ++i) lt.trans[i] = 256 + i;
  for (i = 0; i < 144; ++i) lt.trans[24 + i] = i;
  for (i = 0; i < 8; ++i) lt.trans[24 + 144 + i] = 280 + i;
  for (i = 0; i < 112; ++i) lt.trans[24 + 144 + 8 + i] = 144 + i;

  /* build fixed distance tree */
  for (i = 0; i < 5; ++i) dt.table[i] = 0;

  dt.table[5] = 32;

  for (i = 0; i < 32; ++i) dt.trans[i] = i;
}

/* given an array of code lengths, build a tree */
var offs = new Uint16Array(16);

function tinf_build_tree(t, lengths, off, num) {
  var i, sum;

  /* clear code length count table */
  for (i = 0; i < 16; ++i) t.table[i] = 0;

  /* scan symbol lengths, and sum code length counts */
  for (i = 0; i < num; ++i) t.table[lengths[off + i]]++;

  t.table[0] = 0;

  /* compute offset table for distribution sort */
  for (sum = 0, i = 0; i < 16; ++i) {
    offs[i] = sum;
    sum += t.table[i];
  }

  /* create code->symbol translation table (symbols sorted by code) */
  for (i = 0; i < num; ++i) {
    if (lengths[off + i]) t.trans[offs[lengths[off + i]]++] = i;
  }
}

/* ---------------------- *
 * -- decode functions -- *
 * ---------------------- */

/* get one bit from source stream */
function tinf_getbit(d) {
  /* check if tag is empty */
  if (!d.bitcount--) {
    /* load next tag */
    d.tag = d.source[d.sourceIndex++];
    d.bitcount = 7;
  }

  /* shift bit out of tag */
  var bit = d.tag & 1;
  d.tag >>>= 1;

  return bit;
}

/* read a num bit value from a stream and add base */
function tinf_read_bits(d, num, base) {
  if (!num)
    return base;

  while (d.bitcount < 24) {
    d.tag |= d.source[d.sourceIndex++] << d.bitcount;
    d.bitcount += 8;
  }

  var val = d.tag & (0xffff >>> (16 - num));
  d.tag >>>= num;
  d.bitcount -= num;
  return val + base;
}

/* given a data stream and a tree, decode a symbol */
function tinf_decode_symbol(d, t) {
  while (d.bitcount < 24) {
    d.tag |= d.source[d.sourceIndex++] << d.bitcount;
    d.bitcount += 8;
  }
  
  var sum = 0, cur = 0, len = 0;
  var tag = d.tag;

  /* get more bits while code value is above sum */
  do {
    cur = 2 * cur + (tag & 1);
    tag >>>= 1;
    ++len;

    sum += t.table[len];
    cur -= t.table[len];
  } while (cur >= 0);
  
  d.tag = tag;
  d.bitcount -= len;

  return t.trans[sum + cur];
}

/* given a data stream, decode dynamic trees from it */
function tinf_decode_trees(d, lt, dt) {
  var hlit, hdist, hclen;
  var i, num, length;

  /* get 5 bits HLIT (257-286) */
  hlit = tinf_read_bits(d, 5, 257);

  /* get 5 bits HDIST (1-32) */
  hdist = tinf_read_bits(d, 5, 1);

  /* get 4 bits HCLEN (4-19) */
  hclen = tinf_read_bits(d, 4, 4);

  for (i = 0; i < 19; ++i) lengths[i] = 0;

  /* read code lengths for code length alphabet */
  for (i = 0; i < hclen; ++i) {
    /* get 3 bits code length (0-7) */
    var clen = tinf_read_bits(d, 3, 0);
    lengths[clcidx[i]] = clen;
  }

  /* build code length tree */
  tinf_build_tree(code_tree, lengths, 0, 19);

  /* decode code lengths for the dynamic trees */
  for (num = 0; num < hlit + hdist;) {
    var sym = tinf_decode_symbol(d, code_tree);

    switch (sym) {
      case 16:
        /* copy previous code length 3-6 times (read 2 bits) */
        var prev = lengths[num - 1];
        for (length = tinf_read_bits(d, 2, 3); length; --length) {
          lengths[num++] = prev;
        }
        break;
      case 17:
        /* repeat code length 0 for 3-10 times (read 3 bits) */
        for (length = tinf_read_bits(d, 3, 3); length; --length) {
          lengths[num++] = 0;
        }
        break;
      case 18:
        /* repeat code length 0 for 11-138 times (read 7 bits) */
        for (length = tinf_read_bits(d, 7, 11); length; --length) {
          lengths[num++] = 0;
        }
        break;
      default:
        /* values 0-15 represent the actual code lengths */
        lengths[num++] = sym;
        break;
    }
  }

  /* build dynamic trees */
  tinf_build_tree(lt, lengths, 0, hlit);
  tinf_build_tree(dt, lengths, hlit, hdist);
}

/* ----------------------------- *
 * -- block inflate functions -- *
 * ----------------------------- */

/* given a stream and two trees, inflate a block of data */
function tinf_inflate_block_data(d, lt, dt) {
  while (1) {
    var sym = tinf_decode_symbol(d, lt);

    /* check for end of block */
    if (sym === 256) {
      return TINF_OK;
    }

    if (sym < 256) {
      d.dest[d.destLen++] = sym;
    } else {
      var length, dist, offs;
      var i;

      sym -= 257;

      /* possibly get more bits from length code */
      length = tinf_read_bits(d, length_bits[sym], length_base[sym]);

      dist = tinf_decode_symbol(d, dt);

      /* possibly get more bits from distance code */
      offs = d.destLen - tinf_read_bits(d, dist_bits[dist], dist_base[dist]);

      /* copy match */
      for (i = offs; i < offs + length; ++i) {
        d.dest[d.destLen++] = d.dest[i];
      }
    }
  }
}

/* inflate an uncompressed block of data */
function tinf_inflate_uncompressed_block(d) {
  var length, invlength;
  var i;
  
  /* unread from bitbuffer */
  while (d.bitcount > 8) {
    d.sourceIndex--;
    d.bitcount -= 8;
  }

  /* get length */
  length = d.source[d.sourceIndex + 1];
  length = 256 * length + d.source[d.sourceIndex];

  /* get one's complement of length */
  invlength = d.source[d.sourceIndex + 3];
  invlength = 256 * invlength + d.source[d.sourceIndex + 2];

  /* check length */
  if (length !== (~invlength & 0x0000ffff))
    return TINF_DATA_ERROR;

  d.sourceIndex += 4;

  /* copy block */
  for (i = length; i; --i)
    d.dest[d.destLen++] = d.source[d.sourceIndex++];

  /* make sure we start next block on a byte boundary */
  d.bitcount = 0;

  return TINF_OK;
}

/* inflate stream from source to dest */
function tinf_uncompress(source, dest) {
  var d = new Data(source, dest);
  var bfinal, btype, res;

  do {
    /* read final block flag */
    bfinal = tinf_getbit(d);

    /* read block type (2 bits) */
    btype = tinf_read_bits(d, 2, 0);

    /* decompress block */
    switch (btype) {
      case 0:
        /* decompress uncompressed block */
        res = tinf_inflate_uncompressed_block(d);
        break;
      case 1:
        /* decompress block with fixed huffman trees */
        res = tinf_inflate_block_data(d, sltree, sdtree);
        break;
      case 2:
        /* decompress block with dynamic huffman trees */
        tinf_decode_trees(d, d.ltree, d.dtree);
        res = tinf_inflate_block_data(d, d.ltree, d.dtree);
        break;
      default:
        res = TINF_DATA_ERROR;
    }

    if (res !== TINF_OK)
      throw new Error('Data error');

  } while (!bfinal);

  if (d.destLen < d.dest.length) {
    if (typeof d.dest.slice === 'function')
      return d.dest.slice(0, d.destLen);
    else
      return d.dest.subarray(0, d.destLen);
  }
  
  return d.dest;
}

/* -------------------- *
 * -- initialization -- *
 * -------------------- */

/* build fixed huffman trees */
tinf_build_fixed_trees(sltree, sdtree);

/* build extra bits and base tables */
tinf_build_bits_base(length_bits, length_base, 4, 3);
tinf_build_bits_base(dist_bits, dist_base, 2, 1);

/* fix a special case */
length_bits[28] = 0;
length_base[28] = 258;

// Begin the day's VIP claim as soon as the plugin loads with the app.
// host.storage can't be touched while the module is still loading.
setTimeout(() => { try { if (session()) startDaily(); } catch { /* not ready */ } }, 3000);
