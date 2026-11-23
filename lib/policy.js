/**
 * 纯判定与文案：不碰 DSH 运行时、不碰子进程，方便直接在 node --test 下验证。
 */

/** 配置缺省值；非法的用户值一律回落到这里的值。 */
export const DEFAULT_SETTINGS = Object.freeze({
  minDurationMs: 3000,
  minGapMs: 2500,
  balloon: true,
  sound: true,
  soundFile: '',
  notifyOnError: true,
  notifyOnAbort: false,
  titlePrefix: 'DSH',
  language: 'zh',
})

/** 取布尔值，只有显式 false 才关闭。 */
function bool(value, fallback) {
  return typeof value === 'boolean' ? value : fallback
}

/** 取非空字符串，超长或非字符串回落。 */
function text(value, fallback, max = 80) {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  return trimmed.length === 0 || trimmed.length > max ? fallback : trimmed
}

/**
 * 合并用户配置与缺省值。
 * @param {object | undefined} config - cordis.patch.yml 传入的 config。
 * @returns {typeof DEFAULT_SETTINGS} 完整且合法的设置。
 */
export function resolveSettings(config) {
  const raw = config && typeof config === 'object' ? config : {}
  const min = Number(raw.minDurationMs)
  const gap = Number(raw.minGapMs)
  return {
    minDurationMs: Number.isFinite(min) && min >= 0 ? Math.floor(min) : DEFAULT_SETTINGS.minDurationMs,
    minGapMs: Number.isFinite(gap) && gap >= 0 ? Math.floor(gap) : DEFAULT_SETTINGS.minGapMs,
    balloon: bool(raw.balloon, DEFAULT_SETTINGS.balloon),
    sound: bool(raw.sound, DEFAULT_SETTINGS.sound),
    soundFile: typeof raw.soundFile === 'string' ? raw.soundFile.trim() : '',
    notifyOnError: bool(raw.notifyOnError, DEFAULT_SETTINGS.notifyOnError),
    notifyOnAbort: bool(raw.notifyOnAbort, DEFAULT_SETTINGS.notifyOnAbort),
    titlePrefix: text(raw.titlePrefix, DEFAULT_SETTINGS.titlePrefix),
    language: raw.language === 'en' ? 'en' : 'zh',
  }
}

/**
 * 这一轮该不该提醒。
 * @param {{ origin?: string, reasonKind: string, durationMs: number | null, config: object }} input
 * @returns {boolean}
 */
export function shouldNotify({ origin, reasonKind, durationMs, config }) {
  if (origin === 'subagent') return false

  const min = Number.isFinite(config?.minDurationMs) ? config.minDurationMs : DEFAULT_SETTINGS.minDurationMs
  if (typeof durationMs === 'number' && durationMs < min) return false

  switch (reasonKind) {
    case 'completed':
      return true
    case 'error':
      return config?.notifyOnError !== false
    case 'aborted':
      return config?.notifyOnAbort === true
    default:
      return false
  }
}

/**
 * 把毫秒说成人话。
 * @param {number} ms
 * @param {'zh' | 'en'} [language]
 * @returns {string}
 */
export function describeDuration(ms, language = 'zh') {
  const total = Math.max(0, Math.round(Number(ms) / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (language === 'en') {
    if (hours > 0) return `${hours}h ${minutes}m`
    if (minutes > 0) return `${minutes}m ${seconds}s`
    return `${seconds}s`
  }
  if (hours > 0) return `${hours} 小时 ${minutes} 分`
  if (minutes > 0) return `${minutes} 分 ${seconds} 秒`
  return `${seconds} 秒`
}

/**
 * 气泡标题与正文。
 * @param {{ title: string, durationMs: number | null, reasonKind: string, config: object }} input
 * @returns {{ title: string, text: string }}
 */
export function formatNotice({ title, durationMs, reasonKind, config }) {
  const language = config?.language === 'en' ? 'en' : 'zh'
  const prefix = text(config?.titlePrefix, DEFAULT_SETTINGS.titlePrefix)
  const name = text(title, language === 'en' ? 'Current session' : '当前会话', 120)
  const used = typeof durationMs === 'number' ? describeDuration(durationMs, language) : null

  const head = {
    completed: language === 'en' ? 'Turn finished' : '对话完成',
    error: language === 'en' ? 'Turn failed' : '对话出错',
    aborted: language === 'en' ? 'Turn interrupted' : '已中断',
  }[reasonKind] ?? (language === 'en' ? 'Turn ended' : '对话结束')

  const body = {
    completed: language === 'en' ? `"${name}" finished replying` : `「${name}」已完成回复`,
    error: language === 'en' ? `"${name}" failed this turn` : `「${name}」这一轮出错了`,
    aborted: language === 'en' ? `"${name}" was interrupted` : `「${name}」已中断`,
  }[reasonKind] ?? (language === 'en' ? `"${name}" ended` : `「${name}」已结束`)

  const suffix = used === null
    ? ''
    : language === 'en' ? ` · took ${used}` : ` · 用时 ${used}`

  return { title: `${prefix} · ${head}`, text: body + suffix }
}
