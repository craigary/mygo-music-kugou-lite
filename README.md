# 酷狗概念版 (Kugou Lite) for MyGo Music

给 [MyGo Music](https://github.com/egoist/mygo-music) 的酷狗音乐概念版插件。

## 安装

[在 MyGo Music 里安装](mygo-music://install-plugin?repo=craigary/mygo-music-kugou-lite)，或在 **设置 → 插件 → +** 里填仓库地址：

```text
https://github.com/craigary/mygo-music-kugou-lite
```

也可以直接选这个文件夹，或用它的 zip。需要 MyGo Music **0.1.24** 或更新（见 [`plugin.json`](plugin.json) 的 `minAppVersion`）。

## 功能

- **登录**：可以在设置中通过扫码（默认）、手机号 + 短信验证码、手机号 + 密码来登录账号。
- **浏览**：在首页可查看每日推荐、推荐歌单、酷狗 TOP500、新歌和排行榜。
- **搜索**：歌曲、专辑、歌手、歌单。
- **排行榜**：完整展示整张榜单。
- **歌手**：热门歌曲和全部专辑，可以关注 / 取消关注。
- **专辑**：可以收藏和取消收藏，收藏的专辑在侧边栏「收藏的专辑」里单独一页。
- **播放**：跟随 MyGo 的音质设置，账号没有 VIP、取不到该音质时，播放较低品质的版本。
- **歌词**：逐字歌词，有翻译一并显示；没有逐字歌词时用普通歌词。
- **评论**：可以发表、点赞和取消点赞。
- **我的主页**：在左下角点击头像进入，可查看 VIP 类型和到期时间、今日签到状态、关注与粉丝、我的歌单、收藏的专辑、最近播放。
- **歌单**：新建、改名、删除、加歌、移歌、调序；别人的歌单可以收藏和取消收藏。自己建的空封面歌单，用里面第一首歌的封面。
- **电台**：私人 FM 和小众 FM。
- **最近播放**：播放记录同步到酷狗，手机 App 里也能看到。
- **每日 VIP 签到**：在设置里开启「领取每日免费 VIP」后，每天首次启动时领取当天的免费 VIP。
- **语言**：跟随 MyGo Music 的简体中文 / English 设置。

## 说明

- 首次使用时会向酷狗注册一个设备（和概念版 App 一样），之后才能取到播放地址。注册信息只存在插件自己的数据里。
- 能不能播、能播什么音质取决于账号：未登录只能播免费歌曲，VIP 歌曲需要登录并领取 VIP。
- 评论可以发表、点赞，但不能回复。
- 不支持播客和 MV。
- 登录凭证以明文存在 MyGo 的插件数据目录里（用密码登录的话，密码也会留在设置里）。

非官方插件，用的是非公开接口，酷狗改了就可能失效。接口与签名参考 [MakcRe/KuGouMusicApi](https://github.com/MakcRe/KuGouMusicApi)（MIT），评论点赞的 mlike 接口参考 [SoundFieldLab/WaveForge](https://github.com/SoundFieldLab/WaveForge)（MIT）的实测；逐字歌词解压用 [tiny-inflate](https://github.com/foliojs/tiny-inflate)（MIT，已内联）。

[MIT](LICENSE)
