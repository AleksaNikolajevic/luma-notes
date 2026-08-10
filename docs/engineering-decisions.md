# Engineering decisions

Ovaj dokument opisuje odluke koje nisu očigledne samo iz pregleda UI-ja. Cilj je
da reviewer može da proceni trade-off-e, a ne samo krajnji rezultat.

## 1. Server-side sesije umesto JWT pristupa

**Kontekst:** Browser aplikaciji je potrebna opoziva autentifikacija bez
izlaganja tokena JavaScript-u.

**Odluka:** Klijent dobija nasumični opaque token u `HttpOnly` cookie-ju. Baza
čuva samo SHA-256 otisak tokena, datum isteka i vlasnika sesije.

**Posledice:**

- sesija može odmah da se opozove;
- krađa baze ne otkriva aktivne session tokene;
- API radi jedan bazni upit pri autentifikaciji;
- horizontalno skaliranje zahteva zajedničku bazu ili session store.

## 2. Verzovano hashovanje lozinki

Lozinke koriste scrypt profil čiji su parametri upisani u sam hash. Posle
uspešne prijave stariji profil se automatski rehash-uje. Tako se parametri mogu
pojačavati bez prinudnog resetovanja svih lozinki.

Neuspešna prijava koristi dummy hash kada korisnik ne postoji, čime se smanjuje
razlika u vremenu odgovora i mogućnost enumeracije naloga.

## 3. Odvojeni PostgreSQL nalozi

Migracioni kontejner dobija administratorski nalog samo za DDL i dodelu prava.
Runtime API dobija `notes_app` nalog sa pravima potrebnim za čitanje i menjanje
aplikacionih tabela.

Kompromitovan API zato nema `CREATEDB`, `CREATEROLE`, superuser ili replication
prava. Secret-i nisu deo image-a niti Git repozitorijuma.

## 4. Autorizacija vlasništva u svakom upitu

Svaki read, update i delete nad beleškom kombinuje njen ID sa `owner_id`
prijavljenog korisnika. Zahtev drugog korisnika dobija `404`, tako da API ne
potvrđuje ni postojanje tuđeg resursa.

PostgreSQL Row-Level Security trenutno nije uključen. To je svesno dokumentovana
granica: greška u budućem API upitu može zaobići aplikacionu proveru. Za sistem
sa strožim multi-tenant zahtevima sledeći korak bi bio RLS sa transaction-scoped
identitetom korisnika.

## 5. Autosave sa optimističkim zaključavanjem

Svaka beleška ima monotono polje `version`. Klijent šalje verziju koju je
učitao, a update uspeva samo ako se ona još poklapa sa bazom.

Ovo sprečava da sporiji zahtev ili druga otvorena kartica neprimetno prepišu
noviji sadržaj. Kod konflikta korisnik može da učita noviju verziju ili ponovo
sačuva svoj sadržaj.

## 6. Cursor paginacija umesto offset-a

Lista je sortirana po `pinned`, `updated_at` i `id`, a isti skup polja se kodira
u cursor. Stabilnost liste se ne pogoršava kada se nove beleške dodaju između
dva zahteva, a veliki offset ne mora da se skenira.

## 7. Server-side pretraga

Pretraga se izvršava u PostgreSQL-u nad naslovom i bezbednim tekstualnim
preview-em. Klijent debounce-uje unos i šalje query serveru, pa rezultat nije
ograničen na trenutno učitanu stranicu.

Za mnogo veći skup podataka prirodan sledeći korak je `pg_trgm` ili PostgreSQL
full-text indeks. Trenutni `ILIKE` pristup je namerno jednostavan za
podrazumevanu kvotu od 1.000 beleški po korisniku.

## 8. Rich-text model i sanitizacija

Editor koristi TipTap/ProseMirror zbog pouzdanog Selection i history modela. Ovo
zamenjuje zastareli `document.execCommand`, ali se biblioteci ne veruje kao
bezbednosnoj granici.

API ponovo sanitizuje HTML uz malu allow-listu tagova i bez atributa. Clipboard
ili ručno konstruisan API zahtev zato ne mogu da sačuvaju skripte, event
handlere ili proizvoljne URL-ove.

## 9. Dve Docker mreže i loopback-only port

PostgreSQL je samo u internoj backend mreži. API je dostupan web kontejneru, ali
nema host port. Nginx je jedini objavljen servis i vezan je za `127.0.0.1`, gde
ga preuzima TLS reverse proxy.

Kontejneri koriste neprivilegovane korisnike, read-only filesystem, uklonjene
capabilities i ograničenja memorije, CPU-a i broja procesa.

## 10. Test strategija

- unit testovi proveravaju scrypt, session tokene i rich-text sanitizaciju;
- Fastify injection testovi proveravaju cache i cross-origin zaštite;
- PostgreSQL integracioni test proverava izolaciju dva korisnika, server-side
  pretragu i konflikt verzija;
- frontend testovi proveravaju API query ugovor i registracioni UI;
- Playwright E2E prolazi registraciju, autosave, pretragu, reload i ponovnu
  prijavu.

CI uz testove pokreće format check, ESLint, TypeScript, build, dependency audit
i Docker Compose validaciju.
