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

## App öffnen

Ohne Build-Schritt lokal starten: `python3 -m http.server 8000 --bind 127.0.0.1`.
Danach im Browser `localhost:8000` öffnen. Auf GitHub Pages wird die App direkt
unter dem Projektpfad geöffnet. Service Worker und Offline-Start benötigen
HTTPS oder localhost.

Beim ersten Öffnen Owner, Repository, Dateipfad, optional Branch und Token
auf dem Gerät eingeben. Der fine-grained Token gilt nur für das betreffende
Repository und braucht ausschließlich **Contents: Read**. Zugang und letzte
Dateikopie bleiben im Browserspeicher; „Zugang löschen“ entfernt beides.
Zugangsdaten gehören niemals in dieses öffentliche Repository.

Die Liste startet mit offenen Einträgen, neueste Dateizeilen zuerst.
Zustände lassen sich mehrfach wählen, gewählte Tags müssen alle passen;
die Suche umfasst Text, Tags und Notizen. Beim Öffnen und bei Rückkehr zur
sichtbaren App wird aktualisiert. Bei Abruffehlern bleiben die letzte Kopie
und ihr Zeitstempel sichtbar. Ohne zuvor geladene Kopie ist offline keine
Journalansicht verfügbar.

Icons neu erzeugen: `node tools/generate-icons.js`.

### Auf dem iPhone prüfen

1. Die über HTTPS bereitgestellte App in Safari öffnen und den Zugang einrichten.
2. Über „Teilen“ → „Zum Home-Bildschirm“ hinzufügen; vom Symbol starten.
   Name, Icon und eigenständige Ansicht prüfen.
3. Nach erfolgreichem Laden die App schließen, Flugmodus einschalten und vom
   Home-Bildschirm öffnen: Oberfläche, gespeicherte Einträge, Fehlerhinweis und
   „Stand:“ müssen sichtbar bleiben.
4. Wieder online gehen und zur App zurückkehren: Die Datei soll aktualisiert
   werden; unveränderte Dateien behalten den Zeitstempel der letzten Kopie.
5. Zustände, mehrere Tags und Suche kombinieren; Reihenfolge, Anzahl, Notizen
   und besondere Marker prüfen.
6. Bei 375 Pixel Breite, im hellen und dunklen Modus sowie mit langen Zeilen
   prüfen: kein horizontales Scrollen, lesbarer Text, freie Safe Areas.
   Zoomen und Textauswahl ausprobieren.
7. „Zugang löschen“ wählen: Setup erscheint; nach erneutem Öffnen dürfen
   weder Zugang noch alte Journaldatei geladen werden.
