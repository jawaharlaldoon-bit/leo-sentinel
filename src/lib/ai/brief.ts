import { stableHash } from './cache';
import { GRANITE_BRIEF_MODEL_ID } from './types';
import type { MissionBrief } from './types';
import type { EvidenceItem, ScenarioResult } from '@/lib/scenarios/types';

export class BriefValidationError extends Error {}

export function validateScenarioForBrief(value: unknown): ScenarioResult {
  if (!value || typeof value !== 'object') {
    throw new BriefValidationError('scenario must be a ScenarioResult object.');
  }
  const scenario = value as ScenarioResult;
  if (
    typeof scenario.scenarioId !== 'string' ||
    typeof scenario.scenarioName !== 'string' ||
    typeof scenario.riskScore !== 'number' ||
    scenario.riskScore < 0 ||
    scenario.riskScore > 100 ||
    !Array.isArray(scenario.evidence) ||
    scenario.evidence.length === 0
  ) {
    throw new BriefValidationError('scenario is missing required result fields.');
  }
  const evidenceIds = new Set<string>();
  for (const item of scenario.evidence) {
    if (
      !item ||
      typeof item.id !== 'string' ||
      typeof item.label !== 'string' ||
      !['measured', 'calculated', 'simulated'].includes(item.kind) ||
      evidenceIds.has(item.id)
    ) {
      throw new BriefValidationError('scenario contains invalid or duplicate evidence.');
    }
    evidenceIds.add(item.id);
  }
  return scenario;
}

export function validateMissionBrief(
  value: unknown,
  evidence: EvidenceItem[],
  modelId = GRANITE_BRIEF_MODEL_ID,
): MissionBrief {
  if (!value || typeof value !== 'object') throw new BriefValidationError('Brief is not an object.');
  const brief = value as MissionBrief;
  const allowedEvidence = new Set(evidence.map((item) => item.id));
  if (!['nominal', 'watch', 'critical'].includes(brief.riskLevel)) {
    throw new BriefValidationError('Brief riskLevel is invalid.');
  }
  if (typeof brief.executiveSummary !== 'string' || brief.executiveSummary.length > 800) {
    throw new BriefValidationError('Brief executiveSummary is invalid.');
  }
  if (!Array.isArray(brief.findings) || brief.findings.length === 0 || brief.findings.length > 6) {
    throw new BriefValidationError('Brief findings are invalid.');
  }
  for (const finding of brief.findings) {
    if (
      typeof finding.claim !== 'string' ||
      !Array.isArray(finding.evidenceIds) ||
      finding.evidenceIds.length === 0 ||
      finding.evidenceIds.some((id) => !allowedEvidence.has(id))
    ) {
      throw new BriefValidationError('Brief contains an unsupported claim or evidence ID.');
    }
  }
  if (!Array.isArray(brief.actions) || brief.actions.length === 0 || brief.actions.length > 3) {
    throw new BriefValidationError('Brief actions are invalid.');
  }
  for (const action of brief.actions) {
    if (
      ![1, 2, 3].includes(action.priority) ||
      typeof action.action !== 'string' ||
      typeof action.rationale !== 'string'
    ) {
      throw new BriefValidationError('Brief action is invalid.');
    }
  }
  if (typeof brief.confidence !== 'number' || brief.confidence < 0 || brief.confidence > 1) {
    throw new BriefValidationError('Brief confidence must be between 0 and 1.');
  }
  if (!Array.isArray(brief.limitations) || brief.limitations.some((item) => typeof item !== 'string')) {
    throw new BriefValidationError('Brief limitations are invalid.');
  }

  return {
    ...brief,
    modelId,
    generatedAt: typeof brief.generatedAt === 'string' ? brief.generatedAt : new Date().toISOString(),
  };
}

export function buildDeterministicBrief(scenario: ScenarioResult): MissionBrief {
  const riskLevel = scenario.riskScore >= 75 ? 'critical' : scenario.riskScore >= 40 ? 'watch' : 'nominal';
  const routeText = scenario.rerouteAvailable
    ? `A degraded route remains available with a ${scenario.latencyDeltaMs ?? 0} ms latency change.`
    : 'No degraded route is available after the simulated asset loss.';
  const generatedAt = scenario.timestamp;

  return validateMissionBrief(
    {
      riskLevel,
      executiveSummary: `${scenario.scenarioName} is at ${riskLevel} risk. ${routeText}`,
      findings: [
        {
          claim: scenario.rerouteAvailable
            ? 'The pathfinder found a viable degraded route.'
            : 'The pathfinder found no viable degraded route.',
          evidenceIds: ['scenario-reroute'],
        },
        {
          claim: `The deterministic mission risk score is ${scenario.riskScore} out of 100.`,
          evidenceIds: ['scenario-risk-score', 'scenario-disabled-assets'],
        },
        {
          claim:
            scenario.latencyDeltaMs === null
              ? 'Latency impact cannot be calculated without a degraded route.'
              : `The degraded route changes modeled latency by ${scenario.latencyDeltaMs} ms.`,
          evidenceIds: ['scenario-latency-delta', 'scenario-hop-delta'],
        },
      ],
      actions: scenario.rerouteAvailable
        ? [
            {
              priority: 1,
              action: 'Keep the degraded route staged and monitor the affected assets.',
              rationale: 'A viable alternate path is available, but it has less redundancy.',
            },
            {
              priority: 2,
              action: 'Validate gateway and ISL telemetry before operator approval.',
              rationale: 'The scenario is simulated from the current evidence snapshot.',
            },
          ]
        : [
            {
              priority: 1,
              action: 'Escalate the outage and protect traffic from the affected region.',
              rationale: 'No alternate route is available in the modeled topology.',
            },
            {
              priority: 2,
              action: 'Restore one disabled gateway or satellite before resuming service.',
              rationale: 'Connectivity requires at least one reachable egress path.',
            },
          ],
      confidence: scenario.rerouteAvailable ? 0.88 : 0.94,
      limitations: [
        'This brief is deterministic because live watsonx inference was disabled or unavailable.',
        'Scenario links are decision-support simulations and must be checked against live telemetry.',
      ],
      modelId: GRANITE_BRIEF_MODEL_ID,
      generatedAt,
    },
    scenario.evidence,
  );
}

export function scenarioCacheKey(scenario: ScenarioResult): string {
  return `brief:${stableHash(scenario)}`;
}

export function buildBriefPrompt(scenario: ScenarioResult): string {
  return [
    'You are a mission-resilience copilot. Return JSON only, with the supplied schema.',
    'Use only the evidence below. Every finding must cite one or more exact evidence IDs.',
    'Do not invent telemetry, causes, probabilities, or remediation outcomes.',
    `Scenario: ${JSON.stringify({
      scenarioId: scenario.scenarioId,
      scenarioName: scenario.scenarioName,
      rerouteAvailable: scenario.rerouteAvailable,
      riskScore: scenario.riskScore,
      affectedAssets: scenario.affectedAssets,
      evidence: scenario.evidence,
    })}`,
    'Schema: {riskLevel:"nominal"|"watch"|"critical", executiveSummary:string, findings:[{claim:string,evidenceIds:string[]}], actions:[{priority:1|2|3,action:string,rationale:string}], confidence:number, limitations:string[]}',
  ].join('\n');
}
