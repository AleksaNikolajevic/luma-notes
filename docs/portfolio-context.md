# Portfolio context

Komercijalni sistemi na kojima autor radi pripadaju kompanijama i njihovim
korisnicima, pa njihov izvorni kod, podaci i interni ekrani ne mogu da budu
objavljeni.

Luma Notes je zato nezavisan javni projekat napravljen kao proverljiv primer
istog načina rada:

- feature je vođen od UI-ja i API ugovora do baze i deployment-a;
- arhitektonske i bezbednosne odluke su eksplicitno dokumentovane;
- automatske provere mogu da se pokrenu bez pristupa privatnoj infrastrukturi;
- repository ne sadrži kod, podatke, dizajn ili poslovnu logiku prethodnih
  poslodavaca i klijenata.

## Šta projekat demonstrira

- prelazak između srodnih full-stack ekosistema;
- TypeScript ugovore deljene između React-a i Node.js API-ja;
- modelovanje PostgreSQL podataka i migracija;
- browser autentifikaciju i vlasničku autorizaciju;
- konflikt-safe autosave i asinhrono stanje u UI-ju;
- dizajn self-hosted deployment-a sa bezbednim podrazumevanim vrednostima;
- testiranje na unit, integration i E2E nivou.

## Namerno ograničen opseg

Ovo nije pokušaj da se napravi kompletna zamena za Apple Notes. Trenutni scope
ne uključuje deljenje beleški, priloge, offline sinhronizaciju, password reset,
MFA ili end-to-end enkripciju.

Ta ograničenja su namerna: cilj je mala, završena vertikalna celina čije odluke
mogu da se objasne i odbrane, a ne veliki broj nedovršenih funkcija.

## Razuman sledeći produkcioni korak

Za veću javnu instalaciju prioriteti bi bili:

1. email verifikacija, password reset i opcioni MFA;
2. PostgreSQL Row-Level Security kao dodatna autorizaciona granica;
3. centralizovan rate-limit store i strukturisani metrics/tracing;
4. enkriptovani backup-i sa automatski testiranim restore postupkom;
5. `pg_trgm` ili full-text indeks kada realni podaci opravdaju složenost.
