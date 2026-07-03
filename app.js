const sampleOldPolicy = `Total knee arthroplasty policy, version 2025. This policy applies to commercial and Medicare Advantage members.

Procedure code 27447 is covered when the member has severe osteoarthritis of the knee and conservative therapy has failed for at least 12 weeks. Prior authorization is required before the date of service.

Documentation must include office notes, imaging results, conservative treatment history, and functional limitation. Claims submitted without required documentation may be flagged for medical necessity review.

Exclusions: procedure code 27447 is not covered for investigational implant systems or cosmetic indications. The policy is effective January 1, 2025.`;

const sampleNewPolicy = `Total knee arthroplasty policy, version 2026. This policy applies to commercial, Medicare Advantage, and marketplace members.

Procedure codes 27447 and 27446 are covered when the member has severe osteoarthritis of the knee and conservative therapy has failed for at least 12 weeks. Prior authorization is required before the date of service and must be attached to the claim record.

Documentation must include office notes, imaging results, conservative treatment history, functional limitation, and a shared decision-making attestation. Claims submitted without required documentation or missing prior authorization may be flagged for medical necessity review.

Exclusions: procedure codes 27447 and 27446 are not covered for investigational implant systems, cosmetic indications, or procedures performed before the effective date. The policy is effective January 1, 2026.`;

const fields = {
  oldPolicy: document.querySelector("#oldPolicy"),
  newPolicy: document.querySelector("#newPolicy"),
  summaryOutput: document.querySelector("#summaryOutput"),
  requirementsOutput: document.querySelector("#requirementsOutput"),
  changesOutput: document.querySelector("#changesOutput"),
  rulesOutput: document.querySelector("#rulesOutput"),
  validationOutput: document.querySelector("#validationOutput"),
  coverageScore: document.querySelector("#coverageScore"),
  changeCount: document.querySelector("#changeCount"),
  ruleCount: document.querySelector("#ruleCount"),
  approvalStatus: document.querySelector("#approvalStatus"),
};

let currentAnalysis = null;
let currentRuleView = "json";
let aiAvailable = false;
let aiModel = "gpt-4.1-mini";

document.querySelector("#loadSampleBtn").addEventListener("click", () => {
  fields.oldPolicy.value = sampleOldPolicy;
  fields.newPolicy.value = sampleNewPolicy;
  runAnalysis();
});

document.querySelector("#analyzeBtn").addEventListener("click", runAnalysis);

document.querySelector("#approveBtn").addEventListener("click", () => {
  fields.approvalStatus.textContent = "Approved";
  fields.approvalStatus.style.color = "var(--green)";
  if (currentAnalysis) {
    currentAnalysis.approved = true;
    renderValidation(currentAnalysis);
  }
});

document.querySelectorAll("[data-rule-view]").forEach((button) => {
  button.addEventListener("click", () => {
    currentRuleView = button.dataset.ruleView;
    document.querySelectorAll("[data-rule-view]").forEach((item) => {
      item.classList.toggle("active", item === button);
    });
    if (currentAnalysis) {
      renderRules(currentAnalysis.rules);
    }
  });
});

document.querySelectorAll("[data-copy-target]").forEach((button) => {
  button.addEventListener("click", async () => {
    const target = document.querySelector(`#${button.dataset.copyTarget}`);
    const text = target.innerText || target.textContent;
    await navigator.clipboard.writeText(text.trim());
    button.textContent = "Copied";
    setTimeout(() => {
      button.textContent = "Copy";
    }, 1200);
  });
});

async function runAnalysis() {
  const oldText = fields.oldPolicy.value.trim();
  const newText = fields.newPolicy.value.trim();
  const targetText = newText || oldText;

  if (!targetText) {
    renderEmpty();
    return;
  }

  if (aiAvailable) {
    await runAiAnalysis(oldText, targetText);
    return;
  }

  const oldAnalysis = analyzePolicy(oldText);
  const newAnalysis = analyzePolicy(targetText);
  const changes = comparePolicies(oldText, targetText);
  const rules = generateRules(newAnalysis);
  const validations = validateAnalysis(newAnalysis, rules, changes);

  currentAnalysis = {
    oldAnalysis,
    newAnalysis,
    changes,
    rules,
    validations,
    approved: false,
  };

  fields.approvalStatus.textContent = "Needs review";
  fields.approvalStatus.style.color = "";
  renderSummary(newAnalysis, changes);
  renderRequirements(newAnalysis);
  renderChanges(changes);
  renderRules(rules);
  renderValidation(currentAnalysis);
  updateStatus(newAnalysis, changes, rules);
}

async function runAiAnalysis(oldText, newText) {
  setBusy(true);

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ old_policy: oldText, new_policy: newText, model: aiModel }),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "AI analysis failed.");
    }

    renderAiAnalysis(payload.analysis);
  } catch (error) {
    console.warn("OpenAI analysis failed; falling back to deterministic mode.", error);
    aiAvailable = false;
    runAnalysis();
  } finally {
    setBusy(false);
  }
}

function renderAiAnalysis(analysis) {
  const rules = Array.isArray(analysis.rules) ? analysis.rules : [];
  const changes = Array.isArray(analysis.changes) ? analysis.changes : [];
  const requirements = normalizeAiRequirements(analysis.requirements || {});
  const validations = Array.isArray(analysis.validations) ? analysis.validations : [];

  currentAnalysis = {
    ai: true,
    requirements,
    changes,
    rules,
    validations,
    approved: false,
  };

  fields.approvalStatus.textContent = "Needs review";
  fields.approvalStatus.style.color = "";
  fields.summaryOutput.innerHTML = `<p>${escapeHtml(analysis.summary || "No summary returned.")}</p>`;
  renderAiRequirements(requirements);
  renderChanges(changes);
  renderRules(rules);
  renderValidation(currentAnalysis);
  updateAiStatus(requirements, changes, rules);
}

function normalizeAiRequirements(requirements) {
  return {
    codes: arrayify(requirements.codes),
    effective_dates: arrayify(requirements.effective_dates),
    populations: arrayify(requirements.populations),
    prior_authorization: arrayify(requirements.prior_authorization),
    documentation: arrayify(requirements.documentation),
    coverage_exclusions: arrayify(requirements.coverage_exclusions),
  };
}

function renderAiRequirements(requirements) {
  fields.requirementsOutput.innerHTML = `
    <div class="kv-grid">
      ${renderKeyValue("Detected codes", renderPills(requirements.codes))}
      ${renderKeyValue("Effective dates", renderPills(requirements.effective_dates))}
      ${renderKeyValue("Member populations", renderPills(requirements.populations))}
      ${renderKeyValue("Prior authorization", renderSentenceList(requirements.prior_authorization))}
      ${renderKeyValue("Documentation requirements", renderSentenceList(requirements.documentation))}
      ${renderKeyValue("Coverage or exclusions", renderSentenceList(requirements.coverage_exclusions))}
    </div>
  `;
}

function updateAiStatus(requirements, changes, rules) {
  const signals = [
    requirements.codes.length > 0,
    requirements.effective_dates.length > 0,
    requirements.prior_authorization.length > 0,
    requirements.documentation.length > 0,
    requirements.coverage_exclusions.length > 0,
  ];
  const coverage = Math.round((signals.filter(Boolean).length / signals.length) * 100);
  fields.coverageScore.textContent = `${coverage}%`;
  fields.changeCount.textContent = String(changes.length);
  fields.ruleCount.textContent = String(rules.length);
}

function setBusy(isBusy) {
  document.querySelector("#analyzeBtn").disabled = isBusy;
  document.querySelector("#analyzeBtn").textContent = isBusy ? "Analyzing..." : "Analyze Policy";
}

function analyzePolicy(text) {
  const sentences = splitSentences(text);
  const codes = extractCodes(text);
  const dates = extractDates(text);
  const requirements = sentences.filter((sentence) =>
    /\b(required|must|shall|include|prior authorization|documentation|medical necessity|covered when)\b/i.test(sentence),
  );
  const exclusions = sentences.filter((sentence) =>
    /\b(exclusion|excluded|not covered|investigational|cosmetic)\b/i.test(sentence),
  );
  const authSentences = sentences.filter((sentence) => /prior authorization/i.test(sentence));
  const documentationSentences = sentences.filter((sentence) => /documentation|office notes|imaging|attestation|treatment history/i.test(sentence));
  const coverageSentences = sentences.filter((sentence) => /covered when|covered if|coverage|applies to/i.test(sentence));
  const populations = extractPopulations(text);

  return {
    text,
    sentences,
    codes,
    dates,
    requirements,
    exclusions,
    authSentences,
    documentationSentences,
    coverageSentences,
    populations,
    summary: buildSummary({ codes, dates, authSentences, documentationSentences, exclusions, populations }),
  };
}

function splitSentences(text) {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function extractCodes(text) {
  const codeMatches = text.match(/\b[A-Z]?\d{4,5}[A-Z]?\b/g) || [];
  return [...new Set(codeMatches)].sort();
}

function extractDates(text) {
  const matches = text.match(
    /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+\d{4}\b/gi,
  ) || [];
  return [...new Set(matches.map((date) => titleCase(date)))];
}

function extractPopulations(text) {
  const populationTerms = ["commercial", "medicare advantage", "marketplace", "medicaid", "self-funded", "exchange"];
  return populationTerms.filter((term) => new RegExp(`\\b${term}\\b`, "i").test(text));
}

function buildSummary(analysis) {
  const codeText = analysis.codes.length ? `procedure code${analysis.codes.length > 1 ? "s" : ""} ${analysis.codes.join(", ")}` : "the referenced procedure codes";
  const authText = analysis.authSentences.length ? "requires prior authorization" : "does not explicitly mention prior authorization";
  const docText = analysis.documentationSentences.length ? "requires supporting documentation" : "does not clearly define documentation requirements";
  const exclusionText = analysis.exclusions.length ? "includes coverage exclusions that should be reviewed before rule deployment" : "does not include obvious exclusion language";
  const populationText = analysis.populations.length ? `applies to ${analysis.populations.join(", ")} members` : "does not clearly identify member populations";
  const dateText = analysis.dates.length ? `The detected effective date is ${analysis.dates.join(", ")}.` : "No explicit effective date was detected.";

  return `The updated policy ${populationText} and addresses ${codeText}. It ${authText}, ${docText}, and ${exclusionText}. ${dateText} The recommended operational action is analyst review of extracted requirements before claims logic is promoted.`;
}

function comparePolicies(oldText, newText) {
  if (!oldText || oldText.trim() === newText.trim()) {
    return [];
  }

  const oldSentences = splitSentences(oldText);
  const newSentences = splitSentences(newText);
  const oldSet = new Set(oldSentences.map(normalizeSentence));
  const newSet = new Set(newSentences.map(normalizeSentence));
  const removed = oldSentences.filter((sentence) => !newSet.has(normalizeSentence(sentence)));
  const added = newSentences.filter((sentence) => !oldSet.has(normalizeSentence(sentence)));
  const changed = matchChangedSentences(removed, added);
  const changedAdded = new Set(changed.map((item) => item.added));
  const changedRemoved = new Set(changed.map((item) => item.removed));

  return [
    ...changed.map((item) => ({ type: "changed", ...item })),
    ...added.filter((sentence) => !changedAdded.has(sentence)).map((sentence) => ({ type: "added", text: sentence })),
    ...removed.filter((sentence) => !changedRemoved.has(sentence)).map((sentence) => ({ type: "removed", text: sentence })),
  ];
}

function matchChangedSentences(removed, added) {
  const matches = [];
  const usedAdded = new Set();

  removed.forEach((oldSentence) => {
    let best = null;
    added.forEach((newSentence) => {
      if (usedAdded.has(newSentence)) return;
      const score = similarity(oldSentence, newSentence);
      if (score > 0.42 && (!best || score > best.score)) {
        best = { removed: oldSentence, added: newSentence, score };
      }
    });
    if (best) {
      usedAdded.add(best.added);
      matches.push(best);
    }
  });

  return matches;
}

function normalizeSentence(sentence) {
  return sentence.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function similarity(a, b) {
  const aWords = new Set(normalizeSentence(a).split(" ").filter(Boolean));
  const bWords = new Set(normalizeSentence(b).split(" ").filter(Boolean));
  const overlap = [...aWords].filter((word) => bWords.has(word)).length;
  const union = new Set([...aWords, ...bWords]).size || 1;
  return overlap / union;
}

function generateRules(analysis) {
  const codes = analysis.codes.length ? analysis.codes : ["UNSPECIFIED_CODE"];
  const rules = [];

  if (analysis.authSentences.length) {
    rules.push({
      rule_id: "AUTH-001",
      rule_name: "Prior authorization completeness check",
      source_text: analysis.authSentences[0],
      output_format: "json_logic_tree",
      conditions: [
        { field: "procedure_code", operator: "in", value: codes },
        { field: "prior_authorization_required", operator: "equals", value: true },
        { field: "prior_authorization_on_claim", operator: "equals", value: false },
      ],
      action: "flag_for_review",
      review_required: true,
    });
  }

  if (analysis.documentationSentences.length) {
    rules.push({
      rule_id: "DOC-001",
      rule_name: "Required documentation check",
      source_text: analysis.documentationSentences[0],
      output_format: "json_logic_tree",
      conditions: [
        { field: "procedure_code", operator: "in", value: codes },
        { field: "documentation_present", operator: "equals", value: false },
      ],
      action: "flag_for_medical_necessity_review",
      review_required: true,
    });
  }

  if (analysis.exclusions.length) {
    rules.push({
      rule_id: "EXCL-001",
      rule_name: "Coverage exclusion screen",
      source_text: analysis.exclusions[0],
      output_format: "json_logic_tree",
      conditions: [
        { field: "procedure_code", operator: "in", value: codes },
        { field: "exclusion_term_detected", operator: "equals", value: true },
      ],
      action: "route_to_policy_analyst",
      review_required: true,
    });
  }

  return rules;
}

function validateAnalysis(analysis, rules, changes) {
  return [
    {
      level: analysis.codes.length ? "pass" : "warn",
      label: analysis.codes.length ? "Codes detected" : "No CPT/HCPCS-like codes detected",
      detail: analysis.codes.length ? `${analysis.codes.length} code value(s) extracted for rule conditions.` : "Analyst should confirm whether the policy contains billable codes.",
    },
    {
      level: analysis.dates.length ? "pass" : "warn",
      label: analysis.dates.length ? "Effective date detected" : "No effective date detected",
      detail: analysis.dates.length ? analysis.dates.join(", ") : "Policy lifecycle controls require a date before production use.",
    },
    {
      level: rules.length ? "pass" : "fail",
      label: rules.length ? "Draft rules generated" : "No draft rules generated",
      detail: rules.length ? `${rules.length} reviewable rule draft(s) created from policy language.` : "Policy language did not contain recognizable rule triggers.",
    },
    {
      level: changes.length ? "pass" : "warn",
      label: changes.length ? "Version changes detected" : "No version changes detected",
      detail: changes.length ? `${changes.length} added, removed, or changed sentence-level item(s) detected.` : "If two versions were expected, verify both inputs were pasted.",
    },
    {
      level: "warn",
      label: "Human review required",
      detail: "Draft logic is not a payment decision. Analyst approval is required before operational use.",
    },
  ];
}

function renderSummary(analysis, changes) {
  const changeSentence = changes.length
    ? `${changes.length} policy change item(s) were detected between versions.`
    : "No policy version changes were detected.";

  fields.summaryOutput.innerHTML = `
    <p>${escapeHtml(analysis.summary)}</p>
    <p>${escapeHtml(changeSentence)} This gives a payer analyst a concise starting point while preserving a path back to the source text.</p>
  `;
}

function renderRequirements(analysis) {
  fields.requirementsOutput.innerHTML = `
    <div class="kv-grid">
      ${renderKeyValue("Detected codes", renderPills(analysis.codes))}
      ${renderKeyValue("Effective dates", renderPills(analysis.dates))}
      ${renderKeyValue("Member populations", renderPills(analysis.populations.map(titleCase)))}
      ${renderKeyValue("Prior authorization", renderSentenceList(analysis.authSentences))}
      ${renderKeyValue("Documentation requirements", renderSentenceList(analysis.documentationSentences))}
      ${renderKeyValue("Coverage or exclusions", renderSentenceList([...analysis.coverageSentences, ...analysis.exclusions]))}
    </div>
  `;
}

function renderChanges(changes) {
  if (!changes.length) {
    fields.changesOutput.innerHTML = `<p class="empty">No changes found. Paste two different policy versions to compare them.</p>`;
    return;
  }

  fields.changesOutput.innerHTML = `
    <div class="change-list">
      ${changes
        .map((change) => {
          if (change.type === "changed") {
            const oldText = change.removed || change.old_text || "";
            const newText = change.added || change.new_text || "";
            return `<div class="change changed"><strong>Changed</strong><p><b>Old:</b> ${escapeHtml(oldText)}</p><p><b>New:</b> ${escapeHtml(newText)}</p></div>`;
          }
          return `<div class="change ${change.type}"><strong>${escapeHtml(change.type)}</strong><p>${escapeHtml(change.text || change.added || change.removed || "")}</p></div>`;
        })
        .join("")}
    </div>
  `;
}

function renderRules(rules) {
  if (!rules.length) {
    fields.rulesOutput.textContent = "No rules generated. Add policy language with prior authorization, documentation, or exclusion requirements.";
    return;
  }

  if (currentRuleView === "ifthen") {
    fields.rulesOutput.textContent = rules.map(toIfThen).join("\n\n");
    return;
  }

  if (currentRuleView === "python") {
    fields.rulesOutput.textContent = rules.map(toPython).join("\n\n");
    return;
  }

  fields.rulesOutput.textContent = JSON.stringify({ generated_rules: rules }, null, 2);
}

function renderValidation(analysisBundle) {
  const approval = analysisBundle.approved
    ? [{ level: "pass", label: "Analyst approved", detail: "The current draft has been marked approved for demo purposes." }]
    : [];
  const validations = [...analysisBundle.validations, ...approval];

  fields.validationOutput.innerHTML = `
    <div class="validation-list">
      ${validations
        .map(
          (item) => `
            <div class="validation-item">
              <span class="dot ${item.level}"></span>
              <div>
                <strong>${escapeHtml(item.label)}</strong>
                <div>${escapeHtml(item.detail)}</div>
              </div>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function arrayify(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];
  return [String(value)];
}

function updateStatus(analysis, changes, rules) {
  const signals = [
    analysis.codes.length > 0,
    analysis.dates.length > 0,
    analysis.authSentences.length > 0,
    analysis.documentationSentences.length > 0,
    analysis.exclusions.length > 0,
  ];
  const coverage = Math.round((signals.filter(Boolean).length / signals.length) * 100);
  fields.coverageScore.textContent = `${coverage}%`;
  fields.changeCount.textContent = String(changes.length);
  fields.ruleCount.textContent = String(rules.length);
}

function renderEmpty() {
  currentAnalysis = null;
  fields.summaryOutput.textContent = "Load sample policies or paste policy text, then run analysis.";
  fields.requirementsOutput.innerHTML = "";
  fields.changesOutput.innerHTML = "";
  fields.rulesOutput.textContent = "";
  fields.validationOutput.innerHTML = "";
  fields.coverageScore.textContent = "0%";
  fields.changeCount.textContent = "0";
  fields.ruleCount.textContent = "0";
  fields.approvalStatus.textContent = "Needs review";
}

function renderKeyValue(label, value) {
  return `<div class="kv-item"><strong>${escapeHtml(label)}</strong>${value}</div>`;
}

function renderPills(items) {
  if (!items.length) return `<span class="empty">Not detected</span>`;
  return `<div class="pill-list">${items.map((item) => `<span class="pill">${escapeHtml(item)}</span>`).join("")}</div>`;
}

function renderSentenceList(sentences) {
  if (!sentences.length) return `<span class="empty">Not detected</span>`;
  return `<ul>${sentences.slice(0, 4).map((sentence) => `<li>${escapeHtml(sentence)}</li>`).join("")}</ul>`;
}

function toIfThen(rule) {
  const conditions = rule.conditions
    .map((condition) => `${condition.field} ${condition.operator} ${Array.isArray(condition.value) ? condition.value.join(", ") : condition.value}`)
    .join("\nAND ");
  return `Rule: ${rule.rule_name}\nIF ${conditions}\nTHEN ${rule.action}\nReview required: ${rule.review_required ? "yes" : "no"}\nSource: ${rule.source_text}`;
}

function toPython(rule) {
  const codeList = rule.conditions.find((condition) => condition.field === "procedure_code")?.value || [];
  const codeArray = JSON.stringify(codeList);
  const functionName = rule.rule_id.toLowerCase().replace(/-/g, "_");
  return `def ${functionName}(claim):\n    procedure_codes = ${codeArray}\n    # Source: ${rule.source_text}\n    if claim.get("procedure_code") in procedure_codes:\n        return "${rule.action}"\n    return "no_action"`;
}

function titleCase(value) {
  return value.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function checkAiAvailability() {
  try {
    const response = await fetch("/api/status");
    if (!response.ok) return;
    const status = await response.json();
    aiAvailable = Boolean(status.ai_available);
    aiModel = status.model || aiModel;
  } catch {
    aiAvailable = false;
  }
}

renderEmpty();
checkAiAvailability();
