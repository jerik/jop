Hier ist der strukturierte Forschungs- und Implementierungsplan inklusive aller relevanten Spezifikationen, Randbedingungen und Primärreferenzen, die ein Coding-Agent benötigt, um eine mobile Micro-PWA für iOS mit Synchronisation über ein privates GitHub-Repository zu erstellen.

---

# Forschungs- und Implementierungsplan: iOS Micro-PWA mit Private GitHub Sync

Dieser Plan gliedert das Projekt in vier aufeinander aufbauende Phasen und liefert dem Coding-Agenten präzise Spezifikationen für Datenfluss, Fehlerbehandlung und Plattformgrenzen.

```
+-----------------------------------------------------------------------------------+
| Phase 1: API-Protokoll & GitHub-Kommunikation (Contents-API, Auth, Concurrency)   |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
| Phase 2: iOS WebKit-Plattformarchitektur & Safe Area (PWA Standalone, SW-Cache)   |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
| Phase 3: State-Management, Offline-Queue & Konfliktbehandlung (409 Conflict)      |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          v
+-----------------------------------------------------------------------------------+
| Phase 4: UI/UX, Konfigurations-Onboarding & Verifikation (Testmatrix)             |
+-----------------------------------------------------------------------------------+

```

---

## Phase 1: API-Protokoll & GitHub-Kommunikation

### 1. Endpunkte & HTTP-Verhalten

Der Coding-Agent darf ausschließlich die GitHub REST API v3 über HTTPS aufrufen. Raw-Content-Domains (`raw.githubusercontent.com`) dürfen wegen fehlender CORS-Freigaben für Authorization-Header im Browser nicht genutzt werden.

* **Host:** `[https://api.github.com](https://api.github.com)`

* **Datei abrufen:** `GET /repos/{owner}/{repo}/contents/{path}?ref={branch}`

* **Datei anlegen oder überschreiben:** `PUT /repos/{owner}/{repo}/contents/{path}`

* **Pflicht-Header für alle API-Aufrufe:**
* `Authorization: Bearer <PAT>`

* `Accept: application/vnd.github+json`

* `X-GitHub-Api-Version: 2022-11-28`

* `Content-Type: application/json` (für `PUT`)





### 2. Datenpayload & Concurrency Control

* **Base64-Codierung:** Die GitHub Contents-API überträgt Dateiinhalte im Attribut `content` als Base64-String. Das native `btoa()`/`atob()` in JavaScript versagt bei UTF-8-Zeichen (Umlaute, Sonderzeichen, Emojis). Der Agent muss zwingend `TextEncoder` und `TextDecoder` zur Byte-Konvertierung verwenden.


* **Dateigrößen-Grenze:** Der `contents`-Endpunkt unterstützt Inline-Base64 nur bis zu einer Dateigröße von 1 MB. Für Aufgaben- oder Notiz-JSONs ist dies völlig ausreichend. Größere Blobs erfordern die Git Data API (Blobs/Trees/Commits).


* **SHA-Optimistic Locking:** Beim Aktualisieren muss das Feld `sha` mit dem SHA-Hash des letzten erfolgreichen GET-Aufrufs übergeben werden.


* Antwort `200 OK` / `201 Created`: Commit war erfolgreich; das neue `sha` im Response-Body muss lokal gespeichert werden.


* Antwort `409 Conflict`: Die Datei wurde remote verändert; der lokale Hash ist veraltet.





---

## Phase 2: iOS WebKit-Plattformarchitektur

### 1. Standalone PWA-Konfiguration

iOS Safari benötigt spezifische Deklarationen, um die Adress- und Navigationsleiste auszublenden und wie eine native Anwendung zu wirken:

* **HTML-Head-Metadaten:**
* `<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">`
* `<meta name="apple-mobile-web-app-capable" content="yes">`
* `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`
* `<meta name="apple-mobile-web-app-title" content="DataApp">`
* `<link rel="apple-touch-icon" href="icon-192.png">`


* **Web App Manifest (`manifest.json`):**
* `display: "standalone"`, `start_url: "./index.html"`, `theme_color`, `icons`.





### 2. Safe Area Insets & Touch-Optimierung

Im Vollbildmodus rendert iOS unter die Dynamic Island / Notch und über den Home-Indikator am unteren Bildschirmrand:

* Das Layout muss zwingend `env(safe-area-inset-top)` und `env(safe-area-inset-bottom)` als Polsterung (Padding) berücksichtigen.
* Gummiband-Scrolling des gesamten Dokument-Bodys verhindern: `overscroll-behavior-y: none`.
* Standardmäßige Textauswahl auf Bedienelementen deaktivieren: `-webkit-user-select: none`.

### 3. Service Worker Caching-Strategie

* **App Shell (Cache-First):** `index.html`, Stylesheets, Scripts und Icons im Service Worker lokal vorhalten, damit die App auch im Flugmodus instant öffnet.


* **API-Bypass (Network-Only):** Anfragen an `api.github.com` dürfen keinesfalls vom Service Worker gecacht werden, da veraltete HTTP-Caches zu fehlerhaften `409`-Konflikten führen.



---

## Phase 3: State-Management & Offline-Strategie

### 1. Dreistufige Speicher-Hierarchie

1. **In-Memory State:** JavaScript-Objekt im Arbeitsspeicher; bindet direkt an die Benutzeroberfläche.
2. **Lokaler Cache (`localStorage` oder `IndexedDB`):** Spiegelt jede UI-Mutation synchron mit Zeitstempel wider, sodass nach dem Schließen des Browsers kein Datenverlust auftritt.


3. **Remote-Persistenz (GitHub):** Asynchroner Push an das Repository bei Verfügbarkeit einer Internetverbindung.



### 2. Konflikt- und Offline-Workflow

```
[Nutzer ändert Daten]
         |
         v
[1. In-Memory State aktualisieren & UI sofort rendern (Optimistic UI)]
         |
         v
[2. Im lokalen Speicher (localStorage) spiegeln]
         |
         v
[3. Netzwerk verfügbar?]
       /       \
     Ja         Nein
     /             \
[PUT Request]    [In lokale Warteschlange einreihen (pendingSync)]
     |                 |
 [Status: 200?]        +---> Sobald wieder online: Erneuter Versuch
    /        \
  Ja          Nein (Status 409 Conflict)
  /              \
[SHA sichern]   [Neueste Version laden (GET)]
                 |
                 v
                [Strategie: User-Prompt "Remote überschreiben" ODER "Auto-Merge"]

```

* **Debouncing bei Texteingaben:** Schreibzugriffe über ein kurzes Debounce (z. B. 1.000 ms bis 2.000 ms) bündeln, um das Rate Limit (5.000 Requests/Stunde) nicht unnötig zu belasten.



---

## Phase 4: UI/UX, Onboarding & Testmatrix

### 1. Erstkonfiguration (Onboarding)

Beim ersten Aufruf prüft die App, ob Zugangsdaten hinterlegt sind. Fehlen diese, öffnet sich eine Eingabemaske:

* Eingabefelder: Personal Access Token (PAT), GitHub Username/Owner, Repository-Name, Dateipfad (`data.json`), Branch (`main`).


* Die Daten werden ausschließlich in `localStorage` gespeichert; keine Übermittlung an Drittserver.

### 2. Test- und Abnahmekriterien für den Agenten

* [ ] **CORS-Check:** `fetch()` sendet Anfragen direkt an `[https://api.github.com](https://api.github.com)` und verarbeitet die Antwort ohne Browser-Blockade.


* [ ] **UTF-8 Encoding Test:** Speichern von Umlauten (`ä, ö, ü, ß`) und Emojis (`✅, 🚀`) führt weder beim Encodieren noch beim Decodieren zu Datenverlust.


* [ ] **Konflikttest (Status 409):** Wird die Datei parallel über das GitHub-Webinterface editiert, fängt die App den nachfolgenden Commit-Versuch mit Status 409 ab, lädt die neuen Daten nach und verhindert Überschreiben ohne Bestätigung.


* [ ] **iOS UI-Pass:** Die Benutzeroberfläche kollidiert nicht mit der iOS-Statusleiste (Notch) und dem Home-Indikator-Balken.
* [ ] **Offline-Funktionalität:** Bei getrennter Verbindung startet die App fehlerfrei aus dem Service-Worker-Cache und zeigt die zuletzt lokal gesicherten Daten an.



---

## Relevante Referenzen & Primärquellen

### 1. GitHub REST API Dokumentation

* **Endpoints for Repository Contents:**
Offizielle Referenz zu Parametern, Header-Typen, Base64-Kodierung und Statuscodes:
`[https://docs.github.com/rest/repos/contents](https://docs.github.com/rest/repos/contents)`

* **Create or Update File Contents:**
API-Details zu `PUT /repos/{owner}/{repo}/contents/{path}`, Pflichtparametern (`message`, `content`, `sha`, `branch`) und Status `409 Conflict`:
`[https://docs.github.com/rest/repos/contents#create-or-update-file-contents](https://docs.github.com/rest/repos/contents#create-or-update-file-contents)`

* **Managing Personal Access Tokens:**
Erstellung und Scopes für feingranulare Tokens (*Contents: Read and write*):
`[https://docs.github.com/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens](https://docs.github.com/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)`

* **Rate Limits and CORS:**
Übersicht über Rate Limits (5.000 Requests/h für authentifizierte Calls) und Cross-Origin Resource Sharing auf `api.github.com`:
`[https://docs.github.com/rest/overview/resources-in-the-rest-api#rate-limiting](https://docs.github.com/rest/overview/resources-in-the-rest-api#rate-limiting)`


### 2. WebKit & iOS PWA Standards

* **Apple WebKit Developer – Configuring Web Applications:**
Offizielle Spezifikation für `apple-mobile-web-app-capable`, Status-Bar-Stile und App-Icons:
`[https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html)`
* **Apple WebKit – Designing Websites for iPhone X (Safe Areas):**
CSS-Spezifikation für `viewport-fit=cover` sowie `env(safe-area-inset-top)` und `env(safe-area-inset-bottom)`:
`[https://webkit.org/blog/7929/designing-websites-for-iphone-x/](https://webkit.org/blog/7929/designing-websites-for-iphone-x/)`

### 3. Web APIs & Standards (MDN)

* **TextEncoder & TextDecoder APIs:**
Standardisierte Byte-Konvertierung für UTF-8-kompatibles Base64-Handling im Browser:
`[https://developer.mozilla.org/en-US/docs/Web/API/TextEncoder](https://developer.mozilla.org/en-US/docs/Web/API/TextEncoder)`
* **Service Worker API & Offline Caching:**
Entkopplung von Anwendungs-Assets und dynamischen REST-Endpunkten:
`[https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)`
