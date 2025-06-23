import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductData } from "@/lib/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FileUp, ListChecks, Rocket } from "lucide-react";

interface Step3ConfirmProps {
  productData: ProductData;
}

export function Step3Confirm({ productData }: Step3ConfirmProps) {
  const photosToUploadCount = productData.photos.filter(p => p.status === 'pending').length;
  const validAttributesCount = productData.attributes.filter(a => a.name && a.name.trim() !== '').length;

  return (
    <div className="space-y-8">
       <Card>
        <CardHeader>
          <CardTitle>Paso 3: Confirmación y Creación</CardTitle>
          <CardDescription>Estás a punto de iniciar el proceso de creación del producto.</CardDescription>
        </CardHeader>
      </Card>

      <Alert>
        <Rocket className="h-4 w-4" />
        <AlertTitle>Proceso de Creación</AlertTitle>
        <AlertDescription>
          Al hacer clic en "Crear Producto", se realizarán las siguientes acciones en orden:
          <ul className="list-decimal list-inside mt-2 space-y-1">
            <li>
              <span className="font-semibold">Subida de Imágenes:</span> Se subirán {photosToUploadCount} imágen(es) a tu servidor. Verás el progreso en la sección de imágenes.
            </li>
            <li>
              <span className="font-semibold">Creación en WooCommerce:</span> Una vez que todas las imágenes estén subidas, se creará el producto en tu tienda con toda la información proporcionada.
            </li>
          </ul>
        </AlertDescription>
      </Alert>
      
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-2">
            <ListChecks className="h-5 w-5 text-primary" />
            <CardTitle>Resumen Final</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
            <p><span className="font-semibold">Nombre:</span> {productData.name || "N/A"}</p>
            <p><span className="font-semibold">SKU:</span> {productData.sku || "N/A"}</p>
            <p><span className="font-semibold">Precio Regular:</span> {productData.regularPrice ? `${productData.regularPrice}€` : "N/A"}</p>
            <p><span className="font-semibold">Categoría:</span> {productData.category?.name || "N/A"}</p>
            <p><span className="font-semibold">Atributos:</span> {validAttributesCount}</p>
            <p><span className="font-semibold">Imágenes:</span> {productData.photos.length}</p>
        </CardContent>
      </Card>
      
    </div>
  );
}
