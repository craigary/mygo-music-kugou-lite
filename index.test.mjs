import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { __test, search } from "./index.js";

test("track mapping builds a stable id and normalizes duration and artwork", () => {
  const track = __test.toTrack({
    hash: "a".repeat(32),
    mixsongid: 42,
    album_id: 7,
    songname: "Song.mp3",
    duration: 213,
    singerinfo: [{ id: 9, name: "Artist" }],
    sizable_cover: "http://img.example/stdmusic/240/cover.jpg",
  });

  assert.equal(track.id, `${"A".repeat(32)}_42_7`);
  assert.equal(track.name, "Song");
  assert.equal(track.duration, 213000);
  assert.equal(track.artists[0].name, "Artist");
  assert.equal(track.album.imageUrl, "https://img.example/stdmusic/400/cover.jpg");
});

test("invalid tracks are ignored and missing names have a fallback", () => {
  assert.equal(__test.toTrack({ songname: "No hash" }), null);
  assert.equal(__test.toTrack({ hash: "b".repeat(32) }).name, "Unknown");
});

test("playlist mapping keeps cover and catalog metadata", () => {
  assert.deepEqual(__test.toPlaylist({
    gid: 17,
    specialname: "Mix",
    flexible_cover: "http://img.example/cover.jpg",
    songcount: 12,
  }), {
    id: "17",
    name: "Mix",
    imageUrl: "https://img.example/cover.jpg",
    description: undefined,
    trackCount: 12,
  });
});

test("stream ids require a Kugou hash", () => {
  assert.deepEqual(__test.parseTrackId(`${"C".repeat(32)}_12_34`), {
    hash: "c".repeat(32),
    mixsongid: 12,
    albumId: 34,
  });
  assert.throws(() => __test.parseTrackId("not-a-hash"), { code: "unavailable" });
});

test("search encodes the query and returns normalized paginated tracks", async () => {
  const previousHost = globalThis.host;
  const previousFetch = globalThis.fetch;
  const values = new Map();
  globalThis.host = {
    storage: {
      get: (key) => values.get(key),
      set: (key, value) => values.set(key, value),
    },
    crypto: {
      md5: (text) => createHash("md5").update(String(text)).digest("hex"),
    },
  };
  let requestUrl;
  globalThis.fetch = async (url) => {
    requestUrl = new URL(url);
    return {
      ok: true,
      json: async () => ({
        data: {
          total: 45,
          lists: [{ hash: "d".repeat(32), songname: "Found", duration: 180 }],
        },
      }),
    };
  };

  try {
    const result = await search({ query: "a song & artist", kind: "tracks", offset: 30 });
    assert.equal(requestUrl.pathname, "/v2/search/song");
    assert.equal(requestUrl.searchParams.get("keyword"), "a song & artist");
    assert.equal(requestUrl.searchParams.get("page"), "2");
    assert.ok(requestUrl.searchParams.get("signature"));
    assert.equal(result.more, false);
    assert.equal(result.tracks[0].name, "Found");
  } finally {
    globalThis.host = previousHost;
    globalThis.fetch = previousFetch;
  }
});
