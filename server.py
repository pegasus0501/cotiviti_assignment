import json
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


APP_DIR = Path(__file__).resolve().parent
ROOT = APP_DIR.parent
PORT = 8765
DEFAULT_MODEL = "gpt-4.1-mini"


ANALYSIS_SCHEMA = {
    "summary": "A concise business summary for a payer policy analyst.",
    "requirements": {
        "codes": ["CPT or HCPCS-like codes"],
        "effective_dates": ["Detected effective dates"],
        "populations": ["Member populations or plan types"],
        "prior_authorization": ["Prior authorization requirements"],
        "documentation": ["Documentation requirements"],
        "coverage_exclusions": ["Coverage requirements and exclusions"],
    },
    "changes": [
        {
            "type": "added | removed | changed",
            "text": "Use for added or removed items.",
            "removed": "Use for changed old text.",
            "added": "Use for changed new text.",
        }
    ],
    "rules": [
        {
            "rule_id": "AUTH-001",
            "rule_name": "Short descriptive name",
            "source_text": "Exact policy sentence supporting the draft rule",
            "output_format": "json_logic_tree",
            "conditions": [
                {"field": "procedure_code", "operator": "in", "value": ["27447"]}
            ],
            "action": "flag_for_review",
            "review_required": True,
        }
    ],
    "validations": [
        {
            "level": "pass | warn | fail",
            "label": "Short validation label",
            "detail": "Why this matters before operational use",
        }
    ],
}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        if self.path == "/api/status":
            self.send_json(
                200,
                {
                    "ai_available": bool(get_openai_api_key()),
                    "model": os.environ.get("OPENAI_MODEL", DEFAULT_MODEL),
                },
            )
            return

        super().do_GET()

    def do_POST(self):
        if self.path != "/api/analyze":
            self.send_error(404, "Not found")
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length))
            result = analyze_with_openai(payload)
            self.send_json(200, result)
        except ValueError as exc:
            self.send_json(400, {"error": str(exc)})
        except HTTPError as exc:
            details = exc.read().decode("utf-8", errors="replace")
            self.send_json(exc.code, {"error": f"OpenAI API error: {details}"})
        except URLError as exc:
            self.send_json(502, {"error": f"Could not reach OpenAI API: {exc.reason}"})
        except Exception as exc:
            self.send_json(500, {"error": f"Server error: {exc}"})

    def send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def analyze_with_openai(payload):
    api_key = get_openai_api_key()
    old_policy = (payload.get("old_policy") or "").strip()
    new_policy = (payload.get("new_policy") or "").strip()
    model = (payload.get("model") or os.environ.get("OPENAI_MODEL") or DEFAULT_MODEL).strip()

    if not api_key:
        raise ValueError("Missing OpenAI API key.")
    if not new_policy:
        raise ValueError("Missing policy text.")

    prompt = f"""
You are helping build a healthcare payer policy-to-rule proof of concept.

Analyze the old and new policy versions. Return ONLY valid JSON matching this
shape:
{json.dumps(ANALYSIS_SCHEMA, indent=2)}

Rules:
- Use the new policy as the target policy.
- Extract requirements useful for payer operations, claims review, prior
  authorization, payment integrity, and auditability.
- If old and new policies differ, list sentence-level changes.
- Draft rules must be reviewable, not final payment decisions.
- Include source_text for each rule.
- Keep the summary concise and business-oriented.

Old policy:
{old_policy or "[No old policy provided]"}

New policy:
{new_policy}
""".strip()

    request_body = {
        "model": model,
        "input": prompt,
        "temperature": 0.2,
        "max_output_tokens": 1800,
    }
    request = Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(request_body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    with urlopen(request, timeout=45) as response:
        data = json.loads(response.read().decode("utf-8"))

    output_text = extract_output_text(data)
    analysis = parse_json_output(output_text)
    return {"model": model, "analysis": analysis}


def get_openai_api_key():
    if os.environ.get("OPENAI_API_KEY"):
        return os.environ["OPENAI_API_KEY"].strip()

    env_path = APP_DIR / ".env"
    if not env_path.exists():
        return ""

    for line in env_path.read_text(encoding="utf-8").splitlines():
        clean = line.strip()
        if not clean or clean.startswith("#") or "=" not in clean:
            continue
        key, value = clean.split("=", 1)
        if key.strip() == "OPENAI_API_KEY":
            return value.strip().strip('"').strip("'")
    return ""


def extract_output_text(response_data):
    if response_data.get("output_text"):
        return response_data["output_text"]

    chunks = []
    for item in response_data.get("output", []):
        for content in item.get("content", []):
            text = content.get("text")
            if text:
                chunks.append(text)
    if not chunks:
        raise ValueError("OpenAI response did not include text output.")
    return "\n".join(chunks)


def parse_json_output(text):
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        cleaned = cleaned.removeprefix("json").strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Model returned non-JSON output: {exc}") from exc


def main():
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Serving Policy Analyzer at http://127.0.0.1:{PORT}/")
    print("Press Ctrl+C to stop.")
    server.serve_forever()


if __name__ == "__main__":
    main()
