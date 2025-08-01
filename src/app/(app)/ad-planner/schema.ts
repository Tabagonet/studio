

import { z } from 'zod';

// === Schemas for Generate Ad Creatives Flow ===
export const GenerateAdCreativesInputSchema = z.object({
  url: z.string().url(),
  objectives: z.array(z.string()),
  platform: z.string(),
  campaign_type: z.string(),
  funnel_stage: z.string(),
  target_audience: z.string(),
});
export type GenerateAdCreativesInput = z.infer<typeof GenerateAdCreativesInputSchema>;

export const GenerateAdCreativesOutputSchema = z.object({
  headlines: z.array(z.string()),
  descriptions: z.array(z.string()),
  cta_suggestions: z.array(z.string()),
  visual_ideas: z.array(z.string()),
});
export type GenerateAdCreativesOutput = z.infer<typeof GenerateAdCreativesOutputSchema>;

// === Schemas for Generate Strategy Tasks Flow ===
export const GenerateStrategyTasksInputSchema = z.object({
  url: z.string().url(),
  objectives: z.array(z.string()),
  platform: z.string(),
  campaign_type: z.string(),
  funnel_stage: z.string(),
  strategy_rationale: z.string(),
});
export type GenerateStrategyTasksInput = z.infer<typeof GenerateStrategyTasksInputSchema>;

const AIGeneratedTaskSchema = z.object({
  name: z.string(),
  hours: z.number(),
});

export const GenerateStrategyTasksOutputSchema = z.object({
  tasks: z.array(AIGeneratedTaskSchema),
});
export type GenerateStrategyTasksOutput = z.infer<typeof GenerateStrategyTasksOutputSchema>;

export const KeywordResearchResultSchema = z.object({
  keywords: z.array(z.object({
    keyword: z.string(),
    intent: z.string(),
    cpc_suggestion: z.string(),
  })),
});
export type KeywordResearchResult = z.infer<typeof KeywordResearchResultSchema>;

export const CampaignSetupResultSchema = z.object({
    setupSteps: z.array(z.object({
        step: z.string(),
        details: z.string(),
    })),
});
export type CampaignSetupResult = z.infer<typeof CampaignSetupResultSchema>;

// Task schema for client-side state with added result field
export const TaskSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  hours: z.number(),
  result: z.union([KeywordResearchResultSchema, GenerateAdCreativesOutputSchema, CampaignSetupResultSchema]).nullable().optional(),
});
export type Task = z.infer<typeof TaskSchema>;

// === Schemas for Task Execution Flow ===
export const ExecuteTaskInputSchema = z.object({
  taskName: z.string(),
  url: z.string().url(),
  buyerPersona: z.string(),
  valueProposition: z.string(),
  strategyPlatform: z.string().optional(), // Pass context of the strategy platform
});
export type ExecuteTaskInput = z.infer<typeof ExecuteTaskInputSchema>;


// === NEW, COMPREHENSIVE AD PLAN SCHEMAS ===

// Represents a single, actionable strategy for the media plan
const StrategySchema = z.object({
  platform: z.string(),
  strategy_rationale: z.string(),
  funnel_stage: z.enum(['Awareness', 'Consideration', 'Conversion']),
  campaign_type: z.string(),
  ad_formats: z.array(z.string()),
  monthly_budget: z.number(),
  targeting_suggestions: z.array(z.string()),
  key_kpis: z.array(z.string()),
  creative_angle: z.string(),
  tasks: z.array(TaskSchema).optional(),
  creatives: GenerateAdCreativesOutputSchema.optional(),
});
export type Strategy = z.infer<typeof StrategySchema>;

// Represents a stage in the overall marketing funnel
const FunnelStageSchema = z.object({
  stage_name: z.string().describe("Nombre de la etapa del embudo (ej. Awareness, Consideration)"),
  description: z.string().describe("Descripción del objetivo de esta fase."),
  channels: z.array(z.string()).describe("Canales recomendados para esta fase."),
  content_types: z.array(z.string()).describe("Tipos de contenido recomendados."),
  kpis: z.array(z.string()).describe("KPIs clave para medir esta fase."),
});

// The main output schema for the entire advertising plan
export const CreateAdPlanOutputSchema = z.object({
  id: z.string().optional(),
  createdAt: z.string().optional(),
  // --- Input Data to be saved ---
  url: z.string().url({ message: "La URL no es válida." }).or(z.literal('')).default(''),
  objectives: z.array(z.string()).default([]),
  companyInfo: z.string().optional(),
  valueProposition: z.string().optional(),
  targetAudience: z.string().optional(),
  competitors: z.string().optional(),
  priorityObjective: z.string().optional(),
  brandPersonality: z.array(z.string()).optional(),
  monthlyBudget: z.string().optional(),
  additionalContext: z.string().optional(),
  
  // High-level strategy
  buyer_persona: z.string().describe("Perfil psicográfico del cliente ideal."),
  value_proposition: z.string().describe("Propuesta de valor clara y diferencial."),
  
  // Detailed funnel breakdown
  funnel: z.array(FunnelStageSchema).describe("Embudo de conversión completo por etapas."),
  
  // Actionable media plan
  strategies: z.array(StrategySchema),
  total_monthly_budget: z.number(),
  
  // Supporting materials
  recommended_tools: z.array(z.string()).describe("Herramientas recomendadas para la estrategia."),
  calendar: z.array(z.object({
    month: z.string(),
    focus: z.string(),
    actions: z.array(z.string()),
  })),
  extra_recommendations: z.array(z.string()).describe("Recomendaciones extra sobre posicionamiento, tono, etc."),

  // Financials
  fee_proposal: z.object({
    setup_fee: z.number(),
    management_fee: z.number(),
    fee_description: z.string(),
  }),
});

export type CreateAdPlanOutput = z.infer<typeof CreateAdPlanOutputSchema>;

// Schema for the initial user input form
export const CreateAdPlanInputSchema = z.object({
  url: z.string().url({ message: "Por favor, introduce una URL válida." }),
  objectives: z.array(z.string()).min(1, { message: "Selecciona al menos un objetivo." }),
  companyInfo: z.string().optional(),
  valueProposition: z.string().optional(),
  targetAudience: z.string().optional(),
  competitors: z.string().optional(),
  priorityObjective: z.string().optional(),
  brandPersonality: z.array(z.string()).optional(),
  monthlyBudget: z.string().optional(),
  additionalContext: z.string().optional(),
});
export type CreateAdPlanInput = z.infer<typeof CreateAdPlanInputSchema>;


// === Schemas for Competitor Analysis Flow ===
export const CompetitorAnalysisInputSchema = z.object({
  url: z.string().url(),
  additional_context: z.string().optional(),
});
export type CompetitorAnalysisInput = z.infer<typeof CompetitorAnalysisInputSchema>;

export const CompetitorAnalysisOutputSchema = z.object({
  id: z.string().optional(),
  createdAt: z.string().optional(),
  competitors: z.array(z.object({
    competitor_name: z.string().describe("El nombre de la empresa competidora."),
    key_platforms: z.string().describe("Las plataformas publicitarias clave que utilizan (ej. Google Ads, Meta Ads)."),
    estimated_monthly_budget: z.number().describe("Una estimación aproximada de su inversión publicitaria mensual en euros."),
    strategy_summary: z.string().describe("Un resumen conciso de su estrategia publicitaria aparente."),
    creative_angle: z.string().describe("El enfoque creativo principal o mensaje que utilizan en sus anuncios."),
  })).describe("Una lista de 2 a 3 de los principales competidores encontrados."),
});
export type CompetitorAnalysisOutput = z.infer<typeof CompetitorAnalysisOutputSchema>;


// === Schemas for Google Ads Campaign Generation ===
export const GenerateGoogleCampaignInputSchema = z.object({
  url: z.string().url(),
  objectives: z.array(z.string()),
  buyer_persona: z.string(),
  value_proposition: z.string(),
});
export type GenerateGoogleCampaignInput = z.infer<typeof GenerateGoogleCampaignInputSchema>;

export const GoogleAdGroupSchema = z.object({
  adGroupName: z.string().describe("Un nombre temático y conciso para el grupo de anuncios (ej. 'Zapatillas Correr Hombre')."),
  keywords: z.array(z.string()).describe("Una lista de 5 a 15 palabras clave estrechamente relacionadas con el tema del grupo."),
  ads: z.array(z.object({
    headlines: z.array(z.string().max(30, "Los titulares no deben superar los 30 caracteres.")).describe("Una lista de 3 a 5 titulares potentes y cortos."),
    descriptions: z.array(z.string().max(90, "Las descripciones no deben superar los 90 caracteres.")).describe("Una lista de 2 a 3 descripciones persuasivas."),
  })).describe("Al menos un ejemplo de anuncio para este grupo."),
});

export const GoogleAdsCampaignSchema = z.object({
    campaignName: z.string().describe("Un nombre general para toda la campaña (ej. 'Venta Calzado Deportivo Verano')."),
    adGroups: z.array(GoogleAdGroupSchema).describe("Una lista de 2 a 5 grupos de anuncios temáticos.")
});
export type GoogleAdsCampaign = z.infer<typeof GoogleAdsCampaignSchema>;
