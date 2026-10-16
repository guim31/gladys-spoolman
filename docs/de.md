# Spoolman

Verfolge deine 3D-Druck-Filamentspulen in Gladys über
[Spoolman](https://github.com/Donkie/Spoolman), die selbst gehostete
Filamentverwaltung: Restgewicht und Restlänge jeder Spule, der Bestand jedes
Materials, der Verbrauch eines Drucks und ein Verbrauch, den du selbst
erfasst. Alles bleibt in deinem lokalen Netzwerk: Gladys spricht direkt mit
Spoolman.

Spoolman aktualisiert Gladys **live**: sobald Klipper (Moonraker), OctoPrint
oder die Spoolman-Webseite eine Spule ändert, bewegen sich ihre Werte in
Gladys.

Getestet mit einem echten Spoolman 0.27.0 (sein offizielles Docker-Image).
Rückmeldungen sind im Gladys-Forum willkommen.

## Voraussetzungen

- Gladys Assistant 5.2 oder neuer (das Formular des Widgets braucht es).
- Ein Spoolman-Server, den der Gladys-Rechner erreicht, standardmäßig auf
  Port 7912, oder hinter einem Reverse-Proxy.
- Um Drucke automatisch zu verfolgen: ein Drucker, der seinen Verbrauch an
  Spoolman meldet, etwa Klipper mit dem Abschnitt `[spoolman]` von Moonraker
  oder OctoPrint mit seinem Spoolman-Plugin. Sonst erfasst du den Verbrauch
  mit der Szenenaktion oder dem Widget.

## Konfiguration

1. Öffne den Reiter **Konfiguration** der Integration.
2. Gib unter **Spoolman-Adresse** die IP-Adresse des Servers ein, zum
   Beispiel `192.168.1.50`: die Integration nutzt dann Port 7912. Füge den
   Port hinzu, wenn er abweicht (`192.168.1.50:8000`). Hinter einem
   Reverse-Proxy gibst du die vollständige Adresse samt Unterpfad ein
   (`https://example.org/spoolman`).
3. Spoolman hat keine eigene Anmeldung. Verlangt dein Proxy Zugangsdaten,
   füll **Proxy-Benutzername** und **Proxy-Passwort** (HTTP Basic) aus, oder
   einen **zusätzlichen HTTP-Header** in der Form `Name: Wert` (ein Token).
4. **Ein Bestandsgerät pro Material** (standardmäßig an) fügt ein Gerät pro
   Material (PLA, PETG …) mit seinem gesamten Restgewicht hinzu.
5. **Sprache der Namen und Meldungen** legt die Namen der Funktionen (beim
   Hinzufügen des Geräts festgelegt) und die Texte fest. Standardmäßig
   Französisch.
6. Speichere und nutze dann **Verbindung testen**: sie zeigt die
   Spoolman-Version, die Anzahl der Spulen in Gebrauch und den Zustand der
   Live-Aktualisierung.
7. Füge im Reiter **Entdecken** die Spulen und Bestände hinzu, die du
   verfolgen willst.

## Geräte

**Eine Spule** (eine pro Spule in Gebrauch, benannt nach Hersteller,
Filament und Material, mit ihrer Spoolman-Nummer:
`Prusament Galaxy Black PLA #1`):

| Funktion                 | Wert                                                      |
| ------------------------ | --------------------------------------------------------- |
| Restgewicht (g)          | verbleibende Gramm Filament                               |
| Verbleibend              | verbleibender Prozentsatz, bezogen auf das Anfangsgewicht |
| Verbrauchtes Gewicht (g) | seit der Erfassung der Spule verbrauchte Gramm            |
| Restlänge                | verbleibende Meter Filament                               |
| Zuletzt verwendet        | Datum und Uhrzeit des letzten Verbrauchs, oder „Nie“      |
| Status                   | „In Gebrauch“, „Archiviert“ oder „In Spoolman gelöscht“   |

Lagerort, Farbe und Nummer der Spule stehen in den Geräteparametern. Eine
Spule, deren Filament in Spoolman kein Gewicht hat, meldet weder Restgewicht
noch Prozentsatz: trag das Filamentgewicht in Spoolman ein.

**Ein Bestand** (`Bestand PLA`): das gesamte Restgewicht (g) und die Anzahl
der Spulen in Gebrauch eines Materials.

Eine archivierte Spule verschwindet aus dem Reiter Entdecken; wurde sie zu
Gladys hinzugefügt, bleibt ihr Gerät und zeigt „Archiviert“. Lösche es in
Gladys, wenn du seinen Verlauf nicht mehr brauchst.

## Dashboard-Widget

**Filamentspulen**: drei Kacheln (Gesamtbestand in kg, Anzahl der Spulen,
Anzahl knapper Spulen), die Liste der Spulen, die zuerst leer werden, mit
Restgewicht, Lagerort und Prozentsatz (grün, orange unter der Schwelle, rot
unter ihrer Hälfte), und eine Schaltfläche **Verbrauch**: sie öffnet ein
Formular (Spule, Menge, Gramm oder Meter) und erfasst den Verbrauch in
Spoolman.

Einstellungen: ein Material (`PLA`) und ein Spoolman-Lagerort, um die Liste
zu filtern, und der Prozentsatz, unter dem eine Spule als knapp gilt
(standardmäßig 20 %).

## Szenen-Auslöser

- **Filament verbraucht**: eine Spule hat in Spoolman Gewicht verloren (ein
  vom Drucker gemeldeter Druck), sobald der Verbrauch 2 Minuten ruht: ein
  ganzer Druck ergibt ein einziges Ereignis. Optionaler Filter: die Spule.
  Variablen: Name der Spule, Material, Lagerort, verbrauchte Gramm,
  verbleibende Gramm, verbleibender Prozentsatz. Ein von der Integration
  selbst erfasster Verbrauch (Szenenaktion, Widget) löst ihn nicht aus.
- **Spule archiviert**: eine Spule wurde in Spoolman archiviert (meist: sie
  ist leer). Optionaler Filter: die Spule. Variablen: Name der Spule,
  Material, Lagerort.

Eine Schwelle („weniger als 100 g“) braucht keinen eigenen Auslöser: nutze
den Standardauslöser **Änderung von Gerätestatus** auf dem Restgewicht oder
Prozentsatz einer Spule oder auf dem Restgewicht eines Bestands.

## Szenenaktionen

**Filamentverbrauch erfassen**: zieht eine Menge (in Gramm oder Metern) von
einer Spule in Spoolman ab, für einen Drucker, der ihn nicht meldet (zum
Beispiel am Ende eines Drucks, den eine andere Integration meldet).
Ausgaben: verbleibende Gramm, verbleibender Prozentsatz.

## Szenenbeispiele

- **Filament bestellen, bevor es ausgeht**: Auslöser „Änderung von
  Gerätestatus“, Restgewicht von `Bestand PETG` unter 500 → Nachricht
  „Weniger als 500 g PETG übrig“ senden.
- **Spule fast leer**: Auslöser „Änderung von Gerätestatus“, Restgewicht
  einer Spule unter 100 → Nachricht „Spule fast leer: bestell eine neue“.
- **Druckbilanz**: Auslöser **Filament verbraucht** → eine Nachricht mit
  seinen Variablen: verbrauchte Gramm, Name der Spule, verbleibende Gramm.
- **Ein Drucker ohne Spoolman**: Auslöser „Druck beendet“ seiner Integration
  → Aktion **Filamentverbrauch erfassen** auf der geladenen Spule.

## Fehlerbehebung

- **„Spoolman antwortet nicht“**: prüfe Adresse und Port (7912 mit dem
  offiziellen Docker-Image, 8000 innerhalb des Containers) und ob der
  Gladys-Rechner ihn erreicht.
- **„Zugriff verweigert (401)“ oder „(403)“**: dein Proxy lehnt die
  Zugangsdaten oder den Header ab. Spoolman selbst antwortet 403 nur auf eine
  Anfrage von einer anderen Website (ein Browser): die Integration sendet
  keine.
- **„Antwortet nicht wie Spoolman“**: die Adresse führt zu einer
  Anmeldeseite oder einem anderen Dienst. Mit Unterpfad gibst du ihn
  vollständig ein.
- **Eine Spule hat kein Restgewicht**: ihr Filament hat in Spoolman kein
  Gewicht.
- Mehr Details in den Protokollen der Integration (`LOG_LEVEL=debug` für
  jede Aktualisierung).

## Grenzen

- Ein einziger Spoolman-Server.
- Gladys hat keine Gramm-Einheit: die Gewichte tragen „(g)“ im Namen.
- Den Raum eines Geräts kann eine Integration nicht festlegen: weise ihn in
  Gladys zu. Der Spoolman-Lagerort steht in den Geräteparametern und filtert
  das Widget.
- Spoolman vergibt die Nummer der letzten Spule neu, wenn sie gelöscht wird
  (SQLite): eine neue Spule kann dann ihr Gladys-Gerät übernehmen.
- Die Live-Aktualisierung braucht einen WebSocket, der durch deinen Proxy
  geht; sonst liest die Integration Spoolman alle 5 Minuten.
- Eine Änderung an Filament oder Hersteller lädt die ganze Liste neu
  (Spoolman sendet dafür keine Aktualisierung der Spulen).
