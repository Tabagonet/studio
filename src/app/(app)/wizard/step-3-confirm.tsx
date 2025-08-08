// src/app/(app)/wizard/step-3-confirm.tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductData } from "@/lib/types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FileUp, ListChecks, Rocket, ShieldAlert } from "lucide-react";
import { useState, useEffect } from "react";
import { auth } from "@/lib/firebase";

interface Step3ConfirmProps {
  productData: ProductData;
  onValidationComplete: (isValid: boolean) => void;
}

export function Step3Confirm({ productData, onValidationComplete }: Step3ConfirmProps) {
  const [isNameDuplicate, setIsNameDuplicate] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    const checkName = async () => {
        if (!productData.name) {
            setIsChecking(false);
            setIsNameDuplicate(false);
            onValidationComplete(true);
            return;
        }
        setIsChecking(true);
        try {
            const user = auth.currentUser;
            if (!user) throw new Error("Not authenticated");
            const token = await user.getIdToken();
            const response = await fetch(`/api/woocommerce/products/check?name=${encodeURIComponent(productData.name)}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await response.json();
            const duplicate = data.exists;
            setIsNameDuplicate(duplicate);
            const isInvalid = duplicate && (!productData.sku || !productData.supplier);
            onValidationComplete(!isInvalid);
        } catch (e) {
            console.error("Failed to check name on confirmation screen", e);
            setIsNameDuplicate(false);
            onValidationComplete(true);
        } finally {
            setIsChecking(false);
        }
    };
    checkName();
  }, [productData.name, productData.sku, productData.supplier, onValidationComplete]);

  const photosToUploadCount = productData.photos.filter(p => p.status === 'pending').length;
  const validAttributesCount = productData.attributes.filter(a => a.name && a.name.trim() !== '').length;
  
  const isInvalid = isNameDuplicate && (!productData.sku || !productData.supplier);

  return (
    <div className="space-y-8">
       <Card>
        <CardHeader>
          <CardTitle>Paso 3: Confirmación y Creación</CardTitle>
          <CardDescription>Estás a punto de iniciar el proceso de creación del producto.</CardDescription>
        </CardHeader>
      </Card>

      {isInvalid && (
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Faltan Datos Obligatorios</AlertTitle>
            <AlertDescription>
                El nombre del producto ya existe. Para continuar, por favor, vuelve al paso anterior y proporciona un <strong>SKU</strong> y un <strong>Proveedor</strong> para diferenciar este producto.
            </AlertDescription>
          </Alert>
      )}

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
            <p><span className="font-semibold">Etiquetas:</span> {productData.tags || "Ninguna"}</p>
        </CardContent>
      </Card>
      
    </div>
  );
}
