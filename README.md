# 酷狗概念版 (Kugou Lite) for MyGo Music

给 [MyGo Music](https://github.com/egoist/mygo-music) 的酷狗音乐概念版插件。

## 安装

[在 MyGo Music 里安装](mygo-music://install-plugin?repo=craigary/mygo-music-kugou-lite)，或在 **设置 → 插件 → +** 里填仓库地址：

```text
https://github.com/craigary/mygo-music-kugou-lite
```

也可以直接选这个文件夹，或用它的 zip。需要 MyGo Music **0.1.20** 或更新（见 [`plugin.json`](plugin.json) 的 `minAppVersion`）。

## 功能

- **登录**：用酷狗概念版 App 扫码；也可以在插件设置里填手机号，收短信验证码登录。
- **浏览**：首页有每日推荐、推荐歌单、酷狗 TOP500、新歌和排行榜；搜索覆盖歌曲、专辑、歌手、歌单。
- **排行榜**：按歌单页展示，一次给全 500 首，不是一页 100 首往下翻。
- **歌手**：热门歌曲加全部专辑，可以关注 / 取消关注。
- **播放**：音质按无损 → 320 → 128 自动降档，账号能播到哪一档就给哪一档。
- **歌词**：优先逐字歌词（带翻译），没有再退回整行歌词。
- **评论**：歌曲评论可翻页，登录后可以发表。
- **我的**：账号页有 VIP 状态、关注与粉丝、我的歌单、最近播放。
- **歌单**：新建、改名、删除、加歌、移歌、调序；可以收藏别人的歌单，也可以取消收藏。
- **电台**：私人 FM 和小众 FM。
- **最近播放**：本地记录加酷狗听歌历史，播放时同步上报，手机 App 里能看到同一条。
- **每日 VIP**：打开 MyGo 时自动领取概念版每天的免费 VIP，结果显示在首页副标题。
- **语言**：跟随 MyGo Music 的简体中文 / English 设置。

## 说明

未登录只能播免费歌曲的试听片段，歌单和红心也需要登录。不支持评论点赞与回复、收藏专辑、播客和 MV。登录凭证以明文存在 MyGo 的插件数据目录里。

非官方插件，用的是非公开接口，酷狗改了就可能失效。接口与签名参考 [MakcRe/KuGouMusicApi](https://github.com/MakcRe/KuGouMusicApi)（MIT）；逐字歌词解压用 [tiny-inflate](https://github.com/foliojs/tiny-inflate)（MIT，已内联）。

[MIT](LICENSE)
