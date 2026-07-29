# Implementation Plan: Dev Panel Console (node-pty + ws + xterm)

## Problem and approach
`Console Panel` is currently a placeholder UI and the backend currently exposes SSE for telemetry only.  
We will add a dedicated WebSocket terminal channel (`ws`) backed by `node-pty` on Node.js, then replace the Console tab with an `xterm` terminal view in React.  
Per your choices, implementation will support both lifecycle modes via UI toggle:
1. **Retain**: keep terminal session/websocket alive when switching tabs.
2. **Restart**: close and recreate terminal session when switching away/back.

Terminal scope will be **one isolated session per browser client** (not shared globally).

## Current state findings
- `proa_advisor_react/src/components/Dev Panel/tabs/Console Panel/index.tsx` is dummy content.
- `proa_advisor_react/src/components/Dev Panel/index.tsx` renders only active tab component, so tab switch unmounts prior tab.
- `proa_advisor/index.js` runs Express + SSE (`/data_stream`) but no websocket server.
- Backend already has `node-pty` + `ws` dependencies; frontend does not yet include `xterm` packages.

## Proposed folder structure
### Backend (`proa_advisor`)
- `handler/terminal/terminal_session_manager.js`
  - Owns session map keyed by `clientId`.
  - Handles retain/restart decisions, idle cleanup, safe teardown.
- `handler/terminal/terminal_ws_server.js`
  - Creates/attaches `WebSocketServer`, message routing, connection lifecycle.
- `handler/terminal/pty_factory.js`
  - Spawns platform shell and applies cwd/env defaults.
- `handler/terminal/terminal_protocol.js`
  - Message shape constants + validation helpers.

### Frontend (`proa_advisor_react/src/components/Dev Panel/tabs/Console Panel`)
- `index.tsx` (tab container + lifecycle mode toggle UI)
- `TerminalView.tsx` (xterm mount + fit addon + status line)
- `useTerminalSocket.ts` (ws connection, protocol handlers, input/resize piping)
- `buttons/buttonTemplate.ts` (button config template: display name + command payload)
- `buttons/defaultButtons.ts` (initial button list wired to the template)
- `styles.css` (terminal layout, mode controls, status indicators)

## Connection design (backend + frontend)
1. Backend switches from direct `app.listen(...)` to an HTTP server (`http.createServer(app)`), then attaches WS terminal server on path like `/ws/terminal`.
2. Frontend generates stable `clientId` (via `sessionStorage`) to represent one browser client.
3. On connect, frontend sends `init` payload: `clientId`, `mode` (`retain|restart`), `cols`, `rows`.
4. Backend behavior:
   - `retain`: reuse existing live PTY session for `clientId` when available.
   - `restart`: terminate existing session for `clientId` and spawn fresh PTY.
5. Data flow:
   - client → server: `input`, `resize`, `control(restart|terminate)`.
   - server → client: `ready`, `output`, `status`, `exit`, `error`.
   - console action buttons emit command payloads through the same client `input` channel.
6. Disconnect handling:
   - retain mode: keep session for configurable grace/idle timeout and allow reconnect.
   - restart mode: terminate session on tab leave/disconnect.

## Frontend tab-switch strategy
- Update `Dev Panel` rendering so Console tab can remain mounted while hidden when mode is `retain`, allowing websocket continuity.
- In `restart` mode, explicitly close socket/session on tab deactivation and recreate on reactivation.
- Keep behavior isolated to Console tab to avoid changing lifecycle of unrelated tabs.

## Implementation todos
1. Add backend terminal modules and protocol contracts under `handler/terminal`.
2. Refactor backend bootstrapping in `index.js` to create HTTP server and attach WS terminal endpoint.
3. Implement session manager for per-client PTY lifecycle (retain/restart, cleanup, reconnect).
4. Add React terminal dependencies (`xterm`, `xterm-addon-fit`) and build Console tab UI.
5. Implement socket hook + protocol handling in Console tab (connect/input/output/resize/status).
6. Add `Console Panel/buttons` template system so each button defines `displayName` + `command` payload.
7. Implement initial action buttons:
   - **Ctrl+C** button sends `\u0003` to the terminal session.
   - **Echo Dummy Text** button sends `echo dummy text\n`.
8. Update Dev Panel tab mounting behavior to support retain/restart semantics for Console.
9. Add configuration and safety defaults (shell selection, cwd, env pass-through limits, idle timeout).
10. Validate with manual scenarios for both modes, button actions, and reconnection behavior.

## Notes and considerations
- Existing SSE telemetry endpoints remain unchanged.
- React StrictMode may mount/unmount twice in dev; socket init must guard against duplicate sessions.
- If terminal endpoint is ever exposed beyond trusted local network, add auth token check at WS upgrade time.
