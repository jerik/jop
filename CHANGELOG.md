# Changelog

Änderungen an jop, neueste zuerst, gruppiert nach dem Tag, an dem sie live
gingen. Jede Zeile steht für ein Issue und sagt, was sich bei der Benutzung
ändert; den Wortlaut des Auftrags und die Umsetzung enthält das Issue. Welche
Version auf dem iPhone läuft, zeigt die Infoseite (Info-Symbol).

## 2026-10-20

- Einträge lassen sich bearbeiten: der Stift öffnet eine Seite, auf der man den
  Status frei wechselt und einen Kommentar anhängt; eine Vorschau zeigt die
  neue Zeile. Ein Wechsel nach `@done`, `@canceled` oder `@past` hängt das
  Datum an, ein Kommentar steht als „# yyyy-mm-dd Text“ am Ende. Bis die
  Änderung in der Datei angekommen ist, steht beim Eintrag „wird übernommen …“.
  Der Token braucht dafür Contents: Read and write. (#15)
- Shortlist, Info und Bearbeiten haben oben einen festen Kopf mit „Zurück“;
  Zurück geht auch per Wischen vom linken Rand und landet an der vorherigen
  Stelle der Liste. `@todo` wird wie jeder Marker angezeigt, mehrere
  Kommentare stehen je auf einer eigenen Zeile. (#14)
- Stern, Stift, Info, Kreuz und Zurück sind einheitliche Symbole (Lucide)
  statt Schriftzeichen; ein gemerkter Eintrag hat einen gefüllten Stern. (#16)

## 2026-10-19

- Suche und Schnellfilter bleiben beim Scrollen oben stehen; ein `×` leert die
  Suche. Die Schnellfilter `todo`, `next`, `wait`, `periodic`, `new` und
  `andere` ersetzen den Filter „Zustand“, gewählt ist einer oder keiner (dann
  alle), Start ist `todo`. Jeder Eintrag trägt links einen Farbbalken seiner
  Gruppe. Suchtreffer sind markiert, Weblinks öffnen im Browser. Eine
  Infoseite zeigt die laufende Version und enthält „Zugang löschen“. Einträge
  lassen sich mit ☆ auf eine Shortlist setzen; sie übersteht neue Fassungen
  der Datei und wird mit dem Zugang gelöscht. (#13)

## 2026-10-16

- Die README ist eine Anleitung zum Einrichten und Prüfen auf dem iPhone.
  (#10)
- Tags enden vor Satzzeichen (`:kino,` ergibt `kino`); die Filter sind
  eingeklappt und schieben die Liste nicht mehr aus dem Bild. (#8)
- jop lässt sich auf den Home-Bildschirm legen und startet auch offline:
  Einrichtungsformular, Liste mit Filtern, Manifest, Service Worker. (#6)
- Die Datei wird aus dem privaten Repository gelesen; Zugang und letzte Kopie
  bleiben auf dem Gerät, unveränderte Dateien werden nicht neu geladen. (#4)
- Parser und Filter für das Journalformat. (#2)
