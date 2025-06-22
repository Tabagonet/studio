
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
    const headers = [
      'sku', 'nombre', 'tipo', 'categorias', 'etiquetas', 
      'precio_regular', 'precio_oferta', 'stock_inicial',
      'atributo_1_nombre', 'atributo_1_valores', 'atributo_1_variacion', 'atributo_1_visible',
      'atributo_2_nombre', 'atributo_2_valores', 'atributo_2_variacion', 'atributo_2_visible',
    ];
    const exampleData = [
      // Simple product example
      [
        'SKU-PALA-ACERO', 'Pala de Jardín de Acero', 'simple', 'Herramientas', 'jardineria, pala, acero',
        '12.50', '9.99', '200',
        '', '', '', '', // No attributes for simple product
        '', '', '', ''
      ],
      // Variable product example
      [
        'TSHIRT-COOL', 'Camiseta Molona', 'variable', 'Ropa > Camisetas', 'ropa, camiseta, verano',
        '', '', '0', // Price and stock can be left blank for parent variable product
        'Color', 'Rojo | Verde | Azul', '1', '1', // Attribute 1 (Color) for variations
        'Talla', 'S | M | L', '1', '1'             // Attribute 2 (Talla) for variations
      ]
    ];
    
    const csvContent = [
      headers.join(','),
      ...exampleData.map(row => row.map(cell => `"${cell}"`).join(','))
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
        <AlertTitle>Cómo Funciona el Proceso por Lotes</AlertTitle>
        <AlertDescription>
          <ol className="list-decimal list-inside space-y-3 mt-2">
            <li>
              <strong>Prepara tus Imágenes:</strong> Nombra cada foto con el patrón <strong><code>SKU-NUMERO.jpg</code></strong>. El <strong>SKU</strong> debe coincidir exactamente con el de tu CSV. El <strong>NÚMERO</strong> (`-1`, `-2`, etc.) las agrupa y ordena (la `-1` será la imagen principal).
              <br />
              <em className="text-xs">Ejemplo: `TSHIRT-COOL-1.jpg`, `TSHIRT-COOL-2.jpg`.</em>
            </li>
            <li>
              <strong>Prepara tu archivo CSV:</strong> Descarga nuestra plantilla. Contiene todas las columnas necesarias para crear productos <strong>simples</strong> y <strong>variables</strong>.
              <ul className="list-disc list-inside pl-6 mt-2 text-sm space-y-1">
                  <li><strong>Columnas Clave:</strong> <code>sku</code> y <code>nombre</code> son obligatorios. El <code>nombre</code> se usará para la IA.</li>
                  <li><strong>Categorías:</strong> Usa <code>&gt;</code> para indicar jerarquía. Ej: <code>Ropa &gt; Camisetas</code>.</li>
                  <li><strong>Productos Variables:</strong>
                      <ul className="list-['-_'] list-inside pl-4">
                        <li>Define el <code>tipo</code> como <code>variable</code>.</li>
                        <li>Usa las columnas <code>atributo_1_nombre</code>, <code>atributo_1_valores</code>, etc.</li>
                        <li>Separa los valores de los atributos con <code>|</code>. Ej: <code>Rojo | Verde | Azul</code>.</li>
                        <li>Pon <code>1</code> en <code>atributo_1_variacion</code> para que se generen las combinaciones.</li>
                      </ul>
                  </li>
              </ul>
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
            Descarga un archivo CSV de ejemplo con las columnas recomendadas. El campo <strong><code>sku</code></strong> es obligatorio y debe coincidir con el identificador en los nombres de las imágenes.
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
