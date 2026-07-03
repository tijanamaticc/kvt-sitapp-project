# SitApp

SitApp je školski Angular projekat — jednostavan chat klijent sa osnovnim SVT delom (minimalni server). Fokus je na studentskoj implementaciji funkcionalnosti za KVT.

Konfiguracija okruženja:
- `.env.example` je šablon koji ide u Git i pokazuje koja su podešavanja potrebna.
- `.env` je lokalni fajl sa stvarnim vrednostima i ne treba da se komituje.
- Kada praviš svoj lokalni setup, kopiraj `.env.example` u `.env` i unesi svoje SMTP podatke ako želiš slanje mejlova.

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

