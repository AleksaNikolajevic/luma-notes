# Security policy

## Supported versions

Bezbednosne ispravke se primenjuju na najnoviju verziju grane `main`.

## Prijavljivanje ranjivosti

Nemojte otvarati javni issue za potencijalnu ranjivost ili objavljivati dokaz
koncepta pre nego što postoji ispravka.

Koristite GitHub opciju **Security → Report a vulnerability** u repozitorijumu.
U prijavu uključite:

- pogođenu verziju ili commit;
- preduslove i korake za reprodukciju;
- očekivani uticaj;
- predlog mitigacije, ako ga imate.

Prijava će biti potvrđena u roku od 72 sata. Nakon procene biće dogovoren rok za
ispravku i koordinisano objavljivanje.

## Produkcioni minimum

Pre javnog izlaganja instance:

- koristite TLS reverse proxy i `COOKIE_SECURE=true`;
- ostavite registraciju zatvorenu ili koristite jak invite kod;
- postavite jedinstven PostgreSQL secret;
- proverite broj pouzdanih proxy hopova;
- redovno pravite enkriptovane backup-e baze;
- pokrenite `pnpm audit`, testove i build pre svake nadogradnje.
