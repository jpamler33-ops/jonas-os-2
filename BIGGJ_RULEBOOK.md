# BIGGJ INTERNAL RULEBOOK V1

**Status:** kanonische interne Verhaltens- und Anti-Pattern-Verfassung für BIGGJ / TCX  
**Source of truth:** `biggj-rulebook.mjs`  
**Version:** `BIGGJ_INTERNAL_RULEBOOK_V1`

Dieses Rulebook definiert nicht nur, **wie BIGGJ arbeiten soll**, sondern ausdrücklich auch, **wie BIGGJ nicht arbeiten darf**. Der Kern ist deshalb eine Kombination aus Positivregeln, Anti-Regeln, Negativbeispielen, Erkennungssignalen und einer festgelegten Reaktion auf Verstöße.

V1 enthält 149 explizite Regeln in 21 Domänen. Kritische Verfassungsfakten werden zusätzlich maschinell geprüft.

## 1. Grundprinzip

Für jede relevante Aktion gilt die gleiche Reihenfolge:

1. **Was soll passieren?**
2. **Welche Regeln gelten?**
3. **Welche verbotenen Zustände könnten auftreten?**
4. **Welche Evidenz beweist, dass der Zustand zulässig ist?**
5. **Welche Evidenz fehlt?**
6. **Gibt es eine HARD-Regelverletzung?**
7. **Wenn ja: blockieren / ABSTAIN.**
8. **Wenn nein, aber HIGH-Verletzung: CAUTION / degradieren / reparieren.**
9. **Erst danach ausführen, testen oder anzeigen.**
10. **Entscheidung mit Rule-IDs auditieren.**

BIGGJ darf fehlende Informationen nie durch optimistische Defaults ersetzen.

## 2. Regelhierarchie

`HARD > HIGH > MEDIUM`

- **HARD:** Verfassungsgrenze. Verletzung führt zu Block / ABSTAIN / Quarantäne.
- **HIGH:** Starker Qualitäts- oder Sicherheitsverstoß. Funktion darf nur degradiert, repariert oder bewusst eingeschränkt fortfahren.
- **MEDIUM:** Qualitätsstandard. Verletzung erzeugt Verbesserungsbedarf, aber nicht zwingend einen globalen Block.

**Downstream darf niemals lockern.** Wenn ein früher Gate `ABSTAIN` oder `BLOCKED` liefert, darf kein späteres Modul daraus `PASS`, `PRIMARY` oder eine stärkere Freigabe machen.

## 3. Feste Systemgrenzen

Diese Grenzen gelten in V1 unabhängig von Strategie, Asset oder UI:

- `execution = SHADOW_ONLY`
- `canExecute = false`
- `canExecuteLive = false`
- `ABSTAIN` ist ein vollwertiges Ergebnis.
- Keine echten Börsenorders.
- Keine Wallet-Signaturen.
- Keine automatische Primär-Policy-Mutation.
- Keine automatische Model-Promotion.
- Keine automatische Skill-Transition.
- Point-in-Time ist Pflicht.
- Future Leakage ist verboten.
- Erfundene Evidenz ist verboten.
- Unverifizierte News dürfen nicht als verifiziert erscheinen.
- Stale Daten dürfen nicht als live/current erscheinen.
- Destruktive autonome Recovery ist verboten.
- Secrets dürfen nicht in Logs, UI oder Commits erscheinen.
- Red CI darf nicht ignoriert werden.
- Externe Calls brauchen Timeouts.
- Autonome Loops brauchen harte Bounds.

## 4. Rule-Schema

Jede Regel enthält:

- **id** – stabile Rule-ID, z. B. `DATA-001`
- **domain** – fachliche Domäne
- **severity** – HARD / HIGH / MEDIUM
- **kind** – REQUIRE / FORBID / PREFER / VERIFY
- **title** – kurze Bedeutung
- **must** – Soll-Verhalten
- **mustNot** – explizites Nicht-Soll-Verhalten
- **why** – warum diese Grenze existiert
- **detect** – typische maschinen- oder reviewbare Verletzungssignale
- **response** – definierte Reaktion
- **badExamples** – konkrete Negativbeispiele
- **goodExamples** – zulässige Gegenbeispiele

Eine Regel ohne `mustNot`, schlechtes Beispiel oder gute Gegenprobe ist unvollständig.

## 5. Domänen

### META
Regelt das Rulebook selbst: Versionierung, Konfliktauflösung, Ausnahmen, Rule-IDs, strengere Downstream-Gates und Policy-Integrität.

### EPISTEMIC
Regelt Wahrheit und Unsicherheit: OBSERVED / INFERRED / MODELLED / ASSUMED, keine erfundene Evidenz, keine falsche Kausalität, keine Scheinsicherheit, kein Confirmation Bias.

### DATA
Regelt Point-in-Time, Provenance, Freshness, Schemas, Dedupe, Providerfehler, Timestamps und deterministische Transformationen.

### RESEARCH
Regelt Hypothesen, Falsifier, Forward-Shadow, Multiple Testing, Reproduzierbarkeit, effektive Stichprobe, Regime-Transportabilität und Failure Memory.

### FORECAST
Regelt probabilistische Forecasts, Kalibrierung, Invalidation, adaptive Intervalle, Drift, unveränderliche Historie und ABSTAIN.

### TRADING
Regelt SHADOW_ONLY, keine erzwungenen Trades, keine Live-Ausführung, Entry-Admission, Lifecycle und Trennung zwischen Primärstrategie und Research-Discovery.

### RISK
Regelt Portfolio Blocks, Exposure Caps, Drawdown, Liquidität, Leverage, Unknown Risk und Tail Risk.

### MEMECOIN
Regelt Chain+Contract-Identität, Rug-Risk, Holder/LP/Owner-Risiken, Social Hype und höhere Risikoschwellen.

### NEWS
Regelt Quelle, Zeit, unabhängige Bestätigung, Unverified-Status, German-first, Translation fail-closed, Dedupe und Trennung von Fakt vs. Marktinterpretation.

### TRADER_WALLET
Regelt Public Data Only, stabile Entity-Identität, reale Historie, Survivorship Bias, Risk Adjustment und kein Live Copy-Trading.

### AUTONOMY
Regelt reversible Self-Heal, keine Primärmutation, keine Promotion, Owner Heartbeats, Backpressure, bounded loops und unveränderte Evidence-History.

### GOVERNANCE
Regelt Human Approvals, Scope, Audit, Hold/Reject/Promote und die Unüberstimmbarkeit von HARD-Regeln.

### UX
Regelt ehrliche Statusdarstellung, kontextuelle Buttons, mobile-first, Deutsch, Error Remediation, epistemische Labels und nicht-destruktive UI-Resets.

### CHANNELS
Regelt einen Manager pro Channel, Freshness, Supervisor, targeted repair, stable markers, Fehlerpropagation und eindeutigen Channel-Zweck.

### PERSISTENCE
Regelt atomare Writes, Hashes/Manifeste, Corruption Quarantine, keine destruktive Recovery, Storage Admission, Cold Store Verification und Retention.

### SECURITY
Regelt Secrets, Environment Variables, Least Privilege, Input Validation, Privacy und sichere Fehlermeldungen.

### OPERATIONS
Regelt Readiness, degraded mode, Circuit Breaker, Cooldowns, Recovery-Verifikation, Error Visibility und Startup Grace.

### TESTING
Regelt Syntax, Unit/Integration, Negativtests, PIT-Regressionen, Corruption Tests, UI Coverage, adversarial cases und deterministische Tests.

### DEPLOYMENT
Regelt Branch/PR/CI, Docker Packaging, Merge-Gates, Production Verify, Rollback, Red-CI-Verbot und parallele Branch-Kompatibilität.

### RESOURCE
Regelt bounded Queues, Concurrency, Timeouts, Caches und Memory Pressure.

### AUDIT
Regelt Timestamps, Scopes, Fingerprints, strukturierte Ursachen, Secret-Redaction und getrennte Outcome-Zustände.

## 6. Negative-State-Taxonomie

BIGGJ soll nicht nur auf `ERROR` reagieren. Folgende Nicht-Soll-Zustände sind getrennt zu behandeln:

- `UNKNOWN`
- `MISSING`
- `UNPROVEN`
- `STALE`
- `DEGRADED`
- `INVALID`
- `CORRUPT`
- `DUPLICATE`
- `FUTURE_LEAKAGE`
- `UNVERIFIED`
- `CONFLICTED`
- `RATE_LIMITED`
- `TIMEOUT`
- `BACKPRESSURE`
- `UNOWNED`
- `BLOCKED`
- `QUARANTINED`
- `ABSTAIN`

Diese Zustände dürfen nicht zu einem einzigen generischen Fehler zusammenfallen, wenn die Unterscheidung für Recovery oder Wahrheit relevant ist.

## 7. Was explizit niemals passieren darf

Beispiele:

- Daten aus der Zukunft in historische Entscheidungen einschleusen.
- Eine Schätzung als Messung darstellen.
- Eine Quelle oder Evidenz erfinden.
- Fehlende Daten mit 0 oder false gleichsetzen, wenn das System dadurch sicherer aussieht.
- Ein Risiko-Gate durch eine hohe Forecast-Confidence überstimmen.
- Eine Strategie promoten, weil sie historisch die höchste PnL hatte.
- Ein Modell sich selbst promoten lassen.
- Einen Trade erzwingen, nur damit "Aktivität" entsteht.
- Ein Memecoin anhand des Tickers statt Chain+Contract identifizieren.
- Social Hype als unabhängige Fundamentalevidenz zählen.
- Reposts derselben News als mehrere unabhängige Bestätigungen zählen.
- Eine unverifizierte Nachricht als verified markieren.
- Englische News trotz Strict-German still posten.
- Bei Providerfehler alte Daten ohne Stale-Label wiederverwenden.
- Corrupt State löschen, bevor das Original quarantined wurde.
- Remote Archive lokal löschen, bevor Hash/Readback verifiziert ist.
- Retries ohne Limit/Cooldown laufen lassen.
- Tausende External Calls unbegrenzt parallel starten.
- Secrets in Logs schreiben.
- Einen failed CI Run als "wahrscheinlich egal" übergehen.
- Nach Merge behaupten, Production laufe, ohne Railway/Runtime zu prüfen.
- UI-Aufräumen mit fachlicher History-Löschung vermischen.

## 8. Machine Enforcement

`evaluateBiggjRulebook(...)` prüft aktuell einen festen Core von kritischen Verfassungsfakten.

Beispiele:

- execution
- canExecute
- canExecuteLive
- abstainFirstClass
- automaticPrimaryMutation
- automaticPromotion
- automaticSkillTransition
- unboundedLoop
- pointInTimeRequired
- evidenceFabrication
- stalePresentedAsCurrent
- unverifiedMarkedVerified
- destructiveRecovery
- secretsExposed
- redCiIgnored
- externalCallsHaveTimeouts

Ergebnis:

- `PASS`
- `CAUTION`
- `BLOCKED`

Bei `BLOCKED` ist die Aktion `ABSTAIN`.

Wichtig: Das Rulebook behauptet nicht, alle 149 Regeln bereits generisch automatisch aus jedem beliebigen Runtime-Objekt beweisen zu können. Dafür müssen Fachmodule ihre semantischen Verstöße mit Rule-ID an das Rulebook melden. Diese Grenze ist absichtlich sichtbar, damit "nicht geprüft" nie mit "bestanden" verwechselt wird.

## 9. Integration Contract für jedes Modul

Jedes neue oder wesentlich geänderte Modul soll:

1. relevante Rulebook-Domänen bestimmen;
2. Hard Invariants übernehmen;
3. mindestens einen Nicht-Soll-Fall definieren;
4. bei erkennbarer Verletzung eine Rule-ID emitten;
5. fehlende Evidenz nicht optimistisch ersetzen;
6. einen Failure/Degraded/Abstain-Pfad besitzen;
7. neue HARD-Regeln mit Negativtests absichern;
8. State/Output versionieren, wenn historische Reproduzierbarkeit relevant ist;
9. bei externer I/O Timeout, Retry-Limit und Backpressure besitzen;
10. vor Production-Merge CI + Packaging + Live Verify bestehen.

## 10. Change Control

Eine Rule-ID ist semantisch stabil.

Wenn sich die Bedeutung wesentlich ändert:

- neue Rule-ID oder neue Rulebook-Version,
- Teständerung,
- Changelog/PR-Erklärung,
- Prüfung bestehender Integrationen,
- keine stille Umdeutung historischer Entscheidungen.

Neue Regeln sollen möglichst zuerst als **Anti-Pattern + Detect Signal + Response** beschrieben werden. Erst dann soll die positive Idealform ergänzt werden.

## 11. Zielzustand

Der Zielzustand ist kein Bot, der nur weiß, was "gut" aussieht. BIGGJ soll systematisch erkennen:

- was unmöglich sein darf,
- was gefährlich ist,
- was unbewiesen ist,
- was stale ist,
- was manipuliert sein könnte,
- was nicht reproduzierbar ist,
- was eine Regel umgeht,
- was zwar technisch funktioniert, aber wissenschaftlich falsch ist,
- und wann die korrekte Antwort schlicht `ABSTAIN` lautet.

Das Rulebook ist dafür die feste gemeinsame Sprache aller Subsysteme.
