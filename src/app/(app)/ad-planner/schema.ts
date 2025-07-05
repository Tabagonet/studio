
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

export const TaskSchema = z.object({
  id: z.string().default(() => uuidv4()),
  name: z.string().default(''),
  hours: z.number().default(0),
});
export type Task = z.infer<typeof TaskSchema>;

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
  headlines: z.array(z.string()).describe("Una lista de 3 a 5 titulares cortos y potentes para los anuncios (máx. 30-40 caracteres)."),
  descriptions: z.array(z.string()).describe("Una lista de 2 a 3 descripciones persuasivas y más largas para el cuerpo del anuncio (máx. 90 caracteres)."),
  cta_suggestions: z.array(z.string()).describe("Una lista de 2 a 3 sugerencias de Llamada a la Acción (CTA) claras y directas (ej. Comprar Ahora, Saber Más)."),
  visual_ideas: z.array(z.string()).describe("Una lista de 2 a 3 ideas conceptuales para las imágenes o vídeos del anuncio."),
});
export type GenerateAdCreativesOutput = z.infer<typeof GenerateAdCreativesOutputSchema>;

export const AdStrategySchema = z.object({
  platform: z.string().describe("Plataforma publicitaria (ej. Google Ads, Meta Ads, LinkedIn Ads).").default(''),
  strategy_rationale: z.string().describe("Justificación de por qué se ha elegido esta plataforma para los objetivos dados.").default(''),
  funnel_stage: z.enum(['Awareness', 'Consideration', 'Conversion']).describe("Etapa del embudo de ventas a la que se dirige esta estrategia.").default('Awareness'),
  campaign_type: z.string().describe("Tipo de campaña recomendada (ej. Performance Max, Búsqueda, Video, Generación de Leads).").default(''),
  ad_formats: z.array(z.string()).describe("Formatos de anuncio concretos a utilizar (ej. Anuncio de Texto Expandido, Anuncio de Carrusel, In-Stream).").default([]),
  monthly_budget: z.number().describe("Presupuesto mensual recomendado para esta plataforma.").default(0),
  targeting_suggestions: z.array(z.string()).describe("Sugerencias de segmentación específicas para esta plataforma (ej. Lookalike, Intereses, Remarketing).").default([]),
  key_kpis: z.array(z.string()).describe("Los 2-3 KPIs más importantes para esta estrategia específica (ej. ROAS, CPA).").default([]),
  creative_angle: z.string().describe("El enfoque creativo o mensaje principal para los anuncios de esta estrategia.").default(''),
  tasks: z.array(TaskSchema).optional().default([]).describe("Desglose de tareas para implementar esta estrategia."),
  creatives: GenerateAdCreativesOutputSchema.optional().describe("Creativos publicitarios generados por la IA para esta estrategia."),
});

export type Strategy = z.infer<typeof AdStrategySchema>;

const CalendarMilestoneSchema = z.object({
  month: z.string().describe("Mes del hito (ej. 'Mes 1', 'Mes 2', 'Mes 3').").default(''),
  focus: z.string().describe("El enfoque principal o la meta para ese mes (ej. Configuración y Lanzamiento, Optimización A/B, Escalado).").default(''),
  actions: z.array(z.string()).describe("Acciones específicas y detalladas a realizar durante ese mes.").default([]),
});

const FeeProposalSchema = z.object({
    setup_fee: z.number().describe("Precio único por la configuración inicial de todas las campañas.").default(0),
    management_fee: z.number().describe("Precio por la gestión mensual recurrente de las campañas.").default(0),
    fee_description: z.string().describe("Descripción detallada de los servicios incluidos en los honorarios de gestión.").default(''),
});

export const CreateAdPlanOutputSchema = z.object({
  id: z.string().optional(),
  createdAt: z.string().optional(),
  url: z.string().url({ message: "La URL no es válida." }).or(z.literal('')).default('').describe("La URL que se analizó para generar el plan."),
  objectives: z.array(z.string()).default([]).describe("Los objetivos de negocio que se usaron como base."),
  executive_summary: z.string().default('').describe("Resumen ejecutivo del plan, explicando la lógica general y la estrategia propuesta."),
  target_audience: z.string().default('').describe("Descripción detallada del público objetivo ideal (datos demográficos, intereses, comportamientos, puntos de dolor)."),
  strategies: z.array(AdStrategySchema).default([]).describe("Array de estrategias detalladas para cada plataforma recomendada."),
  total_monthly_budget: z.number().default(0).describe("Suma total de los presupuestos mensuales de todas las plataformas."),
  calendar: z.array(CalendarMilestoneSchema).default([]).describe("Calendario de implementación detallado para los primeros 3 meses."),
  kpis: z.array(z.string()).default([]).describe("KPIs clave para medir el éxito de la campaña (ej. ROAS, CPA, CTR, Tasa de Conversión)."),
  fee_proposal: FeeProposalSchema.default({ setup_fee: 0, management_fee: 0, fee_description: '' }).describe("Propuesta de honorarios por la configuración y gestión."),
  additional_context: z.string().optional().describe("Contexto adicional proporcionado por el usuario."),
});

export type CreateAdPlanOutput = z.infer<typeof CreateAdPlanOutputSchema>;

export const CreateAdPlanInputSchema = z.object({
  url: z.string().url({ message: "Por favor, introduce una URL válida." }),
  objectives: z.array(z.string()).min(1, { message: "Selecciona al menos un objetivo." }),
  additional_context: z.string().optional(),
  plan_duration: z.string().default('3'),
});

export type CreateAdPlanInput = z.infer<typeof CreateAdPlanInputSchema>;


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

// This schema represents a task as returned by the AI (without a client-side ID)
const AIGeneratedTaskSchema = z.object({
  name: z.string().describe("El nombre claro y conciso de la tarea a realizar."),
  hours: z.number().describe("Una estimación realista de las horas necesarias para completar esta tarea."),
});

export const GenerateStrategyTasksOutputSchema = z.object({
  tasks: z.array(AIGeneratedTaskSchema).describe("Una lista de 5 a 7 tareas concretas y accionables para ejecutar la estrategia."),
});
export type GenerateStrategyTasksOutput = z.infer<typeof GenerateStrategyTasksOutputSchema>;
