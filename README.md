# ML99 恋爱日常

一个清爽简约的本地静态网站，用来记录照片、视频、日志和留言。

## 功能

- 添加、删除、预览照片
- 添加、删除、播放视频
- 添加、删除日志和留言
- 自动计算从 2022 年 12 月 10 日开始的恋爱天数
- 自动显示距离下一个整百天纪念日还有几天

## 使用方式

在项目目录中启动一个本地静态服务：

```bash
python3 -m http.server 4173
```

然后打开：

```text
http://localhost:4173
```

照片和视频会保存在当前浏览器的 IndexedDB 中，日志和留言会保存在 localStorage 中。换浏览器、清理站点数据或更换电脑后，本地数据不会自动同步。

## 发布到 GitHub Pages

当前发布地址使用 GitHub Pages 项目页：

```text
https://lixinyu66666.github.io/love-daily-site/
```

如果想使用 `https://用户名.github.io/仓库名/`，在 GitHub 创建一个普通公开仓库，然后把本项目推送到仓库的 `main` 分支。

GitHub 仓库设置中进入 `Settings -> Pages`，发布源选择 `Deploy from a branch`，分支选择 `main`，目录选择 `/root`。

注意：GitHub Pages 是静态托管。网站里的添加照片、添加视频、日志和留言会保存在访问者自己的浏览器里，不会自动同步到 GitHub 或其他设备。
