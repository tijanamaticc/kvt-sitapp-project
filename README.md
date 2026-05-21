# SitApp

SitApp is an Angular school project focused on the KVT part: login, registration, protected routes, and a simple logged-in profile page. The backend is intentionally kept minimal and works as a mock SVT layer that stores users and uploaded profile images locally, while also supporting real SMTP email notifications for registration approval and password changes.

## Features

- Login and registration
- Logged-in profile page with editable user data
- Profile image selection from device
- Password change form
- Admin approval page for pending registrations
- Editable profile section
- Responsive WhatsApp-like split layout

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

```bash
npm run start:server
```

Email settings for real notifications:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

Put them in a root `.env` file. You can copy `.env.example` and fill in real values.

If these are not set, the server prints the message to the console instead of sending it.

Server API endpoints (minimal):

- `POST /api/login` { identifier, password }
- `POST /api/register` { username, email, phone, password, profile, avatar }
- `GET /api/registrations?status=pending`
- `POST /api/registrations/:id/approve`
- `POST /api/registrations/:id/reject`
- `PUT /api/users/:id/profile`
- `PUT /api/users/:id/password`

The server persists data to `server/data.json` and uploaded profile images to `server/uploads/`.

## KVT mapping and how it works

- Registracija korisnika: forma prikuplja `firstName`, `lastName`, `username`, `email`, `phone`, `password` i opcionalnu profilnu sliku iz uređaja. Frontend čuva sesiju u `localStorage` i šalje zahtev `POST /api/register` koji upisuje korisnika u `server/data.json`.
- Administrator: `server/data.json` sadrži predefinisan administratorski nalog (`admin / admin123`).
- Registracija prvo ide kao pending zahtev. Administrator na posebnoj strani vidi pending prijave i odobrava ili odbija registraciju. Korisnik dobija mejl kada pošalje zahtev i dodatni mejl kada admin obradi zahtev.
- Prijava i odjava: `POST /api/login` prihvata `identifier` (username/email/phone) i `password`. Nakon uspešne prijave aplikacija čuva trenutnog korisnika u `localStorage` i omogućava `logout()` koji briše sesiju. `authGuard` blokira pristup zaštićenim rutama ako korisnik nije prijavljen.
- Profil korisnika: nakon prijave korisnik odmah dolazi na svoju stranu profila, gde može da vidi i menja svoje podatke.
- Mock SVT: backend nije komplikovan i nije prava SQL baza; koristi `server/data.json` i `server/uploads/` kao jednostavno trajno skladište za potrebe KVT i odbrane.

## Test flow (pre push)

1. Start frontend: `npm start` → open `http://localhost:4200`.
2. Start server (optional): `npm run start:server` → `http://localhost:3333`.
3. Register new user via UI. Status stays pending until admin approves it.
4. Log in as admin, open `/admin`, approve or reject the pending request.
5. Log in with the approved user and confirm the logged-in profile page is accessible only when logged in.

If you want, I can also give you a 30-second defense script based on this README.
