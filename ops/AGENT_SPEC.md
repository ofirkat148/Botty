# Botty Agent Specification

Botty acts as the orchestrator. Agents are domain-specific data services.
This document is the contract every agent must follow.

---

## Two rules

### 1. Speak A2A

Every agent must implement the Google A2A protocol:

**Discovery** — `GET /.well-known/agent.json`

Returns an Agent Card:
```json
{
  "name": "My Agent",
  "description": "What this agent does",
  "url": "http://localhost:7003/",
  "version": "1.0.0",
  "defaultInputModes": ["text/plain"],
  "defaultOutputModes": ["text/plain"],
  "capabilities": { "streaming": false },
  "skills": [{ "id": "query", "name": "Query", "description": "..." }],
  "metadata": {
    "command": "my-agent",
    "systemPrompt": "You are My Agent. ..."
  }
}
```

**Task endpoint** — `POST /`

Receives A2A `tasks/send` JSON-RPC:
```json
{
  "jsonrpc": "2.0", "id": "abc", "method": "tasks/send",
  "params": {
    "id": "abc",
    "message": { "role": "user", "parts": [{ "type": "text", "text": "show portfolio" }] }
  }
}
```

Returns:
```json
{
  "jsonrpc": "2.0", "id": "abc",
  "result": {
    "id": "abc",
    "status": { "state": "completed" },
    "artifacts": [{ "parts": [{ "type": "text", "text": "[My Agent — live data]\n\n..." }] }],
    "model": "my-agent",
    "tokensUsed": 0
  }
}
```

**Health check** — `GET /health` returns `{ "status": "ok" }`. No other data needed.

---

### 2. No LLM inside the adapter

The agent's job is to **fetch domain data and return it as structured text**.
Botty's LLM (Groq, Gemini, Claude, local) receives that text and writes the reply.

**Do:**
- Query a database or API
- Format rows as readable text
- Dispatch by keyword to different fetchers
- Return instantly with `tokensUsed: 0`

**Do not:**
- Call Gemini, OpenAI, Anthropic, Ollama, or any other LLM
- Store API keys in the adapter or its systemd unit
- Implement fallback chains, quota handling, or retry logic

Violating this rule means:
- Two LLMs run in sequence (slow, expensive)
- API keys and quota failures live outside Botty (invisible, hard to debug)
- If the agent's LLM is down, Botty gets a 500 instead of data

---

## Template

Copy `ezra-agent/botty_adapter.py` or `polymarket-alpha/botty_adapter.py` as a starting point.

The only parts to change per agent:
1. `name`, `description`, `command`, `systemPrompt` in the Agent Card
2. `PORT` environment variable default
3. The data fetcher functions and dispatch table in `_build_context()`
4. The `[Agent Name — live data]` prefix in the response text

Everything else (A2A envelope, Flask setup, systemd unit shape) is identical.

---

## Registering with Botty

1. Run the adapter: `python3 botty_adapter.py` (or via systemd)
2. In Botty → Settings → Agents → scan, or add manually:
   - Executor type: **Local agent**
   - Endpoint: `http://localhost:<PORT>/`
3. Botty reads the Agent Card and creates the agent entry automatically on scan.

---

## Port allocation

| Port | Agent |
|------|-------|
| 7001 | Ezra |
| 7002 | Polymarket Alpha |
| 7003+ | Future agents |
