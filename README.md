# SitApp

SitApp is a WhatsApp-inspired Angular school project with a light-blue visual identity and a minimal local data layer so the KVT functionality works without a heavy backend.

## Features

- Login and registration
- Conversation search and quick user search
- Direct chats and group chats
- Message sending with read status
- Basic group creation and member management
- Editable profile section
- Responsive split layout

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Start the Angular dev server:

```bash
npm start
```

3. Open the app at:

```text
http://localhost:4200
```
4. Running the minimal SVT (server)

Install server deps and start:

```bash
npm install express cors body-parser
npm run start:server
```

Server API endpoints (minimal):

- `POST /api/login` { identifier, password }
- `POST /api/register` { username, email, phone, password, profile }

The server persists data to `server/data.json`.

## Push plan for today (auth skeleton)

You will push only the authentication skeleton for KVT today. The commit should include:
- frontend auth components (`src/app/features/auth`)
- user model and auth service (`src/app/core/models/user.model.ts`, `src/app/core/services/auth.service.ts`)
- minimal server seed and endpoints (`server/index.cjs`, `server/data.json`)
- `.vscode/settings.json` and README changes

Recommended git commands before pushing:
```bash
git add src/app/features/auth src/app/core/models/user.model.ts src/app/core/services/auth.service.ts server/index.cjs server/data.json .vscode/settings.json README.md
git commit -m "KVT: auth skeleton — registration/login + predefined admin; removed demo data"
git push origin master
```

## KVT mapping and how it works

- Registracija korisnika: forma prikuplja `firstName`, `lastName`, `username`, `email`, `phone`, `password` i opciono `avatarUrl`. Frontend čuva sesiju u `localStorage` i (ako koristite server) šalje zahtev `POST /api/register` koji upisuje korisnika u `server/data.json`.
- Administrator: `server/data.json` sadrži predefinisan administratorski nalog (`admin / admin123`).
- Prijava i odjava: `POST /api/login` prihvata `identifier` (username/email/phone) i `password`. Nakon uspešne prijave aplikacija čuva trenutnog korisnika u `localStorage` i omogućava `logout()` koji briše sesiju. `authGuard` blokira pristup zaštićenim rutama ako korisnik nije prijavljen.

## Test flow (pre push)

1. Start frontend: `npm start` → open `http://localhost:4200`.
2. Start server (optional): `npm run start:server` → `http://localhost:3333`.
3. Register new user via UI; log out and log in with the created credentials.
4. Confirm protected route (`/chat`) is accessible only when logged in.

If you want, I can prepare a branch `auth-skeleton` and commit these exact files into it so you can review before pushing to `master`.
