# Jak přidat novou hlášku

Otevři **Supabase → Table Editor → `recap_phrases` → Insert row**.
Nasazení není potřeba, změna se projeví **nejpozději do minuty**.

---

## Volná hláška (běžný případ)

Stylistická hláška bez vazby na konkrétní situaci.

| Pole | Co vyplnit |
|---|---|
| `text` | znění, jeden řádek, max 400 znaků |
| `scope` | `baroko`, `kudy`, nebo `both` |
| `usage_type` | `free` |
| `rule_key` | **nech prázdné** |
| `enabled` | `true` |
| `weight` | `0` (vyšší = model ji uvidí dřív) |

**Příklad:**

```sql
insert into public.recap_phrases (text, scope, usage_type)
values ('„Tohle by nevymyslel ani okresní přebor.“', 'both', 'free');
```

Model ji dostane jako nabídku. Nemusí ji použít — a to je v pořádku.

---

## Hláška vázaná na situaci

Když hláška něco **tvrdí o výsledku nebo o tipérovi**, musí být navázaná na
pravidlo, které existuje **v kódu**.

| Pole | Co vyplnit |
|---|---|
| `usage_type` | `gated` |
| `rule_key` | **existující** klíč pravidla |

**Příklad — jiné znění k existujícímu pravidlu:**

```sql
insert into public.recap_phrases (text, scope, usage_type, rule_key)
values ('„Tohle mi hlava fakt nebere.“', 'kudy', 'gated', 'absolutely_shocking');
```

Tahle hláška se objeví **jen tehdy**, když aplikace sama doloží, že šlo
o výsledek proti drtivému konsenzu. Zápis do databáze na tom nic nemění.

### Použitelné klíče

`absolutely_shocking`, `walked_all_over`, `painful_zero`, `zero_disaster`,
`round_bottom`, `gas_station_tip`, `dance_exit`, `knows_the_shovel`,
`what_the_hell`, `levels`, `melta`, `bagrovana`, `kriplfight`,
`unfinished_business`, `division_performance`, `spooky`, `close_the_shop`

**Neznámý klíč = hláška se nikdy nepoužije.** Řádek se tiše zahodí.

---

## Chci úplně nové pravidlo

Když potřebuješ hlášku pro situaci, kterou aplikace zatím nerozpoznává
(třeba „někdo tipoval čtyřikrát po sobě stejné skóre“), **samotný zápis do
databáze nestačí** — pravidlo se musí doplnit do kódu, aby šlo spočítat
a otestovat. Napiš mi a doděláme to.

---

## Ostatní úkony

| Chci | Jak |
|---|---|
| dočasně vypnout hlášku | `enabled` → `false` |
| upravit znění | přepiš `text` |
| upřednostnit | zvyš `weight` |
| smazat | smaž řádek |

## Na co si dát pozor

- **Jeden řádek.** Víceřádkový text se zahodí.
- **Do 400 znaků.**
- **Stejné znění dvakrát ve stejném rozsahu** nejde vložit (unikátní index).
- Prázdná tabulka je v pořádku — aplikace pak používá vestavěné hlášky.

---

## Kontrolní seznam po nasazení (ruční)

Testy neprokážou, jestli je text vtipný. Po prvním ostrém běhu projdi
čtyři případy:

| Případ | Na co se dívat |
|---|---|
| **A — nudné Baroko** (1:0, všichni podobně) | Zůstalo krátké? Není tam vata? |
| **B — chaotické Baroko** (přesná trefa, někdo úplně mimo) | Použilo víc pozorování? Nevypisuje tipéry za sebou? |
| **C — běžné Kudy** | 8–13 vět? Sedí fakta? |
| **D — bohaté kumulativní Kudy** | 12–20 vět? Zmiňuje sobotu i neděli? Netvrdí dohrané kolo, když čeká odložený zápas? |

U všech navíc: **nevymýšlí si**? Žádné emoce, výroky ani dění na hřišti,
která nejsou v datech. Kolik hlášek použil — 0–2 v Baroku, 1–3 v Kudy?

Když něco nesedí, pošli mi ukázku.
