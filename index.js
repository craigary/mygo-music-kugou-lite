const API = "https://gateway.kugou.com";
const APP_ID = 3116;
const CLIENT_VERSION = 11440;
const SIGNING_SALT = "LnT6xpN3khm36zse0QzvmgTZ3waWdRSA";
const PLAY_KEY_SALT = "185672dd44712f60bb1736df5a377e82";
const USER_AGENT = "Android15-1070-11083-46-0-DiscoveryDRADProtocol-wifi";
const PAGE_SIZE = 30;

const storage = () => host.storage;
const md5 = (value) => host.crypto.md5(String(value));
const asString = (value) => typeof value === "object" ? JSON.stringify(value) : String(value);
const array = (...values) => values.find(Array.isArray) || [];
const imageUrl = (value) => {
  if (!value) return undefined;
  return String(value)
    .replace("{size}", "400")
    .replace("/stdmusic/240/", "/stdmusic/400/")
    .replace(/^http:/, "https:");
};

function deviceId() {
  let id = storage().get("deviceGuid");
  if (!id) {
    id = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
    storage().set("deviceGuid", id);
  }
  return BigInt(`0x${md5(id)}`).toString();
}

function signature(params, body = "") {
  const canonical = Object.keys(params).sort()
    .map((key) => `${key}=${asString(params[key])}`)
    .join("");
  return md5(`${SIGNING_SALT}${canonical}${body}${SIGNING_SALT}`);
}

async function request(path, { params = {}, body, router, base = API, bare = false, signed = true } = {}) {
  const timestamp = Math.floor(Date.now() / 1000);
  const query = bare ? { ...params } : {
    dfid: storage().get("dfid") || "-",
    mid: deviceId(),
    uuid: "-",
    appid: APP_ID,
    clientver: CLIENT_VERSION,
    clienttime: timestamp,
    ...params,
  };
  const payload = body === undefined ? undefined : JSON.stringify(body);
  if (signed) query.signature = signature(query, payload);
  const search = new URLSearchParams(Object.entries(query).map(([k, v]) => [k, asString(v)]));
  const headers = {
    "User-Agent": USER_AGENT,
    "kg-rc": "1",
    ...(router ? { "x-router": router } : {}),
    ...(payload ? { "Content-Type": "application/json" } : {}),
  };
  const response = await fetch(`${base}${path}?${search}`, {
    method: payload ? "POST" : "GET",
    headers,
    body: payload,
  });
  if (!response.ok) throw new Error(`Kugou request failed (HTTP ${response.status})`);
  const result = await response.json();
  const code = Number(result.error_code || result.errcode || result.err_code || 0);
  if (result.status === 0 || (code && code !== 200)) {
    throw new Error(result.error || result.error_msg || result.msg || `Kugou error ${code}`);
  }
  return result.data ?? result;
}

function artistsFrom(raw = {}) {
  const source = raw.singerinfo || raw.authors || raw.singers;
  if (Array.isArray(source)) {
    return source.map((artist) => ({
      id: String(artist.id ?? artist.author_id ?? artist.singerid ?? ""),
      name: String(artist.name ?? artist.author_name ?? artist.singername ?? ""),
      imageUrl: imageUrl(artist.avatar || artist.imgurl),
    })).filter((artist) => artist.name);
  }
  const names = String(raw.SingerName || raw.singername || raw.author_name || raw.singer || "");
  const ids = String(raw.singerid || raw.author_id || "").split(/[,、]/);
  return names.split(/[、&,，]/).map((name, index) => ({
    id: ids[index] || `name:${name.trim()}`,
    name: name.trim(),
  })).filter((artist) => artist.name);
}

function toTrack(raw = {}) {
  const data = { ...raw, ...(raw.base || {}), ...(raw.audio_info || {}) };
  const hash = data.hash || data.FileHash || data.HASH || data.audio_hash;
  if (!hash) return null;
  const albumInfo = raw.album_info || raw.albuminfo || {};
  const artists = artistsFrom(raw).length ? artistsFrom(raw) : artistsFrom(data);
  let name = String(data.songname || data.SongName || data.audio_name || data.name || data.filename || "");
  name = name.replace(/\.(mp3|flac|ogg|m4a|wav|ape)$/i, "");
  let duration = Number(data.duration || data.Duration || data.timelength || 0);
  if (duration && duration < 10000) duration *= 1000;
  const albumId = data.album_id || data.AlbumID || albumInfo.album_id || 0;
  return {
    id: `${String(hash).toUpperCase()}_${data.mixsongid || data.album_audio_id || 0}_${albumId}`,
    name: name || "Unknown",
    artists,
    album: {
      id: String(albumId),
      name: String(data.album_name || data.AlbumName || albumInfo.album_name || ""),
      imageUrl: imageUrl(data.sizable_cover || data.album_img || albumInfo.cover),
    },
    duration,
  };
}

function toAlbum(raw = {}) {
  return {
    id: String(raw.album_id ?? raw.AlbumID ?? raw.id ?? ""),
    name: String(raw.album_name ?? raw.AlbumName ?? raw.name ?? ""),
    imageUrl: imageUrl(raw.sizable_cover || raw.Image || raw.imgurl || raw.cover),
    artists: artistsFrom(raw),
  };
}

function toArtist(raw = {}) {
  return {
    id: String(raw.author_id ?? raw.AuthorId ?? raw.singerid ?? raw.id ?? ""),
    name: String(raw.author_name ?? raw.AuthorName ?? raw.singername ?? raw.name ?? ""),
    imageUrl: imageUrl(raw.sizable_avatar || raw.avatar || raw.imgurl || raw.Image),
  };
}

function toPlaylist(raw = {}) {
  return {
    id: String(raw.global_collection_id || raw.gid || raw.specialid || raw.id || ""),
    name: String(raw.specialname || raw.name || raw.title || ""),
    imageUrl: imageUrl(raw.flexible_cover || raw.imgurl || raw.pic || raw.cover || raw.img),
    description: String(raw.intro || raw.description || "") || undefined,
    trackCount: Number(raw.songcount || raw.count || raw.song_count || 0) || undefined,
  };
}

const trackList = (items) => items.map(toTrack).filter(Boolean);

export async function search({ query, kind = "tracks", offset = 0 }) {
  const kinds = { tracks: "song", albums: "album", artists: "author", playlists: "special" };
  const type = kinds[kind];
  if (!type) throw Object.assign(new Error("Unsupported search type"), { code: "unsupported" });
  const pageSize = kind === "albums" ? 20 : PAGE_SIZE;
  const page = Math.floor(offset / pageSize) + 1;
  const data = await request(type === "song" ? "/v2/search/song" : `/v1/search/${type}`, {
    router: "complexsearch.kugou.com",
    params: {
      keyword: query,
      page,
      pagesize: pageSize,
      platform: "AndroidFilter",
      iscorrection: 1,
      ...(type === "song" ? { privilegefilter: 0, area_code: 1 } : { albumhide: 0, nocollect: 0 }),
    },
  });
  const items = array(data.lists, data.info, data.list);
  const more = Number(data.total || 0) ? page * pageSize < Number(data.total) : items.length >= pageSize;
  const output = {
    tracks: () => ({ tracks: trackList(items), more }),
    albums: () => ({ albums: items.map(toAlbum).filter((item) => item.id), more }),
    artists: () => ({ artists: items.map(toArtist).filter((item) => item.id), more }),
    playlists: () => ({ playlists: items.map(toPlaylist).filter((item) => item.id), more }),
  };
  return output[kind]();
}

export async function suggest({ query }) {
  if (!query.trim()) return [];
  const data = await request("/v2/getSearchTip", {
    router: "searchtip.kugou.com",
    params: {
      keyword: query,
      AlbumTipCount: 0,
      CorrectTipCount: 0,
      MVTipCount: 0,
      MusicTipCount: 10,
      radiotip: 0,
    },
  });
  const suggestions = [];
  for (const group of array(data, data.data)) {
    for (const item of array(group.RecordDatas, group.records)) {
      const value = item.HintInfo || item.hintinfo;
      if (value) suggestions.push(String(value));
    }
  }
  return [...new Set(suggestions)].slice(0, 10);
}

export async function home() {
  let tracks = [];
  try {
    const data = await request("/everyday_song_recommend", {
      router: "everydayrec.service.kugou.com",
      params: { platform: "ios" },
      body: {},
    });
    tracks = trackList(array(data.song_list, data.songs, data.info));
  } catch {
    tracks = [];
  }
  return {
    title: "Kugou Concept",
    sections: tracks.length ? [{ title: "Daily picks", tracks, morePage: "daily" }] : [],
  };
}

export async function browse({ page }) {
  if (page === "charts") {
    const data = await request("/ocean/v6/rank/list", { params: { plat: 2, withsong: 0, parentid: 0 } });
    return {
      title: "Charts",
      sections: [{
        title: "Kugou charts",
        links: array(data.info, data.list).map((rank) => ({
          title: String(rank.rankname || rank.name || ""),
          subtitle: String(rank.intro || ""),
          imageUrl: imageUrl(rank.imgurl || rank.image),
          page: `rank:${rank.rankid}`,
        })).filter((item) => item.title),
      }],
    };
  }
  if (page === "daily") {
    const data = await request("/everyday_song_recommend", {
      router: "everydayrec.service.kugou.com",
      params: { platform: "ios" },
      body: {},
    });
    return { title: "Daily picks", sections: [{ title: "Songs", tracks: trackList(array(data.song_list, data.songs, data.info)) }] };
  }
  if (String(page).startsWith("rank:")) {
    const rankId = Number(String(page).slice(5));
    if (!Number.isSafeInteger(rankId) || rankId <= 0) throw new Error("Invalid chart");
    const data = await request("/openapi/kmr/v2/rank/audio", {
      body: { pagesize: PAGE_SIZE, rank_id: rankId, page: 1, type: 1 },
    });
    return { title: "Chart", sections: [{ title: "Songs", tracks: trackList(array(data.songlist, data.song_list, data.info, data.list)) }] };
  }
  throw Object.assign(new Error("Unsupported page"), { code: "unsupported" });
}

export async function album({ id }) {
  const [detail, firstPage] = await Promise.all([
    request("/kmr/v2/albums", {
      router: "openapi.kugou.com",
      params: {},
      body: {
        data: [{ album_id: String(id) }],
        is_buy: 0,
        fields: "album_id,album_name,publish_date,sizable_cover,authors,author_name,trans_param",
      },
    }).catch(() => ({})),
    request("/v1/album_audio/lite", {
      router: "openapi.kugou.com",
      body: { album_id: String(id), is_buy: "", page: 1, pagesize: PAGE_SIZE },
    }),
  ]);
  const rawAlbum = array(detail, detail.info, detail.list)[0] || {};
  const albumInfo = toAlbum(rawAlbum);
  albumInfo.id = String(id);
  const total = Number(firstPage.total || 0);
  const pageCount = Math.min(Math.ceil(total / PAGE_SIZE), 10);
  const nextPages = await Promise.all(
    Array.from({ length: Math.max(pageCount - 1, 0) }, (_, index) =>
      request("/v1/album_audio/lite", {
        router: "openapi.kugou.com",
        body: { album_id: String(id), is_buy: "", page: index + 2, pagesize: PAGE_SIZE },
      }).catch(() => ({})),
    ),
  );
  const tracks = trackList([firstPage, ...nextPages].flatMap((page) => array(page.songs, page.info, page.list)));
  for (const track of tracks) {
    if (!track.album.imageUrl) track.album.imageUrl = albumInfo.imageUrl;
    if (!track.album.name) track.album.name = albumInfo.name;
    if (!track.album.id) track.album.id = albumInfo.id;
  }
  if (!albumInfo.name && tracks[0]) albumInfo.name = tracks[0].album.name;
  if (!albumInfo.imageUrl && tracks[0]) albumInfo.imageUrl = tracks[0].album.imageUrl;
  return { album: albumInfo, tracks };
}

export async function artist({ id }) {
  let artistId = String(id);
  if (artistId.startsWith("name:")) {
    const result = await search({ query: artistId.slice(5), kind: "artists" });
    if (!result.artists[0]) throw Object.assign(new Error("Artist not found"), { code: "unavailable" });
    artistId = result.artists[0].id;
  }
  const [detail, songs, albums] = await Promise.all([
    request("/kmr/v3/author", {
      router: "openapi.kugou.com",
      body: { author_id: artistId },
    }).catch(() => ({})),
    request("/kmr/v1/audio_group/author", {
      base: "https://openapi.kugou.com",
      router: "openapi.kugou.com",
      body: {
        appid: APP_ID,
        clientver: CLIENT_VERSION,
        mid: deviceId(),
        clienttime: Math.floor(Date.now() / 1000),
        author_id: artistId,
        pagesize: 100,
        page: 1,
        sort: 1,
        area_code: "all",
      },
    }).catch(() => []),
    request("/kmr/v1/author/albums", {
      router: "openapi.kugou.com",
      body: { author_id: artistId, pagesize: PAGE_SIZE, page: 1, sort: 1, category: 1, area_code: "all" },
    }).catch(() => []),
  ]);
  const artistInfo = toArtist(Array.isArray(detail) ? detail[0] : detail);
  artistInfo.id = artistId;
  return {
    artist: artistInfo,
    tracks: trackList(array(songs, songs.info, songs.list)),
    albums: array(albums, albums.info, albums.list).map(toAlbum).filter((item) => item.id),
  };
}

export async function playlist({ id }) {
  const metadata = await request("/v3/get_list_info", {
    router: "pubsongs.kugou.com",
    body: { data: [{ global_collection_id: String(id) }], userid: "0", token: "" },
  }).catch(() => ({}));
  const info = array(metadata, metadata.info, metadata.list)[0] || {};
  const tracks = [];
  for (let page = 0; page < 10; page++) {
    const data = await request("/pubsongs/v2/get_other_list_file_nofilt", {
      params: {
        area_code: 1,
        begin_idx: page * 300,
        plat: 1,
        type: 1,
        mode: 1,
        personal_switch: 1,
        extend_fields: "abtags,hot_cmt,popularization",
        pagesize: 300,
        global_collection_id: String(id),
      },
    });
    const nextTracks = trackList(array(data.songs, data.info, data.list));
    tracks.push(...nextTracks);
    if (nextTracks.length < 300 || (Number(data.count) && tracks.length >= Number(data.count))) break;
  }
  return { ...toPlaylist({ ...info, global_collection_id: String(id) }), trackCount: tracks.length, tracks };
}

function parseTrackId(id) {
  const [hash, mixsongid = "0", albumId = "0"] = String(id).split("_");
  if (!/^[a-f0-9]{32}$/i.test(hash)) throw Object.assign(new Error("Invalid song"), { code: "unavailable" });
  return { hash: hash.toLowerCase(), mixsongid: Number(mixsongid) || 0, albumId: Number(albumId) || 0 };
}

const qualityOptions = {
  standard: ["128"],
  high: ["320", "128"],
  lossless: ["high", "flac", "320", "128"],
};

export async function stream({ id, quality = "high" }) {
  const song = parseTrackId(id);
  const mid = deviceId();
  let lastError;
  for (const qualityName of qualityOptions[quality] || qualityOptions.high) {
    const params = {
      dfid: storage().get("dfid") || "-",
      mid,
      uuid: "-",
      appid: APP_ID,
      clientver: CLIENT_VERSION,
      clienttime: Math.floor(Date.now() / 1000),
      hash: song.hash,
      album_id: song.albumId,
      album_audio_id: song.mixsongid,
      quality: qualityName,
      behavior: "play",
      key: md5(`${song.hash}${PLAY_KEY_SALT}${APP_ID}${mid}0`),
    };
    try {
      const data = await request("/v5/url", {
        base: "https://trackercdn.kugou.com",
        bare: true,
        router: "trackercdn.kugou.com",
        params,
      });
      const url = array(data.url, data.backupUrl, data.backup_url)
        .find((candidate) => typeof candidate === "string" && candidate.startsWith("https://"));
      if (!url) continue;
      const type = String(data.extName || data.ext || new URL(url).pathname.split(".").pop()).toLowerCase();
      if (!["mp3", "flac", "ogg"].includes(type)) continue;
      let bitrate = Number(data.bitRate || data.bitrate || 0);
      if (bitrate > 10000) bitrate = Math.round(bitrate / 1000);
      return {
        url,
        type,
        quality: type === "flac" ? "lossless" : bitrate >= 300 ? "high" : "standard",
        bitRate: bitrate || undefined,
        size: Number(data.fileSize || data.filesize || 0) || undefined,
      };
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) throw lastError;
  throw Object.assign(new Error("This song is unavailable or requires a Kugou account"), { code: "unavailable" });
}

export async function lyrics({ id }) {
  const { hash, mixsongid } = parseTrackId(id);
  const found = await request("/search", {
    base: "https://lyrics.kugou.com",
    bare: true,
    signed: false,
    params: { ver: 1, man: "yes", client: "mobi", hash, album_audio_id: mixsongid || "" },
  });
  const candidate = array(found.candidates)[0];
  if (!candidate) throw Object.assign(new Error("No lyrics found"), { code: "unavailable" });
  const downloaded = await request("/download", {
    base: "https://lyrics.kugou.com",
    bare: true,
    signed: false,
    params: {
      ver: 1,
      client: "android",
      id: candidate.id,
      accesskey: candidate.accesskey,
      fmt: "lrc",
      charset: "utf8",
    },
  });
  if (!downloaded.content) throw Object.assign(new Error("No lyrics found"), { code: "unavailable" });
  const binary = atob(downloaded.content);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return { lrc: new TextDecoder().decode(bytes) };
}

export const __test = { imageUrl, toTrack, toAlbum, toArtist, toPlaylist, parseTrackId, signature };
