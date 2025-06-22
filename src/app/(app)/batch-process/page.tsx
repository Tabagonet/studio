
"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { UploadCloud, FileText, Info, FileSpreadsheet, Image as ImageIcon, CheckCircle, Download } from "lucide-react";
import { cn } from '@/lib/utils';

// Placeholder type for combined data
interface StagedProduct {
  id: string; // SKU or unique identifier
  name: string;
  images: File[];
  csvData: Record<string, any> | null;
  status: 'ready' | 'missing_images' | 'missing_csv_data';
}

export default function BatchProcessPage() {
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [stagedProducts, setStagedProducts] = useState<StagedProduct[]>([]);

  const onImagesDrop = useCallback((acceptedFiles: File[]) => {
    setImageFiles(prev => [...prev, ...acceptedFiles]);
    // Here we would trigger the logic to group images by SKU
  }, []);

  const onCsvDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setCsvFile(acceptedFiles[0]);
      // Here we would trigger the logic to parse the CSV
    }
  }, []);

  const { getRootProps: getImageRootProps, getInputProps: getImageInputProps, isDragActive: isImageDragActive } = useDropzone({
    onDrop: onImagesDrop,
    accept: { 'image/*': ['.jpeg', '.jpg', '.png', '.webp'] },
    multiple: true,
  });

  const { getRootProps: getCsvRootProps, getInputProps: getCsvInputProps, isDragActive: isCsvDragActive } = useDropzone({
    onDrop: onCsvDrop,
    accept: { 'text/csv': ['.csv'] },
    multiple: false,
  });

  const clearFiles = () => {
    setImageFiles([]);
    setCsvFile(null);
    setStagedProducts([]);
  };

  const handleDownloadTemplate = () => {
    const headers = ['sku', 'precio_regular', 'precio_oferta', 'categorias', 'stock_inicial'];
    const exampleData = [
      ['SKU-PROD-1', '29.99', '19.99', 'Plantas > De Interior', '100'],
      ['SKU-PROD-2', '35.50', '', 'Plantas > Suculentas', '50'],
      ['SKU-PROD-3', '12.50', '9.99', 'Herramientas', '200'],
    ];
    
    const csvContent = [
      headers.join(','),
      ...exampleData.map(row => row.map(cell => `"${cell}"`).join(',')) // Quote cells to handle commas
    ].join('\n');
      
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "plantilla_productos_wooautomate.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };
  
  // This effect would combine the data when files change
  useEffect(() => {
    if (imageFiles.length > 0 && csvFile) {
        // Placeholder for the actual logic
        // 1. Group images by identifier from filename
        // 2. Parse CSV
        // 3. Merge data and populate stagedProducts
        console.log("Both file types are present. Ready to process.");
    }
  }, [imageFiles, csvFile]);

  return (
    <div className="container mx-auto py-8 space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-3">
            <UploadCloud className="h-8 w-8 text-primary" />
            <div>
              <CardTitle>Creación de Productos por Lote</CardTitle>
              <CardDescription>Sube imágenes y un archivo CSV para crear múltiples productos de forma masiva.</CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>
      
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Cómo Funciona el Proceso Híbrido</AlertTitle>
        <AlertDescription>
          <ol className="list-decimal list-inside space-y-2 mt-2">
            <li>
              <strong>Prepara tus Imágenes:</strong> Nombra cada foto con el patrón <strong><code>SKU-NUMERO.jpg</code></strong>. Por ejemplo, <code>CAM-AZ-M-1.jpg</code> y <code>CAM-AZ-M-2.jpg</code> para el mismo producto. El SKU será el identificador único.
            </li>
            <li>
              <strong>Prepara tu archivo CSV:</strong> Descarga nuestra plantilla y crea una hoja de cálculo con los datos de tus productos. La columna <strong><code>sku</code></strong> es obligatoria. Para las categorías, usa <strong><code>&gt;</code></strong> para indicar jerarquía (ej. <code>Plantas &gt; Suculentas</code>). Si una categoría no existe, se creará automáticamente.
            </li>
            <li>
              <strong>Sube Ambos Archivos:</strong> Arrastra tus imágenes y tu archivo CSV a las zonas de carga de abajo.
            </li>
             <li>
              <strong>Verifica y Procesa:</strong> El sistema cruzará los datos y te mostrará una vista previa. Desde allí, podrás generar contenido con IA y crear los productos.
            </li>
          </ol>
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5 text-muted-foreground" /> Plantilla CSV
          </CardTitle>
          <CardDescription>
            Descarga un archivo CSV de ejemplo con las columnas recomendadas para rellenar los datos de tus productos. El campo <strong><code>sku</code></strong> es obligatorio y debe coincidir con el identificador en los nombres de las imágenes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={handleDownloadTemplate}>
            Descargar Plantilla CSV
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ImageIcon className="h-5 w-5 text-muted-foreground" /> 1. Subir Imágenes</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              {...getImageRootProps()}
              className={cn(
                "flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg transition-colors cursor-pointer",
                isImageDragActive ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
              )}
            >
              <input {...getImageInputProps()} />
              <UploadCloud className="h-10 w-10 text-muted-foreground" />
              <p className="mt-3 text-center text-sm">
                {isImageDragActive ? 'Suelta las imágenes aquí' : 'Arrastra las imágenes o haz clic para seleccionarlas'}
              </p>
            </div>
            {imageFiles.length > 0 && (
              <div className="mt-4 text-sm text-center flex items-center justify-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600"/>
                <span>{imageFiles.length} imágen(es) preparada(s).</span>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-muted-foreground" /> 2. Subir Archivo CSV</CardTitle>
          </CardHeader>
          <CardContent>
             <div
              {...getCsvRootProps()}
              className={cn(
                "flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg transition-colors cursor-pointer",
                isCsvDragActive ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
              )}
            >
              <input {...getCsvInputProps()} />
              <FileText className="h-10 w-10 text-muted-foreground" />
              <p className="mt-3 text-center text-sm">
                {isCsvDragActive ? 'Suelta el archivo CSV aquí' : 'Arrastra el archivo CSV o haz clic para seleccionarlo'}
              </p>
            </div>
             {csvFile && (
              <div className="mt-4 text-sm text-center flex items-center justify-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600"/>
                <span>{csvFile.name} preparado.</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

       <Card>
        <CardHeader className="flex flex-row items-center justify-between">
           <div>
            <CardTitle>3. Verificación y Procesamiento</CardTitle>
            <CardDescription>Revisa los productos identificados antes de generar contenido y crearlos en tu tienda.</CardDescription>
           </div>
           <div className="flex gap-2">
            <Button variant="destructive" onClick={clearFiles} disabled={imageFiles.length === 0 && !csvFile}>
                Limpiar Todo
            </Button>
            <Button disabled={stagedProducts.length === 0}>
                Procesar {stagedProducts.length} Productos
            </Button>
           </div>
        </CardHeader>
        <CardContent>
            <div className="min-h-[200px] flex items-center justify-center text-center text-muted-foreground border border-dashed rounded-md">
                <p>Aquí aparecerá la lista de productos detectados al subir imágenes y el archivo CSV.</p>
            </div>
            {/* Placeholder for the verification table */}
        </CardContent>
      </Card>

    </div>
  );
}
