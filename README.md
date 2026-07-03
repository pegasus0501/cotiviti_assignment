# Healthcare Policy Analyzer POC

This proof of concept demonstrates Topic 3 from the Cotiviti intern assessment:
content management in health care, including conversion of written policy into
rules, features, and structured outputs.

## What the POC Does

The app accepts an old and new version of a healthcare policy and produces:

- A concise policy summary
- Extracted CPT/HCPCS-like codes, effective dates, populations, prior
  authorization requirements, documentation requirements, and exclusions
- Sentence-level policy version changes
- Draft rules in JSON, if/then, and Python-like formats
- Validation checks that show why human analyst approval is still required
- Optional OpenAI-powered summarization and structured extraction

The POC can run in deterministic mode without any API key. It also includes an
optional OpenAI mode for AI-generated summaries, extracted requirements,
version-change analysis, and draft rule logic. The sample policies are
synthetic and do not contain patient data.

## Why This Is Useful for Cotiviti

Cotiviti works in areas such as payment accuracy, payer analytics, quality, risk
adjustment, and operational improvement. Payer teams often need to read long
medical policies, compare policy updates, and translate policy language into
claims review logic. This POC shows how a policy intelligence workflow could
reduce manual review time, improve consistency, and preserve source traceability
before an analyst approves operational rules.

## How to Run

Option 1: deterministic mode only. Open the file directly in a browser:

```bash
open policy-analyzer/index.html
```

Option 2: deterministic mode only. Run a local static server from the project root:

```bash
python3 -m http.server 8000
```

Then visit:

```text
http://localhost:8000/policy-analyzer/
```

Option 3: deterministic mode plus automatic OpenAI mode. First create a local
`.env` file:

```bash
cp policy-analyzer/.env.example policy-analyzer/.env
open -e policy-analyzer/.env
```

Add your real key:

```bash
OPENAI_API_KEY=sk-your-real-key-here
```

Then run the included local server from the project root:

```bash
python3 policy-analyzer/server.py
```

Then visit:

```text
http://127.0.0.1:8765/policy-analyzer/
```

When `policy-analyzer/.env` contains `OPENAI_API_KEY`, the app automatically
uses OpenAI analysis through the local server. If no key is configured, it falls
back to deterministic analysis. The `.env` file is ignored by Git and should not
be committed.

## Demo Flow

1. Click `Load Sample Policies`.
2. Review the old and new policy text.
3. Click `Analyze Policy`.
4. Show the executive summary.
5. Show extracted requirements.
6. Show version changes.
7. Show draft rules in JSON, if/then, and Python formats.
8. Show validation controls and mark the draft as analyst approved.

## Implementation Notes

The app is a dependency-free static prototype:

- `index.html` defines the workflow and result panels.
- `styles.css` provides the dashboard UI.
- `app.js` performs summarization, extraction, comparison, rule generation, and
  validation.
- `server.py` serves the app and proxies optional OpenAI analysis requests to
  the OpenAI Responses API.

The rule outputs are drafts. In a real payer setting, they would need source
traceability, schema validation, deterministic rule checks, version control, and
human approval before use in claims or prior authorization workflows.
