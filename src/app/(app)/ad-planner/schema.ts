
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

// Task schema for client-side state
export const TaskSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  hours: z.number(),
});
export type Task = z.infer<typeof TaskSchema>;

// === NEW, COMPREHENSIVE AD PLAN SCHEMAS ===
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

export const CreateAdPlanOutputSchema = z.object({
  id: z.string().optional(),
  createdAt: z.string().optional(),
  url: z.string().url({ message: "La URL no es válida." }).or(z.literal('')).default(''),
  objectives: z.array(z.string()).default([]),
  additional_context: z.string().optional(),
  
  executive_summary: z.string(),
  target_audience: z.string(),
  
  strategies: z.array(StrategySchema),
  
  total_monthly_budget: z.number(),
  
  calendar: z.array(z.object({
    month: z.string(),
    focus: z.string(),
    actions: z.array(z.string()),
  })),

  kpis: z.array(z.string()),

  fee_proposal: z.object({
    setup_fee: z.number(),
    management_fee: z.number(),
    fee_description: z.string(),
  }),
});

export type CreateAdPlanOutput = z.infer<typeof CreateAdPlanOutputSchema>;

export const CreateAdPlanInputSchema = z.object({
  url: z.string().url({ message: "Por favor, introduce una URL válida." }),
  objectives: z.array(z.string()).min(1, { message: "Selecciona al menos un objetivo." }),
  additional_context: z.string().optional(),
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
