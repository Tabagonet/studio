
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { promises as fs } from 'fs';
import path from 'path';

// This function reads the markdown file from the server's filesystem.
async function getGuideContent() {
  try {
    const filePath = path.join(process.cwd(), 'src', 'docs', 'SHOPIFY_PARTNER_APP_SETUP.md');
    const fileContent = await fs.readFile(filePath, 'utf8');
    return fileContent;
  } catch (error) {
    console.error("Failed to read Shopify setup guide:", error);
    return "<p>No se pudo cargar la guía en este momento. Por favor, contacta con el soporte.</p>";
  }
}

export default async function ShopifySetupGuidePage() {
  const content = await getGuideContent();

  return (
    <div className="container mx-auto py-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-bold">Guía de Configuración de Shopify Partner</CardTitle>
          <CardDescription>Sigue estos pasos para obtener las credenciales necesarias para la automatización.</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className="prose prose-sm md:prose-base max-w-none dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
