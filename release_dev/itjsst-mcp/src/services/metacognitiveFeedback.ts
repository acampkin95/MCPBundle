import type { ThoughtRecord, CognitiveStage } from './structuredThinking.js';

/**
 * Enhanced metacognitive feedback system for structured thinking
 *
 * This replaces the naive quality score approach with multi-dimensional analysis
 * including content quality, reasoning depth, coherence, and trend detection.
 */

export interface QualityDimensions {
  readonly completeness: number; // 0-1: Does thought address the stage goals?
  readonly specificity: number; // 0-1: Concrete vs vague?
  readonly coherence: number; // 0-1: Logical consistency with prior thoughts?
  readonly novelty: number; // 0-1: New insights vs repetition?
  readonly actionability: number; // 0-1: Clear next steps?
  readonly evidenceBased: number; // 0-1: Backed by data/references?
}

export interface MetacognitiveAssessment {
  readonly thoughtId: string;
  readonly stage: CognitiveStage | string;
  readonly qualityDimensions: QualityDimensions;
  readonly overallScore: number; // Weighted composite
  readonly confidence: number; // How confident is this assessment?
  readonly flags: readonly QualityFlag[];
  readonly suggestions: readonly string[];
  readonly timestamp: string;
}

export interface QualityFlag {
  readonly type: 'warning' | 'info' | 'critical';
  readonly category:
    | 'completeness'
    | 'coherence'
    | 'depth'
    | 'repetition'
    | 'vagueness'
    | 'missing-evidence';
  readonly message: string;
  readonly affectedThoughts: readonly string[];
}

export interface QualityTrend {
  readonly dimension: keyof QualityDimensions;
  readonly direction: 'improving' | 'declining' | 'stable';
  readonly recentAverage: number;
  readonly historicalAverage: number;
  readonly changeRate: number; // Per thought
}

export interface MetacognitiveReport {
  readonly assessments: readonly MetacognitiveAssessment[];
  readonly trends: readonly QualityTrend[];
  readonly overallQuality: number;
  readonly stageQuality: Record<string, number>;
  readonly criticalIssues: readonly QualityFlag[];
  readonly recommendations: readonly string[];
  readonly needsFollowUp: boolean;
}

/**
 * Stage-specific quality criteria
 */
const STAGE_CRITERIA: Record<string, Partial<Record<keyof QualityDimensions, number>>> = {
  problem_definition: {
    completeness: 0.8, // Must clearly define problem
    specificity: 0.7, // Should be specific about constraints
    actionability: 0.5, // Less critical at this stage
  },
  research: {
    evidenceBased: 0.9, // Must cite sources
    completeness: 0.7, // Should cover key areas
    novelty: 0.6, // Should bring new information
  },
  analysis: {
    coherence: 0.9, // Must be logically consistent
    evidenceBased: 0.8, // Should reference research
    specificity: 0.8, // Should be concrete
  },
  synthesis: {
    actionability: 0.9, // Must have clear next steps
    coherence: 0.8, // Must connect insights
    completeness: 0.7, // Should address all key points
  },
  conclusion: {
    completeness: 0.9, // Must summarize all findings
    actionability: 0.9, // Must have clear actions
    coherence: 0.8, // Must tie everything together
  },
};

/**
 * Content analysis patterns for quality assessment
 */
const QUALITY_PATTERNS = {
  vague: /\b(maybe|perhaps|possibly|might|could|somewhat|fairly|quite)\b/gi,
  specific: /\b(specifically|precisely|exactly|measured|quantified|demonstrated)\b/gi,
  evidence: /\b(according to|based on|data shows|research indicates|documented in|ref:|see:)\b/gi,
  actionable: /\b(will|must|should|next step|action item|todo|implement|execute)\b/gi,
  incomplete: /\b(unclear|unknown|uncertain|need to investigate|TBD|TODO)\b/gi,
  repetitive: /\b(as mentioned|as stated|previously|again|repeated)\b/gi,
};

export class MetacognitiveFeedbackService {
  /**
   * Assess the quality of a single thought
   */
  public assessThought(
    thought: ThoughtRecord,
    priorThoughts: readonly ThoughtRecord[]
  ): MetacognitiveAssessment {
    const dimensions = this.analyzeQualityDimensions(thought, priorThoughts);
    const flags = this.detectQualityIssues(thought, dimensions, priorThoughts);
    const suggestions = this.generateSuggestions(thought, dimensions, flags);

    // Weighted composite based on stage-specific criteria
    const overallScore = this.computeOverallScore(thought.stage, dimensions);

    // Confidence based on content length, specificity, and evidence
    const confidence = this.computeConfidence(thought, dimensions);

    return {
      thoughtId: thought.id,
      stage: thought.stage,
      qualityDimensions: dimensions,
      overallScore,
      confidence,
      flags,
      suggestions,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Analyze quality across multiple dimensions
   */
  private analyzeQualityDimensions(
    thought: ThoughtRecord,
    priorThoughts: readonly ThoughtRecord[]
  ): QualityDimensions {
    const content = thought.thought.toLowerCase();
    const wordCount = content.split(/\s+/).length;

    // Completeness: Length, metadata richness, addressing stage goals
    const completeness = this.assessCompleteness(thought, wordCount);

    // Specificity: Concrete terms vs vague language
    const specificity = this.assessSpecificity(content);

    // Coherence: Logical consistency with prior thoughts
    const coherence = this.assessCoherence(thought, priorThoughts);

    // Novelty: New insights vs repetition
    const novelty = this.assessNovelty(thought, priorThoughts);

    // Actionability: Clear next steps
    const actionability = this.assessActionability(content);

    // Evidence-based: References, data, citations
    const evidenceBased = this.assessEvidence(thought, content);

    return {
      completeness,
      specificity,
      coherence,
      novelty,
      actionability,
      evidenceBased,
    };
  }

  private assessCompleteness(thought: ThoughtRecord, wordCount: number): number {
    let score = 0;

    // Minimum length (20+ words gets full points)
    score += Math.min(wordCount / 20, 1) * 0.3;

    // Metadata richness
    if (thought.metadata?.tags && thought.metadata.tags.length > 0) score += 0.2;
    if (thought.metadata?.external_refs && thought.metadata.external_refs.length > 0) score += 0.2;
    if (thought.metadata?.importance) score += 0.1;

    // No incomplete markers
    const incompleteMatches = thought.thought.match(QUALITY_PATTERNS.incomplete);
    score += (1 - Math.min((incompleteMatches?.length ?? 0) / 3, 1)) * 0.2;

    return Math.min(score, 1);
  }

  private assessSpecificity(content: string): number {
    const vague = content.match(QUALITY_PATTERNS.vague)?.length ?? 0;
    const specific = content.match(QUALITY_PATTERNS.specific)?.length ?? 0;

    // Penalize vague language, reward specific language
    const ratio = specific > 0 ? specific / (vague + specific) : vague > 0 ? 0 : 0.5;

    // Numbers, file paths, URLs indicate specificity
    const hasNumbers = /\d+/.test(content);
    const hasPaths = /[/\\][\w/.]+|:\d+/.test(content);

    let score = ratio;
    if (hasNumbers) score += 0.2;
    if (hasPaths) score += 0.1;

    return Math.min(score, 1);
  }

  private assessCoherence(thought: ThoughtRecord, priorThoughts: readonly ThoughtRecord[]): number {
    if (priorThoughts.length === 0) return 1; // First thought is always coherent

    // Check for references to prior thoughts
    const references = thought.metadata?.external_refs ?? [];
    if (references.length > 0) return 0.9;

    // Check for revision/branch relationships
    if (thought.metadata?.revisesThought || thought.metadata?.branchFromThought) return 0.85;

    // Check for shared tags (indicates thematic consistency)
    const currentTags = new Set(thought.metadata?.tags ?? []);
    const priorTags = priorThoughts.flatMap((t) => t.metadata?.tags ?? []);
    const sharedTags = priorTags.filter((tag) => currentTags.has(tag)).length;

    if (sharedTags > 0) return Math.min(0.6 + sharedTags * 0.1, 0.9);

    // Check for same stage (stage coherence)
    const sameStage = priorThoughts.some((t) => t.stage === thought.stage);
    if (sameStage) return 0.6;

    return 0.4; // Isolated thought
  }

  private assessNovelty(thought: ThoughtRecord, priorThoughts: readonly ThoughtRecord[]): number {
    if (priorThoughts.length === 0) return 1;

    const content = thought.thought.toLowerCase();

    // Check for explicit repetition markers
    const repetitive = content.match(QUALITY_PATTERNS.repetitive);
    if (repetitive && repetitive.length > 2) return 0.3;

    // Check for content similarity (simple word overlap)
    let maxSimilarity = 0;
    const currentWords = new Set(content.split(/\s+/).filter((w) => w.length > 3));

    for (const prior of priorThoughts.slice(-5)) {
      // Check last 5 thoughts
      const priorWords = new Set(
        prior.thought
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 3)
      );
      const overlap = Array.from(currentWords).filter((w) => priorWords.has(w)).length;
      const similarity = overlap / Math.max(currentWords.size, priorWords.size);
      maxSimilarity = Math.max(maxSimilarity, similarity);
    }

    return 1 - maxSimilarity;
  }

  private assessActionability(content: string): number {
    const actionable = content.match(QUALITY_PATTERNS.actionable)?.length ?? 0;

    // Bullet points or numbered lists indicate actionable content
    const hasBullets = /[-*•]\s+/.test(content);
    const hasNumbers = /^\d+[.)]/.test(content);

    let score = Math.min(actionable / 3, 0.7);
    if (hasBullets) score += 0.2;
    if (hasNumbers) score += 0.1;

    return Math.min(score, 1);
  }

  private assessEvidence(thought: ThoughtRecord, content: string): number {
    const evidenceMarkers = content.match(QUALITY_PATTERNS.evidence)?.length ?? 0;
    const references = thought.metadata?.external_refs?.length ?? 0;

    let score = Math.min(evidenceMarkers / 2, 0.5);
    score += Math.min(references / 3, 0.5);

    return Math.min(score, 1);
  }

  /**
   * Compute weighted overall score based on stage-specific criteria
   */
  private computeOverallScore(stage: string, dimensions: QualityDimensions): number {
    const criteria = STAGE_CRITERIA[stage] ?? {};
    const weights = Object.keys(dimensions).reduce(
      (acc, key) => {
        acc[key as keyof QualityDimensions] = criteria[key as keyof QualityDimensions] ?? 0.5;
        return acc;
      },
      {} as Record<keyof QualityDimensions, number>
    );

    const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
    const weightedSum = (Object.keys(dimensions) as Array<keyof QualityDimensions>).reduce(
      (sum, key) => sum + dimensions[key] * weights[key],
      0
    );

    return weightedSum / totalWeight;
  }

  /**
   * Compute confidence in the assessment
   */
  private computeConfidence(thought: ThoughtRecord, dimensions: QualityDimensions): number {
    const wordCount = thought.thought.split(/\s+/).length;

    // More content = more confidence
    const lengthConfidence = Math.min(wordCount / 50, 1);

    // High specificity = more confidence
    const specificityConfidence = dimensions.specificity;

    // Evidence = more confidence
    const evidenceConfidence = dimensions.evidenceBased;

    return (lengthConfidence + specificityConfidence + evidenceConfidence) / 3;
  }

  /**
   * Detect quality issues and generate flags
   */
  private detectQualityIssues(
    thought: ThoughtRecord,
    dimensions: QualityDimensions,
    priorThoughts: readonly ThoughtRecord[]
  ): QualityFlag[] {
    const flags: QualityFlag[] = [];

    // Critical: Very low completeness
    if (dimensions.completeness < 0.3) {
      flags.push({
        type: 'critical',
        category: 'completeness',
        message: 'Thought is severely incomplete or too vague',
        affectedThoughts: [thought.id],
      });
    }

    // Warning: Low specificity
    if (dimensions.specificity < 0.4) {
      flags.push({
        type: 'warning',
        category: 'vagueness',
        message: 'Thought lacks specific details or concrete examples',
        affectedThoughts: [thought.id],
      });
    }

    // Warning: Low coherence with prior thoughts
    if (priorThoughts.length > 0 && dimensions.coherence < 0.4) {
      flags.push({
        type: 'warning',
        category: 'coherence',
        message: 'Thought seems disconnected from previous reasoning',
        affectedThoughts: [thought.id],
      });
    }

    // Info: High repetition
    if (dimensions.novelty < 0.3) {
      flags.push({
        type: 'info',
        category: 'repetition',
        message: 'Thought appears repetitive with prior content',
        affectedThoughts: [thought.id],
      });
    }

    // Warning: Missing evidence in research/analysis
    if (
      (thought.stage === 'research' || thought.stage === 'analysis') &&
      dimensions.evidenceBased < 0.4
    ) {
      flags.push({
        type: 'warning',
        category: 'missing-evidence',
        message: `${thought.stage} stage requires evidence, citations, or references`,
        affectedThoughts: [thought.id],
      });
    }

    return flags;
  }

  /**
   * Generate actionable suggestions for improvement
   */
  private generateSuggestions(
    thought: ThoughtRecord,
    dimensions: QualityDimensions,
    flags: readonly QualityFlag[]
  ): string[] {
    const suggestions: string[] = [];

    if (dimensions.completeness < 0.5) {
      suggestions.push('Expand this thought with more detail about the rationale and implications');
    }

    if (dimensions.specificity < 0.5) {
      suggestions.push(
        'Add specific examples, numbers, or file references to make this more concrete'
      );
    }

    if (dimensions.coherence < 0.5) {
      suggestions.push(
        'Reference prior thoughts or explain how this connects to previous reasoning'
      );
    }

    if (
      dimensions.evidenceBased < 0.5 &&
      (thought.stage === 'research' || thought.stage === 'analysis')
    ) {
      suggestions.push('Add citations, data sources, or references to support claims');
    }

    if (dimensions.actionability < 0.5 && thought.stage === 'synthesis') {
      suggestions.push('Include specific next steps or action items');
    }

    if (flags.some((f) => f.type === 'critical')) {
      suggestions.push('Consider revising this thought before proceeding to ensure quality');
    }

    return suggestions;
  }

  /**
   * Analyze trends across multiple assessments
   */
  public analyzeTrends(assessments: readonly MetacognitiveAssessment[]): QualityTrend[] {
    if (assessments.length < 3) return []; // Need at least 3 for trend

    const trends: QualityTrend[] = [];
    const dimensions: Array<keyof QualityDimensions> = [
      'completeness',
      'specificity',
      'coherence',
      'novelty',
      'actionability',
      'evidenceBased',
    ];

    for (const dimension of dimensions) {
      const values = assessments.map((a) => a.qualityDimensions[dimension]);
      const recentValues = values.slice(-3);
      const recentAverage = recentValues.reduce((sum, v) => sum + v, 0) / recentValues.length;
      const historicalAverage = values.reduce((sum, v) => sum + v, 0) / values.length;

      // Simple linear regression for trend
      const changeRate = this.computeChangeRate(values);

      let direction: 'improving' | 'declining' | 'stable' = 'stable';
      if (changeRate > 0.05) direction = 'improving';
      else if (changeRate < -0.05) direction = 'declining';

      trends.push({
        dimension,
        direction,
        recentAverage,
        historicalAverage,
        changeRate,
      });
    }

    return trends;
  }

  private computeChangeRate(values: readonly number[]): number {
    if (values.length < 2) return 0;

    // Simple linear regression slope
    const n = values.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = values.reduce((sum, v) => sum + v, 0);
    const sumXY = values.reduce((sum, v, i) => sum + i * v, 0);
    const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    return slope;
  }

  /**
   * Generate comprehensive metacognitive report
   */
  public generateReport(thoughts: readonly ThoughtRecord[]): MetacognitiveReport {
    const assessments = thoughts.map((thought, index) =>
      this.assessThought(thought, thoughts.slice(0, index))
    );

    const trends = this.analyzeTrends(assessments);

    const overallQuality =
      assessments.reduce((sum, a) => sum + a.overallScore, 0) / Math.max(assessments.length, 1);

    const stageQuality: Record<string, number> = {};
    for (const assessment of assessments) {
      if (!stageQuality[assessment.stage]) {
        const stageAssessments = assessments.filter((a) => a.stage === assessment.stage);
        stageQuality[assessment.stage] =
          stageAssessments.reduce((sum, a) => sum + a.overallScore, 0) / stageAssessments.length;
      }
    }

    const criticalIssues = assessments.flatMap((a) => a.flags).filter((f) => f.type === 'critical');

    const recommendations = this.generateRecommendations(assessments, trends, overallQuality);

    const needsFollowUp =
      overallQuality < 0.6 ||
      criticalIssues.length > 0 ||
      trends.some((t) => t.direction === 'declining' && t.dimension !== 'novelty');

    return {
      assessments,
      trends,
      overallQuality,
      stageQuality,
      criticalIssues,
      recommendations,
      needsFollowUp,
    };
  }

  private generateRecommendations(
    assessments: readonly MetacognitiveAssessment[],
    trends: readonly QualityTrend[],
    overallQuality: number
  ): string[] {
    const recommendations: string[] = [];

    if (overallQuality < 0.5) {
      recommendations.push(
        'Overall thought quality is low. Consider slowing down and providing more detail.'
      );
    }

    const decliningTrends = trends.filter((t) => t.direction === 'declining');
    for (const trend of decliningTrends) {
      if (trend.dimension === 'coherence') {
        recommendations.push(
          'Coherence is declining. Ensure each thought connects to prior reasoning.'
        );
      }
      if (trend.dimension === 'evidenceBased') {
        recommendations.push('Evidence quality is declining. Add more citations and references.');
      }
    }

    const lowScoreDimensions = assessments
      .flatMap((a) => Object.entries(a.qualityDimensions))
      .reduce(
        (acc, [dim, score]) => {
          if (!acc[dim]) acc[dim] = [];
          acc[dim].push(score);
          return acc;
        },
        {} as Record<string, number[]>
      );

    for (const [dimension, scores] of Object.entries(lowScoreDimensions)) {
      const average = scores.reduce((sum, s) => sum + s, 0) / scores.length;
      if (average < 0.5) {
        recommendations.push(`Improve ${dimension} across all thoughts`);
      }
    }

    if (recommendations.length === 0) {
      recommendations.push('Quality is good. Continue with current approach.');
    }

    return recommendations;
  }
}
