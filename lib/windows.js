/**
 * Windows 通知通道：生成一次性 PowerShell 脚本，拉起后立即放手。
 * 气泡需要进程存活，所以脚本自己在展示后睡满气泡时长再退出。
 */
import { spawn } from 'node:child_process'

/** 连续失败多少次后彻底停用（避免每轮对话都拉起一个注定失败的进程）。 */
const MAX_FAILURES = 3

/** 气泡停留时长（毫秒）。 */
const BALLOON_MS = 8000

/** 气泡标题在 NotifyIcon.Text 上的硬上限。 */
const TRAY_TEXT_MAX = 63

/**
 * 转义 PowerShell 单引号字符串：单引号翻倍。
 * @param {string} value
 * @returns {string}
 */
function psQuote(value) {
  return String(value ?? '').replace(/'/g, "''")
}

/**
 * 按 code point 截断，避免把 emoji 的代理对切成孤立码元。
 * @param {string} value
 * @param {number} max
 * @returns {string}
 */
function clip(value, max) {
  const points = Array.from(String(value ?? ''))
  return points.length <= max ? points.join('') : points.slice(0, max).join('')
}

/**
 * 生成 UTF-16LE base64 命令，避免引号/中文在命令行上被拆坏。
 * @param {string} script
 * @returns {string}
 */
export function encodeCommand(script) {
  return Buffer.from(script, 'utf16le').toString('base64')
}

/**
 * 生成展示一次提醒的 PowerShell 源码。
 * @param {{ title: string, text: string }} notice
 * @param {object} settings
 * @returns {string}
 */
export function buildScript(notice, settings) {
  const title = psQuote(clip(notice?.title, TRAY_TEXT_MAX))
  const body = psQuote(clip(notice?.text, 255))
  const lines = ['$ErrorActionPreference = "Stop"']

  if (settings?.sound !== false) {
    const wav = settings?.soundFile
      ? `'${psQuote(settings.soundFile)}'`
      : "$(Join-Path $env:SystemRoot 'Media\\Windows Notify System Generic.wav')"
    lines.push(
      '$played = $false',
      'try {',
      `  $wav = ${wav}`,
      '  if (Test-Path -LiteralPath $wav) {',
      '    (New-Object Media.SoundPlayer $wav).PlaySync()',
      '    $played = $true',
      '  }',
      '} catch { }',
      'if (-not $played) {',
      '  try { [System.Media.SystemSounds]::Asterisk.Play(); Start-Sleep -Milliseconds 700 } catch { }',
      '}',
    )
  }

  if (settings?.balloon !== false) {
    lines.push(
      'Add-Type -AssemblyName System.Windows.Forms',
      'Add-Type -AssemblyName System.Drawing',
      '$n = New-Object System.Windows.Forms.NotifyIcon',
      '$n.Icon = [System.Drawing.SystemIcons]::Information',
      `$n.Text = '${title}'`,
      '$n.Visible = $true',
      `$n.ShowBalloonTip(${BALLOON_MS}, '${title}', '${body}', [System.Windows.Forms.ToolTipIcon]::Info)`,
      `Start-Sleep -Milliseconds ${BALLOON_MS + 1000}`,
      '$n.Visible = $false',
      '$n.Dispose()',
    )
  }

  return lines.join('\n')
}

/**
 * 造一个通知通道。平台判断、时钟与 spawn 都可注入，便于测试。
 *
 * 失败记账覆盖三条路径：同步抛出、spawn 的异步 'error' 事件、以及
 * PowerShell 非零退出（脚本级失败：执行策略、受限语言模式、Add-Type 失败）。
 *
 * @param {object} settings
 * @param {{ spawn?: Function, platform?: string, now?: () => number, log?: (message: string) => void }} [hooks]
 * @returns {{ notify(notice: { title: string, text: string }): boolean }}
 */
export function createWindowsNotifier(settings, hooks = {}) {
  const platform = hooks.platform ?? process.platform
  const spawnFn = hooks.spawn ?? spawn
  const now = typeof hooks.now === 'function' ? hooks.now : () => Date.now()
  const log = typeof hooks.log === 'function' ? hooks.log : () => {}
  const minGapMs = Number.isFinite(settings?.minGapMs) ? Math.max(0, settings.minGapMs) : 2500
  const anyChannel = settings?.balloon !== false || settings?.sound !== false

  let failures = 0
  let disabled = false
  let lastSpawnAt = Number.NEGATIVE_INFINITY

  /** 记一次失败；达到上限后只留一条停用日志，之后静默。 */
  const recordFailure = (reason) => {
    if (disabled) return
    failures += 1
    log(`通知失败（${failures}/${MAX_FAILURES}）：${reason}`)
    if (failures >= MAX_FAILURES) {
      disabled = true
      log('通知通道连续失败，已停用：请检查 powershell.exe 是否可用、执行策略是否放行')
    }
  }

  if (platform !== 'win32') {
    log(`通知通道跳过：当前平台 ${platform} 不是 win32`)
    return { notify: () => false }
  }

  return {
    notify(notice) {
      if (disabled) return false
      // 气泡与声音都关掉时，没有可做的事，也不再拉进程。
      if (!anyChannel) return true

      const at = now()
      if (at - lastSpawnAt < minGapMs) {
        log('距上次提醒不足节流窗口，跳过本次')
        return false
      }

      const script = buildScript(notice, settings)
      try {
        const child = spawnFn(
          'powershell.exe',
          [
            '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden',
            '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodeCommand(script),
          ],
          { windowsHide: true, stdio: 'ignore', detached: true },
        )
        // spawn 找不到可执行文件时不会同步抛错，只发 'error'；脚本自己失败则是非零退出。
        child?.on?.('error', error => recordFailure(`启动失败：${error?.message ?? error}`))
        child?.on?.('exit', code => {
          if (code !== 0) recordFailure(`PowerShell 退出码 ${code === null ? 'null' : code}`)
        })
        child?.unref?.()
        lastSpawnAt = at
        return true
      } catch (error) {
        recordFailure(`拉起失败：${error?.message ?? error}`)
        return false
      }
    },
  }
}
