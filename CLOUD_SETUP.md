# 云端数据与账号

项目 `gym`：`yqavstbwzvtzkjidnxvh`，组织 `trevv731-hue's Org`，加拿大区域 `ca-central-1`。沿用用户创建的免费方案，没有升级或启用付费服务。

`supabase/migrations/202610140001_gym_sync.sql` 已应用。每个账号只能读取自己的训练文档和私有媒体。写入通过检查账号和版本的函数进行；客户端不能直接覆盖整张表。网页只使用公开 publishable key，不包含数据库密码或 service-role key。

## 注册邮件配置

Supabase 连接器没有修改 Auth URL / SMTP 设置的工具，因此这两项尚未自动配置：

1. 在 https://supabase.com/dashboard/project/yqavstbwzvtzkjidnxvh/auth/url-configuration 设置 Site URL 为 `https://tvgym.pages.dev/`。
2. Redirect URLs 加入 `https://tvgym.pages.dev/**` 和 `https://trevv731-hue.github.io/opengym-pages/**`。如以后继续使用 Netlify，再加入 `https://tvgym.netlify.app/**`。本地测试可加入 `http://127.0.0.1:8765/opengym-pages/**`。
3. 默认发信服务只允许组织成员邮箱。个人使用先用组织成员邮箱；要给其他邮箱注册或找回密码，需自行配置 SMTP 发信服务。未配置时，网页会提示发信失败，不会假称注册成功。

上述限制来自官方文档：[返回地址](https://supabase.com/docs/guides/auth/redirect-urls)、[默认发信限制](https://supabase.com/docs/guides/auth/auth-smtp)。

邮箱确认、密码找回回调会在网页路由启动前处理，避免邮箱链接的登录信息被页面跳转覆盖。

## 数据保护

- 未登录：记录保存在当前浏览器；另存最多 14 份恢复副本，主记录损坏时可自动恢复。清除全部网站数据会删除这些本机副本。
- 登录：已完成的训练、计划、体重、围度、个人媒体同步到账号。首次合并已有本机数据需要本人确认；不同账号的数据不会自动混合。
- 正在进行的训练保留在原设备。离线修改先保存在本机，联网后重试。仅收到服务端确认后显示「已同步」。
- 定期导出 JSON；含个人照片视频时导出 ZIP。iPhone 可通过分享面板存入「文件」或 iCloud Drive。取消分享或缺少媒体的 ZIP 不会被标记为完整备份。
- Supabase 免费项目可能因长时间不使用而暂停；保留外部备份。没有承诺永久免费或永久在线。

## 验证

163 项相关单元测试通过。实际浏览器已验证训练保存、JSON 导出导入、离线打开、动作视频、本机主记录丢失恢复。使用临时测试账号连接真实 Supabase，验证上传、全新浏览器登录恢复、离线保留和重新联网同步，测试账号和数据已删除。

数据库权限验证：匿名不可读写训练表，客户端不能直接更新表，媒体桶非公开。安全检查对允许登录用户执行 SECURITY DEFINER 写入函数给出提示；这是有意的受控入口，函数固定使用 auth.uid()，固定空 search_path，拒绝匿名并检查文档和版本。隔离及冲突行为另经真实 PostgreSQL 引擎测试。

管理密码单独存于本机 `LocalAppData/openGym-private/supabase-db-password.dpapi`，用当前 Windows 用户加密，未进入仓库和网站。

## Cloudflare 托管

已在用户 Cloudflare 账号创建 `tvgym` Pages 项目，生产地址 https://tvgym.pages.dev/ 。上传并发布完整网站和动作媒体，共 13,233 个文件，生产部署 `776f51ff-1664-4659-9c2b-8ca0642cf344`。纯静态部署，没有 Pages Functions、付费存储或付费方案升级。

源码在原 GitHub 仓库，Cloudflare 当前通过直接上传发布，不会自动跟随 GitHub 提交更新。已登录 Wrangler 时，可使用 `wrangler pages deploy docs --project-name tvgym --branch main` 发布已构建的版本。该项目内集中管理健身网站的部署；无需另买域名。

文件数量与单文件大小满足 [Pages 免费方案限制](https://developers.cloudflare.com/pages/platform/limits/)。国内访问速度需由用户实际网络测试，不承诺即时打开。
