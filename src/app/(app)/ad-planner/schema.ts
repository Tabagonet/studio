
import { z } from 'zod';

// Define the detailed structure for the advertising plan
const AdStrategySchema = z.object({
  platform: z.string().describe("Plataforma publicitaria (ej. Google Ads, Meta Ads, LinkedIn Ads)."),
  strategy: z.string().describe("Descripción de la estrategia para esta plataforma."),
  ad_formats: z.array(z.string()).describe("Formatos de anuncio recomendados (ej. Búsqueda, Display, Video, Lead Gen Form)."),
  monthly_budget: z.number().describe("Presupuesto mensual recomendado para esta plataforma."),
});

const CalendarMilestoneSchema = z.object({
  month: z.string().describe("Mes del hito (ej. 'Mes 1', 'Mes 2')."),
  focus: z.string().describe("El enfoque principal o la meta para ese mes."),
  actions: z.array(z.string()).describe("Acciones específicas a realizar durante ese mes."),
});

const FeeProposalSchema = z.object({
    setup_fee: z.number().describe("Precio por la configuración inicial de las campañas."),
    management_fee: z.number().describe("Precio por la gestión mensual recurrente."),
    fee_description: z.string().describe("Descripción de los servicios incluidos en los honorarios."),
});

export const CreateAdPlanOutputSchema = z.object({
  executive_summary: z.string().describe("Resumen ejecutivo del plan, explicando la lógica general."),
  target_audience: z.string().describe("Descripción detallada del público objetivo ideal."),
  strategies: z.array(AdStrategySchema).describe("Array de estrategias para cada plataforma recomendada."),
  total_monthly_budget: z.number().describe("Suma total de los presupuestos mensuales de todas las plataformas."),
  calendar: z.array(CalendarMilestoneSchema).describe("Calendario de implementación para los primeros 3 meses."),
  kpis: z.array(z.string()).describe("KPIs clave para medir el éxito (ej. CPA, ROAS, CTR)."),
  fee_proposal: FeeProposalSchema.describe("Propuesta de honorarios por la gestión."),
});

export type CreateAdPlanOutput = z.infer<typeof CreateAdPlanOutputSchema>;

export const CreateAdPlanInputSchema = z.object({
  url: z.string().url({ message: "Por favor, introduce una URL válida." }),
  objective: z.string().min(1, { message: "Por favor, selecciona un objetivo." }),
});

export type CreateAdPlanInput = z.infer<typeof CreateAdPlanInputSchema>;
