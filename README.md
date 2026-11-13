# Fuzz Room – Version 2

Browser-Musikstudio mit fünf bearbeitbaren Spuren: Riff, Melodie, Bass, Gesang und Drums.

Webseite: https://clausi1971.github.io/fuzz-room/

## Komponieren

Musikstile: Stoner Rock, Punk Rock, Hard Rock, Nu Metal und Korn-inspiriert. Neue App-Generatoren kombinieren auswählbare Rhythmus-, Motiv- und Phrasenbausteine. Gemeinsame Song-Einstellungen: Stil, Grundton, Tonart und Tempo; eigene Einstellungen je Spur. Die Spuren starten leer.

„Arrangement erzeugen“ bietet einen ganzen Song (acht Teile, 52 Takte) oder nur den geöffneten Teil. Alle fünf Spuren werden automatisch passend zum Stil erzeugt. Vor dem Ersetzen vorhandener Inhalte ist eine Bestätigung erforderlich. Ganze Song-Ersetzungen lassen sich nicht über die Spur-Historie zurücknehmen; vorher als Datei speichern. Wiederkehrende Strophen und Refrains haben unabhängig bearbeitbare Kopien derselben Motive.

## Bearbeiten und abspielen

Aufklappbare Raster, Lautstärke, Mute und Solo pro Spur, bis zu 30 Rückgängig-/Wiederholen-Schritte je Spur und Teil, Gitarren-/Bass-Tabulaturen sowie frei benennbare und verschiebbare Songteile. Play/Stopp an jeder Songkarte startet den Teil ab Takt 1 als Loop. Wiedergabe des ganzen Songs ist ebenfalls möglich. Klick auf eine Taktüberschrift während der Wiedergabe schaltet einen gemeinsamen Ein-Takt-Loop.

Riff: einzelne Anschläge, PM-Anteil, manuelle Spieltechniken, Drop D oder tiefe siebensaitige A-Stimmung. Melodie: Phrasenarten, optionale Techniken, zwei Gitarrenklänge, Oktavverschiebung. Bass: drei Arbeitsweisen und zwei Stimmungen; ohne Riff entsteht automatisch eine eigenständige Basslinie. Drums: vollständige Groove-Bausteine und drei Toms. Gesang: eigene Melodie, vier Phrasenarten, drei Stimmlagen, synthetische Ah-Stimme oder Orientierungston ohne Text.

## Dateien und ChatGPT

Arrangements als JSON auf dem eigenen Gerät speichern und wieder importieren. Alte V1-Dateien bleiben importierbar. MIDI exportiert einzelne Spuren oder das Arrangement einschließlich unterstützter Spielbewegungen; der Klang hängt vom verwendeten MIDI-Instrument ab. Kein automatisches Speichern auf einem Server.

ChatGPT wird manuell über kopierte Anfragen und eingefügte JSON-Antworten genutzt. Besucher verwenden ihren eigenen ChatGPT-Chat. Die Webseite enthält keine Anmeldedaten oder API-Schlüssel und greift auf kein gemeinsames ChatGPT-Konto zu.

## Lokal starten und prüfen

index.html im Browser öffnen. Für Audio eine Wiedergabeaktion anklicken. Die Klangmodelle sind synthetische Hörhilfen.

Tests: node --test tests/*.test.cjs

## GitHub Pages

Statische Dateien im Hauptverzeichnis, Branch main, Pages-Ordner / (root), kein Build erforderlich. Version 2 ersetzt die bisherige Webseite; Version 1 bleibt in der Git-Historie erhalten. Quellen und eigene Kompositionsregeln sind im Ordner docs dokumentiert.
