/**
 * 浏览器侧：会话从「运行中」变成「空闲」时，右下角弹一条提示并响一声。
 * 挂在 shell.overlay（root 作用域），对任意会话生效；点卡片直接跳到那个会话。
 */
window.__ModuleLoader__.load({
  id: 'dsh-turn-end-reminder',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const CSS = `
.dsh-teto-root{position:fixed;right:20px;bottom:20px;z-index:2147483000;display:flex;flex-direction:column;gap:10px;pointer-events:none}
.dsh-teto-card{pointer-events:auto;position:relative;display:flex;align-items:flex-start;gap:10px;min-width:240px;max-width:360px;
  padding:12px 30px 12px 14px;border-radius:12px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);
  border:1px solid var(--dsw-alias-border-l1);box-shadow:0 10px 30px rgba(0,0,0,.18);cursor:pointer;
  font-size:13px;line-height:1.4;animation:dsh-teto-in .18s ease-out}
.dsh-teto-card:hover{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2)}
.dsh-teto-dot{flex:none;width:8px;height:8px;margin-top:5px;border-radius:50%;background:var(--dsw-alias-state-success-primary)}
.dsh-teto-body{min-width:0}
.dsh-teto-title{font-weight:600}
.dsh-teto-sub{margin-top:2px;color:var(--dsw-alias-label-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-teto-hint{margin-top:4px;font-size:11px;color:var(--dsw-alias-label-secondary);opacity:.75}
.dsh-teto-close{position:absolute;top:6px;right:6px;width:20px;height:20px;border:0;border-radius:6px;padding:0;
  background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;line-height:1}
.dsh-teto-close:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
@keyframes dsh-teto-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
`

    /** 两音提示音；AudioContext 在用户已交互过的页面里可以直接用。 */
    let audioContext
    function chime() {
      try {
        const Ctor = window.AudioContext ?? window.webkitAudioContext
        if (!Ctor) return
        audioContext ??= new Ctor()
        if (audioContext.state === 'suspended') audioContext.resume()
        const now = audioContext.currentTime
        for (const [index, frequency] of [[0, 880], [1, 1320]]) {
          const oscillator = audioContext.createOscillator()
          const gain = audioContext.createGain()
          const start = now + index * 0.16
          oscillator.type = 'sine'
          oscillator.frequency.value = frequency
          gain.gain.setValueAtTime(0.0001, start)
          gain.gain.exponentialRampToValueAtTime(0.16, start + 0.02)
          gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28)
          oscillator.connect(gain)
          gain.connect(audioContext.destination)
          oscillator.start(start)
          oscillator.stop(start + 0.3)
        }
      } catch {
        /* 没有可用音频设备时静默跳过，界面提示仍然展示 */
      }
    }

    return {
      inject: ['slots', 'uiWorkspace'],
      apply(ctx) {
        /** 跳到该会话；失败只记日志，不打断提示。 */
        const openSession = (sessionId) => {
          try {
            ctx.uiWorkspace?.openSession(sessionId)
          } catch (error) {
            console.warn('[turn-end-reminder] 打开会话失败', error)
          }
        }

        function TurnEndToasts(props) {
          const status = props.useSessionStatus ? props.useSessionStatus(snapshot => snapshot) : undefined
          const rows = props.useSessions ? props.useSessions(state => state.byId) : undefined
          const [toasts, setToasts] = React.useState([])
          const previous = React.useRef(null)
          const sequence = React.useRef(0)

          React.useEffect(() => {
            if (!(status instanceof Map)) return
            const next = new Map()
            for (const [id, entry] of status) next.set(id, entry?.running === true)

            if (previous.current !== null) {
              for (const [id, running] of next) {
                if (previous.current.get(id) !== true || running) continue
                const row = rows?.[id]
                if (row?.origin === 'subagent') continue
                sequence.current += 1
                const key = sequence.current
                setToasts(list => [...list.slice(-2), {
                  key,
                  sessionId: id,
                  title: row?.displayTitle ?? '当前会话',
                }])
                chime()
              }
            }
            previous.current = next
          }, [status, rows])

          React.useEffect(() => {
            if (toasts.length === 0) return undefined
            const timer = window.setTimeout(() => setToasts(list => list.slice(1)), 8000)
            return () => window.clearTimeout(timer)
          }, [toasts])

          const dismiss = (key) => setToasts(list => list.filter(item => item.key !== key))

          if (toasts.length === 0) return null
          return h('div', { className: 'dsh-teto-root' },
            h('style', null, CSS),
            toasts.map(toast => h('div', {
              key: toast.key,
              className: 'dsh-teto-card',
              role: 'button',
              tabIndex: 0,
              title: '打开这个会话',
              onClick: () => {
                dismiss(toast.key)
                openSession(toast.sessionId)
              },
              onKeyDown: (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return
                event.preventDefault()
                dismiss(toast.key)
                openSession(toast.sessionId)
              },
            },
            h('span', { className: 'dsh-teto-dot', 'aria-hidden': true }),
            h('div', { className: 'dsh-teto-body' },
              h('div', { className: 'dsh-teto-title' }, '一轮对话完成'),
              h('div', { className: 'dsh-teto-sub' }, toast.title),
              h('div', { className: 'dsh-teto-hint' }, '点击回到这个会话'),
            ),
            h('button', {
              type: 'button',
              className: 'dsh-teto-close',
              'aria-label': '关闭提示',
              onClick: (event) => {
                event.stopPropagation()
                dismiss(toast.key)
              },
            }, '×'),
            )),
          )
        }

        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'turn-end-toast',
          order: 10,
        }, TurnEndToasts))
      },
    }
  },
})
