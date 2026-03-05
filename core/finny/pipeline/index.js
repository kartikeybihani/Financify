// core/finny/pipeline/index.js
/**
 * Ask Pipeline Orchestrator
 * 
 * Orchestrates the 6-stage ask pipeline:
 * 1. Classification Stage - Normalize and merge classification
 * 2. Context Loading Stage - Select and load data packs
 * 3. Enrichment Stage - Web/stock data augmentation
 * 4. Prompt Assembly Stage - Build complete prompt
 * 5. Execution Stage - LLM call and validation
 * 6. Finalization Stage - Response logging and metadata
 */

import { logInfo, logError } from "../utils/logging.js";
import { executeClassificationStage } from "./ClassificationStage.js";
import { executeContextLoadingStage } from "./ContextLoadingStage.js";
import { executeEnrichmentStage } from "./EnrichmentStage.js";
import {
  executePromptAssemblyStage,
  buildInsufficiencyState,
  buildHighRiskClarificationResponse,
} from "./PromptAssemblyStage.js";
import { executeExecutionStage } from "./ExecutionStage.js";
import { executeFinalizationStage } from "./FinalizationStage.js";

/**
 * Execute the complete Ask pipeline
 * 
 * @param {Object} input - Pipeline input
 * @param {string} input.message - User message
 * @param {Object} input.context - Request context (user_id, chat_id, profile, etc.)
 * @param {Object} input.classificationResult - Classification result
 * @param {Object} input.services - Service instances (contextPlanningService, llmService, etc.)
 * @param {Object} input.helpers - Helper functions (buildContextPacks, logConversation, etc.)
 * @param {Object} input.requestMetadata - Request metadata (requestId, startTime, etc.)
 * 
 * @returns {Object} Final response object
 */
export async function executeAskPipeline(input) {
  const {
    message,
    context,
    classificationResult,
    services,
    helpers,
    requestMetadata,
  } = input;

  const { requestId, startTime } = requestMetadata;
  const timings = {
    user_data_ms: 0,
    market_ms: 0,
    web_ms: 0,
    summary_ms: 0,
    llm_ms: 0,
  };
  const toolsUsed = [];

  logInfo("🚀 [PIPELINE] Starting Ask pipeline", { requestId });

  try {
    // Stage 1: Classification
    const classificationStageResult = await executeClassificationStage({
      message,
      classificationResult,
      packs: {}, // Will be populated in context stage
      profile: context?.profile || {},
      userId: context?.user_id,
      chatId: context?.chat_id,
      continuityOverride: context?.continuity_override,
    });

    const { classification } = classificationStageResult;

    // Stage 2: Context Loading
    const contextStageResult = await executeContextLoadingStage({
      classification,
      message,
      userId: context?.user_id,
      contextPlanningService: services.contextPlanningService,
      buildContextPacks: helpers.buildContextPacks,
    });

    const { packs, slots, needs, dataGaps } = contextStageResult;

    // Re-run classification stage with packs for normalization
    const finalClassificationResult = await executeClassificationStage({
      message,
      classificationResult,
      packs,
      profile: context?.profile || {},
      userId: context?.user_id,
      chatId: context?.chat_id,
      continuityOverride: context?.continuity_override,
    });

    const advisoryRuntimeEnabled =
      String(process.env.FINNY_ADVISORY_RUNTIME_V1 || "").toLowerCase() ===
      "true";
    const finalClassification = finalClassificationResult.classification || {};
    const insufficiency = buildInsufficiencyState(
      message,
      finalClassification,
      packs,
      context?.profile || {},
    );
    const hasInsufficiency =
      insufficiency.missing_numeric_inputs.length > 0 ||
      insufficiency.missing_decision_context.length > 0;
    const infoSufficiency = String(finalClassification?.info_sufficiency || "").toLowerCase();
    const shouldHardClarify =
      finalClassification?.decision_risk === "high" &&
      !advisoryRuntimeEnabled &&
      hasInsufficiency &&
      (finalClassification?.needs_clarification === true ||
        infoSufficiency === "missing" ||
        infoSufficiency === "unknown");

    if (shouldHardClarify) {
      logInfo("🛑 [PIPELINE] Using deterministic high-risk clarification gate");
      return buildHighRiskClarificationResponse(insufficiency);
    }

    // Stage 3: Enrichment
    const enrichmentStageResult = await executeEnrichmentStage({
      message,
      classification: finalClassification,
      packs,
      webSearchService: services.webSearchService,
      stockAnalysisService: services.stockAnalysisService,
      userId: context?.user_id,
      timings,
      toolsUsed,
    });

    // Stage 4: Prompt Assembly
    const promptStageResult = await executePromptAssemblyStage({
      message,
      classification: finalClassification,
      packs,
      enrichedData: enrichmentStageResult,
      context: {
        ...context,
        data_gaps: dataGaps || [],
      },
      continuityOverride: context?.continuity_override,
      userRefused: helpers.detectRefusalToAnswer?.(message) || false,
      ambiguousIntent: helpers.detectAmbiguousIntent?.(message) || false,
    });

    const {
      messages,
      responseContract,
      advisoryRuntime,
      spendingTipEvidence,
      routingMessage,
    } = promptStageResult;

    // Stage 5: Execution
    const executionStageResult = await executeExecutionStage({
      messages,
      responseContract,
      advisoryRuntime,
      message,
      routingMessage,
      packs,
      classification: finalClassification,
      profile: context?.profile || {},
      continuityOverride: context?.continuity_override || null,
      spendingTipEvidence,
      llmService: services.llmService,
      timings,
      toolsUsed,
    });

    const {
      responseText,
      usedModel,
      usage,
      contractValidationResult,
      contractRepairUsed,
      contractFallbackUsed,
    } = executionStageResult;

    // Stage 6: Finalization
    const finalizationStageResult = await executeFinalizationStage({
      message,
      responseText,
      classification: finalClassification,
      packs,
      context,
      responseContract,
      advisoryRuntime,
      continuityOverride: context?.continuity_override || null,
      spendingTipEvidence,
      contractValidationResult,
      contractRepairUsed,
      contractFallbackUsed,
      usedModel,
      usage,
      timings,
      toolsUsed,
      requestId,
      startTime,
      logConversation: helpers.logConversation,
    });

    const { response } = finalizationStageResult;

    logInfo("✅ [PIPELINE] Ask pipeline complete", {
      requestId,
      totalTime: Date.now() - startTime,
      stages: 6,
    });

    return response;
  } catch (error) {
    logError("❌ [PIPELINE] Pipeline failed:", error?.message);
    throw error;
  }
}
