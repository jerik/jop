# jop

Ein Journal im Klartext auf dem Smartphone lesen: auflisten und filtern. Das
Journal liegt in einem privaten GitHub-Repository, jop liest es nur.

Wo das Journal liegt und mit welchem Token jop es liest, wird beim ersten Start
auf dem Gerät eingetragen und bleibt dort. Dieses Repository enthält nur den
Code.

Stand: im Aufbau. Regeln für die Arbeit daran: [CONVENTIONS.md](CONVENTIONS.md).

## Parser und Filter

Tests starten: `node --test`.

Die Module können direkt in Node und im Browser importiert werden:

```js
import { parseJournal } from './parser.js';
import { filterEntries } from './filter.js';

const entries = parseJournal('@todo :kino Film ansehen # Heute Abend\n');
const newestOpen = filterEntries(entries);
const matching = filterEntries(entries, {
  states: ['open'],
  markers: ['@todo', '@todo-next'],
  tags: ['kino'],
  text: 'heute',
});
```

`parseJournal(text)` liefert Einträge in Dateireihenfolge mit `line` (ab 1),
`raw`, `marker`, `state`, `tags`, `note` und `text`. Ein abschließender
Zeilenumbruch erzeugt keinen zusätzlichen Eintrag; LF und CRLF werden erkannt.
Tags werden ohne Doppelpunkt gespeichert. Als Tag gilt ein mit `:` beginnendes
Wort am Anfang oder nach einem Leerzeichen, bis zum nächsten Leerraum oder
Doppelpunkt. Nur der Teil vor dem ersten ` # ` wird nach Tags durchsucht.
Die Notiz enthält alles nach dieser Trennung; fehlt sie, ist `note` leer.
Marker und Tags werden aus `text` entfernt, äußere Leerzeichen abgeschnitten.
Andere Syntax und innere Leerzeichen bleiben erhalten. Unbekannte Marker
bleiben als Einträge mit Zustand `other` erhalten.

`filterEntries(entries, query)` verändert die Eingabe nicht und liefert die
höchste Zeilennummer zuerst. `states`, `markers` und `tags` akzeptieren jeweils
einen String oder ein Array. Zustände und Marker verknüpfen ihre Werte mit
ODER, alle angegebenen Tags müssen vorhanden sein. Diese Vergleiche sind exakt.
`text` sucht ohne Beachtung der Großschreibung in Text, Tags und Notiz.
Die verschiedenen Kriterien werden mit UND verknüpft.
Ohne wirksame Kriterien gilt `states: ['open']`; explizite Kriterien suchen
ansonsten über alle Zustände. Leere Arrays und leere Suchtexte schränken nicht ein.
