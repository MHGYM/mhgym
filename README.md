# MHGym API

Backend REST API voor de MHGym fitness app — gebouwd met Node.js, Express en SQLite.

## Features

- 🔐 Gebruikersregistratie & login (JWT)
- 🗓️ Lesrooster & reserveringssysteem
- 💳 Lidmaatschappen (Basic / Premium / VIP)
- 💰 Mollie betalingsintegratie

## Installatie

```bash
npm install
cp .env.example .env        # vul je eigen waarden in
npm run migrate             # database aanmaken
npm run dev                 # server starten (met auto-reload)
```

## API Endpoints

### Auth
| Method | Route | Beschrijving |
|--------|-------|-------------|
| POST | `/api/auth/register` | Registreer nieuw lid |
| POST | `/api/auth/login` | Inloggen |
| GET  | `/api/auth/me` | Eigen profiel ophalen |
| PUT  | `/api/auth/profile` | Profiel bijwerken |
| PUT  | `/api/auth/password` | Wachtwoord wijzigen |

### Lessen
| Method | Route | Beschrijving |
|--------|-------|-------------|
| GET | `/api/classes` | Alle lessen (filter: `?category=yoga&from=2025-06-01`) |
| GET | `/api/classes/:id` | Les details |
| POST | `/api/classes` | Les aanmaken (admin) |
| PUT | `/api/classes/:id` | Les bewerken (admin) |
| DELETE | `/api/classes/:id` | Les annuleren (admin) |

### Reserveringen
| Method | Route | Beschrijving |
|--------|-------|-------------|
| GET | `/api/bookings` | Eigen reserveringen |
| POST | `/api/bookings` | Les reserveren |
| DELETE | `/api/bookings/:id` | Reservering annuleren |
| GET | `/api/bookings/admin` | Alle reserveringen (admin) |

### Lidmaatschappen
| Method | Route | Beschrijving |
|--------|-------|-------------|
| GET | `/api/memberships` | Beschikbare tiers |
| GET | `/api/memberships/mine` | Eigen lidmaatschap |
| PUT | `/api/memberships/mine/cancel` | Lidmaatschap opzeggen |
| GET | `/api/memberships/admin/users` | Alle leden (admin) |

### Betalingen (Mollie)
| Method | Route | Beschrijving |
|--------|-------|-------------|
| POST | `/api/payments/checkout` | Start Mollie betaling |
| POST | `/api/payments/webhook` | Mollie webhook |
| GET  | `/api/payments` | Eigen betalingshistorie |
| GET  | `/api/payments/admin` | Alle betalingen (admin) |

## Lidmaatschap tiers

| Tier | Prijs/mnd | Max lessen/mnd |
|------|-----------|----------------|
| Basic | €29,95 | 8 |
| Premium | €49,95 | 20 |
| VIP | €79,95 | Onbeperkt |

## Technologie

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: SQLite (better-sqlite3)
- **Auth**: JWT + bcrypt
- **Betalingen**: Mollie API
- **Validatie**: express-validator
