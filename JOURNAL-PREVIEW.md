# 训练手记：独立试用网站

地址：https://gym.bdprk.com/#/home 。源码在 `trainnote-preview` 分支，独立工作目录为本文件所在目录。原 GitHub Pages 网站、main 分支及原训练数据库不迁移、不替换。是否迁移由用户试用后决定。

## 参考与实现

根据用户提供的训记 APK 静态拆解，重新实现“训练、动作、历史、我的”导航、周历、训练模板、训练入口、历史月历与个人数据入口；沿用 openGym 的动作库、模板编辑、组数/重量记录、递减组、休息计时、训练总结、统计和文件备份。没有运行原 App 或真实截图，不宣称像素级复刻、完整还原 267 个页面，也没有调用原 App 的业务接口或复制其商用资源。

设计参考本机 ui-design-system v3 的语义颜色、实底内容层、表单状态、底部导航、48px 触控目标与减少动效规则。浅绿配色是本产品选择，不修改共享库默认配色。中文默认不附英文动作名。

新代码在 `frontend/src/trainnote/`。只有 `VITE_TRAINNOTE=1` 时启用新版导航与页面；此分支的 HTML 元信息面向新站。新站不展示原小云端卡片、同步/配对面板和账号同步状态。日常保存安静执行，网络失败保留本机记录并自动重试。照片视频仍在当前设备，备份页明确说明，需导出带媒体的 ZIP 保存完整副本。

## 数据与访问

新站 Worker 为 `bdprk-gym-preview`，使用独立 D1 `bdprk-gym-preview`，只保存一个私人试用档案。`GET/PUT /api/profile` 使用版本条件写入；冲突时合并再试，无法完成时保留本机副本。进行中的训练仅在原设备恢复，完成后进入历史并后台保存。未配置自动导入旧网站数据，也不把本地 QA 的测试模板/训练上传到生产。

与私人云端使用相同的已授权 Windows 设备证书和备用恢复密钥，但浏览器会话密钥独立、Cookie 限定新站。第一次浏览器可能需要选择「小云端 · 本机专属密钥」。换设备时在 `/auth/login` 用桌面备用恢复密钥授权一次。站长凭证只存在服务器 Secrets；静态页面没有同步令牌。备用域名不授予访问。设备授权来自 Cloudflare 的已验证/未撤销状态和允许指纹，不信任伪造请求头。

原站 `cloud.bdprk.com` 的认证和应用同步不修改。mTLS hostname associations 保留原主机并新增 `gym.bdprk.com`。新站 Worker 的三个 Secrets 为 `OWNER_CERT_SHA256`、`OWNER_RECOVERY_SHA256`、`OWNER_SESSION_SECRET`；后续部署需保留秘密绑定，不上传 `.dev.vars`。丢失访问时可通过用户的 Cloudflare 管理连接器重设恢复密钥和会话；无代理专用后门。

动作演示媒体通过受限文件路径读取原 openGym Pages 的公开媒体，绝不转发认证头/Cookie，保留原媒体许可和署名。这是试用版对旧托管的静态资源依赖，正式迁移时应一并处理媒体托管。

## 本地构建与验证

```powershell
node scripts/build-journal.mjs
npx wrangler d1 execute bdprk-gym-preview --local --file server/schema.sql
# 仅本地 .dev.vars 配置 LOCAL_PREVIEW="1"，不提交或部署该变量。
npx wrangler dev --port 8789
node --test server/worker.test.js
cd frontend
npx vitest run src/trainnote/sync.test.js src/lib/cloud-profile.test.js src/views/Workout.test.jsx src/views/FocusView.test.jsx src/views/Plan.routine-count.test.jsx src/views/Library.test.jsx
```

Wrangler 登录管理账户后可用根目录配置部署；连接器部署使用 Workers 静态资产上传会话、完成 JWT 与脚本上传接口。凭证只在内存传递。禁止将新站构建写回旧站 `docs/` 或 push 到 main。发布源码到独立 `trainnote-preview` 分支以遵守开源许可。

已验证：相关前端 256 项测试、独立后端 3 项测试；新增改动后的入门计划/设置/后台保存相关 54 项回归（与前述部分重叠，不累加）；390px 手机和桌面视图；模板创建、中文动作搜索、开始训练、编辑重量、勾选组、结束保存、历史月历；本地后台存储读回；线上真实浏览器以证书进入、空白档案后台写入并读回 revision 1、无页面异常、无云端面板与手机横向溢出，匿名 API 被拒绝。生产未写入 QA 模板或训练记录。外观模式单独提供真实生效的浅色/深色/系统选择，不保留被新版主题覆盖的无效强调色设置。

未验证边界：iPhone 真机安装、长时间离线、多台真实设备并发、完整无障碍审计、原 App 像素级一致性。训练文档当前限制 4 MiB，超限保留本机记录；照片视频不在该接口存储。
