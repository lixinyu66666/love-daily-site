# ML99 恋爱日常

一个清爽简约的静态网站，用来记录照片、视频、日志和留言。前端继续部署在 GitHub Pages，照片、照片缩略图、日志和留言可以保存到 Supabase Free。

## 功能

- 添加、删除、预览照片
- 上传前自动压缩照片，并生成缩略图
- 添加、删除、播放视频，默认单个视频不超过 45 MB
- 添加、删除日志和留言
- 修改日志和留言
- 自动计算从 2022 年 12 月 10 日开始的恋爱天数
- 自动显示距离下一个整百天纪念日还有几天
- 配置 Supabase 后使用 Supabase Auth 验证密码，数据库和文件通过 RLS 限制为登录后访问

## 使用方式

在项目目录中启动一个本地静态服务：

```bash
python3 -m http.server 4173
```

然后打开：

```text
http://localhost:4173
```

如果没有填写 Supabase 配置，网站会保留本地预览模式：照片和视频保存在当前浏览器的 IndexedDB 中，日志和留言保存在 localStorage 中。换浏览器、清理站点数据或更换电脑后，本地数据不会自动同步。

## Supabase Free 配置

1. 在 Supabase 新建一个 Free 项目。
2. 打开 `SQL Editor`，运行 [supabase/schema.sql](supabase/schema.sql)。
3. 进入 `Authentication -> Users`，添加一个用户。邮箱可以自定义，例如 `ml99@example.com`；密码设置为 `620725`，并勾选或选择确认用户。
4. 在 Supabase 项目设置里复制 Project URL 和 anon/public key，填写到 [supabase-config.js](supabase-config.js)：

```js
window.ML99_SUPABASE_CONFIG = {
  url: "https://你的项目.supabase.co",
  anonKey: "你的 anon 或 publishable key",
  authEmail: "ml99@example.com",
  mediaBucket: "ml99-media",
  maxVideoSizeMB: 45,
  imageMaxEdge: 1800,
  imageQuality: 0.82,
  thumbMaxEdge: 520,
  thumbQuality: 0.76,
};
```

`url`、`anonKey` 和 `authEmail` 会暴露在浏览器里，这是 Supabase 前端接入的正常方式；不要把 `service_role` key 放进这个文件。

配置完成后，密码输入会调用 Supabase Auth 登录。登录成功后，照片、缩略图、视频元信息、日志和留言会保存到 Supabase。照片会先压缩成 WebP，再上传展示图和缩略图两个版本。视频目前不压缩，只做大小限制。

## 发布到 GitHub Pages

当前发布地址使用 GitHub Pages 项目页：

```text
https://lixinyu66666.github.io/love-daily-site/
```

如果想使用 `https://用户名.github.io/仓库名/`，在 GitHub 创建一个普通公开仓库，然后把本项目推送到仓库的 `main` 分支。

GitHub 仓库设置中进入 `Settings -> Pages`，发布源选择 `Deploy from a branch`，分支选择 `main`，目录选择 `/root`。

注意：GitHub Pages 仍然只是静态托管。真正的持久化由 Supabase 提供；如果 [supabase-config.js](supabase-config.js) 没有填写完整，网站会退回本地预览模式。
