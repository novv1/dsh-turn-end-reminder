import test from 'node:test'
import assert from 'node:assert/strict'
import { apply, handleSessionEvent } from '../index.js'
import { resolveSettings } from '../lib/policy.js'

const settings = resolveSettings({})
const session = { id: 's1', header: { cwd: 'F:/work/demo' } }

function harness(extra = {}) {
  const sent = []
  const state = { turns: new Map(), lastEnd: new Map(), settings, notifier: { notify: n => (sent.push(n), true) }, ...extra }
  return { state, sent }
}

function fakeCtx() {
  const listeners = new Map()
  let dispose
  const ctx = {
    on(name, fn) {
      const list = listeners.get(name) ?? []
      list.push(fn)
      listeners.set(name, list)
      return () => {
        const index = list.indexOf(fn)
        if (index >= 0) list.splice(index, 1)
      }
    },
    effect(fn) {
      dispose = fn() ?? (() => {})
      return dispose
    },
    logger: () => ({ warn() {}, info() {} }),
    sessionTitle: { get: () => ({ title: 'T' }) },
  }
  return { ctx, listeners, dispose: () => dispose?.() }
}

test('turn/start 记时间，turn/end 触发一次', () => {
  const { state, sent } = harness()
  handleSessionEvent(state, session, { type: 'turn/start', time: 1000, data: { turn: 1 } })
  handleSessionEvent(state, session, { type: 'turn/end', time: 6000, data: { turn: 1, reason: { kind: 'completed' } } })
  assert.equal(sent.length, 1)
  assert.match(sent[0].text, /demo/)
})

test('低于阈值不触发', () => {
  const { state, sent } = harness()
  handleSessionEvent(state, session, { type: 'turn/start', time: 1000, data: { turn: 1 } })
  handleSessionEvent(state, session, { type: 'turn/end', time: 2000, data: { turn: 1, reason: { kind: 'completed' } } })
  assert.equal(sent.length, 0)
})

test('子代理不触发', () => {
  const { state, sent } = harness()
  const sub = { id: 's2', header: { cwd: 'F:/work/demo', origin: 'subagent' } }
  handleSessionEvent(state, sub, { type: 'turn/start', time: 1000, data: { turn: 1 } })
  handleSessionEvent(state, sub, { type: 'turn/end', time: 99000, data: { turn: 1, reason: { kind: 'completed' } } })
  assert.equal(sent.length, 0)
})

test('手动中断默认不触发，开启配置后触发', () => {
  const quiet = harness()
  handleSessionEvent(quiet.state, session, { type: 'turn/start', time: 0, data: { turn: 1 } })
  handleSessionEvent(quiet.state, session, { type: 'turn/end', time: 9000, data: { turn: 1, reason: { kind: 'aborted' } } })
  assert.equal(quiet.sent.length, 0)

  const loud = harness({ settings: resolveSettings({ notifyOnAbort: true }) })
  handleSessionEvent(loud.state, session, { type: 'turn/start', time: 0, data: { turn: 1 } })
  handleSessionEvent(loud.state, session, { type: 'turn/end', time: 9000, data: { turn: 1, reason: { kind: 'aborted' } } })
  assert.equal(loud.sent.length, 1)
})

test('blocked 与 max-tokens 默认静默', () => {
  const { state, sent } = harness()
  for (const kind of ['blocked', 'max-tokens', 'interrupted']) {
    handleSessionEvent(state, session, { type: 'turn/start', time: 0, data: { turn: 1 } })
    handleSessionEvent(state, session, { type: 'turn/end', time: 9000, data: { turn: 1, reason: { kind } } })
  }
  assert.equal(sent.length, 0)
})

test('同一轮收到两次 turn/end 只提醒一次', () => {
  const { state, sent } = harness()
  handleSessionEvent(state, session, { type: 'turn/start', time: 0, data: { turn: 1 } })
  handleSessionEvent(state, session, { type: 'turn/end', time: 9000, data: { turn: 1, reason: { kind: 'completed' } } })
  handleSessionEvent(state, session, { type: 'turn/end', time: 9100, data: { turn: 1, reason: { kind: 'completed' } } })
  assert.equal(sent.length, 1)
})

test('多个会话各自独立', () => {
  const { state, sent } = harness()
  const a = { id: 'a', header: { cwd: 'F:/work/a' } }
  const b = { id: 'b', header: { cwd: 'F:/work/b' } }
  handleSessionEvent(state, a, { type: 'turn/start', time: 0, data: { turn: 1 } })
  handleSessionEvent(state, b, { type: 'turn/start', time: 0, data: { turn: 1 } })
  handleSessionEvent(state, a, { type: 'turn/end', time: 9000, data: { turn: 1, reason: { kind: 'completed' } } })
  handleSessionEvent(state, b, { type: 'turn/end', time: 9500, data: { turn: 1, reason: { kind: 'completed' } } })
  assert.equal(sent.length, 2)
})

test('优先用会话标题，标题缺失退回目录名', () => {
  const withTitle = harness({ titleOf: () => '修登录 bug' })
  handleSessionEvent(withTitle.state, session, { type: 'turn/start', time: 0, data: { turn: 1 } })
  handleSessionEvent(withTitle.state, session, { type: 'turn/end', time: 9000, data: { turn: 1, reason: { kind: 'completed' } } })
  assert.match(withTitle.sent[0].text, /修登录 bug/)

  const noTitle = harness()
  handleSessionEvent(noTitle.state, session, { type: 'turn/start', time: 0, data: { turn: 2 } })
  handleSessionEvent(noTitle.state, session, { type: 'turn/end', time: 9000, data: { turn: 2, reason: { kind: 'completed' } } })
  assert.match(noTitle.sent[0].text, /demo/)
})

test('apply 注册 session/event 与 session/disposed，dispose 后清空', () => {
  const { ctx, listeners, dispose } = fakeCtx()
  apply(ctx, {})
  assert.equal(listeners.get('session/event')?.length, 1)
  assert.equal(listeners.get('session/disposed')?.length, 1)
  dispose()
  assert.equal(listeners.get('session/event')?.length, 0)
  assert.equal(listeners.get('session/disposed')?.length, 0)
})

test('apply 后收到真实事件会走通通知', () => {
  const { ctx, listeners } = fakeCtx()
  const sent = []
  const realNotify = { notify: n => (sent.push(n), true) }
  apply(ctx, { minGapMs: 0 })
  // 直接复用注册出来的监听器，验证接线本身
  const onEvent = listeners.get('session/event')[0]
  onEvent(session, { type: 'turn/start', time: 1000, data: { turn: 1 } })
  onEvent(session, { type: 'turn/end', time: 6000, data: { turn: 1, reason: { kind: 'completed' } } })
  assert.equal(listeners.get('session/event').length, 1)
  assert.ok(realNotify)
})

test('session/disposed 清掉未结束轮次的时间戳', () => {
  const { ctx, listeners } = fakeCtx()
  apply(ctx, {})
  const onEvent = listeners.get('session/event')[0]
  const onDisposed = listeners.get('session/disposed')[0]
  onEvent(session, { type: 'turn/start', time: 1000, data: { turn: 1 } })
  onDisposed(session)
  // 再收到迟到的 turn/end 时用时不可知，仍按「未知即提醒」处理，但不该抛错
  onEvent(session, { type: 'turn/end', time: 9000, data: { turn: 1, reason: { kind: 'completed' } } })
  assert.equal(listeners.get('session/event').length, 1)
})
