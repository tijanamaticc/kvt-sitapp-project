# SitApp

SitApp je školski Angular projekat — jednostavan chat klijent sa osnovnim SVT delom (minimalni server). Fokus je na studentskoj implementaciji funkcionalnosti za KVT.

Brzo:
- Login i registracija
- Profil korisnika (promena podataka i profilne slike)
- Lista kontakata i razgovora, slanje poruka, reakcije
- Admin strana za odobravanje registracija (pending)

Kako pokrenuti lokalno:
```bash
npm install
npm start            # frontend na http://localhost:4200
npm run start:server # (opciono) server na http://localhost:3333
```

Server čuva podatke u `server/data.json` i slike u `server/uploads/`.

API (kratko): `POST /api/login`, `POST /api/register`, `GET /api/registrations?status=pending`, `PUT /api/users/:id/profile`, `PUT /api/users/:id/password`.

