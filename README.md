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

## Konfiguration und GitHub-Abruf

`store.js` und `github.js` sind direkt importierbare ES-Module ohne Oberfläche.
Die Zugriffsdaten stammen ausschließlich aus der Konfiguration auf dem Gerät.
Mit einer dort bereits erfassten Variable `config` kann die Anwendung so laden:

```js
import { createStore } from './store.js';
import { fetchJournal, messageFor } from './github.js';

const store = createStore(localStorage);
const saved = store.saveConfig(config);
const result = await fetchJournal(config, store.loadFile(), fetch);
if (result.kind === 'fresh') {
  const cached = store.saveFile({
    text: result.text, etag: result.etag, fetchedAt: result.fetchedAt,
  });
}
const message = messageFor(result);
```

`loadConfig()` und `loadFile()` liefern bei fehlenden, ungültigen oder nicht
lesbaren Daten `null`. Pflichtfelder der Konfiguration sind nichtleere Strings
für `owner`, `repo`, `path` und `token`; `ref` ist optional. Die Dateikopie
enthält `text`, `etag` (String oder `null`) und einen gültigen `fetchedAt`-Zeitstempel.
Speichern liefert bei Erfolg `true`, bei Speicherfehlern `false`.
`clearConfig()` versucht beide Schlüssel zu löschen und liefert nur dann
`true`, wenn beide Löschvorgänge erfolgreich waren.

`fetchJournal(config, cached, fetchImpl)` sendet genau einen GET an die
GitHub-API. `fresh` enthält die neue Datei, `unchanged` lässt die letzte Kopie
bestehen. Bei `error` liefert `messageFor(result)` einen deutschen Hinweis;
für erfolgreiche Ergebnisse liefert die Funktion einen leeren String.
Netzwerkfehler haben `status: null`, Fehler beim Lesen des Antworttexts den
empfangenen HTTP-Status. Beide gelten als `offline`.
Die Module speichern nicht automatisch nach einem Abruf; die aufrufende
Anwendung entscheidet anhand des Ergebnisses und prüft den Speichererfolg.

Die Tests benötigen weder Netzwerk noch Browser: `node --test`.
