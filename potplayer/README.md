# PotPlayer 网页视频工具

这组脚本把网页中的直接视频地址交给 PotPlayer。单视频和多视频统一使用 playlist/DPL 链路，不修改 `kingen-study`，并按 Video.js 播放器实例提供独立入口。

## 支持的功能

- 每个 Video.js 实例只显示一个自己的 PotPlayer 按钮；
- 从该实例的 `host.player` 读取完整 playlist 和当前播放项；
- 单视频和多视频都生成该实例自己的 PotPlayer 播放列表；
- 单视频显示 `PotPlayer`，多视频显示 `PotPlayer(N)`；
- 多视频从网页当前播放项开始，并保留该实例原始播放顺序；
- 不同 Video.js 实例绝不合并数据，即使视频 URL 相同；
- 普通 HTML5 `<video>` 页面继续使用单视频 fallback，并生成单项播放列表。

网页脚本只会转发 PotPlayer 可直接访问的 `file:`, `http:`, `https:`, `rtmp:` 和 `rtsp:` 地址。`blob:`、`data:` 等只存在于浏览器内部的地址会被跳过。

## 注册协议

在仓库根目录打开 PowerShell 或命令提示符：

```text
py -3 potplayer\\potplayer_protocol.py register
```

注册命令会优先使用同一 Python 目录下的 `pythonw.exe`，浏览器点击协议时不会闪出 Python 控制台。处理结果和异常写入：

```text
%TEMP%\\kingen-potplayer\\protocol.log
```

修改脚本或 Python 桥接程序后，需要重新执行一次 `register` 更新当前用户注册表。

如果 PotPlayer 不在默认目录：

```text
py -3 potplayer\\potplayer_protocol.py register --potplayer "D:\\Apps\\PotPlayer\\PotPlayerMini64.exe"
```

注册信息写入当前用户注册表，不需要管理员权限。移除协议：

```text
py -3 potplayer\\potplayer_protocol.py unregister
```

## 安装用户脚本

在 Tampermonkey 中打开并安装 `potplayer.js`。协议注册完成后：

1. 在目标 Video.js 播放器内单击它自己的 `PotPlayer` 标签；
2. 单视频和多视频都会使用一个 PotPlayer 窗口打开对应 playlist，并从网页当前项开始；
3. 页面中的其他 Video.js 实例不会被合并，也不会共享按钮。

## 协议格式

唯一协议格式：

```text
potplayer://playlist?items=<base64url-json>
```

payload 格式为：

```json
{
  "playlistTitle": "页面标题",
  "items": [
    {
      "video": "https://example.com/video.m3u8",
      "title": "Episode 1"
    }
  ],
  "startIndex": 0
}
```

协议只接受对象 payload 和播放列表入口。旧版 payload 中包含已移除字段时会直接拒绝。桥接程序生成的 DPL 使用 PotPlayer 的 `playname`、`topindex`、`saveplaypos`、`file` 和 `title` 字段，并直接保存真实视频 URL。页面标题用于生成临时 DPL 文件名。

## 限制

- 浏览器页面必须暴露真实的视频 URL；`blob:`、MSE 内存地址和 DRM 视频不能被通用脚本直接交给 PotPlayer；
- 视频 URL 必须能被 PotPlayer 独立访问；如果网站依赖浏览器 Cookie、Referer 或鉴权头，可能仍需要网站专用适配；
- Video.js 需要在对应 `<video-js>` 元素的 `player` 属性上暴露实例；脚本不依赖 `window.videojs`；
- 普通 HTML5 fallback 只处理当前可访问的 `<video>` 元素，不会把不同播放器实例拼成一个播放列表；
- 旧版 `D:\Projects\tools-py\internet\tampermonkey\player.js` 不应与本脚本同时启用，否则会额外注入旧样式按钮；本工具不会修改该旧脚本。
