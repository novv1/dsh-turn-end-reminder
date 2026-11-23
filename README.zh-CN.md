# 对话完成提醒（Turn-end reminder）

一个 DSH 小插件：一轮对话跑完时叫你回来。发个长任务就去干别的，等它喊你。

[English](README.md) | 简体中文

```
┌──────────────────────────────────────────────┐
│  ●  一轮对话完成                              │
│     my-project                          ×    │
│     点击回到这个会话                          │
└──────────────────────────────────────────────┘
        右下角弹出 · 8 秒后自动消失
```

## 它做什么

- **页面内提示**：任意会话的一轮结束时，右下角弹出卡片，同时响两声提示音。
- **点卡片**直接跳回那个会话；`×` 只关掉提示。
- **对所有会话生效**，不只是当前打开的那个；子代理会话不提醒（否则会被刷屏）。
- 可选叠加 **Windows 托盘气泡**，用于页面已经关掉的情况。

## 安装

仅限 DSH 桌面端（插件加载依赖桌面客户端）。

1. 把这个文件夹下载或克隆到本机任意位置。
2. 打开 DSH → **设置 → 插件 → 添加插件**，选中包含 `package.json` 的那个文件夹。
3. **重启一次 DSH**。页面 bundle 是启动时组装的，重启后提示才会出现。
4. 自己发一句话试试：回复结束时应该就能看到卡片。

也可以在 agent 会话里用内置工具装：

```text
plugin_manager  action: install_bundle  target: <这个文件夹的绝对路径>
```

### 懒人版：把下面这段直接贴给 DSH 里的 Agent

Agent 会自己克隆、自己装、自己告诉你什么时候该重启。复制粘贴就行，不用补充参数。

```text
帮我安装这个 DSH 插件：https://github.com/novv1/dsh-turn-end-reminder

1. 克隆到 %USERPROFILE%\dsh-plugins\dsh-turn-end-reminder（即 C:\Users\<你的用户名>\dsh-plugins\ 下）。
   不要放进 $DSH_HOME，也不要手改我的 profile 里的 package.json 或 cordis.patch.yml。
   git clone https://github.com/novv1/dsh-turn-end-reminder.git "%USERPROFILE%\dsh-plugins\dsh-turn-end-reminder"
   如果 git 提示代理连不上，用 git -c "http.https://github.com/.proxy=" clone 重试一次。
2. 确认那个目录里同时存在 package.json 和 cordis.patch.yml。
3. 用 plugin_manager 工具执行 install_bundle，target 填这个目录的绝对路径。
4. 返回 already-installed 就说明装过了，跳过；返回 applied 说明装好了。
5. 如果你没有 plugin_manager 工具，就告诉我手动安装的路径：DSH → 设置 → 插件 → 添加插件，选中这个目录。
6. 最后一次性告诉我：装到哪了、成功没有、要不要重启 DSH、以及怎么验证
   （随便发一句话，等回复结束，看右下角有没有出现「一轮对话完成」的卡片）。
```

## 使用教程

1. **装好并重启**（见上）。
2. **发一个要跑一会儿的任务**——带几次工具调用就行。不用守着屏幕。
3. **切到别的窗口或别的会话**。只要 DSH 页面开着就行，不需要它在前台。
4. **这一轮结束时**，右下角出现卡片，同时听到两声提示音。
5. **点一下卡片**，直接回到刚跑完的那个会话。想留在原地就点 `×`，或者等 8 秒它自己消失。

就这些，不需要任何配置。

### 想用 Windows 托盘气泡（可选）

Windows 通道默认关闭，因为部分 Windows 版本会静默吞掉托盘气泡。如果你的机器通知正常，在插件的 `cordis.patch.yml` 里打开：

```yaml
- insert:
    - id: turn-end-reminder
      name: dsh-turn-end-reminder
      config:
        minDurationMs: 3000   # 短于此时长的一轮不提醒
        balloon: true         # Windows 托盘气泡
        sound: true           # Windows 系统提示音
```

| 配置键 | 默认值 | 作用 |
|---|---|---|
| `minDurationMs` | `3000` | 仅 Windows 通道：短于此时长（毫秒）不提醒 |
| `minGapMs` | `2500` | 仅 Windows 通道：两次提醒的最小间隔（毫秒） |
| `balloon` | `false` | 是否弹 Windows 托盘气泡 |
| `sound` | `false` | 是否播放 Windows 系统提示音 |
| `soundFile` | `''` | 自定义 `.wav` 路径；留空用系统通知音 |
| `notifyOnError` | `true` | Windows 通道：出错的一轮是否提醒 |
| `notifyOnAbort` | `false` | Windows 通道：手动停止是否提醒 |
| `titlePrefix` | `'DSH'` | 气泡标题前缀 |
| `language` | `'zh'` | 气泡文案语言：`zh` / `en` |

页面内提示不受这些配置影响：任何一轮结束都会提醒。

## 常见问题

**装完没反应。**
页面 bundle 是启动时组装的，装完要**重启 DSH**，只刷新页面不够。如果插件列表里已经有这一项但还是没提示，再刷新一次页面。

**有卡片但没声音。**
先看系统输出设备和静音状态。浏览器在你首次与页面交互前会拦截音频，发过一次消息之后就正常了。

**点了卡片没跳转。**
那个会话可能已经被归档或删除，从侧边栏打开即可。

**Windows 气泡一直不出现。**
多个 Windows 11 版本都有这个毛病：PowerShell 脚本执行成功，系统就是不画。专注助手和分应用通知设置都会影响它。这也是页面内提示默认开启、气泡默认关闭的原因。

## 实现原理

- **浏览器侧**（`client.js`）往 `shell.overlay` 插槽注册一个组件，订阅所有会话的 `running` 状态；某个会话从"运行中"变成"空闲"时就播提示音并渲染卡片。
- **Host 侧**（`index.js`）监听 `turn/end` 会话事件，按结束原因和时长过滤，必要时拉起一个一次性 PowerShell 进程播放声音、弹托盘气泡。

两侧互不依赖，可以单独关闭。

## 开发

```bash
node --test-isolation=none --test test/*.test.js
```

32 个单元测试，零依赖。判定逻辑（`lib/policy.js`）和 Windows 启动器（`lib/windows.js`）都是纯函数 + 依赖注入，可以脱离 DSH 运行。

## 环境要求

- 支持插件的 DSH 桌面端。
- 页面内通道：无额外要求。
- Windows 通道：带 `powershell.exe` 的 Windows（系统自带）。

## 许可

MIT，见 [LICENSE](LICENSE)。
