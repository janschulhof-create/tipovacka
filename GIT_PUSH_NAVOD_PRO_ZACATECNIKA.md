# Git push – opravdu jen Ctrl+C a Ctrl+V

Tento návod je úmyslně zjednodušený. **Nic neopisuj.**

U každého příkazu:

1. označ myší jen samotný příkaz,
2. stiskni **Ctrl+C**,
3. klikni do PowerShellu / Windows Terminalu,
4. stiskni **Ctrl+V**,
5. stiskni **Enter**.

Žádné značky typu `powershell`, žádné tři zpětné apostrofy a žádné kopírování rámečku kolem příkazu.

Nejpohodlnější je použít **Windows Terminal**: Start → napiš `Windows Terminal` → Enter → otevři PowerShell. Pokud používáš staré okno PowerShellu a Ctrl+V tam nefunguje, Windows Terminal tento problém odstraní.

Kompletní verze připravená přesně pro kopírování řádek po řádku je v souboru:

**GIT_PUSH_CTRL_C_CTRL_V.txt**

## Nejkratší postup, když GitHub repozitář už máš

Zkopíruj vždy pouze jeden následující řádek a vlož ho pomocí Ctrl+V.

`git --version`

`npm.cmd ci`

`npm.cmd run ci`

`git init`

`git config user.name "TVOJE JMENO"`

`git config user.email "TVUJ_EMAIL"`

`git remote -v`

Pokud se nevypíše žádný `origin`:

`git remote add origin ADRESA_REPOZITARE`

Pokud `origin` existuje, ale je špatně:

`git remote set-url origin ADRESA_REPOZITARE`

Pak pokračuj:

`git branch -M main`

`git status`

Zkontroluj, že neodesíláš `.env`, `node_modules` ani `.next`.

`git add .`

`git status`

`git commit -m "xB aktualni sezona a Dohrano kola"`

`git push -u origin main`

Pak otevři GitHub → **Actions → CI**. CI musí být zelené.

## Co musíš nahradit

- `TVOJE JMENO` → svoje jméno,
- `TVUJ_EMAIL` → svůj GitHub e-mail,
- `ADRESA_REPOZITARE` → HTTPS adresu z GitHub → **Code → HTTPS → Copy**.

## Když něco skončí chybou

Zastav se na tom konkrétním příkazu. Nepoužívej `--force` a nezkoušej náhodné příkazy.

Detailní řešení nejčastějších problémů je v `GIT_PUSH_CTRL_C_CTRL_V.txt`.
