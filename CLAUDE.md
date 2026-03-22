# CollabCode — CLAUDE.md

## Project Overview

**CollabCode** is a real-time collaborative code editor built for CS436. Users can create projects, manage files/folders, invite collaborators, chat in-app, and execute Python code via the Piston API.

## Repository Structure

```
cs436-codeEditor-main/
├── my-app/          # React frontend (Vite + Chakra UI + Monaco Editor)
└── server/          # Node.js/Express backend (MongoDB + WebSocket + Yjs)
```

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Chakra UI, Monaco Editor, React Router |
| Backend | Node.js, Express, MongoDB (Mongoose), JWT auth |
| Real-time | WebSocket (`ws`), Yjs (CRDT) |
| Code execution | Piston API (external) |

## Running Locally

### Frontend
```bash
cd cs436-codeEditor-main/my-app
npm install
npm run dev         # → http://localhost:5173
```

### Backend
```bash
cd cs436-codeEditor-main/server
npm install
npm run dev         # nodemon → port 4000
```

**Required `.env` in `server/`:**
```
MONGO_URI=<your MongoDB connection string>
JWT_SECRET=<a strong random secret>
```

## Architecture

### Backend (MVC)
- **Routes** → `server/src/routes/` — mount under `/api/auth`, `/api/project`, `/api/file`, `/api/folder`, `/api/chat`
- **Controllers** → `server/src/controllers/` — business logic per resource
- **Models** → `server/src/models/` — Mongoose schemas (User, Project, File, Folder, Chat)
- **Middleware** → `server/src/middleware/authenticate.js` — JWT verification for protected routes

### Frontend
- `App.jsx` — auth gate, renders `<Dashboard>` or `<CodeEditor>`
- `CodeEditor.jsx` — three-panel layout (editor | output | chat), WebSocket sync
- `Dashboard.jsx` — project list and creation
- `pistonAPI.js` — code execution calls (Python only)
- `backendAPI.js` — HTTP helpers for the Express backend

### Real-time Sync
WebSocket server lives in `server.js`. Clients broadcast file edits keyed by `projectId`. Yjs is installed but primarily used via `y-websocket`.

## Known Issues & Technical Debt

### Critical (fix before any production use)
- **Hardcoded JWT secret** in `authControllers.js` and `authenticate.js` — must move to `process.env.JWT_SECRET`
- **Hardcoded CORS origin** (`http://localhost:5173`) in `server.js` — must be env-configurable

### High Priority
- No rate limiting on `/api/auth/login` or `/api/auth/signup` (brute-force risk)
- Frontend `baseUrl` hardcoded to `http://localhost:4000` in `backendAPI.js`
- No `.env.example` file — contributors must guess required vars

### Medium Priority
- No tests (unit, integration, or e2e)
- No TypeScript — runtime type errors go undetected
- `saveAllFiles()` fires one HTTP request per open tab on unload — no batch endpoint
- WebSocket reconnection not implemented; silent failures on disconnect
- Chat file uploads stored in localStorage only — not persisted to backend

### Low Priority
- `.giitignore` typo (duplicate of `.gitignore`)
- Code execution hardcoded to Python; other languages not surfaced in UI
- Folder hierarchy has backend models but no frontend UI
- WebSocket message fields inconsistent (`updatedTabId` vs `fileId`)

## Development Guidelines

- Backend routes are protected via the `authenticate` middleware — always import and apply it to new protected routes
- Keep controllers thin; complex logic belongs in service-layer utilities (none exist yet — create `server/src/services/` if needed)
- Frontend API calls go through `backendAPI.js` — add new helpers there, don't inline `axios` calls in components
- Chakra UI is the component library — prefer its primitives over custom CSS
- Monaco Editor options are set in `CodeEditor.jsx` — editor config changes go there
