# Neuer Melodie-Generator: Recherche und Umsetzung

Stand: 13. November 2026. Version 2 bleibt lokal. Bestätigt wurden zwei wählbare Arbeitsweisen, vier kombinierbare Phrasenarten und getrennte Freigaben für Hammer-ons, Pull-offs und Bendings.

## Recherchierte Grundlagen

- [Patrick Brennan / Premier Guitar: How to Craft More Melodic Solos](https://www.premierguitar.com/lessons/scales/melodic-soloing-guitar): ein Solo braucht Struktur, Raum und motivische Entwicklung. Ein begleitendes Riff gibt noch keine vollständige Solo-Dramaturgie vor. Wiedererkennbare Motive können sich mit kleinen Änderungen entwickeln. Daraus folgt unsere Wahl zwischen eigener Solophrase und direkter Riff-Weiterentwicklung; es wird kein Unterrichtsbeispiel kopiert.
- [Jeff Owens / Fender: Master Hammer-Ons and Pull-Offs](https://www.fender.com/articles/techniques/master-hammer-ons-and-pull-offs): Hammer-ons erzeugen einen höheren Ton auf derselben Saite, Pull-offs kehren die Bewegung um. Beide verbinden Töne legato. Die App verwendet dafür direkt anschließende Töne mit 1–4 Halbtönen Abstand und prüft eine gemeinsame spielbare Saite. Diese konkrete Grenze ist eine eigene praktische Entwurfsentscheidung.
- [Yamaha Musical Instrument Guide: Electric Guitar Playing](https://www.yamaha.com/en/musical_instrument_guide/electric_guitar/play/): erläutert Hammer-on, Pull-off, Halbton-/Ganzton-Bending und die Rückkehr vom gebendeten Ton. Die App setzt optionale Bendings sparsam auf längere gegriffene Töne und hält auch den Zielton innerhalb der gewählten Tonleiter.
- Die allgemeinen Prinzipien getrennter Tonhöhen-/Rhythmusentwicklung und wiedererkennbarer Motivvariation sind zusätzlich in [der bisherigen Recherche](menu-research.md) belegt. Stilhinweise für Korn kommen aus [den bereits recherchierten Musikerinterviews](numetal-research.md), nicht aus einer Analyse oder Kopie konkreter Soli.

## Eigene Kompositionsregeln

**Eigenes Solo:** Hauptphrase mit verwandten Antworten, orientiert an Tonhöhenklassen des Riffs und einzelnen Akzenten der Drums. Tiefe Rifftöne werden in eine passende Sololage übertragen, ohne ihren tonalen Bezug durch bloßes Abschneiden am Tonumfang zu verlieren.

**Riffmotiv weiterentwickeln:** erkennbare Einsatzpunkte und Tonbewegungen des vorhandenen Riffs in höherer Lage. Dichte kann Anschläge ausdünnen; schnelle Läufe können kurze Durchgangstöne ergänzen. Leere Takte können eine eigene Antwort erhalten. Ohne vorhandenes Riff ist diese Arbeitsweise im App-Generator gesperrt.

Vier auswählbare Familien: singende Bögen, Blues-Phrasen, kurze Hooks und schnelle Läufe. Hauptfamilie und Antwort werden stilabhängig aus der ausdrücklich erlaubten Auswahl gewichtet. Stoner und Hard Rock bevorzugen eher Bögen/Blues, Punk und Nu Metal eher prägnante Hooks, Korn auch atmosphärische Bögen. Die Gewichte und Notenentscheidungen sind selbst entwickelt, keine gemessenen Bandstatistiken. „Blues-Phrase“ bedeutet Phrasierung und bevorzugte passende Tonhöhen; die gewählte Tonart wird nicht heimlich durch eine Blues-Tonleiter ersetzt.

Alle Noten bleiben im vorhandenen Solo-Bereich des Generators (MIDI 66–83, Tonleiter gefiltert); das manuelle Raster bietet weiterhin den größeren Umfang. Die Melodie bleibt einstimmig. Noten dürfen Riffanschläge und Taktgrenzen überklingen, enden aber vor dem nächsten Melodieton oder spätestens am Ende des Songteils. Schnelle Läufe verwenden das vorhandene Sechzehntelraster, keine vorgetäuschten Triolen.

Dichte, Rhythmus, Tonbewegung und Charakter beeinflussen neue Vorschläge. Alle Techniken starten deaktiviert. Freigabe bedeutet Erlaubnis, nicht Pflicht bei jedem Vorschlag. Nicht freigegebene Techniken werden beim App-Erzeugen weggelassen und bei aktuellen ChatGPT-Antworten zurückgewiesen. Alte gespeicherte und manuell bearbeitete Noten werden nicht entfernt.

Der Generator ersetzt nur die Melodie. Begleitspuren bleiben erhalten; Wiedergabe startet ab Takt 1. Auswahl und Noten einschließlich Pull-offs/Bendings werden gespeichert und durch Rückgängig/Wiederholen unterstützt. MIDI exportiert die Noten und Anschlagswerte; Bendings werden als Pitch-Bend-Verlauf ausgegeben. Hammer-on/Pull-off haben im Standard-MIDI kein eigenes universelles Gitarren-Technikereignis; die Notenfolge mit angepasster Anschlagsstärke bleibt erhalten, und der hörbare Gitarrencharakter hängt vom externen Instrument ab.
