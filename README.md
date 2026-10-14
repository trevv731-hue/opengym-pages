# openGym 个人网页版

Cloudflare 网站：https://tvgym.pages.dev/

GitHub Pages：https://trevv731-hue.github.io/opengym-pages/

基于 [DuarteSantos8/openGym v1.4.0](https://github.com/DuarteSantos8/openGym/tree/v1.4.0)，保留原作者版权、AGPL-3.0-or-later 许可和第三方声明。

这是个人、非商业的 openGym 分支。首次启动为空白记录，第一屏默认简体中文。未登录时，记录保存在当前浏览器的 localStorage / IndexedDB，并保存本机恢复副本；登录后，记录和个人媒体同步到用户自己的 Supabase 账号，不上传 GitHub。示例 AI 和后台推送仍禁用。

已连接用户创建的免费数据库。注册邮件返回地址和默认发信限制，以及完整的数据保护说明，见 [CLOUD_SETUP.md](CLOUD_SETUP.md)。

两个托管地址使用同一个云端数据库；同一账号登录后可同步。浏览器本机数据按网址隔离，从原 Netlify 地址迁移时先导出 JSON 或带媒体的 ZIP，再在新版导入。Cloudflare 当前采用直接上传，未来代码更新需要重新发布，尚未设置自动部署。

## iPhone 使用

Safari 打开网站 → 分享 → 添加到主屏幕。先联网打开一次；离线可记录训练，动作媒体需预先加载。Safari 标签页和主屏幕网页的数据不保证共享，建议从一开始固定使用主屏幕版本。清除网站数据、更换手机或浏览器前，在「设置 → 数据与备份」导出备份并保存到文件或 iCloud Drive；照片和视频请选择带媒体的 ZIP 备份。

## 本地构建

需要 Node.js 22.12+。

```sh
cd frontend
npm ci --ignore-scripts
cd ..
node scripts/build-pages.mjs
```

GitHub Pages 使用 main 分支的 /docs 文件夹，无需服务器或付费服务。构建后的网页与随附源码一同发布。docs/exercise-media 是用户提供的 openGym 包里的原始动作媒体，保留原样并按 NOTICE.md 的非商业分支条款使用；禁止独立提取或用于其他产品。

## 本次修改

- 新增 VITE_LOCAL_PAGES 构建开关，复用原项目静态模式的无服务器界面。
- 本地版启动时保留已有数据，不自动注入示例历史。
- 默认中文；本地记录页面说明存储、导出恢复和 iPhone 安装。
- 禁用示例 AI 教练入口，不把预设响应当作真实 AI。
- 在 HTTPS 和安全的 localhost 环境注册原项目的离线服务工作线程。
- 排除压缩包中的 api 服务配置、data、密钥和运行数据。
- 中文翻译在第一次页面绘制前准备好，保留用户主动选择的其他语言。
- 新增账号登录注册、离线重试、版本冲突合并和个人媒体同步；正在进行的训练只留在原设备。
- 新增最多 14 份本机恢复副本、备份提醒和 iPhone 分享到「文件」；浏览器全部数据清理后可通过外部备份或已同步账号恢复。
- 数据库密码用 Windows 当前用户加密保存在仓库外，网页仅包含公开访问密钥。
