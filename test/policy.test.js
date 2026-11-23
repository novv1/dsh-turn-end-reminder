import test from 'node:test'
import assert from 'node:assert/strict'
import { shouldNotify, formatNotice, describeDuration, resolveSettings } from '../lib/policy.js'

const base = { minDurationMs: 3000, balloon: true, sound: true, soundFile: '',
  notifyOnError: true, notifyOnAbort: false, titlePrefix: 'DSH', language: 'zh' }

test('completed 且够长才提醒', () => {
  assert.equal(shouldNotify({ origin: undefined, reasonKind: 'completed', durationMs: 5000, config: base }), true)
  assert.equal(shouldNotify({ origin: undefined, reasonKind: 'completed', durationMs: 2000, config: base }), false)
})

test('子代理永不提醒', () => {
  assert.equal(shouldNotify({ origin: 'subagent', reasonKind: 'completed', durationMs: 60000, config: base }), false)
})

test('中断默认不提醒，可配置开启', () => {
  assert.equal(shouldNotify({ origin: undefined, reasonKind: 'aborted', durationMs: 9000, config: base }), false)
  assert.equal(shouldNotify({ origin: undefined, reasonKind: 'aborted', durationMs: 9000, config: { ...base, notifyOnAbort: true } }), true)
})

test('出错按开关提醒', () => {
  assert.equal(shouldNotify({ origin: undefined, reasonKind: 'error', durationMs: 9000, config: base }), true)
  assert.equal(shouldNotify({ origin: undefined, reasonKind: 'error', durationMs: 9000, config: { ...base, notifyOnError: false } }), false)
})

test('用时未知时按够长处理', () => {
  assert.equal(shouldNotify({ origin: undefined, reasonKind: 'completed', durationMs: null, config: base }), true)
})

test('时长文案', () => {
  assert.equal(describeDuration(3000), '3 秒')
  assert.equal(describeDuration(83000), '1 分 23 秒')
  assert.equal(describeDuration(3725000), '1 小时 2 分')
})

test('成功与出错文案不同，且带上标题与时长', () => {
  const ok = formatNotice({ title: '修登录 bug', durationMs: 83000, reasonKind: 'completed', config: base })
  assert.equal(ok.title, 'DSH · 对话完成')
  assert.match(ok.text, /修登录 bug/)
  assert.match(ok.text, /1 分 23 秒/)
  const bad = formatNotice({ title: '修登录 bug', durationMs: 83000, reasonKind: 'error', config: base })
  assert.match(bad.text, /出错/)
})

test('配置缺省值', () => {
  const s = resolveSettings({})
  assert.equal(s.minDurationMs, 3000)
  assert.equal(s.notifyOnAbort, false)
  assert.equal(s.titlePrefix, 'DSH')
})
