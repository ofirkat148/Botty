# Botty Routing Logic — Reference for Ezra

All the relevant code lives in `server/utils/llm.ts`.

---

## 1. Prompt Classifier

Keyword regex, no ML needed. ~20 lines of code.

```typescript
export function classifyPrompt(prompt: string) {
  const lower = prompt.trim().toLowerCase();
  const wordCount = lower.split(/\s+/).filter(Boolean).length;
  const isCodeHeavy = /code|debug|refactor|typescript|javascript|react|sql|query|stack trace|traceback|bug|architecture|implement|fix/.test(lower);
  const isAnalysisHeavy = /analyze|analysis|compare|reason|tradeoff|explain|design|plan/.test(lower);
  const isLightweight = wordCount > 0 && wordCount <= 18 && /summarize|rewrite|translate|title|tagline|grammar|short|brief/.test(lower);
  const isShortConversational = wordCount > 0 && wordCount <= 10 && !isCodeHeavy && !isAnalysisHeavy;

  return {
    wordCount,
    prefersReasoning: isCodeHeavy || isAnalysisHeavy || wordCount > 120,
    isLightweight,
    isShortConversational,
  };
}
```

**Python equivalent** (direct port):

```python
import re

def classify_prompt(prompt: str) -> dict:
    lower = prompt.strip().lower()
    words = [w for w in lower.split() if w]
    word_count = len(words)

    is_code_heavy = bool(re.search(
        r'code|debug|refactor|typescript|javascript|react|sql|query|stack trace|traceback|bug|architecture|implement|fix',
        lower
    ))
    is_analysis_heavy = bool(re.search(
        r'analyze|analysis|compare|reason|tradeoff|explain|design|plan', lower
    ))
    is_lightweight = 0 < word_count <= 18 and bool(re.search(
        r'summarize|rewrite|translate|title|tagline|grammar|short|brief', lower
    ))
    is_short_conversational = 0 < word_count <= 10 and not is_code_heavy and not is_analysis_heavy

    return {
        'word_count': word_count,
        'prefers_reasoning': is_code_heavy or is_analysis_heavy or word_count > 120,
        'is_lightweight': is_lightweight,
        'is_short_conversational': is_short_conversational,
    }
```

---

## 2. Model Selector

Driven by the classifier output + a routing mode flag.

```typescript
export function getSuggestedModel(
  provider: string,
  prompt: string,
  options?: { preferQuality?: boolean; preferFast?: boolean }
) {
  if (provider === 'anthropic') {
    if (options?.preferFast) return 'claude-3-5-haiku-latest';
    return classifyPrompt(prompt).prefersReasoning
      ? 'claude-3-7-sonnet-latest'
      : 'claude-3-5-haiku-latest';
  }
  if (provider === 'google') {
    if (options?.preferFast) return 'gemini-2.5-flash';
    return options?.preferQuality && classifyPrompt(prompt).prefersReasoning
      ? 'gemini-2.5-pro'
      : 'gemini-2.5-flash';
  }
  if (provider === 'openai') {
    if (options?.preferFast) return 'gpt-4o-mini';
    return options?.preferQuality && classifyPrompt(prompt).prefersReasoning
      ? 'gpt-4o'
      : 'gpt-4o-mini';
  }
  if (provider === 'local') {
    return options?.defaultLocalModel or 'qwen2.5:3b';
  }
}
```

**Python equivalent**:

```python
def get_suggested_model(provider: str, prompt: str, prefer_quality=False, prefer_fast=False, default_local_model=None) -> str:
    classification = classify_prompt(prompt)
    prefers_reasoning = classification['prefers_reasoning']

    if provider == 'anthropic':
        if prefer_fast:
            return 'claude-3-5-haiku-latest'
        return 'claude-3-7-sonnet-latest' if prefers_reasoning else 'claude-3-5-haiku-latest'

    if provider == 'google':
        if prefer_fast:
            return 'gemini-2.5-flash'
        return 'gemini-2.5-pro' if (prefer_quality and prefers_reasoning) else 'gemini-2.5-flash'

    if provider == 'openai':
        if prefer_fast:
            return 'gpt-4o-mini'
        return 'gpt-4o' if (prefer_quality and prefers_reasoning) else 'gpt-4o-mini'

    if provider == 'local':
        return default_local_model or 'qwen2.5:3b'

    return 'gpt-4o-mini'  # fallback
```

---

## 3. Routing Modes

User-selectable in settings. Maps cleanly to the two flags above.

| Mode | `prefer_fast` | `prefer_quality` |
|------|:---:|:---:|
| `auto` | False | False |
| `fastest` | True | False |
| `cheapest` | True | False |
| `best-quality` | False | True |
| `local-first` | — | — | ← tries local provider first, falls back to cloud |

---

## 4. Preferred Local Models (priority-ordered)

Botty probes Ollama's `/api/tags` endpoint and returns whichever of these are installed, in this order:

```python
PREFERRED_LOCAL_MODELS = [
    'qwen2.5:3b',
    'mistral:v0.3',
    'qwen2.5:1.5b',
    'llama3.2:1b',
    'gemma3:1b',
    'smollm2:135m',
]
```

---

## 5. Ollama Model Discovery

Botty probes `/api/tags` to detect what's installed — no hardcoded model names needed at startup.

```python
import httpx

OLLAMA_URL = 'http://localhost:11434'

def get_local_models(ollama_url=OLLAMA_URL) -> list[str]:
    try:
        response = httpx.get(f'{ollama_url}/api/tags', timeout=5)
        response.raise_for_status()
        installed = [m['name'] for m in response.json().get('models', []) if m.get('name')]
        # Return preferred models first, then the rest
        ordered = [m for m in PREFERRED_LOCAL_MODELS if m in installed]
        ordered += [m for m in installed if m not in PREFERRED_LOCAL_MODELS]
        return ordered or ['qwen2.5:3b']
    except Exception:
        return ['qwen2.5:3b']
```

---

## 6. Provider Availability Check

Botty checks env vars first, then DB-stored encrypted keys, then pings Ollama:

```python
import os

def get_available_providers() -> list[str]:
    available = []
    if os.getenv('ANTHROPIC_API_KEY'):
        available.append('anthropic')
    if os.getenv('GEMINI_API_KEY') or os.getenv('GOOGLE_API_KEY'):
        available.append('google')
    if os.getenv('OPENAI_API_KEY'):
        available.append('openai')
    if get_local_models():  # pings Ollama
        available.append('local')
    return available
```

---

## Summary: What's Worth Porting to Ezra

| Botty piece | Effort to port | Value |
|-------------|---------------|-------|
| `classify_prompt` | 15 min | High — removes need for intent ML |
| `get_suggested_model` | 15 min | High — clean model selection per provider |
| Routing mode enum (`fastest`/`best-quality`/etc.) | 10 min | Medium — good UX pattern |
| Ollama `/api/tags` discovery | 10 min | High — dynamic, no hardcoded model names |
| Provider availability check | 10 min | Low — Ezra probably already does this |
