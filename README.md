# Fuzz Room

Webstudio für Stoner-Rock-Riffs, Gitarrenmelodien und Drums. Läuft vollständig im Browser, ohne Installation und ohne eigenen Server.

## Funktionen

- Riff-, Melodie- und Drumraster mit 4, 8 oder 16 Takten pro Songteil
- Benennbare und verschiebbare Songteile; Loop- und Song-Wiedergabe
- Grundton, Moll, Dur, Phrygisch und Blues; farbige Tonrollen
- Offen/PM, mehrstimmige Riffs, Hammer-ons, Slides und Bendings
- Lautstärken, Solo, Drum-Markierungen sowie Rückgängig/Wiederholen
- Einzelspur- und Mehrspur-MIDI mit Pitch-Bend-Daten
- Vollständige Arrangements als JSON speichern und wieder importieren

## ChatGPT

Die App erstellt eine Anfrage, die du selbst in deinen eigenen ChatGPT-Chat kopierst. Die JSON-Antwort fügst du anschließend in die App ein und kannst die neue Spur vor dem Übernehmen vergleichen. Die App meldet sich nicht bei ChatGPT an und enthält keine API-Schlüssel oder Zugangsdaten.

## Lokal starten

Öffne `index.html` in einem aktuellen Browser oder stelle diesen Ordner mit einem lokalen Webserver bereit. Für Audio musst du einmal Play anklicken.

## GitHub Pages

Die statischen Dateien liegen direkt im Hauptverzeichnis. Unter Settings → Pages: Deploy from a branch, Branch `main`, Ordner `/ (root)`. Es ist kein Build-Schritt notwendig.

## Dateien und Klang

Arrangements werden als Dateien auf deinem Gerät gespeichert. Sichere deinen Song vor dem Schließen oder Neuladen. Gitarren und Drums werden mit Web Audio modelliert. Ein MIDI-Export enthält Noten und Spielbewegungen; der Klang hängt vom Instrument im jeweiligen MIDI-Programm ab.
