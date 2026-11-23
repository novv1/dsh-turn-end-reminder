# Turn-end reminder for DeepSeek Harness

A small plugin that pings you when a DSH conversation finishes. Stop babysitting the window: send a long task, go do something else, and come back when it calls you.

English | [简体中文](README.zh-CN.md)

```
┌──────────────────────────────────────────────┐
│  ●  A turn finished                          │
│     my-project                          ×    │
│     Click to return to this conversation     │
└──────────────────────────────────────────────┘
      appears bottom-right · disappears in 8s
```

## What it does

- **In-page toast** in the bottom-right corner the moment any conversation turn ends, with a two-tone chime.
- **Click the toast** to jump straight back to that conversation. The `×` just dismisses it.
- **Works for every session**, not only the one on screen, and never for subagents (they would spam you).
- Optional Windows tray notification as a second channel, for when the page is closed.

## Install

DSH Desktop only (the web UI needs the desktop client for plugin loading).

1. Download or clone this folder anywhere on your machine.
2. Open DSH → **Settings → Plugins → Add plugin**, and pick the folder that contains `package.json`.
3. **Restart DSH** once. The page bundle is assembled at startup, so a fresh start is what makes the toast appear.
4. Send any message to yourself. When the reply finishes you should see the toast.

From an agent session you can also install it with the built-in tool:

```text
plugin_manager  action: install_bundle  target: <absolute path to this folder>
```

### Lazy mode: paste this to an agent inside DSH

The agent clones the repo, installs the bundle, and tells you when to restart. Copy the block, paste it, done — no parameters to fill in.

```text
Please install this DSH plugin: https://github.com/novv1/dsh-turn-end-reminder

1. Clone it to %USERPROFILE%\dsh-plugins\dsh-turn-end-reminder (i.e. C:\Users\<you>\dsh-plugins\).
   Do not put it under $DSH_HOME, and do not edit package.json or cordis.patch.yml inside my profile.
   git clone https://github.com/novv1/dsh-turn-end-reminder.git "%USERPROFILE%\dsh-plugins\dsh-turn-end-reminder"
   If git fails on the proxy, retry once with: git -c "http.https://github.com/.proxy=" clone ...
2. Confirm that directory contains both package.json and cordis.patch.yml.
3. Run the plugin_manager tool with action install_bundle and target set to that absolute path.
4. already-installed means it was already there, skip it; applied means it worked.
5. If you have no plugin_manager tool, just tell me the manual route: DSH -> Settings -> Plugins -> Add plugin, and pick that folder.
6. Finish with one message covering: where it went, whether it worked, whether I need to restart DSH,
   and how to verify (send any message, wait for the reply to finish, look for the "A turn finished" card bottom-right).
```

## Usage tutorial

1. **Install and restart**, as above.
2. **Send a task that takes a while** — anything with a few tool calls. You do not need to keep watching.
3. **Switch to another window** or another conversation. The reminder only needs the DSH page to stay open; it does not need focus.
4. **When the turn ends**, a card appears bottom-right and you hear two short notes.
5. **Click the card.** You land back in the conversation that just finished. If you would rather stay where you are, click `×` or wait 8 seconds.

That is the whole loop. Nothing to configure.

### Tuning the Windows channel (optional)

The Windows tray notification is off by default, because some Windows builds silently suppress it. If your machine shows notifications normally, turn it on in the plugin's `cordis.patch.yml`:

```yaml
- insert:
    - id: turn-end-reminder
      name: dsh-turn-end-reminder
      config:
        minDurationMs: 3000   # ignore turns shorter than this
        balloon: true         # Windows tray balloon
        sound: true           # Windows system sound
```

| Key | Default | Meaning |
|---|---|---|
| `minDurationMs` | `3000` | Windows channel only: ignore turns shorter than this (ms) |
| `minGapMs` | `2500` | Windows channel only: minimum gap between notifications (ms) |
| `balloon` | `false` | Show the Windows tray balloon |
| `sound` | `false` | Play the Windows system sound |
| `soundFile` | `''` | Custom `.wav` path; empty uses the Windows notification sound |
| `notifyOnError` | `true` | Windows channel: notify when a turn fails |
| `notifyOnAbort` | `false` | Windows channel: notify when you stop a turn yourself |
| `titlePrefix` | `'DSH'` | Balloon title prefix |
| `language` | `'zh'` | Balloon language: `zh` or `en` |

The in-page toast ignores all of these except nothing — it always fires, for any finished turn.

## Troubleshooting

**No toast after installing.**
The page bundle is built at startup. Restart DSH (not just refresh) once after installing. If the bundle is listed in **Plugins** but still nothing appears, refresh the page.

**No sound, but the toast shows.**
Browser and OS audio: check the output device and mute state. Browsers also block audio until you interact with the page once — typing a message counts, so this usually resolves itself.

**Toast appears, click does nothing.**
The conversation was archived or removed in the meantime. Open it from the sidebar instead.

**Windows tray balloon never appears.**
Known on several Windows 11 builds: the PowerShell script runs successfully and Windows simply draws nothing (Focus Assist and per-app notification settings both contribute). This is why the in-page channel is the default and the balloon is opt-in.

## How it works

- **Client half** (`client.js`) registers a component into the `shell.overlay` slot. It subscribes to every session's `running` status and fires when a session flips from running to idle, then plays a Web Audio chime and renders the card.
- **Host half** (`index.js`) listens for `turn/end` session events, filters by reason and duration, and — if enabled — spawns a short-lived PowerShell process that plays a sound and shows a tray balloon.

Both halves are independent; either can be disabled without touching the other.

## Development

```bash
node --test-isolation=none --test test/*.test.js
```

32 unit tests, no dependencies. The policy (`lib/policy.js`) and the Windows launcher (`lib/windows.js`) are pure and injectable, so they run outside DSH.

## Requirements

- DSH Desktop with plugin support.
- The in-page channel: nothing else.
- The Windows channel: Windows with `powershell.exe`, which every supported Windows ships.

## License

MIT — see [LICENSE](LICENSE).
