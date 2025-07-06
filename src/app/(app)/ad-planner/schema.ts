
import { z } from 'zod';

// === Schemas for Generate Ad Creatives Flow (NOW DEPRECATED within ad-plan-view) ===
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

// === Schemas for Generate Strategy Tasks Flow (NOW DEPRECATED within ad-plan-view) ===
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


// === NEW, COMPREHENSIVE AD PLAN SCHEMAS ===

const FunnelStageSchema = z.object({
    objective: z.string().describe("El objetivo clave para esta etapa del embudo."),
    channels: z.array(z.string()).describe("Lista de canales específicos recomendados."),
    content_types: z.array(z.string()).describe("Lista de tipos de contenido sugeridos para los canales."),
    kpis: z.array(z.string()).describe("Lista de KPIs para medir el éxito en esta etapa."),
});

const MediaPlanSchema = z.object({
    budget_distribution: z.string().describe("Descripción de cómo se distribuiría el presupuesto."),
    campaign_suggestions: z.array(z.string()).describe("Ideas concretas de campañas a lanzar."),
});

const RecommendedToolSchema = z.object({
    category: z.string().describe("Categoría de la herramienta (ej. CRM, Analítica)."),
    tools: z.string().describe("Nombres de las herramientas recomendadas."),
});

const ContentCalendarSchema = z.object({
    month: z.string().describe("El mes del plan (ej. 'Mes 1')."),
    focus: z.string().describe("El enfoque principal para ese mes."),
    actions: z.array(z.string()).describe("Lista de acciones detalladas para el mes."),
});

const StrategicRecommendationsSchema = z.object({
    positioning: z.string().describe("Recomendación sobre cómo posicionar la marca."),
    tone_of_voice: z.string().describe("Tono de comunicación sugerido."),
    differentiation: z.string().describe("Ideas clave para diferenciarse de la competencia."),
});


export const CreateAdPlanOutputSchema = z.object({
  id: z.string().optional(),
  createdAt: z.string().optional(),
  url: z.string().url({ message: "La URL no es válida." }).or(z.literal('')).default(''),
  objectives: z.array(z.string()).default([]),
  additional_context: z.string().optional(),
  
  buyer_persona: z.string().describe("Descripción del perfil psicográfico del cliente ideal."),
  value_proposition: z.string().describe("Propuesta de valor clara y diferencial del negocio."),
  
  funnel: z.object({
    awareness: FunnelStageSchema,
    interest: FunnelStageSchema,
    consideration: FunnelStageSchema,
    conversion: FunnelStageSchema,
    retention: FunnelStageSchema,
    referral: FunnelStageSchema,
  }).describe("Embudo de conversión completo dividido en 6 etapas."),

  media_plan: MediaPlanSchema.describe("Plan de medios con distribución de presupuesto y sugerencias de campaña."),
  
  recommended_tools: z.array(RecommendedToolSchema).describe("Lista de herramientas recomendadas por categoría."),

  key_performance_indicators: z.array(z.string()).describe("KPIs generales para medir el éxito de toda la estrategia."),
  
  content_calendar: z.array(ContentCalendarSchema).describe("Calendario de contenidos y acciones mes a mes."),

  strategic_recommendations: StrategicRecommendationsSchema.describe("Recomendaciones estratégicas adicionales sobre posicionamiento, tono y diferenciación."),
});

export type CreateAdPlanOutput = z.infer<typeof CreateAdPlanOutputSchema>;
// This is a placeholder now, as the new output is much more detailed
export type Strategy = {};
export type Task = {};


export const CreateAdPlanInputSchema = z.object({
  url: z.string().url({ message: "Por favor, introduce una URL válida." }),
  objectives: z.array(z.string()).min(1, { message: "Selecciona al menos un objetivo." }),
  additional_context: z.string().optional(),
  plan_duration: z.string().default('3'),
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
