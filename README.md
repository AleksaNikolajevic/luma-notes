# Luma Notes

Self-hosted aplikacija za privatne beleške, inspirisana jednostavnošću Apple
Notes-a. Luma Notes pruža čist React interfejs, sidebar sa pretragom i pinovanim
beleškama, automatsko čuvanje, osnovno formatiranje teksta i izolaciju podataka
između korisnika.

Projekat je namenjen javnom repozitorijumu i bezbednom pokretanju na sopstvenom
serveru. Bezbedne podrazumevane vrednosti uključuju zatvorenu registraciju,
ograničen PostgreSQL nalog za API i objavljivanje aplikacije samo na loopback
interfejsu.

> **Portfolio kontekst:** Komercijalni sistemi na kojima autor radi nisu javni.
> Ovaj repository je nezavisan, proverljiv primer full-stack načina rada i ne
> sadrži kod, podatke ili poslovnu logiku prethodnih poslodavaca. Više detalja
> je u [portfolio kontekstu](./docs/portfolio-context.md).

![Luma Notes workspace](./docs/screenshots/notes-workspace.png)

## Mogućnosti

- registracija, prijava i odjava korisnika;
- privatne beleške dostupne samo njihovom vlasniku;
- sidebar sa pregledom, pretragom i pinovanjem beleški;
- kreiranje, automatsko čuvanje i brisanje beleški;
- osnovno rich-text formatiranje;
- optimističko zaključavanje protiv prepisivanja novije verzije;
- cursor paginacija i server-side pretraga;
- prilagodljive kvote po korisniku;
- responsive interfejs za desktop i mobilne uređaje;
- Docker Compose postavka spremna za self-hosting.

## Tehnologije

| Sloj           | Tehnologije                                           |
| -------------- | ----------------------------------------------------- |
| Web            | React 19, TypeScript, Vite, TipTap, Nginx             |
| API            | Node.js 22, Fastify, TypeScript, Zod                  |
| Baza           | PostgreSQL 16, Drizzle ORM                            |
| Testovi        | Node Test Runner, Vitest, Testing Library, Playwright |
| Infrastruktura | Docker, Docker Compose                                |
| Monorepo       | pnpm workspaces                                       |

## Arhitektura

```mermaid
flowchart LR
    U["Browser"] -->|HTTPS| P["TLS reverse proxy<br/>Caddy ili ekvivalent"]
    P --> W["React aplikacija<br/>Nginx"]
    W -->|/api| A["Fastify API"]
    A -->|ograničeni notes_app nalog| D[("PostgreSQL")]
    M["Jednokratni migracioni servis"] -->|admin nalog| D
```

Web kontejner je jedina objavljena komponenta i vezan je za
`127.0.0.1:${APP_PORT}`. API i PostgreSQL ostaju u internim Docker mrežama.
Migracije koriste administratorski nalog samo tokom pokretanja, dok API dobija
ograničeni `notes_app` nalog.

Razlozi i trade-off-i iza sesija, autosave-a, paginacije, pretrage, editora i
Docker izolacije opisani su u
[Engineering decisions](./docs/engineering-decisions.md).

```text
.
├── apps/
│   ├── api/                 # Fastify API, Drizzle šema i migracije
│   └── web/                 # React aplikacija i Nginx konfiguracija
├── packages/
│   └── contracts/           # Deljeni Zod ugovori i TypeScript tipovi
├── docs/                     # Portfolio kontekst i tehničke odluke
├── tests/e2e/                # Playwright korisnički tok
├── .github/                 # CI i Dependabot konfiguracija
├── docker-compose.yml
├── .env.example
├── SECURITY.md
└── pnpm-workspace.yaml
```

## Preduslovi

Za preporučeno Docker pokretanje:

- Docker Engine 24+;
- Docker Compose v2;
- domen koji pokazuje na server i TLS reverse proxy za javnu instalaciju.

Za razvoj van kontejnera potrebni su i:

- Node.js 22+;
- pnpm 11;
- lokalno dostupan PostgreSQL 16+.

## Brzi lokalni start sa Docker-om

Ovaj režim je namenjen proveri aplikacije na računaru, preko HTTP-a.

1. Kopirajte primer konfiguracije:

   ```bash
   cp .env.example .env
   ```

   U PowerShell-u:

   ```powershell
   Copy-Item .env.example .env
   ```

2. Za lokalno pokretanje promenite sledeće vrednosti u `.env`:

   ```dotenv
   PUBLIC_ORIGIN=http://localhost:3000
   TRUST_PROXY_HOPS=1
   COOKIE_SECURE=false
   REGISTRATION_MODE=open
   ```

3. Kreirajte direktorijum za secret-e i generišite dve nezavisne lozinke:

   ```bash
   mkdir -p .secrets
   node -e "const fs=require('fs'),c=require('crypto');fs.mkdirSync('.secrets',{recursive:true});for(const n of ['postgres_admin_password','postgres_app_password']){const p='.secrets/'+n;if(!fs.existsSync(p))fs.writeFileSync(p,c.randomBytes(48).toString('base64url'))}"
   ```

   U PowerShell-u:

   ```powershell
   New-Item -ItemType Directory -Force .secrets | Out-Null
   node -e "const fs=require('fs'),c=require('crypto');fs.mkdirSync('.secrets',{recursive:true});for(const n of ['postgres_admin_password','postgres_app_password']){const p='.secrets/'+n;if(!fs.existsSync(p))fs.writeFileSync(p,c.randomBytes(48).toString('base64url'))}"
   ```

4. Pokrenite aplikaciju:

   ```bash
   docker compose up -d --build
   ```

5. Otvorite [http://localhost:3000](http://localhost:3000).

Proverite stanje i logove:

```bash
docker compose ps
docker compose logs -f api web
```

Zaustavljanje servisa ne briše podatke:

```bash
docker compose down
```

> `COOKIE_SECURE=false` i `REGISTRATION_MODE=open` služe samo za lokalni razvoj.
> Nemojte ih koristiti na javnom serveru.

## Bezbedno produkciono pokretanje

### 1. Pripremite konfiguraciju

```bash
cp .env.example .env
```

U `.env` obavezno postavite:

```dotenv
PUBLIC_ORIGIN=https://notes.example.com
TRUST_PROXY_HOPS=2
COOKIE_SECURE=true
REGISTRATION_MODE=closed
```

`PUBLIC_ORIGIN` mora tačno odgovarati origin-u koji korisnik vidi u browseru,
bez završne kose crte. Za tok `klijent → Caddy → web Nginx → API`,
`TRUST_PROXY_HOPS=2`.

Previsoka vrednost `TRUST_PROXY_HOPS` može omogućiti spoofovanje klijentske IP
adrese. Preniska vrednost može spojiti više korisnika u isti rate-limit ključ.

### 2. Generišite PostgreSQL secret-e

```bash
mkdir -p .secrets
node -e "const fs=require('fs'),c=require('crypto');fs.mkdirSync('.secrets',{recursive:true});for(const n of ['postgres_admin_password','postgres_app_password']){const p='.secrets/'+n;if(!fs.existsSync(p))fs.writeFileSync(p,c.randomBytes(48).toString('base64url'))}"
chmod 600 .secrets/postgres_admin_password .secrets/postgres_app_password
```

Fajlovi iz `.secrets/` su ignorisani kroz `.gitignore` i montiraju se kao Docker
secrets. Nemojte ih dodavati u Git, ugrađivati u image ili deliti između
različitih instalacija.

### 3. Kreirajte prvog korisnika

Bezbedni podrazumevani režim registracije je:

```dotenv
REGISTRATION_MODE=closed
```

Za kreiranje prvog naloga generišite jednokratni invite kod:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Izračunajte njegov SHA-256 hash:

```bash
node -e "console.log(require('crypto').createHash('sha256').update(process.argv[1]).digest('hex'))" "OVDE_UNESITE_INVITE_KOD"
```

U `.env` privremeno postavite:

```dotenv
REGISTRATION_MODE=invite
REGISTRATION_INVITE_CODE_HASH=dobijeni_sha256_hash
```

Pokrenite aplikaciju, registrujte nalog koristeći originalni invite kod, zatim
vratite `REGISTRATION_MODE=closed` i primenite promenu:

```bash
docker compose up -d
```

Režim `open` koristite samo ako ispred aplikacije postoji dodatna anti-bot ili
druga kontrola registracije.

### 4. Pokrenite servise

```bash
docker compose up -d --build
docker compose ps
```

Web aplikacija se namerno objavljuje samo na `127.0.0.1:${APP_PORT:-3000}`. Ne
menjajte bind na `0.0.0.0` bez odgovarajućeg firewall-a i TLS reverse proxy-ja.

### 5. Postavite HTTPS reverse proxy

Primer Caddy konfiguracije na hostu:

```caddyfile
notes.example.com {
    header Strict-Transport-Security "max-age=31536000; includeSubDomains"
    reverse_proxy 127.0.0.1:3000
}
```

Nakon pokretanja proverite:

- da je aplikacija dostupna isključivo preko HTTPS-a;
- da PostgreSQL port `5432` i API port `4000` nisu javno dostupni;
- da odgovor postavlja `Secure`, `HttpOnly` i `SameSite=Strict` session cookie;
- da je registracija zatvorena nakon kreiranja potrebnih naloga.

## Konfiguracija

| Promenljiva                     | Podrazumevano                      | Namena                                                    |
| ------------------------------- | ---------------------------------- | --------------------------------------------------------- |
| `PUBLIC_ORIGIN`                 | obavezno u produkciji              | Dozvoljeni javni origin; više vrednosti se odvaja zarezom |
| `TRUST_PROXY_HOPS`              | obavezno u Compose-u               | Broj pouzdanih proxy slojeva, od `0` do `5`               |
| `COOKIE_SECURE`                 | `true` u produkciji                | Dozvoljava slanje session cookie-ja samo preko HTTPS-a    |
| `APP_PORT`                      | `3000`                             | Loopback port web servisa na hostu                        |
| `POSTGRES_DB`                   | `notes`                            | Naziv PostgreSQL baze                                     |
| `POSTGRES_ADMIN_USER`           | `notes_admin`                      | Nalog koji koriste inicijalizacija i migracije            |
| `POSTGRES_APP_USER`             | `notes_app`                        | Ograničeni runtime nalog API-ja                           |
| `POSTGRES_ADMIN_SECRET_FILE`    | `.secrets/postgres_admin_password` | Putanja do admin lozinke                                  |
| `POSTGRES_APP_SECRET_FILE`      | `.secrets/postgres_app_password`   | Putanja do API lozinke                                    |
| `REGISTRATION_MODE`             | `closed`                           | `closed`, `invite` ili `open`                             |
| `REGISTRATION_INVITE_CODE_HASH` | prazno                             | SHA-256 hash invite koda                                  |
| `SESSION_DAYS`                  | `14`                               | Trajanje sesije, od 1 do 90 dana                          |
| `MAX_SESSIONS_PER_USER`         | `5`                                | Maksimalan broj aktivnih sesija po korisniku              |
| `MAX_NOTES_PER_USER`            | `1000`                             | Maksimalan broj beleški po korisniku                      |
| `MAX_NOTE_BYTES`                | `100000`                           | Maksimalna veličina jedne beleške u bajtovima             |
| `MAX_TOTAL_NOTE_BYTES_PER_USER` | `25000000`                         | Ukupna kvota sadržaja po korisniku                        |
| `NOTES_PAGE_SIZE`               | `50`                               | Podrazumevana veličina stranice, od 10 do 100             |
| `DATABASE_URL`                  | nema                               | Konekcija za razvoj van Docker Compose-a                  |
| `PORT`                          | `4000`                             | API port za razvoj van Docker Compose-a                   |

Posle izmene promenljivih primenite konfiguraciju komandom:

```bash
docker compose up -d
```

## Lokalni razvoj sa live reload-om

Docker Compose namerno ne objavljuje PostgreSQL port. Za razvoj van kontejnera
pokrenite zasebnu lokalnu PostgreSQL instancu dostupnu na `localhost:5432` i
kreirajte razvojnu bazu i nalog sa pravima za migracije.

Napravite `.env`:

```dotenv
PUBLIC_ORIGIN=http://localhost:5173
COOKIE_SECURE=false
TRUST_PROXY_HOPS=0
REGISTRATION_MODE=open
DATABASE_URL=postgresql://notes:lokalna-lozinka@localhost:5432/notes
PORT=4000
```

Instalirajte zavisnosti, primenite migracije i pokrenite web i API:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm db:migrate
pnpm dev
```

Vite je dostupan na [http://localhost:5173](http://localhost:5173), a API na
`http://localhost:4000`. Vite prosleđuje `/api` zahteve API-ju tokom razvoja.

Korisne komande:

| Komanda             | Opis                                          |
| ------------------- | --------------------------------------------- |
| `pnpm dev`          | Pokreće web i API u watch režimu              |
| `pnpm build`        | Gradi sve workspace pakete                    |
| `pnpm typecheck`    | Proverava TypeScript tipove                   |
| `pnpm lint`         | Pokreće ESLint                                |
| `pnpm format:check` | Proverava Prettier format                     |
| `pnpm test`         | Pokreće unit i frontend testove               |
| `pnpm test:e2e`     | Pokreće Playwright korisnički tok             |
| `pnpm verify`       | Pokreće sve statičke provere, testove i build |
| `pnpm db:generate`  | Generiše Drizzle migraciju iz izmenjene šeme  |
| `pnpm db:migrate`   | Primenjuje migracije                          |

PostgreSQL integracioni test se automatski uključuje kada je postavljen
`TEST_DATABASE_URL`. E2E test očekuje migriranu razvojnu bazu iz `DATABASE_URL`;
Playwright sam pokreće web i API.

## API pregled

Svi odgovori sa privatnim podacima koriste `Cache-Control: no-store`. Sesija se
prenosi kroz `HttpOnly` cookie; API nije namenjen čuvanju tokena u
`localStorage`-u.

| Metod    | Putanja              | Opis                                            |
| -------- | -------------------- | ----------------------------------------------- |
| `GET`    | `/api/health`        | Health check                                    |
| `GET`    | `/api/auth/config`   | Vraća trenutni režim registracije               |
| `GET`    | `/api/auth/me`       | Vraća prijavljenog korisnika                    |
| `POST`   | `/api/auth/register` | Kreira nalog, ako režim to dozvoljava           |
| `POST`   | `/api/auth/login`    | Kreira sesiju                                   |
| `POST`   | `/api/auth/logout`   | Poništava sesiju                                |
| `GET`    | `/api/notes`         | Lista i pretražuje beleške uz cursor paginaciju |
| `GET`    | `/api/notes/:id`     | Vraća jednu belešku                             |
| `POST`   | `/api/notes`         | Kreira belešku                                  |
| `PATCH`  | `/api/notes/:id`     | Čuva sadržaj, pin status i verziju              |
| `DELETE` | `/api/notes/:id`     | Briše belešku                                   |

`GET /api/notes` prihvata opcione parametre `search`, `cursor` i `limit`. Svaka
operacija nad jednom beleškom proverava i ID beleške i vlasnika.

## Bezbednosni model

- Nasumični neprozirni session token se šalje samo kao cookie; baza čuva njegov
  SHA-256 otisak.
- Produkcioni cookie koristi `__Host-` prefiks, `Secure`, `HttpOnly` i
  `SameSite=Strict`.
- Lozinke koriste verzionisan scrypt profil i automatski se rehash-uju nakon
  uspešne prijave kada profil zastari.
- Login i registracija imaju strože rate limite i odgovore koji smanjuju
  enumeraciju korisnika.
- State-changing zahtevi prolaze Origin i Fetch Metadata proveru.
- Rich-text HTML se sanitizuje na serveru pre čuvanja.
- Zod ugovori ograničavaju dužinu i oblik ulaza.
- Svaki SQL upit nad beleškama uključuje `owner_id`.
- Kvote ograničavaju broj beleški, pojedinačnu veličinu i ukupnu potrošnju po
  korisniku.
- API koristi optimističko zaključavanje kroz polje `version`.
- API i web rade kao neprivilegovani korisnici sa read-only filesystem-om,
  uklonjenim Linux capabilities i ograničenim resursima.
- PostgreSQL i API nisu direktno objavljeni na hostu.
- Nginx postavlja CSP i zaštite od clickjacking-a, MIME sniffing-a i curenja
  referrer-a.
- Logovi rediguju cookie, authorization, lozinke i invite kodove.
- CI pokreće format, lint, typecheck, unit, PostgreSQL integration i browser E2E
  testove, build i dependency audit; Dependabot prati zastarele zavisnosti.

Ove zaštite ne zamenjuju redovno ažuriranje servera, firewall, TLS, backup i
nadzor. Za prijavu ranjivosti pogledajte [SECURITY.md](./SECURITY.md).

### Granice poverenja

Luma Notes nije end-to-end enkriptovana aplikacija. Beleške se čuvaju kao
sanitizovan HTML u PostgreSQL bazi, pa administrator servera, vlasnik backup-a
ili napadač koji kompromituje server može pročitati njihov sadržaj. TLS štiti
prenos, ali enkripciju diska, volumena i backup-a mora obezbediti operator.

Autorizacija beleški se trenutno sprovodi u API sloju obaveznim `owner_id`
filterom; PostgreSQL Row-Level Security nije uključen. Ugrađeni rate-limit store
je lokalni memorijski store jedne API instance. Za horizontalno skaliranje je
potreban zajednički atomski store.

## Backup i oporavak

Napravite konzistentan PostgreSQL backup u custom formatu. Ovaj postupak ne
zavisi od shell redirekcije i radi isto na Linux-u, macOS-u i Windows-u:

```bash
docker compose exec db pg_dump -U notes_admin -d notes --format=custom --file=/tmp/notes.backup
docker compose cp db:/tmp/notes.backup ./notes.backup
docker compose exec db rm /tmp/notes.backup
```

Čuvajte backup enkriptovan, van istog servera, i periodično testirajte oporavak.
Sledeća komanda prepisuje sadržaj ciljne baze, zato je koristite samo nad
proverenom instalacijom:

```bash
docker compose stop api web
docker compose cp ./notes.backup db:/tmp/notes.backup
docker compose exec db pg_restore -U notes_admin -d notes --clean --if-exists /tmp/notes.backup
docker compose exec db rm /tmp/notes.backup
docker compose up -d
```

## Ažuriranje instalacije

Pre ažuriranja napravite backup, zatim preuzmite novu verziju i ponovo izgradite
image-e:

```bash
git pull --ff-only
docker compose build --pull
docker compose up -d
docker compose ps
```

`migrate` servis automatski primenjuje migracije pre pokretanja API-ja.
Pregledajte release napomene i `.env.example` pre svakog ažuriranja.

## Provere pre objave

```bash
pnpm audit --audit-level moderate
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
docker compose config --quiet
```

CI uz ove provere pokreće PostgreSQL integracioni i Playwright E2E test pri
svakom pull request-u i prema rasporedu definisanom u `.github/workflows/`.

## Operativne preporuke

- Redovno ažurirajte host, Docker Engine, bazne image-e i Node zavisnosti.
- Koristite rootless Docker kada okruženje to dozvoljava.
- Ograničite SSH pristup, uključite firewall i automatske bezbednosne zakrpe.
- Nadgledajte `429`, `403`, neuspešne prijave, rast baze i iskorišćenost kvota.
- Ne zapisujte sadržaj beleški, cookie-je, lozinke ili invite kodove u logove.
- Rotirajte PostgreSQL secret-e po dokumentovanoj proceduri i nakon sumnje na
  kompromitovanje.
- Za više API replika zamenite in-memory rate-limit store zajedničkim Redis ili
  drugim atomskim store-om.

## Doprinos projektu

1. Otvorite issue za veće izmene ili bezbednosno neutralne predloge.
2. Napravite malu, fokusiranu granu.
3. Pokrenite `pnpm verify`.
4. Pošaljite pull request sa opisom ponašanja i načina provere.

Nemojte javno otvarati issue za neobjavljenu ranjivost. Koristite privatni kanal
opisan u [SECURITY.md](./SECURITY.md).

## Licenca

Projekat je dostupan pod permisivnom [MIT licencom](./LICENSE).
