/**
 * DSH 插件入口：监听会话事件，在一轮对话结束时提醒。
 * 所有判断在 lib/policy.js，所有进程细节在 lib/windows.js，这里只做接线。
 */
import { resolveSettings, shouldNotify, formatNotice } from './lib/policy.js'
import { createWindowsNotifier } from './lib/windows.js'

/** Loader 行里显示的名字。 */
export const name = 'turn-end-reminder'

/**
 * 从 cwd 取末级目录名，作为没有标题时的兜底。
 * @param {string | undefined} cwd
 * @returns {string | undefined}
 */
function directoryName(cwd) {
  if (typeof cwd !== 'string' || cwd.length === 0) return undefined
  const parts = cwd.split(/[\\/]+/).filter(Boolean)
  return parts.length > 0 ? parts[parts.length - 1] : undefined
}

/**
 * 处理一条会话事件。导出以便脱离 DSH 运行时测试。
 * @param {{ turns: Map<string, { turn: number, startedAt: number }>, lastEnd?: Map<string, number>, settings: object, notifier: { notify(n: object): boolean }, titleOf?: (session: object) => string | undefined, log?: (m: string) => void }} state
 * @param {object} session
 * @param {object} event
 */
export function handleSessionEvent(state, session, event) {
  if (!event || typeof event.type !== 'string') return
  const id = String(session?.id ?? '')
  if (id.length === 0) return

  if (event.type === 'turn/start') {
    state.turns.set(id, {
      turn: Number(event.data?.turn ?? 0),
      startedAt: Number(event.time ?? 0),
    })
    return
  }
  if (event.type !== 'turn/end') return

  const data = event.data ?? {}
  const turn = Number(data.turn ?? 0)

  // 同一轮可能收到重复的 turn/end（恢复、重放）；只按第一次处理。
  const lastEnd = state.lastEnd?.get(id)
  if (typeof lastEnd === 'number' && turn <= lastEnd) return
  state.lastEnd?.set(id, turn)

  const started = state.turns.get(id)
  state.turns.delete(id)

  const durationMs = started !== undefined
    && started.turn === turn
    && Number.isFinite(event.time)
    ? Math.max(0, Number(event.time) - started.startedAt)
    : null

  const reasonKind = String(data.reason?.kind ?? 'unknown')
  const origin = session?.header?.origin
  if (!shouldNotify({ origin, reasonKind, durationMs, config: state.settings })) return

  const title = state.titleOf?.(session)
    ?? directoryName(session?.header?.cwd)
    ?? '当前会话'

  state.notifier.notify(formatNotice({ title, durationMs, reasonKind, config: state.settings }))
}

/**
 * Cordis 入口。
 * @param {object} ctx
 * @param {object} [config]
 */
export function apply(ctx, config) {
  const settings = resolveSettings(config)
  const logger = ctx.logger?.('turn-end-reminder')
  const log = (message) => {
    try { logger?.warn?.(message) } catch { /* 日志不可用不影响提醒 */ }
  }

  const state = {
    turns: new Map(),
    lastEnd: new Map(),
    settings,
    notifier: createWindowsNotifier(settings, { log }),
    titleOf: (session) => {
      try { return ctx.sessionTitle?.get?.(session)?.title } catch { return undefined }
    },
  }

  ctx.effect(() => {
    const offEvent = ctx.on('session/event', (session, event) => {
      try {
        handleSessionEvent(state, session, event)
      } catch (error) {
        log(`处理会话事件失败：${error?.message ?? error}`)
      }
    })
    const offDisposed = ctx.on('session/disposed', (session) => {
      const id = String(session?.id ?? '')
      state.turns.delete(id)
      state.lastEnd.delete(id)
    })
    return () => {
      offEvent?.()
      offDisposed?.()
    }
  })
}
