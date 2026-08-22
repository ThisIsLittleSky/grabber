# 选课抢课 · 独立工具

基于 Node.js + Playwright 的正方教务系统自动抢课工具：**虚拟浏览器登录 + 纯接口抢课**，可无人值守、可部署到服务器。

- 手动登录一次（验证码人工处理），之后会话自动复用。
- 抢课循环走纯 HTTP 请求，不依赖页面 UI。
- 支持课程号 / 教学班 ID / 关键词模糊匹配，命中自动选课。
- 冲突自动重选：只退可退选修课，绝不误退必修课。

## 快速开始

```bash
npm install                      # 安装依赖（含 Playwright 浏览器）
Copy-Item config.example.json config.json   # 生成配置（PowerShell）
# 编辑 config.json：填 targets 目标课程，可选填 login 账号密码
node grab.js                     # 启动（弹出浏览器手动登录后自动抢课）
```

## 测试

```bash
npm test                         # 运行单元测试（node lib/self_test.js）
```

## 文档

- [使用说明.md](使用说明.md) — 完整使用手册（配置、会话、冲突规则、故障排查）
- [docs/接口分析.md](docs/接口分析.md) — 选课接口逆向分析
- [docs/开发计划2.md](docs/开发计划2.md) — 本独立工具实现方案
- [docs/开发计划.md](docs/开发计划.md) — 油猴脚本版方案（前身）

> ⚠️ `config.json`（含账号密码）、`state.json`（含会话 cookie）、`templates.json` 等敏感/运行时文件已被 `.gitignore` 忽略，请勿提交。
