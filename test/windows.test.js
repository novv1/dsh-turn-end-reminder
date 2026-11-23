import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { buildScript, createWindowsNotifier, encodeCommand } from '../lib/windows.js'

const base = { minDurationMs: 3000, minGapMs: 2500, balloon: true, sound: true, soundFile: '',
  notifyOnError: true, notifyOnAbort: false, titlePrefix: 'DSH', language: 'zh' }

function fakeChild() {
  const child = new EventEmitter()
  child.unref = () => {}
  return child
}

test('脚本包含声音与气泡调用', () => {
  const s = buildScript({ title: 'DSH · 对话完成', text: '「修 bug」已完成' }, base)
  assert.match(s, /SoundPlayer/)
  assert.match(s, /PlaySync/)
  assert.match(s, /ShowBalloonTip/)
})

test('单引号标题不破坏脚本', () => {
  const s = buildScript({ title: "it's", text: "a'b" }, base)
  assert.match(s, /'it''s'/)
  assert.doesNotMatch(s, /[^']it's[^']/)
})

test('base64 往返', () => {
  const script = "Write-Output '你好'"
  const enc = encodeCommand(script)
  assert.equal(Buffer.from(enc, 'base64').toString('utf16le'), script)
})

test('非 Windows 平台不拉起进程', () => {
  const calls = []
  const n = createWindowsNotifier(base, { platform: 'linux', spawn: (...a) => calls.push(a) })
  assert.equal(n.notify({ title: 't', text: 'b' }), false)
  assert.equal(calls.length, 0)
})

test('成功调用一次 powershell 且带 -EncodedCommand', () => {
  const calls = []
  const n = createWindowsNotifier(base, { spawn: (...a) => { calls.push(a); return fakeChild() } })
  assert.equal(n.notify({ title: 't', text: 'b' }), true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0][0], 'powershell.exe')
  assert.ok(calls[0][1].includes('-EncodedCommand'))
})

test('异步 spawn 错误会计数，三次后停用', () => {
  const children = []
  const n = createWindowsNotifier({ ...base, minGapMs: 0 }, { spawn: () => { const c = fakeChild(); children.push(c); return c } })
  assert.equal(n.notify({ title: 't', text: 'b' }), true)
  children.at(-1).emit('error', new Error('spawn ENOENT'))
  assert.equal(n.notify({ title: 't', text: 'b' }), true)
  children.at(-1).emit('error', new Error('spawn ENOENT'))
  assert.equal(n.notify({ title: 't', text: 'b' }), true)
  children.at(-1).emit('error', new Error('spawn ENOENT'))
  const before = children.length
  assert.equal(n.notify({ title: 't', text: 'b' }), false)
  assert.equal(children.length, before)
})

test('非零退出计入失败', () => {
  const children = []
  const n = createWindowsNotifier({ ...base, minGapMs: 0 }, { spawn: () => { const c = fakeChild(); children.push(c); return c } })
  for (let i = 0; i < 3; i += 1) {
    n.notify({ title: 't', text: 'b' })
    children.at(-1).emit('exit', 1)
  }
  const before = children.length
  assert.equal(n.notify({ title: 't', text: 'b' }), false)
  assert.equal(children.length, before)
})

test('正常退出不计失败', () => {
  const children = []
  const n = createWindowsNotifier(base, { spawn: () => { const c = fakeChild(); children.push(c); return c } })
  n.notify({ title: 't', text: 'b' })
  children.at(-1).emit('exit', 0)
  assert.equal(n.notify({ title: 't', text: 'b' }), false) // 仍受 2.5s 节流限制，但不是因停用
  assert.equal(n.notify({ title: 't', text: 'b' }), false)
})

test('未知退出码视为失败', () => {
  const children = []
  const n = createWindowsNotifier({ ...base, minGapMs: 0 }, { spawn: () => { const c = fakeChild(); children.push(c); return c } })
  for (let i = 0; i < 3; i += 1) {
    n.notify({ title: 't', text: 'b' })
    children.at(-1).emit('exit', null)
  }
  const before = children.length
  assert.equal(n.notify({ title: 't', text: 'b' }), false)
  assert.equal(children.length, before)
})

test('同步抛出也计入失败并最终停用', () => {
  let count = 0
  const n = createWindowsNotifier(base, { spawn: () => { count += 1; throw new Error('spawn ENOENT') } })
  n.notify({ title: 't', text: 'b' })
  n.notify({ title: 't', text: 'b' })
  const third = n.notify({ title: 't', text: 'b' })
  const fourth = n.notify({ title: 't', text: 'b' })
  assert.equal(third, false)
  assert.equal(fourth, false)
  assert.equal(count, 3)
})

test('节流窗口内的第二次提醒不拉起进程', () => {
  const calls = []
  let now = 1000
  const n = createWindowsNotifier(base, { now: () => now, spawn: (...a) => { calls.push(a); return fakeChild() } })
  assert.equal(n.notify({ title: 't', text: 'b' }), true)
  now = 2000
  assert.equal(n.notify({ title: 't', text: 'b' }), false)
  now = 4000
  assert.equal(n.notify({ title: 't', text: 'b' }), true)
  assert.equal(calls.length, 2)
})

test('气泡和声音都关掉时不拉起进程', () => {
  const calls = []
  const n = createWindowsNotifier({ ...base, balloon: false, sound: false }, { spawn: (...a) => { calls.push(a); return fakeChild() } })
  assert.equal(n.notify({ title: 't', text: 'b' }), true)
  assert.equal(calls.length, 0)
})

test('停用后不再受节流影响直接返回 false', () => {
  const n = createWindowsNotifier(base, { spawn: () => { throw new Error('boom') } })
  for (let i = 0; i < 3; i += 1) n.notify({ title: 't', text: 'b' })
  assert.equal(n.notify({ title: 't', text: 'b' }), false)
})
