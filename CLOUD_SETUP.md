# 云端数据与账号

项目 `gym`：`yqavstbwzvtzkjidnxvh`，组织 `trevv731-hue's Org`，加拿大区域 `ca-central-1`。沿用用户创建的免费方案，没有升级或启用付费服务。

数据库迁移已应用。每个账号只能读取自己的训练文档和私有媒体。写入通过检查账号和版本的函数进行；客户端不能直接覆盖整张表。网页使用公开 publishable key；注册入口另使用公开 anon JWT，服务器开启 JWT 检查。不包含数据库密码或 service-role key。

## 注册和密码找回

按用户要求，注册无需验证邮箱，成功后立即登录。`gym-register` Edge Function 使用服务器内的管理员客户端创建账号；管理员密钥不进入网页。重复账号不会覆盖密码。旧的未验证账号只有在 Supabase 确认原密码正确后，才兼容激活；未提供正确原密码不能激活。

注册和登录显示明显的处理中、成功及失败提示。找回密码才验证邮箱；可以把找回密码邮件的链接或验证码粘贴到网页，验证成功后设置新密码。这条路径不依赖邮件跳转到哪个托管地址。发送邮件失败、超过发信限制或链接失效均明确提示。

如果希望直接点击邮件后返回网站，可配置以下设置。Supabase 连接器没有修改 Auth URL / SMTP 设置的工具：

1. 在 https://supabase.com/dashboard/project/yqavstbwzvtzkjidnxvh/auth/url-configuration 设置 Site URL 为 `https://tvgym.pages.dev/`。
2. Redirect URLs 加入 `https://tvgym.pages.dev/**` 和 `https://trevv731-hue.github.io/opengym-pages/**`。如以后继续使用 Netlify，再加入 `https://tvgym.netlify.app/**`。本地测试可加入 `http://127.0.0.1:8765/opengym-pages/**`。
3. 默认发信服务有收件人和频率限制，可靠的正式密码找回邮件需要配置 SMTP。此限制不影响免邮件注册。未能发送邮件时，网页显示失败，不会声称已经发送。

上述限制来自官方文档：[返回地址](https://supabase.com/docs/guides/auth/redirect-urls)、[默认发信限制](https://supabase.com/docs/guides/auth/auth-smtp)。

邮箱确认、密码找回回调会在网页路由启动前处理，避免邮箱链接的登录信息被页面跳转覆盖。

## 数据保护

- 未登录：记录保存在当前浏览器；另存最多 14 份恢复副本，主记录损坏时可自动恢复。清除全部网站数据会删除这些本机副本。
- 登录：已完成的训练、计划、体重、围度、个人媒体同步到账号。首次合并已有本机数据需要本人确认；不同账号的数据不会自动混合。
- 正在进行的训练保留在原设备。离线修改先保存在本机，联网后重试。仅收到服务端确认后显示「已同步」。
- 定期导出 JSON；含个人照片视频时导出 ZIP。iPhone 可通过分享面板存入「文件」或 iCloud Drive。取消分享或缺少媒体的 ZIP 不会被标记为完整备份。
- Supabase 免费项目可能因长时间不使用而暂停；保留外部备份。没有承诺永久免费或永久在线。

## 验证

172 项相关单元测试通过。实际浏览器已验证训练保存、JSON 导出导入、离线打开、动作视频、本机主记录丢失恢复。使用临时测试账号连接真实 Supabase，验证上传、全新浏览器登录恢复、离线保留和重新联网同步。

注册修复实际验证了：无需邮件的新账号立即登录，重复注册不覆盖原密码，旧未验证账号拒绝错误密码但接受正确原密码，手机页面明显显示校验/注册/登录/重复账号结果。用测试账号的专用恢复令牌验证密码找回：验证后可更新密码，旧密码失效，新密码可登录。这不等同于测试真实邮箱的投递；测试没有向其他人发送邮件。

注册限流通过数据库原子计数，每个来源每小时最多 30 次尝试，计数仅存带服务端盐的来源哈希。限流和旧账号查找函数只授予服务器 service_role，普通客户端不能调用。

数据库权限验证：匿名不可读写训练表，客户端不能直接更新表，媒体桶非公开。安全检查对允许登录用户执行 SECURITY DEFINER 写入函数给出提示；这是有意的受控入口，函数固定使用 auth.uid()，固定空 search_path，拒绝匿名并检查文档和版本。隔离及冲突行为另经真实 PostgreSQL 引擎测试。

管理密码单独存于本机 `LocalAppData/openGym-private/supabase-db-password.dpapi`，用当前 Windows 用户加密，未进入仓库和网站。

## Cloudflare 托管

已在用户 Cloudflare 账号创建 `tvgym` Pages 项目，生产地址 https://tvgym.pages.dev/ 。发布完整网站和动作媒体。Cloudflare 部分为纯静态部署，没有 Pages Functions；注册服务在已有 Supabase 免费项目的 Edge Functions 中运行，没有付费方案升级。

源码在原 GitHub 仓库，Cloudflare 当前通过直接上传发布，不会自动跟随 GitHub 提交更新。已登录 Wrangler 时，可使用 `wrangler pages deploy docs --project-name tvgym --branch main` 发布已构建的版本。该项目内集中管理健身网站的部署；无需另买域名。

文件数量与单文件大小满足 [Pages 免费方案限制](https://developers.cloudflare.com/pages/platform/limits/)。国内访问速度需由用户实际网络测试，不承诺即时打开。
