# Phase 2 Call Notes - Live-Interaktion

Call: Montag, 8. Juni 2026, 16:30 Uhr

## Ziel für den Call

- Phase 1 ist abgeschlossen. Phase 2 sollte als klarer "Live-Modus" für die Vorstellung geplant werden.
- Nicht alles auf einmal entscheiden: erst die stabilen Basismechaniken festlegen, dann komplexere dramaturgische Varianten.
- Vorschlag für den Mindestumfang: Live-Verbindungsstatus, Voting App -> Bühne, Alarm/Trigger Bühne -> App, technischer PoC im Juni.

## Kurzer Einstieg

"Phase 1 ist jetzt durch. Für Phase 2 würde ich den Fokus auf eine verlässliche Live-Schicht legen: Die App wird während der Vorstellung zu einem Show-Kanal. Das Publikum sieht, dass es verbunden ist, kann auf Cue abstimmen, und die Bühne kann umgekehrt alle Geräte in einen Alarmzustand versetzen. Das ist technisch überschaubar, aber dramaturgisch stark, weil App und Bühne sich gegenseitig sichtbar steuern."

## Pitch: Live-Modus mit grünem Verbindungsstatus

- Vor der Vorstellung bzw. beim Start der Szene öffnen Nutzer einen eigenen Live-Bereich in der App.
- Oben steht permanent ein Status: "Live verbunden" mit grünem Punkt.
- Wenn die Verbindung wackelt: gelb "Verbinde neu..." und bei Ausfall rot "Offline - versuche wieder zu verbinden".
- Warum das wichtig ist:
  - Publikum hat Vertrauen, dass die App gerade wirklich Teil der Show ist.
  - Weniger hektisches Nachfragen, Reloaden oder Tippen während der Vorstellung.
  - Technik/Regie kann sehen, wie viele Geräte live verbunden sind.
  - Der Status wird zum Produktionswerkzeug: vor kritischen Cues sieht man, ob der Saal bereit ist.

Satz für den Call:
"Der grüne Punkt ist kein Gimmick, sondern Sicherheitsgefühl. Wenn 145 Leute ihr Handy in der Hand haben, müssen sie sofort verstehen: Ich bin verbunden, ich muss nichts reparieren, ich warte auf den nächsten Cue."

## Pitch: Voting

- App -> Backend -> adaptor:ex -> Bühnenvisualisierung.
- Die App zeigt nur die aktuelle Frage, Auswahloptionen, Countdown und Sendebestätigung.
- Die Bühne/projizierte Visualisierung erzählt das Ergebnis. Die App bleibt ruhig und lenkt nicht ab.
- Dramaturgisch passend für:
  - Soll zuerst über das politische System oder über Ressourcen gesprochen werden?
  - Haustiere in Mytopia: schützen, nutzen, verbieten?
  - Jodtabletten: behalten oder teilen?
  - Backgroundchecks erlauben?
  - Wer bzw. welche Zielsetzung gewinnt am Ende?

Satz für den Call:
"Voting ist für mich nicht einfach ein Formular. Es ist ein Bühnen-Cue: Die Frage kommt aus der Szene, die App sammelt schnell und robust, und das Ergebnis gehört dann auf die Bühne."

## Pitch: Alarm

- Bühne/Regie/adaptor:ex -> Backend -> App.
- Alle geöffneten Apps wechseln sofort in einen roten Alarmbildschirm.
- Kein Audio voraussetzen, weil Handys lautlos sein sollten. Der starke Effekt ist visuell: der ganze Saal leuchtet rot.
- Dramaturgisch besonders passend beim Anschlag nach Annegret/Nele:
  - Explosion/Licht/Qualm auf der Bühne.
  - Gleichzeitig roter App-Screen: "Terrorwarnung".
  - Danach kann die Bühne mit den Reaktionen weiterarbeiten.

Satz für den Call:
"Beim Alarm ist der Reiz, dass die Richtung umgedreht wird. Nicht das Publikum schickt etwas an die Bühne, sondern die Bühne greift in die App ein. Dadurch fühlt sich die digitale Ebene live und gefährlich an."

## MVP vs. Ausbau

MVP für den PoC:

- Live-Verbindungsstatus mit Heartbeat.
- Eine Abstimmung für alle verbundenen Nutzer.
- Aggregierte Ergebnisdaten für adaptor:ex.
- Ein Alarm-Trigger, der alle verbundenen Apps sofort rot schaltet.
- Kleines Regie-/Technik-Monitoring: verbundene Geräte, letzter Cue, Fehlerstatus.

Ausbau, wenn gewünscht:

- Stimmrecht nach Gruppen: Sitzblock, Charakterkarte, Stadtteil, Ressource.
- Gewichtete Stimmen, z.B. Leistung zählt mehr.
- Subgruppen-Votes, z.B. nur Untermhaus stimmt über Jodtabletten ab.
- Nachträgliches Hervorheben bestimmter Gruppen: "Wer so abgestimmt hat, steht jetzt auf."
- Push-Benachrichtigung für geschlossene App, aber nicht als Hauptmechanik während der Show.

## Technischer Plan

1. Gemeinsames Event-Schema definieren:
   - `live.connected`, `vote.opened`, `vote.submitted`, `vote.closed`, `alarm.triggered`, `alarm.cleared`.
   - Klären, welche Daten anonym bleiben und welche nach Gruppe/Sitz/Persona ausgewertet werden.

2. PoC im Juni:
   - App kann Live-Modus öffnen und Verbindung anzeigen.
   - Test-Voting kommt in adaptor:ex an.
   - Test-Alarm kommt von adaptor:ex in der App an.
   - Latenz und Stabilität werden gemessen.

3. Vor-Ort-Test/Workshop:
   - Mit Anton, Videografie und Bühnentechnik.
   - Test mit WLAN und/oder 5G im Saal.
   - TouchDesigner/Projektion bekommt die Ergebnisdaten.
   - Regie prüft, wer Cues auslöst und wie sie in die Vorstellung passen.

4. Abnahme vor Premiere:
   - Stress-Test mit vielen Geräten oder Simulation.
   - Fallbacks für Offline/Netzwerkprobleme.
   - Klare Cue-Liste für Regie und Technik.

## Offene Fragen für Sophie/Manuel/Anton/Technik

- Welche Live-Momente sind dramaturgisch gesetzt, welche sind optional?
- Soll Phase 2 zuerst nur App sein, oder App plus Kuben?
- Brauchen wir anonyme Abstimmungen oder müssen Gruppen/Personas wiedererkennbar sein?
- Welche Ergebnisse müssen auf die Bühne: nur Gesamtzahlen, Prozentwerte, Stadtteile, einzelne Gruppen?
- Wer löst Cues aus: Regie, Technik, Performer oder adaptor:ex automatisch?
- Gibt es im Saal stabiles 5G, oder brauchen wir ein eigenes WLAN?
- Gibt es eine Projektion/TouchDesigner-Pipeline, die Socket.io/MQTT/OSC entgegennehmen soll?
- Was ist der Fallback, wenn 10-20 Prozent der Handys nicht verbunden sind?
- Welche Interaktionen dürfen Nutzer individuell exponieren, ohne dass es unangenehm oder datenschutzkritisch wird?

## Konkreter Vorschlag zum Abschluss

"Ich würde vorschlagen, dass wir heute den MVP beschließen: Verbindung sichtbar machen, ein Voting sauber durchspielen, einen Alarm sauber durchspielen. Parallel sammeln wir die dramaturgischen Wunschmomente aus Sophies Konzept und markieren sie nach Komplexität. Dann kann ich den PoC bauen und wir testen ihn mit Anton und Bühnentechnik vor Ort."
