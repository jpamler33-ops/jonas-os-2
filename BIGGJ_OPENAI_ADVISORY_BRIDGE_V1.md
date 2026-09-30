# BIGGJ OpenAI Advisory Bridge V1

## Zweck

BIGGJ kann einen OpenAI-Reasoning-Endpoint als **externen Advisory Layer** ansprechen. Die Bridge liefert strukturierte Beratung für Forschung, Diagnose und Engineering, aber sie bekommt **keinen** Ausführungspfad.

## Sicherheitsgrenzen

Unverändert und hart:

- `SHADOW_ONLY`
- `canExecute:false`
- `canExecuteLive:false`
- `ABSTAIN` bleibt vollwertig
- Point-in-Time / keine Future Leakage
- `OBSERVED / INFERRED / MODELLED / ASSUMED` bleiben getrennt
- AI-Antworten dürfen PRIMARY Policy, Promotions oder wissenschaftliche Guards nicht automatisch verändern

Kontext wird vor dem Versand rekursiv auf typische Secret-Felder und Secret-Muster geprüft. Responses werden mit `store:false` angefordert.

## Schnittstellen

### Telegram

`/ai <frage>` oder `/chatgpt <frage>`

Die Anfrage erhält einen kompakten Systemkontext aus Mission Control. Nur bereits zugelassene Telegram-Chats erreichen den Command Router.

### HTTP

- `GET /ai/status.json` – nur nicht-sensitive Statusdaten
- `POST /ai/ask` – strukturierte Advisory-Anfrage

`POST /ai/ask` erfordert `Authorization: Bearer <BIGGJ_AI_BRIDGE_TOKEN>` oder `x-biggj-ai-token`.

Beispiel-Body:

```json
{
  "question": "Welche Forschungslücke blockiert uns gerade am stärksten?",
  "context": {
    "optional": "zusätzlicher Kontext"
  }
}
```

## Konfiguration

- `OPENAI_API_KEY` – erforderlich, sonst bleibt die Bridge deaktiviert
- `BIGGJ_AI_MODEL` – Default `gpt-5.6`
- `BIGGJ_AI_BRIDGE_TOKEN` – erforderlich für den HTTP-POST-Endpunkt
- `BIGGJ_AI_TIMEOUT_MS` – Default 30000
- `BIGGJ_AI_MAX_REQUESTS_PER_MINUTE` – Default 6
- `BIGGJ_AI_REASONING_EFFORT` – Default `medium`

Die OpenAI API ist getrennt von einem ChatGPT-Abonnement und benötigt einen API-Key mit API-Billing.
