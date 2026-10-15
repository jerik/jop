# jop

Ein Journal im Klartext auf dem iPhone lesen: auflisten und filtern. Das
Journal liegt in einem privaten GitHub-Repository, jop liest es nur und
schreibt nie zurück.

Wo das Journal liegt und mit welchem Token jop es liest, wird auf dem Gerät
eingetragen und bleibt dort. Dieses Repository enthält nur den Code. Regeln für
die Arbeit daran: [CONVENTIONS.md](CONVENTIONS.md).

## Einrichten

1. **Privates Repository mit der Datei.** Die Journaldatei liegt als
   Textdatei (UTF-8) in einem privaten Repository, zum Beispiel
   `<privates-repo>` mit der Datei `<pfad/zur/datei.txt>`. Den Namen von
   Owner, Repository, Pfad und gegebenenfalls Branch notieren – sie werden in
   Schritt 4 auf dem iPhone eingetragen und nirgends sonst.
2. **Fine-grained Personal Access Token anlegen** (GitHub → Settings →
   Developer settings → Personal access tokens → Fine-grained tokens →
   Generate new token), Anleitung in den
   [GitHub Docs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens#creating-a-fine-grained-personal-access-token):
   - Resource owner: das eigene Konto.
   - Repository access: **Only select repositories** und nur `<privates-repo>`.
   - Repository permissions: nur **Contents: Read-only**. „Metadata: Read-only“
     setzt GitHub dabei automatisch; sonst nichts auswählen.
   - Expiration: **366 Tage** (Custom). Gleich einen Kalendereintrag einige
     Tage vor dem Ablaufdatum anlegen: „jop-Token erneuern“.
   - Den Token kopieren; GitHub zeigt ihn nur einmal an. Er wird nur in
     Schritt 4 in jop eingefügt, nirgends sonst gespeichert oder verschickt.
3. **Auf den Home-Bildschirm legen.** `https://jerik.github.io/jop/` in
   Safari auf dem iPhone öffnen → **Teilen** → **„Zum Home-Bildschirm“**. Den
   Schalter **„Als Web-App öffnen“** eingeschaltet lassen → **Hinzufügen**.
4. **Vom Home-Bildschirm aus einrichten, nicht in Safari.** Safari schließen
   und jop über das neue Symbol öffnen. Die installierte App hat einen eigenen
   Speicher, getrennt von Safari: Was in Safari eingetragen wird, sieht die App
   nicht. Im Formular „Journal einrichten“ eintragen:
   Owner, Repository, Dateipfad (wie in Schritt 1), Branch nur, wenn die Datei
   nicht im Standard-Branch liegt, und den Token. **„Zugang speichern“**
   tippen. Danach lädt jop die Datei und zeigt die offenen Einträge.
5. **„Zugang löschen“** (unten in der Liste) entfernt nach einer Rückfrage den
   gespeicherten Zugang und die letzte Kopie der Datei von diesem Gerät; danach
   erscheint wieder das Einrichtungsformular. Der Token bei GitHub bleibt davon
   unberührt – wer ihn nicht mehr braucht, widerruft ihn dort. Einen neuen oder
   geänderten Zugang trägt man so ein: „Zugang löschen“, dann neu einrichten.

## Prüfen auf dem iPhone

Diese Punkte lassen sich nur auf dem Gerät prüfen. Jeweils: was tun – was
passieren soll.

1. **Installation.** Nach Schritt 3 das Symbol ansehen und jop öffnen. –
   Das jop-Symbol und der Name (z. B. „jop lesen“) erscheinen auf dem Home-Bildschirm. Die App
   öffnet ohne Safari-Adressleiste und ohne Safari-Leiste unten.
2. **Safe Areas.** Die Liste im Hoch- und im Querformat ansehen, bis ganz nach
   unten scrollen. – Nichts liegt unter der Statusleiste, der Dynamic Island
   oder dem Home-Balken; „Zugang löschen“ ist ganz unten erreichbar. Kein
   seitliches Scrollen, auch nicht bei langen Einträgen.
3. **Zoom.** In das Suchfeld und in die Felder des Einrichtungsformulars
   tippen; danach mit zwei Fingern zoomen. – Beim Tippen in ein Feld zoomt die
   Seite nicht von selbst. Zwei-Finger-Zoom funktioniert.
4. **Erster Abruf mit Umlauten.** Nach dem Einrichten einen Eintrag mit ä, ö,
   ü oder ß suchen (z. B. über die Suche). – Umlaute und Sonderzeichen sehen
   aus wie in der Datei; unter dem Hinweisfeld steht „Stand:“ mit Datum und
   Uhrzeit des Abrufs.
5. **Unveränderte Datei beim erneuten Öffnen.** Die Uhrzeit bei „Stand:“
   merken, jop ganz schließen (im App-Umschalter nach oben wischen), eine
   Minute warten, wieder öffnen. – Die Einträge erscheinen sofort, es gibt
   keinen Fehlerhinweis, „Stand:“ zeigt dieselbe Uhrzeit wie vorher (die Datei
   wurde geprüft, aber nicht neu geladen).
6. **Änderung wird erkannt.** Die Datei im privaten Repository ändern (z. B.
   in der GitHub-App oder auf der GitHub-Website einen offenen Eintrag ergänzen), dann
   zu jop zurückwechseln oder jop neu öffnen. – Der neue Eintrag steht in der
   Liste, „Stand:“ zeigt die neue Uhrzeit. Kommt die Änderung nicht sofort,
   nach einer Minute noch einmal zu jop wechseln: GitHub liefert Änderungen
   gelegentlich mit kurzer Verzögerung aus.
7. **Offline-Start.** Nach einem erfolgreichen Abruf jop ganz schließen,
   Flugmodus einschalten, jop vom Home-Bildschirm öffnen. – Die Oberfläche
   startet, die zuletzt geladenen Einträge und „Stand:“ sind sichtbar, dazu der
   Hinweis „Die Datei konnte nicht geladen werden. Bitte die Verbindung
   prüfen.“ Filter und Suche funktionieren. Danach Flugmodus aus und zu jop
   zurückwechseln: Der Hinweis verschwindet.
8. **Widerrufener Token.** Bei GitHub (Settings → Developer settings →
   Fine-grained tokens) den Token widerrufen („Revoke“), dann jop öffnen. –
   Hinweis „Der Token ist ungültig oder abgelaufen. Bitte erneut eingeben.“;
   die letzte Kopie bleibt mit ihrem „Stand:“ sichtbar. Anschließend einen
   neuen Token anlegen (Einrichten, Schritt 2), in jop „Zugang löschen“ und mit
   dem neuen Token neu einrichten. Dasselbe passiert, wenn der Token abläuft.
9. **Aktualisierung nach einer neuen Version.** Nachdem eine neue Version von
   jop veröffentlicht wurde: jop online öffnen, kurz warten, jop ganz
   schließen (im App-Umschalter nach oben wischen) und wieder öffnen. – Jetzt
   läuft die neue Version (erkennbar an der Änderung, die die neue Version
   beschreibt). Zugang und letzte Kopie bleiben erhalten, eine neue
   Einrichtung ist nicht nötig. Zeigt sich die neue Version noch nicht, den
   Vorgang einmal wiederholen.
10. **Zugang löschen.** „Zugang löschen“ tippen und bestätigen, jop ganz
    schließen und wieder öffnen. – Das Einrichtungsformular erscheint; weder
    Zugang noch alte Einträge sind noch zu sehen.

## Was öffentlich ist und was nicht

Öffentlich sind der Code von jop und der Aufbau der Journaldatei (die Testdatei
`journal.anon.txt` zeigt ihn mit anonymisiertem Inhalt). Owner, Repository,
Pfad, Branch und Token stehen nirgends in diesem Repository; sie werden nur auf
dem iPhone eingetragen und bleiben dort im Speicher der installierten App. jop
verbindet sich ausschließlich mit `api.github.com` und sendet den Token nur
dorthin.

jop teilt sich die Herkunft `jerik.github.io` und damit grundsätzlich den
Browserspeicher mit allen anderen GitHub-Pages-Projekten unter dieser Adresse;
das ist vertretbar, weil dort nur eigene Projekte des Owners liegen, jop keine
fremden Skripte lädt und der Token ohnehin nur eine Datei in einem Repository
lesen darf.

## Für die Entwicklung

Kein Build-Schritt, keine Abhängigkeiten: Die ES-Module werden so ausgeliefert,
wie sie sind, und von Browser und Tests gleich importiert.

Tests starten (ohne Netzwerk, ohne Browser):

```bash
node --test
```

Lokal ansehen: `python3 -m http.server 8000 --bind 127.0.0.1` im
Repository-Verzeichnis starten und im Browser Port 8000 dieses Rechners öffnen.
Service Worker und Offline-Start brauchen HTTPS oder localhost.

### `parser.js` und `filter.js`

```js
import { parseJournal } from './parser.js';
import { filterEntries } from './filter.js';

const entries = parseJournal('@todo :kino Film ansehen # Heute Abend\n');
const newestOpen = filterEntries(entries);
const matching = filterEntries(entries, {
  states: ['open'], markers: ['@todo', '@todo-next'], tags: ['kino'], text: 'heute',
});
```

`parseJournal(text)` liefert Einträge in Dateireihenfolge mit `line` (ab 1),
`raw`, `marker`, `state`, `tags`, `note` und `text`. LF und CRLF werden
erkannt, ein abschließender Zeilenumbruch erzeugt keinen Eintrag. Tags stehen
nur vor dem ersten ` # ` und werden ohne Doppelpunkt gespeichert; alles nach
` # ` ist die Notiz. Unbekannte Marker bleiben mit Zustand `other` erhalten.
Die Tests in `tests/parser.test.js` sind die Referenz für das Format.

`filterEntries(entries, query)` verändert die Eingabe nicht und liefert die
höchste Zeilennummer zuerst. `states` und `markers` verknüpfen ihre Werte mit
ODER, alle `tags` müssen vorhanden sein, `text` sucht ohne Groß-/Kleinschreibung
in Text, Tags und Notiz; die Kriterien untereinander gelten mit UND. Ohne
wirksame Kriterien gilt `states: ['open']`.

### `store.js` und `github.js`

```js
import { createStore } from './store.js';
import { fetchJournal, messageFor } from './github.js';

const store = createStore(localStorage);
store.saveConfig(config);
const result = await fetchJournal(config, store.loadFile(), fetch);
if (result.kind === 'fresh') {
  store.saveFile({ text: result.text, etag: result.etag, fetchedAt: result.fetchedAt });
}
const message = messageFor(result);
```

`createStore(storage)` speichert unter `jop.config` (Pflichtfelder `owner`,
`repo`, `path`, `token`, optional `ref`) und `jop.file` (`text`, `etag`,
`fetchedAt`). Laden liefert bei fehlenden oder ungültigen Daten `null`,
Speichern und `clearConfig()` liefern `false`, wenn der Speicher versagt.

`fetchJournal(config, cached, fetchImpl)` sendet genau einen GET an die
Contents-API mit `If-None-Match` aus der letzten Kopie und liefert `fresh`,
`unchanged` (304) oder `error` mit `reason`. `messageFor(result)` übersetzt
Fehler in einen deutschen Hinweis. Gespeichert wird nicht automatisch; das
entscheidet die aufrufende Anwendung.

### App-Dateien

- `index.html`, `app.css`, `app.js`: Einrichtungsformular und Liste mit
  Filtern. `createApp` in `app.js` enthält die Ablauflogik ohne DOM und wird in
  `tests/app.test.js` geprüft; `mountApp` baut die Oberfläche. Beim Öffnen und
  bei Rückkehr zur sichtbaren App wird neu abgerufen.
- `manifest.webmanifest` und die Icons: Installation auf dem Home-Bildschirm.
  Icons neu erzeugen: `node tools/generate-icons.js`.
- `sw.js`: Service Worker, liefert die App-Dateien aus dem Cache (auch
  offline). Anfragen an `api.github.com` laufen nicht durch den Cache.

### Service-Worker-Version erhöhen

Nach jeder Änderung an einer ausgelieferten Datei in `sw.js` die Konstante
`CACHE_VERSION` hochzählen (z. B. `jop.shell.v2` → `jop.shell.v3`). Nur dann
lädt das iPhone die neuen Dateien; die alte Version wird beim Aktivieren
gelöscht. Kommt eine Datei neu hinzu, gehört sie zusätzlich in die Liste
`SHELL`. Wirksam wird die neue Version, wenn die App einmal ganz geschlossen
und wieder geöffnet wird (Prüfpunkt 9).
