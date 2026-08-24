<h1 align="center">⚡ 【2026最新】正方教务系统抢课脚本</h1>
<h3 align="center">深度抓包分析教务系统接口 · 1.5 秒完成抢课</h3>

<p align="center"><em>"每次选课开放的前 30 秒，当别人还在输入密码、点击界面的时候，你已经用 1.5 秒完成了选课。"</em></p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-16+-339933?logo=nodedotjs&logoColor=white" alt="node">
  <img src="https://img.shields.io/badge/Playwright-blue?logo=playwright&logoColor=white" alt="playwright">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="license">
</p>

<p align="center">
  🌐 <a href="README.md">中文</a> · <a href="https://github.com/ThisIsLittleSky/grabber">GitHub</a>
</p>

<p align="center">
  <a href="#优势">优势</a> ·
  <a href="#技术栈">技术栈</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="#配置说明">配置说明</a> ·
  <a href="#会话与无人值守">无人值守</a> ·
  <a href="#冲突自动重选">冲突自动重选</a> ·
  <a href="#测试">测试</a> ·
  <a href="#赞赏">赞赏</a> ·
  <a href="#二次开发">二次开发</a> ·
  <a href="#免责声明">免责声明</a>
</p>

<p align="center">
  无需开浏览器 → 登录-找课-选课 <strong>1.5 秒</strong> → 全自动无人值守<br/>
  只需要提供 <strong>账号 · 密码 · 年级 · 课程名称</strong>，剩下的交给脚本。
</p>

<p align="center">
  <a href="https://www.bilibili.com/video/BV17R866XEia">▶ 演示视频</a>
</p>

---

## 优势

| 环节 | 手工方式 | 本工具 |
|------|----------|--------|
| 开浏览器 | 打开选课页、找入口 | ❌ 无需开浏览器 |
| 登录 | 输账号密码、等验证码 | 会话复用，自动维持登录态 |
| 找课 | 一页页翻课程列表 | 定时轮询，课程号/教学班/关键词自动匹配 |
| 选课 | 抢名额、手点提交 | **1.5 秒完成**，命中即自动提交 |
| 冲突 | 手动退课再选 | 自动退可选修课重选，绝不误退必修 |

> 抢课拼的是速度。别人还在输密码的时候，你的课已经选完了。

## 技术栈

- **Node.js** (>= 16)
- **Playwright** — 虚拟浏览器登录 + 抓取会话
- **纯 HTTP 请求** — 抢课核心不依赖页面 UI

## 快速开始

```bash
npm install                      # 安装依赖（含 Playwright 浏览器）
Copy-Item config.example.json config.json   # 生成配置（PowerShell）
# 编辑 config.json：填 targets 目标课程，可选填 login 账号密码
node grab.js                     # 启动（弹出浏览器手动登录后自动抢课）
```

首次运行会弹出浏览器，登录选课页一次（验证码人工处理），之后会话自动复用。

## 配置说明

编辑 `config.json`：

| 键 | 默认 | 说明 |
|---|---|---|
| `targets.kch` | `""` | 课程号（纯数字），如 `207786` |
| `targets.jxb` | `""` | 教学班 ID（32 位十六进制） |
| `targets.kw` | `""` | 关键词（课程名/教学班名包含） |
| `targets.njdm_id` | `2025` | 年级过滤，留空=不过滤 |
| `login.username` / `login.password` | `""` | 登录账号密码（选填） |
| `intervalSec` | `2.5` | 查询间隔秒数，勿低于 1.5 |
| `kklxdm` | `10` | 课程类别（10=通识选修） |
| `dryRun` | `true` | `true`=只监控不提交；`false`=实跑自动选课 |
| `notify.webhook` | `""` | 成功/会话过期推送 URL（ServerChan/PushPlus 类） |
| `notify.beep` | `true` | 成功/失败时控制台提示音 |

> `state.json` / `templates.json` 为运行时生成，自动复用。换机器/换账号需删除后重新登录一次。

## 会话与无人值守

- 登录成功即把会话写入 `state.json`，下次运行直接复用，无需再登；会话过期自动检测并提示重登。
- **服务器部署**：本地登录一次 → 把整个目录（含 `state.json`、`templates.json`、`config.json`）拷到服务器 → `headless: true` + `dryRun: false` 运行 → 配好 `notify.webhook` 收通知。

## 冲突自动重选

提交返回"冲突"时，自动查询已选课程，解析上课时间找与目标课**时间重叠**的课：

- 重叠课是**可退的选修课**（`kklxdm=10` 且 `rwlx=2`）→ 自动退掉，重新提交目标课。
- 其余情况（必修/不可退/定位不到/退选失败）→ **一律只告警不动手**，冷却后重试。

一句话：**只退可退选修课，绝不误退必修课。** 退选不可逆，实跑前务必先干跑确认。

## 测试

```bash
npm test                         # 运行单元测试（node lib/self_test.js）
```

## 文档

- [使用说明.md](使用说明.md) — 完整使用手册（配置、会话、冲突规则、故障排查）
- [docs/接口分析.md](docs/接口分析.md) — 选课接口逆向分析
- [docs/开发计划2.md](docs/开发计划2.md) — 本独立工具实现方案
- ~~[docs/开发计划.md](docs/开发计划.md) — 油猴脚本版方案（首版，已弃用）~~

> ⚠️ `config.json`（含账号密码）、`state.json`（含会话 cookie）、`templates.json` 等敏感/运行时文件已被 `.gitignore` 忽略，请勿提交。

## 赞赏

如果它帮你抢到了课，欢迎请作者喝杯咖啡 ☕

<p align="center">
  <img src="docs/paycode.jpg" alt="赞赏码" width="220">
</p>

## Roadmap

规划中的功能方向，欢迎认领开发（对应 GitHub Issues 见文末链接）：

- **友好的 UI 界面** — Web 或桌面客户端（形态待定，欢迎贡献者共创）
- **多账号并发** — 多账号同时并行抢课，各自独立轮询 / 选课 / 冲突处理
- **定时轮询** — ① 定时到点自动启动 ② 开抢窗口内自动提频，两者都支持
- **多学校适配** — 内置几所学校的正方系统模板，选学校即可用

> 每个方向对应一个 GitHub Issue，标有 `good first issue` / `help wanted`，可认领开发并提交 PR。

## 二次开发

本项目**允许二次开发**（MIT License）。你可以：

- Fork 后自行修改、增强、打包分发。
- 在此基础上开发自己的抢课工具。
- 提交 PR 贡献回本项目。

二次开发时可参考：

- 核心代码：`grab.js` 与 `lib/`（匹配、冲突、参数解析）
- [docs/接口分析.md](docs/接口分析.md) — 选课接口逆向分析
- [docs/开发计划2.md](docs/开发计划2.md) — 独立工具实现方案

请遵守 MIT License 及下方免责声明。

## 免责声明

本项目**仅供学习研究使用，请勿用于真实环境**。

- 使用本工具可能违反你所在学校的选课系统使用条款，请自行评估风险。
- 因个人操作不当（如误退课、误选课）造成的一切后果，**作者不承担任何责任**。
- 本工具不保证抢课成功率，选课结果以教务系统为准。
- **绿色上网，人人有责。**

---

<p align="center">
  <sub>抢课不是目的，选到心仪的课才是。把体力活交给脚本，把时间留给真正重要的事情。</sub>
</p>

<p align="center">
  <a href="https://github.com/ThisIsLittleSky/grabber/issues">Issues</a> ·
  <a href="https://github.com/ThisIsLittleSky/grabber/pulls">Pull Requests</a>
</p>

<p align="center">
  <sub>欢迎提交 Issue 和 Pull Request！</sub>
</p>
