import { z } from 'zod';

export const TaskSchema = z.object({
  id: z.string(),
  name: z.string(),
  hours: z.number(),
});
export type Task = z.infer<typeof TaskSchema>;

export const AdStrategySchema = z.object({
  platform: z.string().describe("Plataforma publicitaria (ej. Google Ads, Meta Ads, LinkedIn Ads)."),
  strategy_rationale: z.string().describe("Justificación de por qué se ha elegido esta plataforma para los objetivos dados."),
  funnel_stage: z.enum(['Awareness', 'Consideration', 'Conversion']).describe("Etapa del embudo de ventas a la que se dirige esta estrategia."),
  campaign_type: z.string().describe("Tipo de campaña recomendada (ej. Performance Max, Búsqueda, Video, Generación de Leads)."),
  ad_formats: z.array(z.string()).describe("Formatos de anuncio concretos a utilizar (ej. Anuncio de Texto Expandido, Anuncio de Carrusel, In-Stream)."),
  monthly_budget: z.number().describe("Presupuesto mensual recomendado para esta plataforma."),
  tasks: z.array(TaskSchema).optional().describe("Desglose de tareas para implementar esta estrategia."),
});

export type Strategy = z.infer<typeof AdStrategySchema>;

const CalendarMilestoneSchema = z.object({
  month: z.string().describe("Mes del hito (ej. 'Mes 1', 'Mes 2', 'Mes 3')."),
  focus: z.string().describe("El enfoque principal o la meta para ese mes (ej. Configuración y Lanzamiento, Optimización A/B, Escalado)."),
  actions: z.array(z.string()).describe("Acciones específicas y detalladas a realizar durante ese mes."),
});

const FeeProposalSchema = z.object({
    setup_fee: z.number().describe("Precio único por la configuración inicial de todas las campañas."),
    management_fee: z.number().describe("Precio por la gestión mensual recurrente de las campañas."),
    fee_description: z.string().describe("Descripción detallada de los servicios incluidos en los honorarios de gestión."),
});

export const CreateAdPlanOutputSchema = z.object({
  url: z.string().url().describe("La URL que se analizó para generar el plan."),
  objectives: z.array(z.string()).describe("Los objetivos de negocio que se usaron como base."),
  executive_summary: z.string().describe("Resumen ejecutivo del plan, explicando la lógica general y la estrategia propuesta."),
  target_audience: z.string().describe("Descripción detallada del público objetivo ideal (datos demográficos, intereses, comportamientos, puntos de dolor)."),
  strategies: z.array(AdStrategySchema).describe("Array de estrategias detalladas para cada plataforma recomendada."),
  total_monthly_budget: z.number().describe("Suma total de los presupuestos mensuales de todas las plataformas."),
  calendar: z.array(CalendarMilestoneSchema).describe("Calendario de implementación detallado para los primeros 3 meses."),
  kpis: z.array(z.string()).describe("KPIs clave para medir el éxito de la campaña (ej. ROAS, CPA, CTR, Tasa de Conversión)."),
  fee_proposal: FeeProposalSchema.describe("Propuesta de honorarios por la configuración y gestión."),
});

export type CreateAdPlanOutput = z.infer<typeof CreateAdPlanOutputSchema>;

export const CreateAdPlanInputSchema = z.object({
  url: z.string().url({ message: "Por favor, introduce una URL válida." }),
  objectives: z.array(z.string()).min(1, { message: "Selecciona al menos un objetivo." }),
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
