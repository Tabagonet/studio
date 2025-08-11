
import type { NavItem, ProductType, ProductData, BlogPostData, NavGroup } from '@/lib/types';
import { Home, Wand2, Settings, Layers, Brain, UploadCloud, Users, LineChart, Newspaper, Bell, ClipboardList, SearchCheck, Copy, Building, Megaphone, Briefcase, Store, ListChecks, Lightbulb, FileText, Shield, Sparkles, User } from 'lucide-react';
import { ShopifyIcon } from '@/components/core/icons';

export const APP_NAME = "AutoPress AI";
export const SUPPORT_EMAIL = "intelvisual@intelvisual.es";

export const NAV_GROUPS: NavGroup[] = [
  {
    title: 'General',
    items: [
      { title: 'Panel de Control', href: '/dashboard', icon: Home },
      { title: 'Notificaciones', href: '/notifications', icon: Bell },
    ]
  },
  {
    title: 'WooCommerce',
    requiredPlatform: 'woocommerce',
    items: [
      { title: 'Asistente de Creación', href: '/wizard', icon: Wand2, requiredRoles: ['admin', 'super_admin', 'product_manager'], requiredPlan: ['pro', 'agency'] },
      { title: 'Gestión de Productos', href: '/batch', icon: Layers, requiredRoles: ['admin', 'super_admin', 'product_manager'], requiredPlan: ['lite', 'pro', 'agency'] },
      { title: 'Proceso en Lotes', href: '/batch-process', icon: UploadCloud, requiredRoles: ['admin', 'super_admin', 'product_manager'], requiredPlan: ['agency'] },
    ]
  },
   {
    title: 'Shopify',
    requiredPlatform: 'shopify',
    items: [
      { title: 'Trabajos de Creación', href: '/shopify/jobs', icon: ListChecks, requiredRoles: ['admin', 'super_admin'], requiredPlan: ['agency'] },
    ]
  },
  {
    title: 'Blog y Páginas',
    requiredPlatform: 'woocommerce',
    items: [
       { title: 'Creador de Entradas', href: '/blog-creator', icon: Newspaper, requiredRoles: ['admin', 'super_admin', 'content_manager'], requiredPlan: ['pro', 'agency'] },
       { title: 'Gestión de Entradas', href: '/blog', icon: ClipboardList, requiredRoles: ['admin', 'super_admin', 'content_manager'], requiredPlan: ['lite', 'pro', 'agency'] },
       { title: 'Gestión de Páginas', href: '/pages', icon: FileText, requiredRoles: ['admin', 'super_admin', 'content_manager'], requiredPlan: ['lite', 'pro', 'agency'] },
    ]
  },
  {
    title: 'Herramientas',
    items: [
       { title: 'Estrategia de Contenidos', href: '/content-strategy', icon: Lightbulb, requiredRoles: ['super_admin'], requiredPlan: ['agency'] },
       { title: 'Planificador de Publicidad', href: '/ad-planner', icon: Megaphone, requiredRoles: ['super_admin'], requiredPlan: ['agency'] },
       { title: 'Optimizador SEO', href: '/seo-optimizer', icon: SearchCheck, requiredRoles: ['super_admin'], requiredPlan: ['agency'] },
       { title: 'Clonador de Contenido', href: '/content-cloner', icon: Copy, requiredRoles: ['super_admin'], requiredPlan: ['agency'] },
       { title: 'Clonador de Menús', href: '/menu-cloner', icon: Copy, requiredRoles: ['super_admin'], requiredPlan: ['agency'] },
    ]
  },
   {
    title: 'Captación',
    items: [
      { title: 'Prospectos', href: '/prospects', icon: Briefcase, requiredRoles: ['super_admin'], requiredPlan: ['pro', 'agency'] },
    ]
  },
   {
    title: 'Ajustes',
    items: [
       { title: 'Mi Plan y Facturación', href: '/settings/my-plan', icon: Sparkles, requiredRoles: ['admin', 'super_admin'] },
       { title: 'Datos de Cuenta', href: '/settings/company', icon: Building, requiredRoles: ['admin', 'super_admin'] },
       { title: 'Gestión de Prompts IA', href: '/prompts', icon: Brain, requiredRoles: ['super_admin'] },
       { title: 'Configuración', href: '/settings', icon: Settings, requiredRoles: ['admin', 'super_admin'] },
    ]
  },
  {
    title: 'Administración',
    items: [
      { title: 'Gestión de Planes', href: '/admin/plans', icon: Shield, requiredRoles: ['super_admin'] },
      { title: 'Gestión de Empresas', href: '/admin/companies', icon: Building, requiredRoles: ['super_admin'] },
      { title: 'Gestión de Usuarios', href: '/admin/users', icon: Users, requiredRoles: ['admin', 'super_admin'], requiresCompany: true },
      { title: 'Actividad de Usuarios', href: '/admin/activity', icon: LineChart, requiredRoles: ['admin', 'super_admin'] },
    ]
  }
];


export const WIZARD_STEPS = [
  { id: '01', name: 'Detalles y Fotos', description: 'Información básica y carga de imágenes.' },
  { id: '02', name: 'Vista Previa', description: 'Revisa y edita el producto.' },
  { id: '03', name: 'Confirmación', description: 'Finaliza y procesa.' },
];


export const PRODUCT_TYPES: { value: ProductType; label: string }[] = [
  { value: 'simple', label: 'Producto Simple' },
  { value: 'variable', label: 'Producto Variable' },
  { value: 'grouped', label: 'Producto Agrupado' },
];

export const INITIAL_PRODUCT_DATA: ProductData = {
  sku: "",
  shouldSaveSku: true,
  name: "",
  status: 'draft',
  productType: 'simple',
  regularPrice: "",
  salePrice: "",
  manage_stock: false,
  stockQuantity: "",
  weight: "",
  dimensions: {
    length: "",
    width: "",
    height: ""
  },
  shipping_class: "",
  category: null,
  tags: [],
  shortDescription: "",
  longDescription: "",
  attributes: [{ name: '', value: '', forVariations: false, visible: true }],
  photos: [],
  variations: [],
  language: 'Spanish',
  targetLanguages: [],
  imageTitle: '',
  imageAltText: '',
  imageCaption: '',
  imageDescription: '',
  groupedProductIds: [],
  source: 'wizard',
};

export const INITIAL_BLOG_DATA: BlogPostData = {
  title: '',
  content: '',
  topic: '', // for AI
  tags: [],
  focusKeyword: '',
  metaDescription: '',
  category: null,
  status: 'draft',
  featuredImage: null,
  sourceLanguage: 'Spanish',
  targetLanguages: [],
  author: null,
  publishDate: null,
};

export const ALL_LANGUAGES = [
    { code: 'Spanish', name: 'Español', slug: 'es' },
    { code: 'English', name: 'Inglés', slug: 'en' },
    { code: 'French', name: 'Francés', slug: 'fr' },
    { code: 'German', name: 'Alemán', slug: 'de' },
    { code: 'Portuguese', name: 'Portugués', slug: 'pt' },
];

export const AI_CREDIT_COSTS: { name: string; href: string, credits: number }[] = [
  { name: 'Asistente de Creación de Productos', href: '/wizard', credits: 10 },
  { name: 'Asistente de Creación de Entradas', href: '/blog-creator', credits: 10 },
  { name: 'Descripciones y SEO de Imágenes (en Gestión de Productos)', href: '/batch', credits: 2 },
  { name: 'Generar Metadatos SEO (en Gestión de Entradas)', href: '/blog', credits: 2 },
  { name: 'Generar Metadatos SEO (en Gestión de Páginas)', href: '/pages', credits: 2 },
  { name: 'Estrategia de Contenidos', href: '/content-strategy', credits: 5 },
  { name: 'Planificador de Publicidad', href: '/ad-planner', credits: 5 },
  { name: 'Generador de Creatividades', href: '/ad-planner', credits: 2 },
  { name: 'Generador de Tareas de Marketing', href: '/ad-planner', credits: 2 },
  { name: 'Análisis de Competencia', href: '/ad-planner', credits: 5 },
  { name: 'Estructura de Campaña de Google Ads', href: '/ad-planner', credits: 10 },
  { name: 'Optimizador SEO (Análisis Técnico)', href: '/seo-optimizer', credits: 1 },
];

export const PROMPT_DEFAULTS: Record<string, { label: string; default: string }> = {
    productDescription: {
        label: "WooCommerce: Generación de Producto",
        default: `You are an expert e-commerce copywriter and SEO specialist.
Your primary task is to receive product information and generate a complete, accurate, and compelling product listing for a WooCommerce store.
The response must be a valid JSON object. Do not include any markdown backticks (\`\`\`) or the word "json" in your response.

**Input Information:**
- **Base Name (from CSV, this is the starting point):** {{baseProductName}}
- **Descriptive Context (from image filename, use this for inspiration):** {{productName}}
- **Language for output:** {{language}}
- **Product Type:** {{productType}}
- **Category:** {{categoryName}}
- **User-provided Tags (for inspiration):** {{tags}}
- **Contained Products (for "Grouped" type only):**
{{{groupedProductsList}}}

**Instructions:**
Generate a JSON object with the following keys.

a.  **"name":** Create a new, SEO-friendly product title in {{language}}. It MUST start with the "Base Name" and should be intelligently expanded using the "Descriptive Context" to make it more appealing and searchable.
b.  **"shortDescription":** A concise and engaging summary in {{language}}, relevant to the newly generated name.
c.  **"longDescription":** A detailed description in {{language}}, relevant to the newly generated name. Use HTML tags like <strong>, <em>, and <br> for formatting.
d.  **"tags":** An array of 5 to 10 relevant SEO keywords/tags in the specified {{language}}.
e.  **"imageTitle":** A concise, SEO-friendly title for product images.
f.  **"imageAltText":** A descriptive alt text for SEO.
g.  **"imageCaption":** An engaging caption for the image.
h.  **"imageDescription":** A detailed description for the image media library entry.

Generate the complete JSON object now.`
    },
    adPlan: {
        label: "Marketing: Plan de Publicidad",
        default: `Eres un estratega senior de marketing digital. Tu tarea es analizar una URL y un objetivo de negocio para crear un plan de publicidad profesional.
Tu respuesta DEBE ser un único objeto JSON válido.

**Contexto:**
- URL: {{url}}
- Objetivos de la Campaña: {{#each objectives}}- {{this}} {{/each}}

**Instrucciones del Plan:**
1.  **executive_summary:** Resume la estrategia general en 2-3 párrafos.
2.  **target_audience:** Describe al público objetivo detalladamente (demografía, intereses, puntos de dolor).
3.  **strategies:** Propón estrategias para cada plataforma.
    -   "platform": ej. Google Ads, Meta Ads.
    -   "strategy_rationale": Justifica por qué esta plataforma es adecuada.
    -   "funnel_stage": (Awareness, Consideration, Conversion).
    -   "campaign_type": ej. Performance Max, Búsqueda, Shopping.
    -   "ad_formats": ej. Video, Carrusel.
    -   "monthly_budget": número.
4.  **total_monthly_budget:** Suma de todos los presupuestos.
5.  **calendar:** Crea un plan para 3 meses.
    - "month": Mes 1, 2, 3.
    - "focus": ej. Configuración y Lanzamiento.
    - "actions": Lista de acciones concretas.
6.  **kpis:** Lista de KPIs clave (ej. ROAS, CPA, CTR).
7.  **fee_proposal:** Propuesta de honorarios.
    - "setup_fee": número.
    - "management_fee": número.
    - "fee_description": Qué incluyen los honorarios.
`
    },
    blogGeneration: {
        label: "Blog: Generar desde Tema",
        default: `You are a professional blog writer and SEO specialist. Your task is to generate a blog post based on a given topic. The response must be a single, valid JSON object with four keys: 'title' (an engaging, SEO-friendly headline), 'content' (a well-structured blog post of at least 400 words, using HTML tags like <h2>, <p>, <ul>, <li>, and <strong> for formatting. All paragraphs (<p> tags) MUST be styled with text-align: justify; for example: <p style="text-align: justify;">Your paragraph here.</p>), 'suggestedKeywords' (an array of 5-7 relevant, SEO-focused keywords), and 'metaDescription' (a compelling summary of around 150 characters for search engines). Do not include markdown or the word 'json' in your output.\n\nGenerate a blog post.\nTopic: "{{topic}}"\nInspiration Keywords: "{{tags}}"\nLanguage: {{language}}`
    },
    blogEnhancement: {
        label: "Blog: Mejorar Contenido",
        default: `You are an expert SEO copywriter. Your task is to analyze a blog post's title and content and rewrite them to be more engaging, clear, and SEO-optimized. Return a single, valid JSON object with two keys: 'title' and 'content'. The content should preserve the original HTML tags. Do not include markdown or the word 'json' in your output.\n\nRewrite and improve the title and content in {{language}} for this blog post.\nOriginal Title: "{{existingTitle}}"\nOriginal Content:\n---\n{{{existingContent}}}\n---`
    },
    titleSuggestion: {
        label: "Blog: Sugerir Títulos",
        default: `You are an expert SEO and content strategist. Based on the provided keyword, generate 5 creative, engaging, and SEO-friendly blog post titles. Return a single, valid JSON object with one key: 'titles', which is an array of 5 string titles. Do not include markdown or the word 'json' in your output.\n\nGenerate 5 blog post titles in {{language}} for the keyword: "{{ideaKeyword}}"`
    },
    keywordSuggestion: {
        label: "Blog: Sugerir Palabras Clave",
        default: `You are an expert SEO specialist. Based on the following blog post title and content, generate a list of relevant, SEO-focused keywords. Return a single, valid JSON object with one key: 'suggestedKeywords' (an array of 5-7 relevant keywords). Do not include markdown or the word 'json' in your output.\n\nGenerate SEO keywords for this blog post in {{language}}.\nTitle: "{{existingTitle}}"\nContent:\n---\n{{{existingContent}}}\n---`
    },
    batchSeoMeta: {
        label: "Acción Lote: Título y Descripción SEO",
        default: `You are an expert SEO copywriter. Your task is to analyze the title and content of a web page and generate optimized SEO metadata.
Respond with a single, valid JSON object with two keys: "title" and "metaDescription".

**Constraints:**
- The "title" must be under 60 characters.
- The "metaDescription" must be under 160 characters.
- Both must be in the same language as the provided content.

**Content for Analysis:**
- Language: {{language}}
- Title: "{{title}}"
- Content Snippet: "{{contentSnippet}}"

Generate the SEO metadata now.`,
    },
    linkSuggestion: {
        label: "Blog: Sugerir Enlaces Internos",
        default: `You are an expert SEO specialist, skilled in creating effective internal linking strategies. Your task is to analyze an article's content and a list of potential link targets from the same website. Identify the most relevant and natural opportunities to add internal links. The response must be a single, valid JSON object with one key "suggestions", containing an array of up to 5 high-quality internal link suggestions.\n\n**Instructions:**\n1.  Read the "currentContent" carefully.\n2.  Review the "potentialTargets" list, which contains the titles and URLs of other pages on the site.\n3.  Find specific phrases or keywords in the "currentContent" that would naturally link to one of the "potentialTargets".\n4.  Do NOT suggest linking a phrase that is already inside an <a> HTML tag.\n5.  Prioritize relevance and user experience. The link should provide value to the reader.\n6.  Return a list of up to 5 of the best link suggestions. For each suggestion, provide the exact phrase to link from the original text, and the corresponding target URL and title.\n\n**Content to Analyze:**\n---\n{{{currentContent}}}\n---\n\n**Available pages to link to:**\n---\n{{#each potentialTargets}}\n- Title: {{{this.title}}}\n- URL: {{{this.link}}}\n{{/each}}\n---`
    },
    seoTechnicalAnalysis: {
        label: "SEO: Análisis Técnico",
        default: `Analiza el siguiente contenido de una página web para optimización SEO (On-Page) y responde únicamente con un objeto JSON válido.\n\n**Datos de la Página:**\n- Título SEO: "{{title}}"\n- Meta Descripción: "{{metaDescription}}"\n- Palabra Clave Principal: "{{focusKeyword}}"\n- URL Canónica: "{{canonicalUrl}}"\n- Total de Imágenes: {{images.length}}\n- Imágenes sin 'alt': {{imagesWithoutAlt}}\n- Encabezado H1: "{{h1}}"\n- Primeros 300 caracteres del contenido: "{{textContent}}"\n\n**Instrucciones:**\nEvalúa cada uno de los siguientes puntos y devuelve un valor booleano (true/false) para cada uno en el objeto "checks". Además, proporciona sugerencias en el objeto "suggested".\n\n**"checks":**\n1. "titleContainsKeyword": ¿Contiene el "Título SEO" la "Palabra Clave Principal"?\n2. "titleIsGoodLength": ¿Tiene el "Título SEO" entre 30 y 65 caracteres?\n3. "metaDescriptionContainsKeyword": ¿Contiene la "Meta Descripción" la "Palabra Clave Principal"?\n4. "metaDescriptionIsGoodLength": ¿Tiene la "Meta Descripción" entre 50 y 160 caracteres?\n5. "keywordInFirstParagraph": ¿Contienen los "Primeros 300 caracteres del contenido" la "Palabra Clave Principal"?\n6. "contentHasImages": ¿Es el "Total de Imágenes" mayor que 0?\n7. "allImagesHaveAltText": ¿Es el número de "Imágenes sin 'alt'" igual a 0?\n8. "h1Exists": ¿Existe el "Encabezado H1" y no está vacío?\n9. "canonicalUrlExists": ¿Existe la "URL Canónica" y no está vacía?\n\n**"suggested":**\n- "title": Sugiere un "Título SEO" mejorado.\n- "metaDescription": Sugiere una "Meta Descripción" mejorada.\n- "focusKeyword": Sugiere la "Palabra Clave Principal" más apropiada para el contenido.`
    },
    seoInterpretation: {
        label: "SEO: Interpretación de Informe",
        default: `You are a world-class SEO consultant analyzing a web page's on-page SEO data. The user has received the following raw data from an analysis tool. Your task is to interpret this data and provide a clear, actionable summary in Spanish. 

Generate a JSON object with four keys: "interpretation", "actionPlan", "positives", "improvements".

-   **"interpretation"**: A narrative paragraph in Spanish explaining the most important SEO data points in a simple, easy-to-understand way.
-   **"actionPlan"**: An array of strings, where each string is a specific, actionable step to improve the page's SEO. Provide 3-5 steps.
-   **"positives"**: An array of strings, where each string is a key SEO strength of the page. Provide 2-4 strengths.
-   **"improvements"**: An array of strings, where each string is a key area for SEO improvement. Provide 2-4 areas.

The values for "actionPlan", "positives", and "improvements" MUST be arrays of strings, even if there is only one item.

**Analysis Data:**
- Page Title: "{{title}}"
- Meta Description: "{{metaDescription}}"
- H1 Heading: "{{h1}}"
- SEO Score: {{score}}/100
- Technical SEO Checks (true = passed, false = failed):
{{{checksSummary}}}`
    },
};
