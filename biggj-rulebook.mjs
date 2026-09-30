import { sha256 } from './institutional-kernel.mjs';

export const BIGGJ_RULEBOOK_VERSION='BIGGJ_INTERNAL_RULEBOOK_V2';
export const BIGGJ_RULEBOOK_SCHEMA_VERSION='BIGGJ_RULEBOOK_SCHEMA_V1';

const deepFreeze=value=>{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const v of Object.values(value))deepFreeze(v);
  }
  return value;
};
const arr=v=>Array.isArray(v)?v:[];
const uniq=xs=>[...new Set(arr(xs).map(String).filter(Boolean))];
const clone=v=>v==null?v:structuredClone(v);

export const BIGGJ_RULEBOOK_DOMAINS=deepFreeze({
  META:'Rulebook, hierarchy, exceptions and policy integrity.',
  EPISTEMIC:'Truth status, evidence labels, uncertainty and reasoning hygiene.',
  DATA:'Point-in-time data, lineage, freshness, schema and source integrity.',
  RESEARCH:'Scientific method, falsification, validation and reproducibility.',
  FORECAST:'Probabilistic forecasting, calibration, invalidation and drift.',
  TRADING:'Shadow-trading behavior, admissions and execution boundaries.',
  RISK:'Portfolio, liquidity, exposure and drawdown controls.',
  MEMECOIN:'High-risk token research, rug-risk and DEX-specific evidence.',
  NEWS:'News ingestion, verification, translation, dedupe and market relevance.',
  TRADER_WALLET:'Public trader/wallet intelligence and identity discipline.',
  AUTONOMY:'Self-healing, learning, mutation boundaries and bounded automation.',
  GOVERNANCE:'Approvals, promotion, skill transitions and human authority.',
  UX:'Telegram/Discord/mobile presentation and user-interaction rules.',
  CHANNELS:'Per-channel ownership, freshness, repair and supervisor rules.',
  PERSISTENCE:'State durability, corruption handling, retention and cold storage.',
  SECURITY:'Secrets, permissions, privacy and input boundaries.',
  OPERATIONS:'Readiness, degradation, recovery and provider health.',
  TESTING:'Tests, regressions, deterministic verification and coverage.',
  DEPLOYMENT:'PR, CI, packaging, deployment, live verification and rollback.',
  RESOURCE:'Memory, concurrency, queues, rate limits and timeouts.',
  AUDIT:'Logs, provenance, fingerprints and decision traceability.'
});

const SEVERITIES=new Set(['HARD','HIGH','MEDIUM']);
const KINDS=new Set(['REQUIRE','FORBID','PREFER','VERIFY']);

function R({id,domain,severity='HIGH',kind='REQUIRE',title,must,mustNot,why,detect,response,bad=[],good=[],tags=[]}){
  if(!id||!BIGGJ_RULEBOOK_DOMAINS[domain]||!SEVERITIES.has(severity)||!KINDS.has(kind))throw new Error('BIGGJ_RULE_INVALID:'+String(id));
  return {
    id:String(id),
    domain,
    severity,
    kind,
    title:String(title),
    must:String(must),
    mustNot:String(mustNot),
    why:String(why),
    detect:uniq(detect),
    response:String(response),
    badExamples:uniq(bad),
    goodExamples:uniq(good),
    tags:uniq(tags)
  };
}

export const BIGGJ_RULEBOOK_RULES=deepFreeze([
  R({id:'META-001',domain:'META',severity:'HARD',title:'Rulebook ist die kanonische Verhaltensgrenze',must:'Jede neue autonome oder entscheidungsrelevante Funktion muss mit diesem Rulebook kompatibel sein.',mustNot:'Kein Modul darf eine eigene lockerere Parallel-Verfassung erfinden oder eine Regel stillschweigend überschreiben.',why:'Ohne zentrale Hierarchie entstehen widersprüchliche Subsysteme.',detect:['parallel policy','local override','policy downgrade'],response:'BLOCK_AND_REQUIRE_RULEBOOK_ALIGNMENT',bad:['Neues Modul setzt canExecuteLive=true obwohl der Kern es verbietet.'],good:['Neue Funktion übernimmt dieselben Safety-Invarianten und verweist auf stabile Rule-IDs.']}),
  R({id:'META-002',domain:'META',severity:'HARD',title:'Strengere Regel gewinnt',must:'Wenn zwei Regeln kollidieren, muss die strengere Einschränkung gelten.',mustNot:'Eine downstream Entscheidung darf eine upstream Sperre nicht lockern.',why:'Fail-closed darf nicht durch spätere Komfortlogik aufgehoben werden.',detect:['gate loosened downstream','blocked then admitted'],response:'ABSTAIN_AND_TRACE_CONFLICT',bad:['Data Gate ABSTAIN, Trading Gate macht trotzdem PRIMARY.'],good:['Jede spätere Stufe kann nur gleich streng oder strenger werden.']}),
  R({id:'META-003',domain:'META',severity:'HIGH',title:'Unbekannt ist nicht falsch und nicht wahr',must:'UNKNOWN, MISSING und UNPROVEN müssen als eigene Zustände erhalten bleiben.',mustNot:'Fehlende Daten dürfen nicht automatisch als false, zero, safe oder verified interpretiert werden.',why:'Default-Werte können Scheinsicherheit erzeugen.',detect:['unknown coerced false','missing coerced zero','unproven treated safe'],response:'DEGRADE_OR_ABSTAIN',bad:['Fehlende Liquiditätsdaten werden als 0 Risiko gewertet.'],good:['Liquidität unbekannt → keine Primärzulassung.']}),
  R({id:'META-004',domain:'META',severity:'HARD',title:'Regeländerungen sind versioniert',must:'Semantische Regeländerungen brauchen neue Version, Tests und nachvollziehbaren Diff.',mustNot:'Eine bestehende Rule-ID darf ihre Bedeutung nicht lautlos ändern.',why:'Historische Entscheidungen müssen reproduzierbar bleiben.',detect:['semantic change same version','rule id repurposed'],response:'BLOCK_RELEASE',bad:['META-002 bedeutet nach Update plötzlich etwas anderes.'],good:['Neue Semantik erhält neue Version oder neue Rule-ID.']}),
  R({id:'META-005',domain:'META',severity:'HIGH',title:'Ausnahmen sind explizit und begrenzt',must:'Ausnahmen müssen Scope, Grund, Eigentümer und Ablaufbedingung enthalten.',mustNot:'Keine dauerhaften versteckten Bypässe, Magic Flags oder undokumentierten Sonderpfade.',why:'Ausnahmen werden sonst zur eigentlichen Policy.',detect:['hidden bypass','permanent exception','magic env override'],response:'REJECT_EXCEPTION_OR_TIMEBOX',bad:['DEBUG=1 deaktiviert unbemerkt Risk Gates in Production.'],good:['Temporäre Ausnahme mit explizitem Scope und Ablaufdatum.']}),
  R({id:'META-006',domain:'META',severity:'HIGH',title:'Regelentscheidung ist erklärbar',must:'Block, Warnung oder Zulassung muss Rule-IDs und konkrete Gründe liefern.',mustNot:'Keine nicht nachvollziehbaren Entscheidungen nur mit generic ERROR oder SCORE.',why:'Diagnostik und Verbesserung brauchen konkrete Ursachen.',detect:['decision without rule id','opaque block'],response:'ADD_DECISION_TRACE',bad:['TRADE_REJECTED ohne Grund.'],good:['ABSTAIN wegen DATA-001 + RISK-004.']}),
  R({id:'META-007',domain:'META',severity:'HIGH',title:'Nicht-Erlaubtes wird positiv modelliert',must:'Für kritische Bereiche müssen explizite Anti-Regeln beschreiben, was verboten, gefährlich oder irreführend ist.',mustNot:'Nicht nur Wunschzustände definieren und Negativfälle implizit lassen.',why:'Ein System erkennt Fehlverhalten besser mit konkreten Gegenbeispielen.',detect:['missing negative rule','no bad examples'],response:'ADD_NEGATIVE_CONTRACT',bad:['Nur "Daten müssen gut sein" ohne Definition schlechter Daten.'],good:['Stale, future-leaked, unverified und schema-broken Daten sind getrennt verboten.']}),
  R({id:'META-008',domain:'META',severity:'MEDIUM',title:'Regeln sind minimal redundant',must:'Ähnliche Regeln dürfen sich ergänzen, aber nicht widersprüchlich duplizieren.',mustNot:'Keine fünf fast identischen Regeln mit abweichenden Schwellen.',why:'Redundanz erhöht Wartungsfehler.',detect:['duplicate threshold','contradictory duplicate'],response:'CONSOLIDATE_RULES',bad:['Drei verschiedene max-exposure Werte in drei Dateien.'],good:['Ein kanonischer Threshold, mehrere Verbraucher.']}),

  R({id:'EPI-001',domain:'EPISTEMIC',severity:'HARD',title:'Epistemische Klasse bleibt erhalten',must:'OBSERVED, INFERRED, MODELLED und ASSUMED müssen strikt unterscheidbar bleiben.',mustNot:'MODELLED oder ASSUMED darf nie als OBSERVED ausgegeben werden.',why:'Wahrheitsstatus ist zentral für wissenschaftliche Nachvollziehbarkeit.',detect:['modelled labeled observed','assumption presented fact'],response:'BLOCK_OR_RELABEL',bad:['Modellschätzung wird als gemessener Wert bezeichnet.'],good:['Wert = MODELLED, Quelle und Unsicherheit sichtbar.']}),
  R({id:'EPI-002',domain:'EPISTEMIC',severity:'HARD',title:'Keine erfundene Evidenz',must:'Jede Evidenz muss aus echter Quelle, Messung oder reproduzierbarer Berechnung stammen.',mustNot:'Keine erfundenen Quellen, Datenpunkte, Preise, Trades, Bestätigungen oder Zitate.',why:'Fabrication zerstört jede nachfolgende Analyse.',detect:['fabricatedEvidence','invented source','synthetic evidence labeled observed'],response:'BLOCK_AND_MARK_INTEGRITY_FAILURE',bad:['Nicht abgefragter API-Preis wird geraten.'],good:['Quelle fehlt → UNKNOWN/ABSTAIN.']}),
  R({id:'EPI-003',domain:'EPISTEMIC',severity:'HIGH',title:'Unsicherheit wird nicht versteckt',must:'Relevante Unsicherheit, Datenlücken und alternative Erklärungen müssen sichtbar bleiben.',mustNot:'Keine punktgenaue Scheinsicherheit ohne Intervall, Evidenz oder Kalibrierung.',why:'Überpräzision führt zu falschem Vertrauen.',detect:['false precision','confidence without calibration'],response:'DEGRADE_CONFIDENCE',bad:['82.37% Wahrscheinlichkeit ohne Kalibrierungsbasis.'],good:['Intervall + Sample Size + Kalibrierungsstatus.']}),
  R({id:'EPI-004',domain:'EPISTEMIC',severity:'HIGH',title:'Korrelation ist keine Kausalität',must:'Kausale Aussagen brauchen Mechanismus, zeitliche Ordnung und Alternativhypothesen.',mustNot:'Keine Kausalbehauptung allein aus zeitgleicher Korrelation.',why:'Marktdaten enthalten viele Scheinkorrelationen.',detect:['causal claim correlation only'],response:'RELABEL_AS_ASSOCIATION',bad:['X steigt, Y steigt → X verursacht Y.'],good:['Assoziation erkannt; Kausalmechanismus separat geprüft.']}),
  R({id:'EPI-005',domain:'EPISTEMIC',severity:'HIGH',title:'Gegenbeweise bleiben sichtbar',must:'Widersprechende Evidenz muss gespeichert und in Entscheidungen einbezogen werden.',mustNot:'Keine Bestätigungsselektion oder Entfernung unbequemer Gegenbeispiele.',why:'Confirmation Bias erzeugt fragile Modelle.',detect:['counter evidence discarded','cherry pick'],response:'REOPEN_REVIEW',bad:['Nur profitable Analogien werden behalten.'],good:['Positive und negative Fälle im gleichen Evidence Set.']}),
  R({id:'EPI-006',domain:'EPISTEMIC',severity:'MEDIUM',title:'Abwesenheit ist nicht Negation',must:'Nicht gefundene Evidenz ist als NOT_OBSERVED oder UNKNOWN zu markieren.',mustNot:'Keine Behauptung "existiert nicht", nur weil die Quelle nichts geliefert hat.',why:'Provider und Coverage sind unvollständig.',detect:['absence treated false'],response:'RELABEL_UNKNOWN',bad:['Keine News gefunden → es gab keine News.'],good:['Quelle lieferte keine News; globale Abwesenheit unbewiesen.']}),
  R({id:'EPI-007',domain:'EPISTEMIC',severity:'HIGH',title:'Disagreement wird nicht gemittelt bis es verschwindet',must:'Quellenkonflikte müssen als Konflikt erhalten und analysiert werden.',mustNot:'Keine blinde Mittelung widersprüchlicher Quellen zu scheinbar sauberem Konsens.',why:'Disagreement ist selbst Information.',detect:['conflict averaged away'],response:'FLAG_DISAGREEMENT',bad:['Zwei inkompatible Preise werden einfach gemittelt.'],good:['Quellenabweichung + Trust + Freshness getrennt.']}),
  R({id:'EPI-008',domain:'EPISTEMIC',severity:'HIGH',title:'Confidence folgt Evidenz, nicht Tonalität',must:'Confidence darf nur durch definierte Evidenz- und Kalibrierungskriterien steigen.',mustNot:'Keine höhere Confidence wegen sprachlicher Sicherheit, Hype oder häufiger Wiederholung.',why:'Wiederholung ersetzt keine unabhängige Evidenz.',detect:['confidence from repetition','hype-weighted confidence'],response:'RESET_CONFIDENCE_BASIS',bad:['100 Tweets sagen dasselbe → automatisch 100 unabhängige Belege.'],good:['Common-cause und Quellenabhängigkeit berücksichtigt.']}),

  R({id:'DATA-001',domain:'DATA',severity:'HARD',title:'Point-in-Time ist Pflicht',must:'Für jede Entscheidung darf nur Information verwendet werden, die zu decisionAsOf bereits verfügbar war.',mustNot:'Keine Future Leakage durch spätere Preise, Labels, Outcomes, Artikel-Updates oder nachträgliche Metadaten.',why:'Future Leakage macht Backtests und Lernen wertlos.',detect:['futureLeakageDetected','availableAt > decisionAsOf','outcome in features'],response:'BLOCK_AND_QUARANTINE_SAMPLE',bad:['Closing Price wird als Feature für Entscheidung 10 Minuten vorher genutzt.'],good:['availableAt <= decisionAsOf für jedes Feature.']}),
  R({id:'DATA-002',domain:'DATA',severity:'HARD',title:'Provenance ist Pflicht',must:'Kritische Daten brauchen Quelle, Zeit, Instrument/Entity und Transformationslinie.',mustNot:'Keine orphan values ohne nachvollziehbare Herkunft.',why:'Ohne Lineage keine Reproduzierbarkeit.',detect:['missing provenance','orphan feature'],response:'ABSTAIN_OR_QUARANTINE',bad:['feature=0.81 ohne Quelle und Timestamp.'],good:['Feature verweist auf Source Event und Transform.']}),
  R({id:'DATA-003',domain:'DATA',severity:'HIGH',title:'Schema vor Nutzung validieren',must:'Externe Payloads müssen Typen, Pflichtfelder und Wertebereiche bestehen.',mustNot:'Keine ungeprüften API-Felder direkt in Forschung oder Trading übernehmen.',why:'APIs ändern Schemas und liefern Fehlerobjekte.',detect:['schema unchecked','object coerced string','NaN admitted'],response:'REJECT_PAYLOAD',bad:['error JSON wird als Preis verarbeitet.'],good:['Schema invalid → Provider failure.']}),
  R({id:'DATA-004',domain:'DATA',severity:'HARD',title:'Stale Daten nicht als live darstellen',must:'Freshness muss pro Quelle/Feature geprüft und sichtbar sein.',mustNot:'Keine alten Daten als current/live ausgeben oder verwenden, wenn die Freshness-Grenze überschritten ist.',why:'Stale Daten können Entscheidungen invertieren.',detect:['stalePresentedAsCurrent','age > freshness threshold'],response:'MARK_STALE_AND_DEGRADE',bad:['30 Minuten alter Orderbook Snapshot als Live-Liquidität.'],good:['STALE + letzter Timestamp + kein Primärsignal.']}),
  R({id:'DATA-005',domain:'DATA',severity:'HIGH',title:'Duplikate sind keine unabhängigen Beweise',must:'Events und Nachrichten müssen dedupliziert und Common-Cause geprüft werden.',mustNot:'Syndizierte Kopien dürfen Confidence nicht vervielfachen.',why:'Newswire-Reposts erzeugen künstliche Evidenzmasse.',detect:['duplicate counted independent','same url/title fingerprint'],response:'DEDUP_AND_REWEIGHT',bad:['10 identische Artikel = 10 Bestätigungen.'],good:['Ein Ursprung + mehrere Reposts = eine Evidenzfamilie.']}),
  R({id:'DATA-006',domain:'DATA',severity:'HIGH',title:'Provider-Ausfall darf keine guten Werte erzeugen',must:'Timeout, 429, 5xx und Parse-Fehler müssen als Provider-Degradation behandelt werden.',mustNot:'Keine Fallback-Zahl aus altem Cache ohne Stale-Markierung.',why:'Fehlerpfade dürfen keine Scheindaten produzieren.',detect:['provider error converted data','silent fallback'],response:'DEGRADE_SOURCE_OR_FALLBACK_WITH_LABEL',bad:['API down → letzter Wert wird still weiterverwendet.'],good:['Fallback sichtbar, Cache Age sichtbar.']}),
  R({id:'DATA-007',domain:'DATA',severity:'HIGH',title:'Zeitachsen sind normalisiert',must:'Timestamps müssen eindeutig, monoton interpretierbar und in einer kanonischen Zeitzone gespeichert werden.',mustNot:'Keine gemischten Local/UTC Zeiten ohne Offset.',why:'Zeitfehler erzeugen scheinbare Future Leakage und falsche Reihenfolgen.',detect:['timezone ambiguous','timestamp nonfinite'],response:'REJECT_OR_NORMALIZE',bad:['2026-09-30 14:00 ohne Zeitzone.'],good:['Epoch ms oder ISO-8601 mit Offset.']}),
  R({id:'DATA-008',domain:'DATA',severity:'MEDIUM',title:'Transformationen sind deterministisch',must:'Gleicher Input + gleiche Version muss gleichen Feature-Output ergeben.',mustNot:'Keine implizite Randomness ohne Seed und Version.',why:'Replay und Debugging brauchen Determinismus.',detect:['nondeterministic transform'],response:'REPRODUCIBILITY_FAILURE',bad:['Feature variiert zwischen Replays ohne Inputänderung.'],good:['Deterministische Transform-Version + Seed.']}),

  R({id:'RESEARCH-001',domain:'RESEARCH',severity:'HARD',title:'Hypothese braucht Falsifier',must:'Jede Forschungsbehauptung muss vor Auswertung eine überprüfbare Widerlegungsbedingung besitzen.',mustNot:'Keine unfalsifizierbaren Narrative als Forschungsresultat.',why:'Ohne Falsifier kann jede Beobachtung passend gemacht werden.',detect:['missing falsifier','posthoc hypothesis'],response:'REJECT_RESEARCH_CLAIM',bad:['Wenn Kurs steigt war Signal richtig, wenn er fällt war Regime schuld.'],good:['Vorab definierte Fehlerbedingung.']}),
  R({id:'RESEARCH-002',domain:'RESEARCH',severity:'HARD',title:'Forward Shadow vor Promotion',must:'Neue Strategien/Modelle müssen auf zukünftigen, eingefrorenen Shadow-Episoden bestehen.',mustNot:'Keine Promotion allein aus In-Sample oder rückwirkend optimierten Daten.',why:'Out-of-sample Evidenz reduziert Overfitting.',detect:['promotion without forward shadow','insample only'],response:'HOLD_CANDIDATE',bad:['Backtest gut → direkt produktiv.'],good:['Frozen candidate + mehrere unabhängige Forward-Episoden.']}),
  R({id:'RESEARCH-003',domain:'RESEARCH',severity:'HIGH',title:'Negative Ergebnisse bleiben erhalten',must:'Fehlgeschlagene Experimente und schlechte Kandidaten müssen als Failure Memory verfügbar bleiben.',mustNot:'Keine Löschung negativer Resultate zur Verschönerung des Track Records.',why:'Sonst werden gleiche Fehler wiederholt.',detect:['failed experiment dropped'],response:'PERSIST_FAILURE_MEMORY',bad:['Nur Sieger-Experimente gespeichert.'],good:['Reject-Grund + Version + Datenfenster archiviert.']}),
  R({id:'RESEARCH-004',domain:'RESEARCH',severity:'HIGH',title:'Mehrfachtests werden kontrolliert',must:'Viele Hypothesen/Parameter-Suchen brauchen Multiple-Testing-Budget oder korrigierte Evidenz.',mustNot:'Keine Best-of-1000-Auswahl mit nominalem p/score als wäre es ein Einzeltest.',why:'Selection Bias produziert scheinbare Alpha-Signale.',detect:['multiple testing unaccounted','hyperparameter fishing'],response:'DEGRADE_EVIDENCE',bad:['1000 Varianten getestet, beste ohne Korrektur promotet.'],good:['Search Budget + Holdout + unabhängige Validierung.']}),
  R({id:'RESEARCH-005',domain:'RESEARCH',severity:'HIGH',title:'Reproduzierbarkeit vor Behauptung',must:'Experiment muss mit eingefrorenen Inputs, Versionen und Seeds reproduzierbar sein.',mustNot:'Keine Promotion nicht reproduzierbarer Resultate.',why:'Nicht reproduzierbare Resultate sind keine belastbare Evidenz.',detect:['replay mismatch','missing version'],response:'BLOCK_PROMOTION',bad:['Ergebnis kann nach Neustart nicht reproduziert werden.'],good:['Deterministic replay hash stimmt.']}),
  R({id:'RESEARCH-006',domain:'RESEARCH',severity:'HIGH',title:'Sample Sufficiency ist explizit',must:'Effektstärke, effektive Stichprobe und Abhängigkeiten müssen berücksichtigt werden.',mustNot:'Keine starken Schlussfolgerungen aus winzigen oder stark korrelierten Samples.',why:'Nominale Sample Size überschätzt häufig die Evidenz.',detect:['insufficient effective sample','dependent observations'],response:'INSUFFICIENT_EVIDENCE',bad:['3 Trades → Strategie validiert.'],good:['ESS, Zeitraum und Regime-Coverage angegeben.']}),
  R({id:'RESEARCH-007',domain:'RESEARCH',severity:'HARD',title:'Keine PnL-Optimierung als wissenschaftlicher Shortcut',must:'Forschung bewertet Mechanismen, Kalibrierung, Stabilität und Risiken getrennt von bloßer PnL-Maximierung.',mustNot:'Keine Policy-Mutation ausschließlich um historische PnL zu maximieren.',why:'PnL kann durch Overfit, Leverage oder Zufall steigen.',detect:['historical pnl optimized policy'],response:'REJECT_MUTATION',bad:['Parameter werden so lange geändert bis Backtest maximal ist.'],good:['Hypothese → Mechanismus → Forward-Validierung.']}),
  R({id:'RESEARCH-008',domain:'RESEARCH',severity:'HIGH',title:'Regime- und Transportabilität prüfen',must:'Ein Effekt muss über relevante Regime/Zeiten auf Stabilität geprüft werden.',mustNot:'Keine universelle Behauptung aus einem einzigen Marktregime.',why:'Viele Marktbeziehungen sind nicht stationär.',detect:['single regime generalization'],response:'LIMIT_SCOPE_OR_HOLD',bad:['Bull-Market-Pattern als immer gültig.'],good:['Gültigkeitsbereich und Failure Regimes dokumentiert.']}),

  R({id:'FORECAST-001',domain:'FORECAST',severity:'HARD',title:'Forecasts sind probabilistisch',must:'Forecast muss Verteilung/Probabilitäten oder explizite Unsicherheit abbilden.',mustNot:'Keine sichere Kurszusage oder deterministische Zukunftsbehauptung.',why:'Marktzukunft ist unsicher.',detect:['guaranteed forecast','certain price target'],response:'BLOCK_DISPLAY_OR_RELABEL',bad:['BTC wird morgen sicher 80k.'],good:['UP/DOWN/FLAT + Intervall + Unsicherheit.']}),
  R({id:'FORECAST-002',domain:'FORECAST',severity:'HARD',title:'Wahrscheinlichkeiten nur bei Kalibrierung anzeigen',must:'Probability Display braucht bestandene Integrität und Kalibrierung.',mustNot:'Keine nackten Prozentwerte aus unkalibriertem Score.',why:'Scores sind keine Wahrscheinlichkeiten.',detect:['probability displayed uncalibrated'],response:'HIDE_PROBABILITY',bad:['Model score .82 → 82% Chance.'],good:['Probability display allowed erst nach Calibration Gate.']}),
  R({id:'FORECAST-003',domain:'FORECAST',severity:'HIGH',title:'Invalidation ist Teil des Forecasts',must:'Jeder aktive Forecast braucht Bedingungen, die seine These schwächen oder invalidieren.',mustNot:'Keine These, die unabhängig von neuen Daten immer bestehen bleibt.',why:'Updatebarkeit ist Kern probabilistischen Denkens.',detect:['missing invalidation'],response:'MARK_INCOMPLETE',bad:['Forecast bleibt bullish trotz widersprechender Regimeänderung.'],good:['Explizite Invalidation + Live-Revision.']}),
  R({id:'FORECAST-004',domain:'FORECAST',severity:'HIGH',title:'Intervalle spiegeln Drift und Datenlage',must:'Unsicherheitsintervalle müssen sich bei Drift, geringer Evidenz oder Regimewechsel verbreitern.',mustNot:'Keine konstant engen Intervalle trotz schlechterer Informationslage.',why:'Unsicherheit ist dynamisch.',detect:['interval not adaptive','drift ignored'],response:'WIDEN_OR_ABSTAIN',bad:['Gleiches Intervall bei normalem und chaotischem Regime.'],good:['Adaptive intervals + Drift Status.']}),
  R({id:'FORECAST-005',domain:'FORECAST',severity:'HARD',title:'ABSTAIN ist vollwertiger Forecast-Ausgang',must:'Bei unzureichender Evidenz darf und soll ABSTAIN gewählt werden.',mustNot:'Keine erzwungene Richtung nur weil UI oder Scheduler ein Ergebnis erwartet.',why:'Erzwungene Vorhersagen verschlechtern Kalibrierung.',detect:['forced directional forecast'],response:'ABSTAIN',bad:['Immer UP/DOWN wählen.'],good:['UNKNOWN/ABSTAIN bei fehlender Edge.']}),
  R({id:'FORECAST-006',domain:'FORECAST',severity:'HIGH',title:'Forecast-Historie ist unveränderlich',must:'Ausgestellte Forecasts, damalige Inputs und Versionen müssen append-only oder auditierbar bleiben.',mustNot:'Keine nachträgliche Anpassung alter Forecasts an bekannte Outcomes.',why:'Sonst ist Accuracy nicht messbar.',detect:['forecast overwritten after outcome'],response:'INTEGRITY_FAILURE',bad:['Alte Probability nach Ausgang geändert.'],good:['Revision als neue Version, alte bleibt erhalten.']}),
  R({id:'FORECAST-007',domain:'FORECAST',severity:'HIGH',title:'Accuracy getrennt nach Horizont und Regime',must:'Performance muss nach Horizont, Asset, Regime und Evidenzlage aufgeschlüsselt werden.',mustNot:'Keine einzige Gesamttrefferquote als Qualitätsbeweis.',why:'Aggregation kann Schwächen verdecken.',detect:['aggregate accuracy only'],response:'REQUIRE_STRATIFIED_METRICS',bad:['70% insgesamt ohne Horizon Split.'],good:['5m/1h/3h + Regime + Calibration Error.']}),
  R({id:'FORECAST-008',domain:'FORECAST',severity:'HIGH',title:'Drift führt zu Degradation',must:'Erkannte Daten-, Feature- oder Modell-Drift muss Confidence und Admission verschärfen.',mustNot:'Keine unveränderte Primärnutzung bei bestätigter Drift.',why:'Verteilungswechsel entwerten historische Evidenz.',detect:['drift detected but no downgrade'],response:'DEGRADE_OR_HOLD',bad:['Drift=HIGH, Forecast Gate bleibt PASS.'],good:['Drift → CAUTION/ABSTAIN bis Revalidierung.']}),

  R({id:'TRADING-001',domain:'TRADING',severity:'HARD',title:'Execution bleibt SHADOW_ONLY',must:'Alle Trades, Orders und Portfolios bleiben Simulation/Research.',mustNot:'Keine echten Börsenorders, Wallet-Signaturen oder Real-Money-Ausführung.',why:'Aktuelle BIGGJ/TCX Systemgrenze ist Forschung, nicht Live-Execution.',detect:['execution != SHADOW_ONLY','real order api','wallet signing'],response:'HARD_BLOCK',bad:['Order an Exchange senden.'],good:['Shadow OMS simuliert Fill und Slippage.']}),
  R({id:'TRADING-002',domain:'TRADING',severity:'HARD',title:'canExecute ist false',must:'canExecute muss systemweit false bleiben.',mustNot:'Kein Modul darf canExecute=true setzen.',why:'Verhindert schleichende Aktivierung echter Ausführung.',detect:['canExecute=true'],response:'HARD_BLOCK_AND_ALERT',bad:['Lokaler Handler setzt canExecute true.'],good:['canExecute:false in allen Entscheidungsobjekten.']}),
  R({id:'TRADING-003',domain:'TRADING',severity:'HARD',title:'canExecuteLive ist false',must:'canExecuteLive muss systemweit false bleiben.',mustNot:'Kein Feature, Plugin oder Fallback darf Live Execution aktivieren.',why:'Explizite zweite Sicherung gegen Echtgeldpfade.',detect:['canExecuteLive=true'],response:'HARD_BLOCK_AND_ALERT',bad:['Discord Button löst Live-Trade aus.'],good:['Button öffnet Shadow-Analyse.']}),
  R({id:'TRADING-004',domain:'TRADING',severity:'HARD',title:'Keine erzwungenen PRIMARY Trades',must:'Kein PRIMARY Trade ist ein gültiges Ergebnis; ABSTAIN bleibt first-class. Separat markierte LAB-Counterfactuals dürfen eine eingefrorene Hypothese messen, ohne PRIMARY-Zulassung zu behaupten.',mustNot:'Bot darf keinen NORMAL/PRIMARY Trade nur wegen Quote, Challenge oder Inaktivität erzwingen und LAB darf nie als PRIMARY umetikettiert werden.',why:'Forced PRIMARY activity erzeugt schlechte Trades; getrennte Counterfactuals messen dagegen bewusst verworfene Hypothesen ohne Gate-Laundering.',detect:['forced primary trade quota','must trade primary today','lab relabeled primary'],response:'ABSTAIN_PRIMARY_AND_ISOLATE_LAB',bad:['Mindestens 5 PRIMARY Trades pro Tag egal was passiert.'],good:['NORMAL bleibt ABSTAIN; optionaler LAB-Counterfactual bleibt research-only.']}),
  R({id:'TRADING-005',domain:'TRADING',severity:'HARD',title:'Keine automatische Primär-Policy-Mutation',must:'Neue Policy-Varianten bleiben Kandidaten/Shadow bis explizit freigegeben.',mustNot:'Keine selbstständige Änderung der aktiven Primärstrategie aus kurzfristiger Performance.',why:'Online-Mutation kann Overfit und Instabilität erzeugen.',detect:['automaticPrimaryMutation=true'],response:'BLOCK_MUTATION',bad:['Nach 3 Verlusten Regeln automatisch lockern.'],good:['Challenger erzeugen, separat testen.']}),
  R({id:'TRADING-006',domain:'TRADING',severity:'HIGH',title:'Entry braucht definierte Invalidation und RR',must:'Primär-Entry benötigt strukturelle Invalidation, ausreichendes RR, Liquidität und Data Safety.',mustNot:'Keine Entry-Zulassung ohne Exit-Logik oder bei unzureichender Liquidität.',why:'Ohne Invalidation ist Risiko nicht definiert.',detect:['entry no invalidation','rr below threshold','liquidity insufficient'],response:'ABSTAIN',bad:['Signal stark, aber kein sinnvoller Stop.'],good:['Entry nur wenn alle Admission Gates PASS.']}),
  R({id:'TRADING-007',domain:'TRADING',severity:'HIGH',title:'Trade-Lifecycle ist zustandsbasiert',must:'Open/Protect/Trail/Exit müssen durch definierte Zustände und Thesis-Änderungen gesteuert werden.',mustNot:'Keine willkürlichen manuellen Ergebnisänderungen nach Outcome.',why:'Lernbare Trade-Historie braucht konsistente Regeln.',detect:['posthoc lifecycle edit'],response:'REJECT_STATE_CHANGE',bad:['Verlusttrade nachträglich als nicht gezählt markieren.'],good:['Jede Transition mit Timestamp/Reason.']}),
  R({id:'TRADING-008',domain:'TRADING',severity:'HIGH',title:'Discovery und Primärstrategie bleiben getrennt',must:'Experimentelle Discovery Trades müssen als Research klassifiziert bleiben.',mustNot:'Keine Vermischung von Explorer-Ergebnissen mit validierter Primärperformance.',why:'Sonst wird Strategiequalität falsch gemessen.',detect:['research trade counted primary'],response:'RECLASSIFY_AND_RECOMPUTE',bad:['Memecoin Experiment verbessert Primär-Winrate.'],good:['ResearchActivity separat.']}),

  R({id:'RISK-001',domain:'RISK',severity:'HARD',title:'NORMAL Portfolio-Risk Block gewinnt immer',must:'Ein aktiver NORMAL Portfolio- oder Drawdown-Block muss jede neue PRIMARY Entry-Zulassung stoppen; Data-Safety-Blocks gelten zusätzlich auch im LAB.',mustNot:'Kein lokales Signal und kein LAB-Ergebnis darf einen NORMAL Risk Block überstimmen.',why:'NORMAL Portfoliorisiko ist höhergeordnet als Einzelsignal; LAB ist ein isoliertes Counterfactual und keine PRIMARY-Zulassung.',detect:['normal portfolioBlocked but primary admitted','lab bypasses data safety'],response:'ABSTAIN_PRIMARY',bad:['Starkes Setup ignoriert NORMAL Drawdown Stop.'],good:['NORMAL block → kein PRIMARY Entry; LAB bleibt separat und nur bei sicherer Datenbasis.']}),
  R({id:'RISK-002',domain:'RISK',severity:'HIGH',title:'NORMAL Exposure Caps sind harte Obergrenzen',must:'NORMAL Single Trade, Asset, Correlation Cluster und Gesamtportfolio müssen definierte Exposure Caps respektieren. LAB-Kapital ist separat und darf diese Headroom-Berechnung nicht verändern.',mustNot:'Keine NORMAL Überschreitung durch Rundung, Split Orders oder Verrechnung mit LAB.',why:'NORMAL Risiko addiert sich über korrelierte Positionen; LAB soll diese Messung weder blockieren noch schönen.',detect:['normal exposure cap exceeded','lab netted against normal exposure'],response:'REDUCE_OR_REJECT_NORMAL',bad:['LAB-Gewinn wird benutzt um NORMAL Clusterlimit zu erhöhen.'],good:['NORMAL Exposure separat geprüft; LAB separat bilanziert.']}),
  R({id:'RISK-003',domain:'RISK',severity:'HARD',title:'NORMAL Drawdown Stop darf nicht gelockert werden',must:'NORMAL Hard Drawdown Limits bleiben unverändert bis reguläre Governance sie ändert. LAB-Recovery wird separat bilanziert und darf NORMAL-Risiko niemals erhöhen.',mustNot:'Keine automatische NORMAL Lockerung oder Hebelerhöhung nach Verlustphase, auch nicht um LAB- oder NORMAL-Verluste zurückzugewinnen.',why:'Loss chasing im NORMAL Wallet erhöht Ruin-Risiko; LAB-Recovery muss isoliert bleiben.',detect:['normal drawdown threshold loosened automatically','lab recovery increases normal risk'],response:'HARD_BLOCK_NORMAL',bad:['Nach LAB-Verlusten NORMAL Risiko verdoppeln.'],good:['NORMAL Hold bleibt; LAB Recovery Debt wird nur separat gemessen.']}),
  R({id:'RISK-004',domain:'RISK',severity:'HARD',title:'Liquidität ist Eintrittsbedingung',must:'Ausführbare Liquidität muss beobachtet und ausreichend sein.',mustNot:'Keine angenommene Liquidität aus Market Cap, Volumen oder Social Hype allein.',why:'Theoretischer Preis ist ohne ausführbare Tiefe irrelevant.',detect:['liquidity unknown admitted','marketcap used as liquidity'],response:'ABSTAIN',bad:['Low-cap Token mit dünnem Pool als problemlos handelbar behandeln.'],good:['Depth/Slippage/Pool-Liquidity geprüft.']}),
  R({id:'RISK-005',domain:'RISK',severity:'HIGH',title:'Leverage braucht eigene Gate-Kette',must:'Hebel darf nur in explizit modellierter Shadow-Risk-Logik berücksichtigt werden.',mustNot:'Keine implizite Hebelerhöhung zur Ziel-PnL-Erreichung.',why:'Hebel skaliert Fehler und Tail Risk.',detect:['leverage to hit target','unbounded leverage'],response:'REJECT_LEVERAGE',bad:['10x weil Signal Confidence hoch ist.'],good:['Leverage Counterfactual getrennt und begrenzt.']}),
  R({id:'RISK-006',domain:'RISK',severity:'HIGH',title:'Unbekanntes Risiko ist kein Nullrisiko',must:'Fehlende Risk Inputs müssen Risiko erhöhen oder Admission verschärfen.',mustNot:'Keine fehlenden Volatilitäts-/Liquiditäts-/Correlation-Werte als 0 interpretieren.',why:'Unknown-to-zero ist gefährlicher Optimismus.',detect:['missing risk -> zero'],response:'DEGRADE_OR_ABSTAIN',bad:['Keine Correlation Daten → correlation=0.'],good:['UNKNOWN correlation → konservativer Clusterblock.']}),
  R({id:'RISK-007',domain:'RISK',severity:'HIGH',title:'Tail Risk wird separat betrachtet',must:'Extremereignisse, Gap Risk und illiquide Zustände müssen außerhalb normaler Varianzmetriken geprüft werden.',mustNot:'Keine Sicherheitsbehauptung nur aus Durchschnittsvolatilität.',why:'Ruin entsteht oft in Tails.',detect:['tail risk omitted'],response:'ADD_STRESS_OR_LIMIT',bad:['VaR normal → sicher.'],good:['Adversarial stress + liquidity shock.']}),

  R({id:'RISK-008',domain:'RISK',severity:'HARD',title:'LAB Kapital ist unbegrenzt virtuell aber epistemisch isoliert',must:'LAB darf ohne Kapital-, Drawdown- oder Academy-Limit virtuelle Counterfactuals finanzieren, muss aber PIT, Data Safety, beobachtete Liquidität, Kosten, Dedupe und eindeutige LAB-Klassifikation erhalten.',mustNot:'LAB darf nie echte Orders ausführen, NORMAL Headroom verändern, PRIMARY Performance oder PRIMARY Lernmodelle kontaminieren, Future Leakage nutzen oder Verluste durch nachträgliche Ergebnisänderung verstecken.',why:'Unbegrenztes virtuelles Kapital ist nur wissenschaftlich nützlich, wenn die Versuchsergebnisse ehrlich, reproduzierbar und strikt vom NORMAL Wallet getrennt bleiben.',detect:['lab affects normal','lab future leakage','lab live execution','lab hides losses','lab ignores data safety'],response:'BLOCK_LAB_AND_PRESERVE_NORMAL',bad:['LAB-Verlust wird aus der Statistik gelöscht oder als NORMAL-Gewinn verrechnet.'],good:['LAB Recovery Debt bleibt sichtbar; NORMAL bleibt unverändert; LAB nutzt nur PIT-sichere Daten.']}),
  R({id:'MEME-001',domain:'MEMECOIN',severity:'HARD',title:'Memecoins sind High-Risk Research',must:'Memecoin-Signale müssen höhere Evidenz- und Risikoschwellen verwenden.',mustNot:'Keine Gleichbehandlung mit liquiden Large Caps.',why:'Rug, illiquidity und Reflexivität sind deutlich höher.',detect:['meme uses core thresholds'],response:'USE_MEME_POLICY_OR_ABSTAIN',bad:['PEPE und BTC gleiche Risk Policy.'],good:['Eigene MEME thresholds.']}),
  R({id:'MEME-002',domain:'MEMECOIN',severity:'HIGH',title:'Rug-Risk ist probabilistisch, nicht garantiert',must:'Rug-Indikatoren sind als Risikoindikatoren mit Evidenzstatus auszugeben.',mustNot:'Keine Behauptung "sicher kein Rug" ohne beweisbare technische/ökonomische Grundlage.',why:'Contract- und Liquiditätsrisiken können sich ändern.',detect:['rug guarantee'],response:'RELABEL_RISK',bad:['Dieser Coin kann nicht ruggen.'],good:['Owner privileges/liquidity lock/holder concentration beobachtet, Restunsicherheit bleibt.']}),
  R({id:'MEME-003',domain:'MEMECOIN',severity:'HARD',title:'Token-Identität ist Chain+Address',must:'Token muss über Chain und Contract Address identifiziert werden.',mustNot:'Ticker allein darf nicht als eindeutige Identität dienen.',why:'Ticker-Kollisionen und Fake Tokens sind häufig.',detect:['ticker only identity'],response:'REJECT_TOKEN_IDENTITY',bad:['BUY PEPE nur anhand Symbol.'],good:['Ethereum + 0x... Contract.']}),
  R({id:'MEME-004',domain:'MEMECOIN',severity:'HIGH',title:'Social Hype ist kein fundamentaler Beweis',must:'Social Momentum darf nur als Reflexivitätsfeature neben Liquidität, Ownership und Flow dienen.',mustNot:'Keine Primärzulassung allein wegen Mentions/Trend.',why:'Hype ist manipulierbar.',detect:['social-only signal'],response:'RESEARCH_ONLY',bad:['Trending auf X → guter Trade.'],good:['Hype + DEX flow + liquidity + contract risk.']}),
  R({id:'MEME-005',domain:'MEMECOIN',severity:'HIGH',title:'Pool- und Holder-Risiko prüfen',must:'Liquidität, Konzentration, LP-Status, Mint/Freeze/Owner-Rechte soweit öffentlich prüfbar einbeziehen.',mustNot:'Keine Qualitätsbewertung nur aus Price Change und Volume.',why:'Technische Kontrollrechte dominieren oft das Risiko.',detect:['contract risk missing'],response:'DEGRADE_MEME_SCORE',bad:['+300% Volume = safe.'],good:['Contract/LP/holders + market activity.']}),
  R({id:'MEME-006',domain:'MEMECOIN',severity:'HARD',title:'Auch Memecoin bleibt SHADOW_ONLY',must:'Memecoin Research darf nur Shadow-Trades erzeugen.',mustNot:'Keine DEX Wallet-Transaktion oder Real-Money Copy.',why:'Systemweite Execution Boundary gilt universell.',detect:['meme live order','wallet transaction'],response:'HARD_BLOCK',bad:['Bot kauft automatisch neuen Token.'],good:['Shadow fill + simulated slippage.']}),

  R({id:'NEWS-001',domain:'NEWS',severity:'HIGH',title:'News hat Quelle und Originalzeit',must:'Jedes News-Event braucht Quelle, URL sofern vorhanden und availableAt/publishedAt.',mustNot:'Keine anonyme Nachricht ohne Provenance in Live-Feeds.',why:'News kann falsch, alt oder syndiziert sein.',detect:['news missing source','news missing timestamp'],response:'DROP_OR_MARK_UNVERIFIED',bad:['Breaking: X passiert, ohne Quelle.'],good:['Quelle + Timestamp + Status.']}),
  R({id:'NEWS-002',domain:'NEWS',severity:'HIGH',title:'Unabhängige Bestätigung ist separat',must:'verified/corroborated darf nur nach definierter unabhängiger Bestätigung gesetzt werden.',mustNot:'Ein zweiter Repost derselben Quelle ist keine unabhängige Bestätigung.',why:'Syndication erzeugt Scheinkonsens.',detect:['verified without independent confirmation'],response:'RELABEL_DISCOVERY_ONLY',bad:['Reuters-Repost auf 5 Seiten = 5 Bestätigungen.'],good:['Unabhängige Primär-/Sekundärquelle bestätigt.']}),
  R({id:'NEWS-003',domain:'NEWS',severity:'HARD',title:'Unverifiziert darf nicht verified heißen',must:'Discovery-only Events müssen sichtbar unverifiziert bleiben.',mustNot:'Keine UI oder downstream Logik darf unverifizierte News als bestätigt darstellen.',why:'Statusfehler können falsche Marktreaktionen auslösen.',detect:['unverifiedMarkedVerified'],response:'HARD_RELABEL_AND_ALERT',bad:['verified:true bei independentConfirmation=0.'],good:['DISCOVERY_ONLY · noch nicht unabhängig verifiziert.']}),
  R({id:'NEWS-004',domain:'NEWS',severity:'HIGH',title:'Discord News ist German-first',must:'Externe Headlines werden für den Nutzer auf Deutsch dargestellt, Originalquelle bleibt verlinkt.',mustNot:'Keine stillen englischen Live-News im deutschen Feed, wenn Strict German aktiv ist.',why:'Konsistente Nutzbarkeit.',detect:['strict german but english posted'],response:'TRANSLATE_OR_SKIP',bad:['Englische RSS-Headline unverändert im deutschen Kanal.'],good:['Automatisch übersetzt + Quelle.']}),
  R({id:'NEWS-005',domain:'NEWS',severity:'HIGH',title:'Translation Failure fail-closed',must:'Bei Übersetzungsfehler darf Strict-German Feed den betroffenen Eintrag überspringen.',mustNot:'Keine unübersetzte Fallback-Ausgabe entgegen Strict-German Policy.',why:'Policy darf bei Providerfehler nicht still gebrochen werden.',detect:['translation failed then raw posted'],response:'SKIP_AND_LOG',bad:['Translator down → englisch posten.'],good:['Übersetzungsfehler gezählt, Item nicht gepostet.']}),
  R({id:'NEWS-006',domain:'NEWS',severity:'HIGH',title:'News-Feed ist dedupliziert und begrenzt',must:'Feeds müssen stabile Event-Fingerprints, Posting-Limits und bounded Translation/Fetch Loops haben.',mustNot:'Keine Spam-Schleifen oder Vollscan der gesamten Historie pro Refresh.',why:'Schützt UX und Runtime.',detect:['unbounded news loop','duplicate spam'],response:'CAP_DEDUP_BACKPRESSURE',bad:['200 alte Headlines bei jedem Restart neu posten.'],good:['Unseen candidates cap + max 12 posts.']}),
  R({id:'NEWS-007',domain:'NEWS',severity:'MEDIUM',title:'Marktreaktion ist getrennt von News-Fakt',must:'News-Fakt und abgeleitete Marktinterpretation müssen getrennte Felder/Labels haben.',mustNot:'Keine Modellinterpretation in den Quellfakt hineinmischen.',why:'Fakt und Ableitung brauchen unterschiedliche Evidenzklassen.',detect:['market inference embedded as fact'],response:'SPLIT_FACT_AND_INFERENCE',bad:['"ETF genehmigt und BTC muss steigen".'],good:['Event OBSERVED; Impact MODELLED/INFERRED.']}),

  R({id:'TW-001',domain:'TRADER_WALLET',severity:'HARD',title:'Nur öffentliche Daten',must:'Trader-/Wallet-Intelligence nutzt nur öffentliche oder ausdrücklich autorisierte Daten.',mustNot:'Keine private Deanonymisierung, Credentials oder nicht autorisierte Accountdaten.',why:'Privacy und Datenintegrität.',detect:['private wallet identity data','unauthorized account data'],response:'BLOCK_COLLECTION',bad:['Private Exchange-Historie ohne Zustimmung scrapen.'],good:['Public on-chain address / public leaderboard.']}),
  R({id:'TW-002',domain:'TRADER_WALLET',severity:'HIGH',title:'Identität muss stabil sein',must:'Performance-Zuordnung braucht eine über Zeit stabile, belegte Entity-ID.',mustNot:'Keine Zusammenführung verschiedener Wallets/Trader nur wegen ähnlichem Verhalten.',why:'Identity errors verfälschen Track Records.',detect:['unstable entity identity'],response:'DO_NOT_SCORE_ENTITY',bad:['Ähnliche Trades → gleiche Person.'],good:['Offiziell gelabelte Exchange/öffentliche Wallet-ID.']}),
  R({id:'TW-003',domain:'TRADER_WALLET',severity:'HIGH',title:'Realized PnL statt Screenshot-Hype',must:'Trader-Qualität braucht nachvollziehbare realisierte Historie, Kosten und mehrere Trades.',mustNot:'Keine Rangliste aus einzelnen Screenshots oder unrealized PnL.',why:'Selection Bias und Fake Screenshots sind häufig.',detect:['single screenshot performance','unrealized only'],response:'INSUFFICIENT_TRACK_RECORD',bad:['Ein 100x Screenshot = Elite Trader.'],good:['Mehrere unabhängige abgeschlossene Trades + Drawdown.']}),
  R({id:'TW-004',domain:'TRADER_WALLET',severity:'HIGH',title:'Survivorship Bias berücksichtigen',must:'Trader-Rankings müssen verschwundene/verlustreiche Accounts soweit messbar berücksichtigen.',mustNot:'Keine Schlussfolgerung nur aus heute sichtbaren Gewinnern.',why:'Winner-only Samples überschätzen Edge.',detect:['survivors only'],response:'DEGRADE_CONFIDENCE',bad:['Top 10 heute = dauerhaft profitabel.'],good:['Zeitfenster, Verlustphasen und Persistenz.']}),
  R({id:'TW-005',domain:'TRADER_WALLET',severity:'HIGH',title:'Copy-Trading ist nicht erlaubt',must:'Trader Intelligence dient Research und Shadow Simulation.',mustNot:'Keine automatischen echten Copy Orders.',why:'Execution Boundary und unbekannte Latenz/Risikoprofile.',detect:['copy live trade'],response:'HARD_BLOCK',bad:['Wallet kauft → BIGGJ kauft echt nach.'],good:['Wallet Event → Shadow Thesis/Replay.']}),
  R({id:'TW-006',domain:'TRADER_WALLET',severity:'MEDIUM',title:'Skill von Risikonahme trennen',must:'Performance muss um Exposure, Leverage, Volatilität und Tail Events kontextualisiert werden.',mustNot:'Hohe absolute PnL darf nicht automatisch als hohe Skill-Schätzung gelten.',why:'Mehr Risiko kann mehr PnL ohne bessere Edge erzeugen.',detect:['pnl rank without risk adjustment'],response:'ADD_RISK_ADJUSTMENT',bad:['Größte PnL = bester Trader.'],good:['Return, DD, leverage, consistency, sample size.']}),

  R({id:'AUTO-001',domain:'AUTONOMY',severity:'HARD',title:'Autonome Recovery ist reversibel',must:'Automatische Reparaturen müssen reversibel, begrenzt und beobachtbar sein.',mustNot:'Keine destruktive autonome Reparatur ohne explizite Governance.',why:'Self-heal darf Schaden nicht vergrößern.',detect:['irreversible autonomous recovery'],response:'BLOCK_RECOVERY',bad:['Corrupt State löschen ohne Backup.'],good:['Quarantäne + clean fallback + Original erhalten.']}),
  R({id:'AUTO-002',domain:'AUTONOMY',severity:'HARD',title:'Keine automatische Primärmutation',must:'automaticPrimaryMutation bleibt false.',mustNot:'Autonomes Lernen darf die Primärpolicy nicht direkt verändern.',why:'Research und Serving müssen entkoppelt bleiben.',detect:['automaticPrimaryMutation=true'],response:'HARD_BLOCK',bad:['Learner schreibt aktive Entry-Schwelle um.'],good:['Challenger Candidate erzeugen.']}),
  R({id:'AUTO-003',domain:'AUTONOMY',severity:'HARD',title:'Keine automatische Promotion',must:'automaticPromotion bleibt false.',mustNot:'Kandidaten dürfen sich nicht selbst in den Primärstatus promoten.',why:'Promotion ist Governance-Grenze.',detect:['automaticPromotion=true'],response:'HARD_BLOCK',bad:['Bestes Modell wird automatisch Primary.'],good:['Review Queue + explizite Freigabe.']}),
  R({id:'AUTO-004',domain:'AUTONOMY',severity:'HARD',title:'Keine automatische Skill-Transition',must:'automaticSkillTransition bleibt false.',mustNot:'Research-Skills dürfen Statusgrenzen nicht selbst final überschreiten.',why:'Skill Claims brauchen überprüfte Evidenz.',detect:['automaticSkillTransition=true'],response:'HARD_BLOCK',bad:['Skill markiert sich selbst als VALIDATED.'],good:['Transition Ticket + Approval.']}),
  R({id:'AUTO-005',domain:'AUTONOMY',severity:'HIGH',title:'Owner Heartbeats statt Phantom-Automation',must:'Jede automatische Aufgabe braucht Owner/Handler, Health und Freshness.',mustNot:'Keine Queue-Einträge als "automatisiert" zählen, wenn kein aktiver Handler existiert.',why:'Sonst entsteht Scheinautomation.',detect:['unowned task','stale owner heartbeat'],response:'MARK_UNOWNED_OR_RECOVER',bad:['Task bleibt ewig AUTO aber niemand arbeitet daran.'],good:['Handler policy + last operation + max silent.']}),
  R({id:'AUTO-006',domain:'AUTONOMY',severity:'HIGH',title:'Backpressure ist normaler Zustand',must:'Memory-, Rate-, Storage- oder Provider-Druck darf Arbeit verzögern.',mustNot:'Keine erzwungene Weiterarbeit über Sicherheitsgrenzen.',why:'Stabilität schlägt Durchsatz.',detect:['backpressure bypassed'],response:'DEFER_AND_RETRY',bad:['OOM-Risiko ignorieren um Worker weiterlaufen zu lassen.'],good:['DEFERRED_MEMORY_PRESSURE.']}),
  R({id:'AUTO-007',domain:'AUTONOMY',severity:'HARD',title:'Keine unbounded loops',must:'Autonome Loops brauchen Limits für Zeit, Versuche, Concurrency, Queue und Datenmenge.',mustNot:'Keine endlose Rekursion, Vollscan-Schleife oder Retry ohne Cooldown.',why:'Unbounded Automation kann Runtime und APIs zerstören.',detect:['unboundedLoop','retry no cap','queue no bound'],response:'HARD_STOP_LOOP',bad:['Retry until success ohne Limit.'],good:['max attempts + cooldown + circuit breaker.']}),
  R({id:'AUTO-008',domain:'AUTONOMY',severity:'HIGH',title:'Lernen überschreibt keine Evidenz',must:'Neue Learnings werden versioniert/append-only und können frühere Hypothesen invalidieren, aber nicht löschen.',mustNot:'Keine Umschreibung der Vergangenheit zur Konsistenz mit neuem Modell.',why:'Learning braucht ehrliche Historie.',detect:['learning rewrites evidence'],response:'APPEND_REVISION',bad:['Alte Forecast-Fehler aus Journal entfernen.'],good:['Neue Revision verweist auf alten Zustand.']}),

  R({id:'GOV-001',domain:'GOVERNANCE',severity:'HARD',title:'Explizite Approval-Grenzen bleiben menschlich',must:'Definierte Model-Promotion- und Skill-Transition-Approvals benötigen explizite menschliche Entscheidung.',mustNot:'Keine Selbstfreigabe durch Bot, Scheduler oder Confidence Score.',why:'Governance schützt Primärsystem vor self-referential promotion.',detect:['auto approval'],response:'AWAIT_HUMAN_APPROVAL',bad:['Score > .9 → Auto Promote.'],good:['PROMOTE_CANDIDATE erzeugt Approval Ticket.']}),
  R({id:'GOV-002',domain:'GOVERNANCE',severity:'HIGH',title:'Repair ist nicht Approval',must:'Pipeline-Fehler und fehlende Evidenz sollen automatisch repariert/gesammelt werden, nicht als Approval an Menschen eskaliert werden.',mustNot:'Keine unnötigen Human-Tickets für technische Repair-Aufgaben.',why:'Menschen sollen Entscheidungen treffen, nicht Routinefehler beheben.',detect:['repair misclassified approval'],response:'AUTO_TRIAGE_REPAIR',bad:['Fehlender Datensatz verlangt Promotion-Freigabe.'],good:['Datensatz automatisch beschaffen/retry.']}),
  R({id:'GOV-003',domain:'GOVERNANCE',severity:'HIGH',title:'Approval ist scoped',must:'Freigabe gilt nur für konkrete Candidate/Version/Transition.',mustNot:'Keine pauschale Dauerfreigabe für zukünftige Varianten.',why:'Neue Version = neue Evidenzlage.',detect:['blanket approval'],response:'REQUIRE_SCOPED_APPROVAL',bad:['Alle zukünftigen Modelle automatisch erlaubt.'],good:['candidateId + generationId.']}),
  R({id:'GOV-004',domain:'GOVERNANCE',severity:'HIGH',title:'Governance-Entscheidung wird auditiert',must:'Approval/Reject/Hold muss Timestamp, Actor/Source, Candidate und Begründung speichern.',mustNot:'Keine anonyme oder nicht nachvollziehbare Statusänderung.',why:'Promotion muss später prüfbar sein.',detect:['approval without audit'],response:'REJECT_STATE_CHANGE',bad:['status=PRIMARY ohne Decision Record.'],good:['Signed/traceable decision record.']}),
  R({id:'GOV-005',domain:'GOVERNANCE',severity:'HARD',title:'Hard Rule kann nicht per Approval umgangen werden',must:'Menschliche Approval darf Sicherheitsinvarianten dieses Rulebooks nicht überschreiben, außer durch explizite neue Rulebook-Version.',mustNot:'Kein "approve anyway" für SHADOW_ONLY, Future Leakage oder Fabrication.',why:'Safety-Invarianten sind Verfassungsgrenzen, nicht Kandidatenwahl.',detect:['approval bypasses hard rule'],response:'HARD_BLOCK',bad:['User approved live execution im alten Rulebook.'],good:['Neue Systemgrenze braucht separate versionierte Architekturänderung.']}),
  R({id:'GOV-006',domain:'GOVERNANCE',severity:'MEDIUM',title:'Hold ist eigener Zustand',must:'HOLD darf weder als Reject noch als Promote behandelt werden.',mustNot:'Keine automatische Promotion nur weil Hold lange genug dauert.',why:'Fehlende Evidenz ist nicht positive Evidenz.',detect:['hold auto promoted'],response:'CONTINUE_RESEARCH',bad:['Nach 7 Tagen HOLD → Promote.'],good:['HOLD bis Proof vorhanden oder Reject.']}),

  R({id:'UX-001',domain:'UX',severity:'HIGH',title:'UI zeigt Status statt Scheinsicherheit',must:'READY/STALE/DEGRADED/UNKNOWN/ERROR müssen sichtbar sein.',mustNot:'Keine grüne/positive Darstellung bei unbekanntem oder stale Zustand.',why:'Nutzerentscheidungen hängen von Datenqualität ab.',detect:['degraded shown healthy'],response:'FIX_STATUS_PRESENTATION',bad:['Provider down, Panel zeigt normal.'],good:['DEGRADED + letzter erfolgreicher Refresh.']}),
  R({id:'UX-002',domain:'UX',severity:'HIGH',title:'Buttons sind kontextuell',must:'Buttons müssen zum aktuellen Panel und möglichen Aktionen passen.',mustNot:'Keine irrelevanten Buttons, Dead Ends oder versteckten Mutationen.',why:'Reduziert Fehlbedienung und UI-Lärm.',detect:['irrelevant button','dead action'],response:'REMOVE_OR_REMAP_BUTTON',bad:['Trade-Button in News-Panel ohne Kontext.'],good:['Forecast → Accuracy / Invalidation / Chart.']}),
  R({id:'UX-003',domain:'UX',severity:'MEDIUM',title:'Mobile-first und kompakt',must:'Wichtige Information muss auf iPhone ohne endloses Scrollen verständlich sein.',mustNot:'Keine riesigen Rohdatenblöcke als primäre UI.',why:'Hauptnutzung ist mobil.',detect:['oversized raw payload'],response:'SUMMARIZE_AND_LINK_DETAIL',bad:['500 Zeilen JSON in Discord.'],good:['Top Status + Drilldown.']}),
  R({id:'UX-004',domain:'UX',severity:'HIGH',title:'Fehlerzustände erklären nächste Aktion',must:'Error/Blocked/Needs muss Grund und nächsten sinnvollen Schritt zeigen.',mustNot:'Keine nackten Codes ohne Bedeutung.',why:'Operative Systeme müssen diagnostizierbar sein.',detect:['error without remediation'],response:'ADD_REMEDIATION_TEXT',bad:['ERR_42.'],good:['Provider 429 → Cooldown aktiv, Fallback Google News RSS.']}),
  R({id:'UX-005',domain:'UX',severity:'HIGH',title:'Deutsch ist Standardsprache der Nutzeroberfläche',must:'Nutzertexte, Panels und Feeds sind standardmäßig Deutsch.',mustNot:'Keine unnötigen englischen Systemtexte in Nutzerflächen.',why:'Konsistenz und Verständlichkeit.',detect:['english user ui'],response:'TRANSLATE_UI',bad:['AWAITING MARKET DATA in deutscher UI.'],good:['WARTE AUF MARKTDATEN.']}),
  R({id:'UX-006',domain:'UX',severity:'MEDIUM',title:'Keine Spam-Refreshes',must:'Unveränderte Panels sollen editiert, dedupliziert oder übersprungen werden.',mustNot:'Keine neue Nachricht bei jedem Scheduler Tick ohne Informationsänderung.',why:'Kanäle bleiben lesbar.',detect:['same panel reposted'],response:'UPSERT_OR_SKIP',bad:['Systemstatus jede Minute neue Message.'],good:['Stable marker + edit in place.']}),
  R({id:'UX-007',domain:'UX',severity:'HIGH',title:'Epistemische Labels sind in UI sichtbar',must:'Unverifiziert, Modelliert, Annahme und Shadow müssen wo relevant sichtbar sein.',mustNot:'Keine Entfernung kritischer Statuslabels aus Designgründen.',why:'Design darf Wahrheitsstatus nicht verstecken.',detect:['epistemic label hidden'],response:'RESTORE_LABEL',bad:['DISCOVERY_ONLY entfernt weil "sieht clean aus".'],good:['Kurzer Statuschip.']}),
  R({id:'UX-008',domain:'UX',severity:'MEDIUM',title:'Reset verliert keine fachliche Historie',must:'Chat-/UI-Reset darf nur UI-Nachrichten bereinigen, nicht Evidence/Trade/Research History.',mustNot:'Keine fachliche Datenlöschung wegen UX-Aufräumen.',why:'UI Lifecycle und Research Persistence sind getrennt.',detect:['ui reset deletes state'],response:'BLOCK_RESET',bad:['10-Minuten-Reset löscht Journal.'],good:['Nur alte UI Messages entfernen.']}),

  R({id:'CH-001',domain:'CHANNELS',severity:'HARD',title:'Jeder Channel hat genau einen Manager',must:'Jeder deklarierte Discord-Channel muss einen eindeutigen Manager-/Profilstatus besitzen.',mustNot:'Keine unmanaged oder doppelt gemanagten Channels.',why:'Freshness und Repair brauchen Ownership.',detect:['missing channel manager','duplicate channel manager'],response:'REPAIR_LAYOUT_AND_PROFILE',bad:['Neuer Channel ohne Profil.'],good:['49/49 Manager Coverage.']}),
  R({id:'CH-002',domain:'CHANNELS',severity:'HIGH',title:'Manager kennt Soll und Nicht-Soll',must:'Manager bewertet Existenz, Kategorie, Topic, Freshness, Content und letzten Fehler.',mustNot:'Keine reine "Channel existiert" Prüfung als Health.',why:'Strukturell vorhandener Channel kann trotzdem nutzlos/stale sein.',detect:['existence-only health'],response:'EXPAND_MANAGER_OBSERVATIONS',bad:['Channel leer aber HEALTHY.'],good:['Content freshness + error + layout.']}),
  R({id:'CH-003',domain:'CHANNELS',severity:'HIGH',title:'Supervisor priorisiert Probleme',must:'Meta-Supervisor muss problematische Manager bündeln und nächste Repairs priorisieren.',mustNot:'Keine unkoordinierte Reparatur aller Channels gleichzeitig.',why:'Verhindert Stampedes und doppelte Arbeit.',detect:['repair storm','no priority'],response:'SERIALIZE_OR_GROUP_REPAIR',bad:['49 Channels gleichzeitig rebuilden.'],good:['Top Problems + deduped repair groups.']}),
  R({id:'CH-004',domain:'CHANNELS',severity:'HIGH',title:'Stale Channel wird refreshed oder markiert',must:'Überschrittene Cadence muss Refresh/Repair auslösen.',mustNot:'Keine dauerhaft stale Panels mit HEALTHY Status.',why:'Channel-Wert hängt von Aktualität ab.',detect:['channel stale healthy'],response:'REFRESH_OR_MARK_STALE',bad:['Live Feed seit 2h unverändert aber grün.'],good:['STALE → targeted refresh.']}),
  R({id:'CH-005',domain:'CHANNELS',severity:'HIGH',title:'Repair ist targeted',must:'Reparatur soll kleinste sinnvolle Gruppe/Funktion betreffen.',mustNot:'Keine Voll-Setup-Rebuilds für einen einzelnen fehlerhaften Panel-Refresh, außer nötig.',why:'Reduziert API-Last und Seiteneffekte.',detect:['full rebuild for local issue'],response:'TARGETED_REPAIR',bad:['Ein News-Fehler → kompletter Server neu anlegen.'],good:['Nur news-feed refresh/recovery.']}),
  R({id:'CH-006',domain:'CHANNELS',severity:'MEDIUM',title:'Stable Marker verhindern Duplikate',must:'Managed Panels und Event Streams brauchen stabile Marker/Fingerprints.',mustNot:'Keine unidentifizierbaren Bot-Messages, die nicht sauber aktualisiert/dedupliziert werden können.',why:'Idempotenz braucht Identität.',detect:['managed message no marker'],response:'ADD_STABLE_MARKER',bad:['Panel ohne footer marker.'],good:['BIGGJ_NEWS_EVENT:<hash>.']}),
  R({id:'CH-007',domain:'CHANNELS',severity:'HIGH',title:'Channel-Fehler fließt in Supervisor',must:'Fehler aus Fetch/Send/Edit/Translation müssen Managerzustand beeinflussen.',mustNot:'Keine geloggten Fehler bei gleichzeitig HEALTHY Manager ohne Recovery.',why:'Observability muss Zustand widerspiegeln.',detect:['error ignored by manager'],response:'DEGRADE_MANAGER',bad:['Discord send 403, Manager HEALTHY.'],good:['failure() + lastError + nextAction.']}),
  R({id:'CH-008',domain:'CHANNELS',severity:'MEDIUM',title:'Channel-Zweck ist eindeutig',must:'Topic und Inhalt müssen zum definierten Kanalzweck passen.',mustNot:'Keine Vermischung von News, Trades, Academy und Errors in einem Feed ohne klare Trennung.',why:'Informationsarchitektur ist Teil der Funktionalität.',detect:['wrong content channel'],response:'ROUTE_TO_CORRECT_CHANNEL',bad:['Stacktrace im Trader-Radar.'],good:['Errors in #errors, News in #news-feed.']}),

  R({id:'PERSIST-001',domain:'PERSISTENCE',severity:'HARD',title:'Persistenz schreibt atomar',must:'Kritische State-Dateien müssen atomar oder generation-basiert geschrieben werden.',mustNot:'Keine in-place Teilwrites, die bei Crash gültige Daten überschreiben.',why:'Crash Safety.',detect:['partial overwrite risk'],response:'USE_TEMP_RENAME_OR_GENERATIONS',bad:['Direkt state.json überschreiben.'],good:['temp + fsync/rename oder A/B generations.']}),
  R({id:'PERSIST-002',domain:'PERSISTENCE',severity:'HARD',title:'Integrität ist prüfbar',must:'Kritischer persistierter State braucht Fingerprint/Hash/Manifest oder äquivalente Verifikation.',mustNot:'Keine blinde Annahme, dass vorhandene Bytes gültig sind.',why:'Silent corruption ist gefährlich.',detect:['state no integrity check'],response:'VERIFY_BEFORE_LOAD',bad:['JSON parse erfolgreich = automatisch vertrauenswürdig.'],good:['Hash chain / manifest verification.']}),
  R({id:'PERSIST-003',domain:'PERSISTENCE',severity:'HARD',title:'Corrupt Original wird quarantined',must:'Beschädigte Dateien werden separat erhalten und clean/recoverable state wird neu aufgebaut.',mustNot:'Keine destruktive Überschreibung des einzigen forensischen Originals.',why:'Debugging und Recovery brauchen Beweise.',detect:['corrupt overwritten'],response:'QUARANTINE_AND_RECOVER',bad:['Corrupt file löschen.'],good:['.corrupt-timestamp + clean state.']}),
  R({id:'PERSIST-004',domain:'PERSISTENCE',severity:'HARD',title:'Keine destruktive automatische Recovery',must:'Autonome Recovery darf Daten nicht löschen, wenn eine reversible Alternative existiert.',mustNot:'Keine History-Pruning-Aktion nur um Fehler schnell zu verstecken.',why:'Datenverlust ist irreversibel.',detect:['destructiveRecovery'],response:'HARD_BLOCK_RECOVERY',bad:['Archive löschen um Budgetalarm zu beseitigen.'],good:['Cold tier/offload/readonly degrade.']}),
  R({id:'PERSIST-005',domain:'PERSISTENCE',severity:'HIGH',title:'Storage Budget ist fail-closed',must:'Bei kritischem Speicherdruck müssen Writes priorisiert/deferred/blocked werden.',mustNot:'Keine ungebremsten Writes bis Volume voll ist.',why:'Volles Volume kann gesamten Dienst korrumpieren.',detect:['storage critical but writes continue'],response:'BLOCK_NONCRITICAL_WRITES',bad:['0 MB frei und weiter Events anhängen.'],good:['Storage admission + pressure thresholds.']}),
  R({id:'PERSIST-006',domain:'PERSISTENCE',severity:'HIGH',title:'Cold Store wird verifiziert',must:'Offloaded Segmente müssen vor lokaler Löschung remote verifiziert sein.',mustNot:'Keine lokale Löschung nur nach Upload-Versuch.',why:'Upload success != durable readable copy.',detect:['delete before remote verify'],response:'KEEP_LOCAL',bad:['PUT 200 → lokal sofort löschen ohne readback/hash.'],good:['Manifest + checksum verified.']}),
  R({id:'PERSIST-007',domain:'PERSISTENCE',severity:'MEDIUM',title:'Retention ist explizit',must:'Caps, TTLs und Archive-Regeln müssen dokumentiert und deterministisch sein.',mustNot:'Keine willkürliche historische Datenlöschung.',why:'Research Windows müssen nachvollziehbar bleiben.',detect:['implicit retention'],response:'DEFINE_RETENTION_POLICY',bad:['Wenn Datei groß wird zufällig Hälfte löschen.'],good:['Bounded hot + verified cold archive.']}),

  R({id:'SEC-001',domain:'SECURITY',severity:'HARD',title:'Secrets niemals ausgeben',must:'Tokens, API Keys, private credentials und vollständige Secret-Werte bleiben außerhalb von Logs/UI/Commits.',mustNot:'Keine Secret-Werte in Fehlermeldungen, Debug Dumps oder Chat-Panels.',why:'Credential leakage kompromittiert Systeme.',detect:['secretsExposed','token in log','secret committed'],response:'REDACT_ROTATE_BLOCK_RELEASE',bad:['DISCORD_BOT_TOKEN im Log.'],good:['Secret vorhanden=true, Wert nie gezeigt.']}),
  R({id:'SEC-002',domain:'SECURITY',severity:'HIGH',title:'Secrets kommen aus Environment/Secret Store',must:'Credentials werden zur Laufzeit aus sicheren Variablen geladen.',mustNot:'Keine hardcodierten Keys im Repository.',why:'Repos sind langlebig und leicht kopierbar.',detect:['hardcoded credential'],response:'REMOVE_AND_ROTATE',bad:['const apiKey="...".'],good:['process.env.API_KEY.']}),
  R({id:'SEC-003',domain:'SECURITY',severity:'HIGH',title:'Least Privilege',must:'Bots und Services erhalten nur benötigte Berechtigungen.',mustNot:'Keine unnötigen Admin-/ManageGuild-/Wallet-Permissions.',why:'Reduziert Blast Radius.',detect:['excess permission'],response:'REDUCE_PERMISSION',bad:['Bot Administrator nur für Message Edit.'],good:['ManageChannels nur wenn Setup nötig.']}),
  R({id:'SEC-004',domain:'SECURITY',severity:'HIGH',title:'Externe Inputs sind untrusted',must:'User-, API-, webhook- und provider inputs werden validiert/normalisiert.',mustNot:'Keine direkte Nutzung untrusted strings als IDs, file paths, HTML oder Commands.',why:'Verhindert Injection und State Corruption.',detect:['unvalidated input'],response:'VALIDATE_OR_REJECT',bad:['URL/Path direkt aus Message.'],good:['Allowlist + normalization.']}),
  R({id:'SEC-005',domain:'SECURITY',severity:'HIGH',title:'Privacy by minimum data',must:'Es wird nur die für Forschung/Funktion notwendige personenbezogene Information verarbeitet.',mustNot:'Keine unnötige Identifizierung natürlicher Personen aus Wallet-/Social-Daten.',why:'Research braucht nicht automatisch reale Identitäten.',detect:['natural person deanonymization'],response:'DROP_PERSONAL_IDENTITY',bad:['Wallet mit echter Person verknüpfen ohne legitimen Bedarf.'],good:['Entity/Walet cohort ohne private Identität.']}),
  R({id:'SEC-006',domain:'SECURITY',severity:'MEDIUM',title:'UI darf keine internen sensiblen Details leaken',must:'User-facing Fehler zeigen sichere Diagnose ohne Secrets/interne Credentials.',mustNot:'Keine vollständigen stack traces mit sensitiven Parametern im öffentlichen Channel.',why:'Debuggability ohne Leakage.',detect:['public stack trace secret risk'],response:'SANITIZE_ERROR',bad:['Raw request headers in Discord.'],good:['Provider 401, Secret-Wert redacted.']}),

  R({id:'OPS-001',domain:'OPERATIONS',severity:'HARD',title:'Readiness ist ehrlicher Gate',must:'READY darf nur bei erfüllten hard readiness Bedingungen gesetzt werden.',mustNot:'Keine READY-Antwort trotz kritischem Persistence/Data/Runtime Failure.',why:'Deployment und Monitoring verlassen sich auf Readiness.',detect:['ready while hard failure'],response:'NOT_READY',bad:['Audit Ledger corrupt aber /ready 200.'],good:['Hard reason → non-ready status.']}),
  R({id:'OPS-002',domain:'OPERATIONS',severity:'HIGH',title:'Degraded ist eigener Betriebsmodus',must:'Teilausfälle dürfen funktionierende Teile weiterlaufen lassen, aber sichtbar degraded.',mustNot:'Keine Totalabschaltung für jeden kleinen Fehler und kein Healthy-Vortäuschen.',why:'Resilienz braucht partielle Degradation.',detect:['minor failure causes total outage','degraded hidden'],response:'DEGRADE_SCOPE',bad:['News-Provider down stoppt Market Data.'],good:['News fallback/degraded, rest healthy.']}),
  R({id:'OPS-003',domain:'OPERATIONS',severity:'HIGH',title:'Circuit Breaker und Cooldown bei wiederholten Providerfehlern',must:'Wiederholte 429/5xx/timeouts müssen Backoff/Cooldown aktivieren.',mustNot:'Keine aggressive Retry-Schleife gegen gestörten Provider.',why:'Schützt Rate Limits und Runtime.',detect:['retry storm'],response:'OPEN_CIRCUIT_COOLDOWN',bad:['429 → sofort 100 Retries.'],good:['Cooldown + secondary provider.']}),
  R({id:'OPS-004',domain:'OPERATIONS',severity:'HIGH',title:'Self-heal wird verifiziert',must:'Nach Recovery muss der ursprüngliche Fehlerzustand erneut geprüft werden.',mustNot:'Keine Recovery als erfolgreich markieren nur weil die Aktion ausgeführt wurde.',why:'Action success ist nicht outcome success.',detect:['recovery executed not verified'],response:'VERIFY_RECOVERY_OUTCOME',bad:['Restart gesendet → resolved.'],good:['Restart + health state healthy.']}),
  R({id:'OPS-005',domain:'OPERATIONS',severity:'HIGH',title:'Fehler verschwinden nicht still',must:'Critical/recurring errors müssen in Observability und betroffenen Managerzustand einfließen.',mustNot:'Keine catch{}-Pfade für sicherheitsrelevante Fehler ohne bewusste Begründung.',why:'Silent failure verhindert Reparatur.',detect:['silent critical catch'],response:'LOG_AND_DEGRADE',bad:['Persistence error ignoriert.'],good:['recordError + readiness reason.']}),
  R({id:'OPS-006',domain:'OPERATIONS',severity:'MEDIUM',title:'Startup hat Grace, aber keine ewige Warmup-Ausrede',must:'Owner/worker dürfen begrenzte Startup Grace haben.',mustNot:'Keine unbegrenzte WARMING_UP Klassifizierung.',why:'Stale Worker muss irgendwann als Problem erkannt werden.',detect:['warmup unbounded'],response:'STALE_AFTER_GRACE',bad:['Worker meldet nie, bleibt WARMING_UP für immer.'],good:['startupGraceMs → danach STALE.']}),

  R({id:'TEST-001',domain:'TESTING',severity:'HARD',title:'Syntax Check ist Pflicht',must:'Geänderte ausführbare JS-Module müssen Syntax Check bestehen.',mustNot:'Kein Merge mit Syntaxfehler.',why:'Syntaxfehler sind vollständig vermeidbare Production-Ausfälle.',detect:['syntax check failed'],response:'BLOCK_MERGE',bad:['node --check rot.'],good:['CI Syntax success.']}),
  R({id:'TEST-002',domain:'TESTING',severity:'HARD',title:'Unit/Integration Regression muss grün sein',must:'Bestehende Tests plus neue relevante Tests müssen bestehen.',mustNot:'Keine fehlschlagenden Tests ignorieren, löschen oder lockern nur um CI grün zu bekommen.',why:'Regression Guards sind Teil der Architektur.',detect:['tests failed','test removed to pass'],response:'BLOCK_MERGE',bad:['Assertion entfernen statt Bug fixen.'],good:['Bug fix + passende Testanpassung nur bei echter Semantikänderung.']}),
  R({id:'TEST-003',domain:'TESTING',severity:'HIGH',title:'Neue Hard Rule braucht Negativtest',must:'Jede neue harte Invariante braucht mindestens einen Test, der den verbotenen Zustand erkennt.',mustNot:'Keine Hard Rule nur als Kommentar/Dokumentation.',why:'Nicht getestete Regeln driften.',detect:['hard rule no negative test'],response:'ADD_NEGATIVE_TEST',bad:['canExecuteLive false dokumentiert, aber nie geprüft.'],good:['Test injiziert true und erwartet BLOCKED.']}),
  R({id:'TEST-004',domain:'TESTING',severity:'HIGH',title:'PIT und Leakage haben Regressiontests',must:'Zeitkritische Forschungspfade müssen Future-Leakage Tests enthalten.',mustNot:'Keine Änderungen an Forecast/Research Input ohne PIT-Regression.',why:'Leakage ist oft subtil und hochschädlich.',detect:['forecast change no pit test'],response:'ADD_PIT_TEST',bad:['Neue Featurequelle ohne availableAt test.'],good:['Future timestamp → fail-closed.']}),
  R({id:'TEST-005',domain:'TESTING',severity:'HIGH',title:'Persistence braucht Corruption Tests',must:'State Stores müssen corrupted/truncated/tampered Fälle testen.',mustNot:'Nur Happy Path testen.',why:'Persistenzfehler treten unter Crash/Storage Pressure auf.',detect:['persistence no corruption test'],response:'ADD_FAILURE_TESTS',bad:['save/load normal only.'],good:['corrupt file → quarantine + clean recover.']}),
  R({id:'TEST-006',domain:'TESTING',severity:'MEDIUM',title:'UI/Channel Regression wird statisch oder funktional geprüft',must:'Wichtige Channels, Commands und Marker brauchen Coverage.',mustNot:'Keine unbemerkte Entfernung zentraler Controls.',why:'UI ist Produktoberfläche.',detect:['required surface missing'],response:'BLOCK_OR_FIX_SURFACE',bad:['/forecast verschwindet beim Refactor.'],good:['required command list test.']}),
  R({id:'TEST-007',domain:'TESTING',severity:'HIGH',title:'Tests prüfen Nicht-Soll-Zustände',must:'Tests sollen explizit falsche, stale, corrupt, missing, duplicated und blocked Zustände abdecken.',mustNot:'Keine reine Happy-Path Suite.',why:'Der Nutzer fordert explizite Erkennung dessen, wie es nicht sein soll.',detect:['happy path only'],response:'ADD_ADVERSARIAL_TESTS',bad:['Nur valid input tests.'],good:['Invalid, stale, future, duplicate, corrupt, unauthorized.']}),
  R({id:'TEST-008',domain:'TESTING',severity:'MEDIUM',title:'Deterministische Tests bevorzugen',must:'Tests sollen Zeit/Randomness/Netzwerk kontrollieren oder mocken.',mustNot:'Keine flaky CI-Abhängigkeit von zufälligen externen Zuständen.',why:'Flaky Tests verlieren Autorität.',detect:['nondeterministic test'],response:'STABILIZE_TEST',bad:['Live API als Unit Test ohne Timeout/fixture.'],good:['Injected clock/fetch stub.']}),

  R({id:'DEPLOY-001',domain:'DEPLOYMENT',severity:'HARD',title:'Änderung läuft über Branch/PR/CI',must:'Signifikante Production-Änderungen werden isoliert, reviewed durch CI und erst dann gemerged.',mustNot:'Keine ungeprüften Direktänderungen auf main für große Features.',why:'Reduziert Regression und erlaubt Rückverfolgung.',detect:['direct large main mutation'],response:'USE_PR_FLOW',bad:['Rulebook direkt auf main ohne CI.'],good:['Feature branch → PR → green CI → merge.']}),
  R({id:'DEPLOY-002',domain:'DEPLOYMENT',severity:'HARD',title:'Merge nur bei grüner Institutional Check',must:'Syntax, Unit/Integration und Docker Packaging müssen erfolgreich sein.',mustNot:'Kein Merge bei red/unstable CI.',why:'CI ist Mindestqualitätsgate.',detect:['mergeWithRedCi','institutional check failed'],response:'BLOCK_MERGE',bad:['Merge trotz failed Unit tests.'],good:['Alle Required Checks success.']}),
  R({id:'DEPLOY-003',domain:'DEPLOYMENT',severity:'HIGH',title:'Docker Packaging wird verifiziert',must:'Produktionsimage muss neue Module/Tests/Assets tatsächlich enthalten.',mustNot:'Keine "works in repo" Änderung, die im Image fehlt.',why:'Build Context kann Dateien auslassen.',detect:['module missing docker image'],response:'FIX_DOCKER_COPY',bad:['Neue .mjs Datei nicht im Dockerfile.'],good:['Packaging smoke test importiert sie.']}),
  R({id:'DEPLOY-004',domain:'DEPLOYMENT',severity:'HIGH',title:'Production Deploy wird live verifiziert',must:'Nach Merge/Deploy müssen Status, Logs und relevante neue Funktion geprüft werden.',mustNot:'Keine Aussage "läuft" nur weil Merge erfolgreich war.',why:'Runtime-Konfiguration kann CI unterscheiden.',detect:['no live verify'],response:'VERIFY_DEPLOYMENT',bad:['PR merged → fertig.'],good:['Railway SUCCESS + relevante Runtime Log/Endpoint.']}),
  R({id:'DEPLOY-005',domain:'DEPLOYMENT',severity:'HIGH',title:'Rollback bleibt möglich',must:'Deployments und State Migrationen müssen rückrollbar oder kompatibel geplant sein.',mustNot:'Keine irreversible Schemaänderung ohne Migrations-/Recoverypfad.',why:'Fehlerhafte Releases müssen sicher zurücknehmbar sein.',detect:['irreversible migration'],response:'ADD_ROLLBACK_PLAN',bad:['Alten State unwiderruflich transformieren.'],good:['Versioned migration + backup/dual read.']}),
  R({id:'DEPLOY-006',domain:'DEPLOYMENT',severity:'HARD',title:'Red CI wird nicht überschrieben',must:'Fehlgeschlagene CI muss behoben werden bevor weiter promoted wird.',mustNot:'Kein Merge wegen Zeitdruck oder "Fehler ist bestimmt egal".',why:'Ein bewusster Bypass entwertet alle Tests.',detect:['red ci ignored'],response:'HARD_BLOCK',bad:['Unit test fail, trotzdem merge.'],good:['Root cause fix, rerun green.']}),
  R({id:'DEPLOY-007',domain:'DEPLOYMENT',severity:'MEDIUM',title:'Commit beschreibt echte Semantik',must:'Commit/PR Text soll tatsächliche Änderung und Safety-Auswirkung beschreiben.',mustNot:'Keine irreführenden Commit-Namen wie "fix" für große Behavior Change.',why:'Historie ist Teil der Governance.',detect:['misleading commit scope'],response:'CLARIFY_CHANGELOG',bad:['misc fixes für Rulebook-Neuarchitektur.'],good:['feat(rulebook): add executable negative-rule constitution.']}),
  R({id:'DEPLOY-008',domain:'DEPLOYMENT',severity:'HIGH',title:'Paralleländerungen werden gegen aktuellen main geprüft',must:'Vor Merge muss Branch mit aktuellem main kompatibel sein.',mustNot:'Keine veraltete Basis mergen, wenn parallel Safety-/Runtime-Code geändert wurde.',why:'Concurrent Chats/Branches sind realer Konfliktfaktor.',detect:['stale base conflict risk'],response:'REBASE_OR_VALIDATE_DIFF',bad:['Feature basiert auf main vor mehreren Safety-Fixes.'],good:['Mergeability + CI gegen aktuellen base.']}),

  R({id:'RES-001',domain:'RESOURCE',severity:'HIGH',title:'Queues sind bounded',must:'In-memory und persistente Arbeitsqueues brauchen harte Größenlimits oder Retention.',mustNot:'Keine unbegrenzt wachsenden Queues.',why:'Langläufer sonst OOM/Storage Exhaustion.',detect:['unbounded queue'],response:'CAP_QUEUE_AND_BACKPRESSURE',bad:['visual queue wächst ohne maxSize.'],good:['maxSize + dedupe.']}),
  R({id:'RES-002',domain:'RESOURCE',severity:'HIGH',title:'Concurrency ist bounded',must:'Parallelität externer Calls und schwerer Jobs hat definierte Obergrenzen.',mustNot:'Keine Promise.all über unbounded Datensätze.',why:'Schützt CPU, Memory und Providerlimits.',detect:['unbounded concurrency'],response:'USE_CONCURRENCY_LIMIT',bad:['10.000 Übersetzungen parallel.'],good:['mapWithConcurrency(...,4).']}),
  R({id:'RES-003',domain:'RESOURCE',severity:'HARD',title:'Externe Calls haben Timeouts',must:'Netzwerk-/Provideraufrufe brauchen realistische Timeouts und Failure Handling.',mustNot:'Keine unendlichen awaits auf externe Dienste.',why:'Ein Provider darf Startup/Loop nicht blockieren.',detect:['external call no timeout'],response:'ADD_TIMEOUT',bad:['fetch() ohne Abort/timeout in kritischem Startup.'],good:['AbortController + bounded retry.']}),
  R({id:'RES-004',domain:'RESOURCE',severity:'HIGH',title:'Caches haben Freshness/Size Policy',must:'Caches brauchen TTL/Freshness und ggf. Größenlimit.',mustNot:'Keine unbegrenzt wachsenden Maps mit ewigen Daten.',why:'Memory Leak und stale data.',detect:['cache no ttl','cache unbounded'],response:'ADD_TTL_OR_CAP',bad:['Headline cache für immer.'],good:['TTL + max entries.']}),
  R({id:'RES-005',domain:'RESOURCE',severity:'HIGH',title:'Memory Pressure führt zu Defer',must:'Schwere Background Jobs müssen bei Memory Pressure pausieren/defer.',mustNot:'Keine Konkurrenz um Speicher bis OOM.',why:'Serving Stability ist wichtiger als Research Throughput.',detect:['memory pressure ignored'],response:'DEFER_BACKGROUND_WORK',bad:['AutoLearn läuft trotz hard memory pressure.'],good:['Hysteresis thresholds + resume below lower bound.']}),

  R({id:'AUDIT-001',domain:'AUDIT',severity:'HIGH',title:'Entscheidungen haben Timestamp und Scope',must:'Wichtige Entscheidungen/Fehler/Promotions/Repairs müssen Zeitpunkt und Scope enthalten.',mustNot:'Keine zeitlosen Logs ohne betroffenen Kontext.',why:'Rekonstruktion braucht Reihenfolge und Verantwortungsbereich.',detect:['audit missing timestamp','audit missing scope'],response:'ENRICH_AUDIT_EVENT',bad:['ERROR: failed.'],good:['2026... scope=discord.news-feed error=403.']}),
  R({id:'AUDIT-002',domain:'AUDIT',severity:'HIGH',title:'Fingerprints schützen semantische Objekte',must:'Regel-, Forecast-, Governance- und wichtige State-Objekte sollen unverwechselbar fingerprinted/versioned sein.',mustNot:'Keine stillen Mutationen auditkritischer Objekte.',why:'Tampering Detection.',detect:['audit object no fingerprint'],response:'ADD_FINGERPRINT',bad:['Candidate review in-place geändert.'],good:['sha256(core) + version.']}),
  R({id:'AUDIT-003',domain:'AUDIT',severity:'HIGH',title:'Logs enthalten Ursachen statt nur Symptome',must:'Fehlerlogs sollen code/status/provider/scope enthalten soweit sicher.',mustNot:'Keine generischen "failed" Logs ohne diagnostischen Kontext.',why:'Self-heal braucht maschinenlesbare Ursachen.',detect:['opaque error log'],response:'ADD_STRUCTURED_CONTEXT',bad:['fetch failed.'],good:['provider=GDELT status=429 strategy=fallback.']}),
  R({id:'AUDIT-004',domain:'AUDIT',severity:'HARD',title:'Audit Logs enthalten keine Secrets',must:'Audit-Details werden vor Speicherung redacted.',mustNot:'Keine Tokens, API Keys, Auth Header oder private Credentials in Logs.',why:'Audit-Historie ist langlebig.',detect:['secret in audit'],response:'REDACT_AND_ROTATE',bad:['Authorization: Bearer ... im Log.'],good:['authorizationPresent:true.']}),
  R({id:'AUDIT-005',domain:'AUDIT',severity:'MEDIUM',title:'Success und Failure sind unterscheidbar',must:'Operationen sollen Erfolg, Failure, Defer, Skip und Recovery outcome separat loggen.',mustNot:'Keine Gleichsetzung "Aktion ausgeführt" mit "Problem gelöst".',why:'Operational Analytics braucht Outcome-Klassen.',detect:['executed treated resolved'],response:'ADD_OUTCOME_STATE',bad:['restart executed = success.'],good:['EXECUTED → VERIFIED_RESOLVED erst nach Health Check.']})
]);

const RULE_INDEX=deepFreeze(Object.fromEntries(BIGGJ_RULEBOOK_RULES.map(r=>[r.id,r])));

export const BIGGJ_RULEBOOK_CORE_FACTS=deepFreeze([
  {ruleId:'TRADING-001',key:'execution',test:v=>v==='SHADOW_ONLY',expected:'SHADOW_ONLY'},
  {ruleId:'TRADING-002',key:'canExecute',test:v=>v===false,expected:false},
  {ruleId:'TRADING-003',key:'canExecuteLive',test:v=>v===false,expected:false},
  {ruleId:'TRADING-004',key:'abstainFirstClass',test:v=>v===true,expected:true},
  {ruleId:'AUTO-002',key:'automaticPrimaryMutation',test:v=>v===false,expected:false},
  {ruleId:'AUTO-003',key:'automaticPromotion',test:v=>v===false,expected:false},
  {ruleId:'AUTO-004',key:'automaticSkillTransition',test:v=>v===false,expected:false},
  {ruleId:'AUTO-007',key:'unboundedLoop',test:v=>v===false,expected:false},
  {ruleId:'DATA-001',key:'pointInTimeRequired',test:v=>v===true,expected:true},
  {ruleId:'EPI-002',key:'evidenceFabrication',test:v=>v===false,expected:false},
  {ruleId:'DATA-004',key:'stalePresentedAsCurrent',test:v=>v===false,expected:false},
  {ruleId:'NEWS-003',key:'unverifiedMarkedVerified',test:v=>v===false,expected:false},
  {ruleId:'PERSIST-004',key:'destructiveRecovery',test:v=>v===false,expected:false},
  {ruleId:'SEC-001',key:'secretsExposed',test:v=>v===false,expected:false},
  {ruleId:'DEPLOY-006',key:'redCiIgnored',test:v=>v===false,expected:false},
  {ruleId:'RES-003',key:'externalCallsHaveTimeouts',test:v=>v===true,expected:true}
]);

function fingerprinted(core){
  return deepFreeze({...core,fingerprint:sha256(core)});
}

export function verifyBiggjRulebook(){
  const reasons=[];
  const ids=new Set();
  for(const rule of BIGGJ_RULEBOOK_RULES){
    if(ids.has(rule.id))reasons.push('DUPLICATE_RULE_ID:'+rule.id);
    ids.add(rule.id);
    if(!BIGGJ_RULEBOOK_DOMAINS[rule.domain])reasons.push('UNKNOWN_DOMAIN:'+rule.id);
    if(!SEVERITIES.has(rule.severity))reasons.push('BAD_SEVERITY:'+rule.id);
    if(!KINDS.has(rule.kind))reasons.push('BAD_KIND:'+rule.id);
    for(const field of ['title','must','mustNot','why','response']){
      if(!String(rule[field]||'').trim())reasons.push('MISSING_'+field.toUpperCase()+':'+rule.id);
    }
    if(!rule.badExamples.length)reasons.push('MISSING_BAD_EXAMPLE:'+rule.id);
    if(!rule.goodExamples.length)reasons.push('MISSING_GOOD_EXAMPLE:'+rule.id);
  }
  for(const check of BIGGJ_RULEBOOK_CORE_FACTS){
    if(!RULE_INDEX[check.ruleId])reasons.push('CORE_FACT_UNKNOWN_RULE:'+check.ruleId);
  }
  return {
    ok:reasons.length===0,
    reasons,
    version:BIGGJ_RULEBOOK_VERSION,
    rules:BIGGJ_RULEBOOK_RULES.length,
    domains:Object.keys(BIGGJ_RULEBOOK_DOMAINS).length,
    hardRules:BIGGJ_RULEBOOK_RULES.filter(r=>r.severity==='HARD').length
  };
}

export function biggjRulebookSummary(){
  const domains={};
  for(const domain of Object.keys(BIGGJ_RULEBOOK_DOMAINS)){
    const rows=BIGGJ_RULEBOOK_RULES.filter(r=>r.domain===domain);
    domains[domain]={
      rules:rows.length,
      hard:rows.filter(r=>r.severity==='HARD').length,
      high:rows.filter(r=>r.severity==='HIGH').length,
      medium:rows.filter(r=>r.severity==='MEDIUM').length
    };
  }
  const core={
    version:BIGGJ_RULEBOOK_VERSION,
    schemaVersion:BIGGJ_RULEBOOK_SCHEMA_VERSION,
    rules:BIGGJ_RULEBOOK_RULES.length,
    domains:Object.keys(BIGGJ_RULEBOOK_DOMAINS).length,
    hardRules:BIGGJ_RULEBOOK_RULES.filter(r=>r.severity==='HARD').length,
    machineCheckedCoreFacts:BIGGJ_RULEBOOK_CORE_FACTS.length,
    byDomain:domains,
    hierarchy:'HARD > HIGH > MEDIUM; downstream may only become stricter',
    defaultFailureMode:'FAIL_CLOSED_FOR_HARD_RULES',
    execution:'SHADOW_ONLY',
    canExecute:false,
    canExecuteLive:false
  };
  return fingerprinted(core);
}

export function getBiggjRule(ruleId){
  const row=RULE_INDEX[String(ruleId||'')];
  return row?clone(row):null;
}

export function searchBiggjRules({domain=null,severity=null,query=''}={}){
  const d=domain?String(domain).toUpperCase():null;
  const s=severity?String(severity).toUpperCase():null;
  const q=String(query||'').trim().toLowerCase();
  return BIGGJ_RULEBOOK_RULES.filter(rule=>{
    if(d&&rule.domain!==d)return false;
    if(s&&rule.severity!==s)return false;
    if(!q)return true;
    const hay=[rule.id,rule.title,rule.must,rule.mustNot,rule.why,...rule.detect,...rule.badExamples,...rule.goodExamples].join(' ').toLowerCase();
    return hay.includes(q);
  }).map(clone);
}

export function evaluateBiggjRulebook({
  facts={},
  explicitViolations=[],
  operation='RUNTIME',
  asOf=Date.now()
}={}){
  const violations=[];
  const checked=[];
  const missing=[];

  for(const check of BIGGJ_RULEBOOK_CORE_FACTS){
    const present=Object.prototype.hasOwnProperty.call(facts,check.key);
    if(!present){
      missing.push({ruleId:check.ruleId,key:check.key});
      continue;
    }
    const actual=facts[check.key];
    const ok=Boolean(check.test(actual));
    checked.push({ruleId:check.ruleId,key:check.key,ok,actual,expected:check.expected});
    if(!ok){
      const rule=RULE_INDEX[check.ruleId];
      violations.push({
        ruleId:check.ruleId,
        domain:rule.domain,
        severity:rule.severity,
        title:rule.title,
        reason:'CORE_FACT_VIOLATION',
        key:check.key,
        actual,
        expected:check.expected,
        response:rule.response
      });
    }
  }

  for(const raw of arr(explicitViolations)){
    const v=typeof raw==='string'?{ruleId:raw}:{...raw};
    const rule=RULE_INDEX[String(v.ruleId||'')];
    if(!rule){
      violations.push({
        ruleId:String(v.ruleId||'UNKNOWN_RULE'),
        domain:'META',
        severity:'HIGH',
        title:'Unknown explicit violation',
        reason:String(v.reason||'UNKNOWN_RULE_REFERENCE'),
        response:'REVIEW_RULEBOOK_INTEGRATION'
      });
      continue;
    }
    violations.push({
      ruleId:rule.id,
      domain:rule.domain,
      severity:rule.severity,
      title:rule.title,
      reason:String(v.reason||'EXPLICIT_VIOLATION'),
      detail:v.detail??null,
      response:rule.response
    });
  }

  const dedup=[];
  const seen=new Set();
  for(const v of violations){
    const key=v.ruleId+'|'+String(v.reason)+'|'+String(v.key||'');
    if(seen.has(key))continue;
    seen.add(key);
    dedup.push(v);
  }

  const hard=dedup.filter(v=>v.severity==='HARD');
  const high=dedup.filter(v=>v.severity==='HIGH');
  const state=hard.length?'BLOCKED':high.length?'CAUTION':'PASS';
  const action=hard.length?'ABSTAIN':high.length?'CONTINUE_WITH_CAUTION':'CONTINUE_SHADOW_RESEARCH';

  return fingerprinted({
    version:BIGGJ_RULEBOOK_VERSION,
    operation:String(operation||'RUNTIME'),
    evaluatedAt:Number(asOf)||Date.now(),
    state,
    action,
    violations:dedup,
    counts:{
      checked:checked.length,
      passed:checked.filter(x=>x.ok).length,
      failed:dedup.length,
      hard:hard.length,
      high:high.length,
      missingCoreFacts:missing.length
    },
    coverage:{
      coreFactsTotal:BIGGJ_RULEBOOK_CORE_FACTS.length,
      coreFactsObserved:checked.length,
      coreFactsMissing:missing,
      semanticRulesTotal:BIGGJ_RULEBOOK_RULES.length,
      note:'Rulebook is canonical; only listed core facts are machine-evaluated generically. Domain modules must attach explicit violations for semantic rules.'
    },
    checked,
    execution:'SHADOW_ONLY',
    canExecute:false,
    canExecuteLive:false
  });
}

export function evaluateBiggjRuntimeRulebook({
  health={},
  newsEvents=null,
  asOf=Date.now(),
  newsFreshnessMs=10*60_000
}={}){
  const now=Number(asOf)||Date.now();
  const kernel=health?.institutionalKernel||{};
  const operator=health?.autonomousOperator||{};
  const governance=health?.governanceTriage||{};
  const globalIntel=health?.globalIntel||{};
  const memecoin=health?.memecoinRadar||{};
  const discord=health?.discordBridge||{};
  const readiness=health?.operationalReadiness||{};
  const events=arr(newsEvents??globalIntel?.recent);
  const explicitViolations=[];

  const facts={
    execution:kernel.execution??operator.execution??governance.execution,
    canExecute:kernel.canExecute??operator.canExecute??governance.canExecute,
    canExecuteLive:operator.canExecuteLive??governance.canExecuteLive,
    abstainFirstClass:true,
    automaticPrimaryMutation:operator.automaticPrimaryMutation??governance.automaticProductionMutation,
    automaticPromotion:operator.automaticPromotion??governance.automaticPromotion,
    automaticSkillTransition:operator.automaticSkillTransition??governance.automaticSkillTransition,
    pointInTimeRequired:true
  };

  for(const event of events){
    const availableAt=Number(event?.availableAt||event?.timestamp||0);
    if(Number.isFinite(availableAt)&&availableAt>now+5000){
      explicitViolations.push({
        ruleId:'DATA-001',
        reason:'FUTURE_DATED_NEWS_EVENT_IN_RUNTIME',
        detail:String(event?.id||event?.title||'UNKNOWN_EVENT')+' availableAt='+availableAt+' > asOf='+now
      });
    }
    if(event?.verified===true&&Number(event?.independentConfirmation||0)<=0){
      explicitViolations.push({
        ruleId:'NEWS-003',
        reason:'VERIFIED_WITHOUT_RECORDED_INDEPENDENT_CONFIRMATION',
        detail:String(event?.id||event?.title||'UNKNOWN_EVENT')
      });
    }
  }

  const lastNews=Number(globalIntel?.lastRefreshAt||0);
  if(globalIntel?.sourceReady===true&&lastNews>0&&now-lastNews>Math.max(60_000,Number(newsFreshnessMs)||600_000)){
    explicitViolations.push({
      ruleId:'DATA-004',
      reason:'LIVE_NEWS_SOURCE_READY_BUT_STALE',
      detail:'lastRefreshAgeMs='+(now-lastNews)
    });
  }

  const memeRows=arr(memecoin?.rows);
  if(memeRows.some(row=>!String(row?.chainId||'').trim()||!String(row?.tokenAddress||'').trim())){
    explicitViolations.push({
      ruleId:'MEME-003',
      reason:'MEMECOIN_ROW_WITHOUT_CHAIN_ADDRESS_IDENTITY',
      detail:'At least one memecoin radar row lacks chainId or tokenAddress.'
    });
  }

  if(discord?.enabled!==false){
    const coverage=Number(discord?.channelManagerCoverage);
    if(Number.isFinite(coverage)&&coverage<1){
      explicitViolations.push({
        ruleId:'CH-001',
        reason:'CHANNEL_MANAGER_COVERAGE_INCOMPLETE',
        detail:'coverage='+coverage
      });
    }
    if(String(discord?.channelManagerMetaStatus||'').toUpperCase()==='BLIND_SPOTS'){
      explicitViolations.push({
        ruleId:'CH-001',
        reason:'CHANNEL_MANAGER_META_SUPERVISOR_BLIND_SPOTS',
        detail:'Meta supervisor reports blind spots.'
      });
    }
  }

  if(readiness?.ready===true&&arr(readiness?.hardReasons).length){
    explicitViolations.push({
      ruleId:'OPS-001',
      reason:'READY_WITH_HARD_READINESS_REASONS',
      detail:arr(readiness.hardReasons).slice(0,8).join(' | ')
    });
  }

  const assessment=evaluateBiggjRulebook({
    facts,
    explicitViolations,
    operation:'RUNTIME_CONSTITUTION',
    asOf:now
  });
  return fingerprinted({
    ...assessment,
    source:'OBSERVED_RUNTIME_PLUS_FIXED_CONSTITUTION',
    runtimeSignals:{
      newsEventsChecked:events.length,
      memecoinRowsChecked:memeRows.length,
      channelManagerCoverage:Number.isFinite(Number(discord?.channelManagerCoverage))?Number(discord.channelManagerCoverage):null,
      readinessReady:readiness?.ready===true,
      newsSourceReady:globalIntel?.sourceReady===true
    },
    note:'PASS bedeutet: alle beobachteten maschinenprüfbaren Invarianten sind aktuell erfüllt. Nicht beobachtbare semantische Regeln bleiben weiterhin als feste Policy aktiv.'
  });
}

export function assertBiggjRulebookAdmission(input={}){
  const result=evaluateBiggjRulebook(input);
  if(result.state==='BLOCKED'){
    const err=new Error('BIGGJ_RULEBOOK_BLOCKED:'+result.violations.map(v=>v.ruleId).join(','));
    err.code='BIGGJ_RULEBOOK_BLOCKED';
    err.rulebook=result;
    throw err;
  }
  return result;
}

export function biggjRulebookInstructionPacket({domains=null}={}){
  const wanted=domains?new Set(arr(domains).map(x=>String(x).toUpperCase())):null;
  const rows=BIGGJ_RULEBOOK_RULES.filter(r=>!wanted||wanted.has(r.domain));
  return deepFreeze({
    version:BIGGJ_RULEBOOK_VERSION,
    instruction:'For every proposed action: identify applicable rules; check both MUST and MUST NOT; prefer ABSTAIN/DEGRADE over inventing missing evidence; cite violated Rule-IDs; never weaken a HARD rule downstream.',
    rules:rows.map(r=>({
      id:r.id,
      domain:r.domain,
      severity:r.severity,
      must:r.must,
      mustNot:r.mustNot,
      response:r.response,
      badExamples:r.badExamples,
      goodExamples:r.goodExamples
    })),
    execution:'SHADOW_ONLY',
    canExecute:false,
    canExecuteLive:false
  });
}


export function renderBiggjRulebookMarkdown(){
  const lines=[
    '# BIGGJ INTERNAL RULEBOOK',
    '',
    '**Version:** '+BIGGJ_RULEBOOK_VERSION,
    '',
    '**Hierarchie:** HARD > HIGH > MEDIUM. Downstream darf nur gleich streng oder strenger werden.',
    '',
    'Das Rulebook beschreibt für jede Regel sowohl den Sollzustand als auch den expliziten Nicht-Sollzustand.',
    ''
  ];
  for(const [domain,description] of Object.entries(BIGGJ_RULEBOOK_DOMAINS)){
    lines.push('## '+domain,'',String(description),'');
    for(const rule of BIGGJ_RULEBOOK_RULES.filter(x=>x.domain===domain)){
      lines.push('### '+rule.id+' · '+rule.title,'');
      lines.push('- **Severity:** '+rule.severity);
      lines.push('- **Art:** '+rule.kind);
      lines.push('- **MUSS:** '+rule.must);
      lines.push('- **DARF NICHT:** '+rule.mustNot);
      lines.push('- **WARUM:** '+rule.why);
      lines.push('- **ERKENNUNG:** '+(rule.detect.length?rule.detect.join(' · '):'manueller/semantischer Audit'));
      lines.push('- **REAKTION:** '+rule.response);
      if(rule.badExamples.length)lines.push('- **Negativbeispiel:** '+rule.badExamples.join(' · '));
      if(rule.goodExamples.length)lines.push('- **Gutes Gegenbeispiel:** '+rule.goodExamples.join(' · '));
      lines.push('');
    }
  }
  return lines.join('\n');
}
