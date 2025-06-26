
"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { UploadCloud, FileText, Info, FileSpreadsheet, Image as ImageIcon, CheckCircle, Download, Loader2, FileWarning, PackageCheck, PackageX, PackageSearch, Sparkles, ShieldAlert } from "lucide-react";
import { cn } from '@/lib/utils';
import Papa from 'papaparse';
import { useToast } from '@/hooks/use-toast';
import Image from 'next/image';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { auth } from '@/lib/firebase';
import type { ProductData, ProductPhoto, ProductVariation } from '@/lib/types';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ALL_LANGUAGES } from '@/lib/constants';
import { v4 as uuidv4 } from 'uuid';

// Staged product type
interface StagedProduct {
  id: string; // SKU
  name: string;
  images: File[];
  csvData: Record<string, any>;
  status: 'ready' | 'missing_images' | 'missing_csv_data' | 'error' | 'duplicate';
  statusMessage: string;
  processingStatus?: 'pending' | 'processing' | 'completed' | 'error';
  processingMessage?: string;
  progress?: number;
}

const getStatusInfo = (product: StagedProduct) => {
    // During processing, this status takes precedence
    if (product.processingStatus && product.processingStatus !== 'pending') {
        switch (product.processingStatus) {
            case 'processing':
                 return { icon: Loader2, color: 'text-blue-600', label: 'Procesando' };
            case 'completed':
                return { icon: PackageCheck, color: 'text-green-600', label: 'Completado' };
            case 'error':
                 return { icon: PackageX, color: 'text-destructive', label: 'Error' };
        }
    }

    // Default verification status
    switch (product.status) {
        case 'ready':
            return { icon: Sparkles, color: 'text-green-600', label: 'Listo' };
        case 'missing_images':
            return { icon: PackageSearch, color: 'text-yellow-600', label: 'Faltan Imágenes' };
        case 'missing_csv_data':
            return { icon: FileWarning, color: 'text-orange-600', label: 'Faltan Datos CSV' };
        case 'duplicate':
            return { icon: ShieldAlert, color: 'text-amber-600', label: 'Duplicado' };
        default:
            return { icon: PackageX, color: 'text-destructive', label: 'Error' };
    }
}

// Helper function to compute the Cartesian product of arrays
function cartesian(...args: string[][]): string[][] {
    const r: string[][] = [];
    const max = args.length - 1;
    function helper(arr: string[], i: number) {
        for (let j = 0, l = args[i].length; j < l; j++) {
            const a = [...arr, args[i][j]];
            if (i === max) {
                r.push(a);
            } else {
                helper(a, i + 1);
            }
        }
    }
    helper([], 0);
    return r;
}

export default function BatchProcessPage() {
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<Record<string, any>[]>([]);
  const [stagedProducts, setStagedProducts] = useState<StagedProduct[]>([]);
  const [isProcessingFiles, setIsProcessingFiles] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [saveSkuInWoo, setSaveSkuInWoo] = useState(true);
  const { toast } = useToast();

  const onImagesDrop = useCallback((acceptedFiles: File[]) => {
    setImageFiles(acceptedFiles);
  }, []);

  const onCsvDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setCsvFile(acceptedFiles[0]);
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
    setCsvData([]);
    setStagedProducts([]);
    setIsBatchProcessing(false);
  };

  const handleDownloadTemplate = () => {
    const headers = [
      'sku', 'nombre', 'tipo', 'categorias', 'etiquetas', 'traducir_a',
      'precio_regular', 'precio_oferta', 'stock_inicial',
      'atributo_1_nombre', 'atributo_1_valores', 'atributo_1_variacion', 'atributo_1_visible',
      'atributo_2_nombre', 'atributo_2_valores', 'atributo_2_variacion', 'atributo_2_visible',
    ];
    const exampleData = [
      [
        'SKU-PALA-ACERO', 'Pala de Jardín de Acero', 'simple', 'Herramientas', 'jardineria, pala, acero', 'English,French',
        '12.50', '9.99', '200',
        '', '', '', '',
        '', '', '', ''
      ],
      [
        'TSHIRT-COOL', 'Camiseta Molona', 'variable', 'Ropa > Camisetas', 'ropa, camiseta, verano', '',
        '', '', '0',
        'Color', 'Rojo | Verde | Azul', '1', '1',
        'Talla', 'S | M | L', '1', '1'
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
    link.setAttribute("download", "plantilla_productos_autopress.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };
  
   // Effect to parse CSV file
  useEffect(() => {
    if (!csvFile) {
        setCsvData([]);
        return;
    }

    Papa.parse(csvFile, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
            const validData = results.data.filter((row: any) => row.sku && row.sku.trim() !== '');
            setCsvData(validData as Record<string, any>[]);
             toast({
                title: "CSV Analizado",
                description: `Se han encontrado ${validData.length} filas con SKU válido.`,
            });
        },
        error: (error: any) => {
            console.error("Error parsing CSV:", error);
            toast({ title: "Error al leer CSV", description: error.message, variant: "destructive" });
        }
    });
  }, [csvFile, toast]);

  // Effect to combine and verify image and CSV data
  useEffect(() => {
    if (csvData.length === 0 && imageFiles.length === 0) {
        setStagedProducts([]);
        return;
    }

    const processAndVerifyProducts = async () => {
        setIsProcessingFiles(true);
        setIsVerifying(true);

        const user = auth.currentUser;
        if (!user) {
            toast({ title: 'No autenticado', description: 'Por favor, inicia sesión para verificar productos.', variant: 'destructive'});
            setIsProcessingFiles(false);
            setIsVerifying(false);
            return;
        }
        const token = await user.getIdToken();

        const csvMap = new Map<string, Record<string, any>>();
        csvData.forEach(row => {
            if(row.sku) csvMap.set(row.sku.trim(), row);
        });

        const imagesBySku = new Map<string, File[]>();
        imageFiles.forEach(file => {
            const skuMatch = file.name.match(/^([a-zA-Z0-9_-]+)-/);
            const sku = skuMatch ? skuMatch[1] : null;
            if (sku) {
                if (!imagesBySku.has(sku)) {
                    imagesBySku.set(sku, []);
                }
                imagesBySku.get(sku)!.push(file);
            }
        });
        
        const verificationPromises: Promise<StagedProduct>[] = [];

        csvMap.forEach((row, sku) => {
            const promise = (async (): Promise<StagedProduct> => {
                const matchingImages = imagesBySku.get(sku) || [];
                
                try {
                    const checkResponse = await fetch(`/api/woocommerce/products/check?sku=${encodeURIComponent(sku)}`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    
                    if (checkResponse.ok) {
                        const checkResult = await checkResponse.json();
                        if (checkResult.exists) {
                            return {
                                id: sku,
                                name: row.nombre || 'Nombre no encontrado',
                                csvData: row,
                                images: matchingImages.sort((a,b) => a.name.localeCompare(b.name)),
                                status: 'duplicate',
                                statusMessage: `Este producto (SKU: ${sku}) ya existe en WooCommerce.`,
                                processingStatus: 'pending',
                            };
                        }
                    } else {
                        console.warn(`Failed to check existence for SKU: ${sku}`);
                    }
                } catch (err) {
                    console.error(`Error during existence check for SKU ${sku}:`, err);
                }

                const hasImages = matchingImages.length > 0;
                return {
                    id: sku,
                    name: row.nombre || 'Nombre no encontrado',
                    csvData: row,
                    images: matchingImages.sort((a,b) => a.name.localeCompare(b.name)),
                    status: hasImages ? 'ready' : 'missing_images',
                    statusMessage: hasImages ? 'Listo para procesar.' : 'Datos encontrados en CSV, pero faltan imágenes con este SKU.',
                    processingStatus: 'pending',
                };
            })();
            verificationPromises.push(promise);
        });

        const verifiedProducts = await Promise.all(verificationPromises);
        setIsVerifying(false);

        const processedSkus = new Set<string>();
        verifiedProducts.forEach(p => processedSkus.add(p.id));
        
        const combined = [...verifiedProducts];

        imagesBySku.forEach((images, sku) => {
            if (!processedSkus.has(sku)) {
                combined.push({
                    id: sku,
                    name: `Producto de SKU: ${sku}`,
                    images: images.sort((a,b) => a.name.localeCompare(b.name)),
                    csvData: {},
                    status: 'missing_csv_data',
                    statusMessage: 'Imágenes encontradas, pero faltan datos para este SKU en el CSV.',
                    processingStatus: 'pending',
                });
            }
        });

        setStagedProducts(combined.sort((a, b) => a.id.localeCompare(b.id)));
        setIsProcessingFiles(false);
    };

    processAndVerifyProducts();
  }, [imageFiles, csvData, toast]);
  
  const readyProductsCount = stagedProducts.filter(p => p.status === 'ready' && p.processingStatus === 'pending').length;

  const updateProductProcessingStatus = (
    sku: string, 
    processingStatus: StagedProduct['processingStatus'], 
    processingMessage?: string,
    progress?: number,
  ) => {
    setStagedProducts(prev => 
      prev.map(p => 
        p.id === sku 
          ? { ...p, processingStatus, processingMessage: processingMessage || p.processingMessage, progress: progress !== undefined ? progress : p.progress } 
          : p
      )
    );
  };
  
  const handleProcessBatch = async () => {
    const user = auth.currentUser;
    if (!user) {
        toast({ title: 'No autenticado', description: 'Por favor, inicia sesión de nuevo.', variant: 'destructive'});
        return;
    }
    const productsToProcess = stagedProducts.filter(p => p.status === 'ready' && p.processingStatus === 'pending');
    
    if (productsToProcess.length === 0) {
        toast({ title: 'Nada que procesar', description: 'No hay productos listos para ser creados.'});
        return;
    }
    
    setIsBatchProcessing(true);
    toast({ title: 'Iniciando procesamiento por lote...', description: `Se procesarán ${productsToProcess.length} productos.` });

    let successes = 0;
    let failures = 0;

    for (const product of productsToProcess) {
        try {
            const token = await user.getIdToken();
            const allTranslations: { [key: string]: number } = {};
            const sourceLang = 'Spanish'; // Assuming source is always Spanish for batch

            // 1. AI Content Generation
            updateProductProcessingStatus(product.id, 'processing', 'Generando contenido con IA...', 5);
            const aiPayload = {
                productName: product.name,
                productType: product.csvData.tipo || 'simple',
                keywords: product.csvData.etiquetas || '',
                language: sourceLang,
            };
            const aiResponse = await fetch('/api/generate-description', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`},
                body: JSON.stringify(aiPayload)
            });
            if (!aiResponse.ok) throw new Error(`La IA falló: ${await aiResponse.text()}`);
            const aiContent = await aiResponse.json();
            
            // 2. Image Uploading
            updateProductProcessingStatus(product.id, 'processing', 'Subiendo imágenes...', 15);
            const uploadedPhotos: ProductPhoto[] = [];
            if (product.images.length > 0) {
                for (const [index, imageFile] of product.images.entries()) {
                    const formData = new FormData();
                    formData.append('imagen', imageFile);
                    const imageResponse = await fetch('/api/upload-image', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` },
                        body: formData,
                    });
                    if (!imageResponse.ok) throw new Error(`Fallo en la subida de ${imageFile.name}`);
                    const imageData = await imageResponse.json();
                    uploadedPhotos.push({
                        id: imageData.url,
                        previewUrl: imageData.url,
                        name: imageFile.name,
                        uploadedUrl: imageData.url,
                        uploadedFilename: imageData.filename_saved_on_server,
                        status: 'completed',
                        progress: 100
                    });
                    const imageProgress = 15 + (25 * (index + 1) / product.images.length);
                    updateProductProcessingStatus(product.id, 'processing', `Subiendo imagen ${index + 1}/${product.images.length}...`, imageProgress);
                }
            }

            // 3. Prepare base product payload
            const createBasePayload = (pData: ProductData): any => {
                const payload: Partial<ProductData> = {
                    name: pData.name, sku: pData.sku, shouldSaveSku: saveSkuInWoo,
                    productType: pData.productType,
                    regularPrice: pData.regularPrice, salePrice: pData.salePrice, stockQuantity: pData.stockQuantity,
                    keywords: pData.keywords,
                    shortDescription: pData.shortDescription, longDescription: pData.longDescription,
                    photos: uploadedPhotos,
                    imageTitle: aiContent.imageTitle, imageAltText: aiContent.imageAltText, imageCaption: aiContent.imageCaption, imageDescription: aiContent.imageDescription,
                    categoryPath: product.csvData.categorias || '',
                    attributes: [], source: 'batch',
                };
                for (let i = 1; i <= 2; i++) {
                    if (product.csvData[`atributo_${i}_nombre`]) {
                        payload.attributes?.push({
                            name: product.csvData[`atributo_${i}_nombre`],
                            value: product.csvData[`atributo_${i}_valores`],
                            forVariations: product.csvData[`atributo_${i}_variacion`] === '1',
                            visible: product.csvData[`atributo_${i}_visible`] !== '0'
                        });
                    }
                }
                
                let variations: ProductVariation[] = [];
                if (payload.productType === 'variable') {
                    const variationAttributes = (payload.attributes || []).filter(attr => attr.forVariations);
                    if (variationAttributes.length > 0) {
                        const attributeValueSets = variationAttributes.map(attr => attr.value.split('|').map(v => v.trim()).filter(Boolean));
                        const combinations = cartesian(...attributeValueSets);
                        variations = combinations.map(combo => {
                            const attrs = combo.map((value, index) => ({ name: variationAttributes[index].name, value }));
                            const skuSuffix = attrs.map(a => a.value.substring(0,3).toUpperCase()).join('-');
                            return { id: uuidv4(), attributes: attrs, sku: `${payload.sku || 'VAR'}-${skuSuffix}`, regularPrice: '', salePrice: '', stockQuantity: '' };
                        });
                    }
                }
                payload.variations = variations;
                return payload;
            };

            // 4. Create Original Product
            updateProductProcessingStatus(product.id, 'processing', 'Creando producto original...', 50);
            const sourceLangSlug = ALL_LANGUAGES.find(l => l.code === sourceLang)?.slug || 'es';
            const originalProductData: ProductData = {
                name: product.name, sku: product.id, productType: product.csvData.tipo || 'simple',
                regularPrice: product.csvData.precio_regular || '', salePrice: product.csvData.precio_oferta || '',
                stockQuantity: product.csvData.stock_inicial || '', shortDescription: aiContent.shortDescription, longDescription: aiContent.longDescription, keywords: aiContent.keywords,
                attributes: [], photos: [], language: sourceLang, category: null
            };
            const originalApiPayload = { productData: createBasePayload(originalProductData), lang: sourceLangSlug };

            const createOriginalResponse = await fetch('/api/woocommerce/products', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(originalApiPayload) });
            if (!createOriginalResponse.ok) throw new Error(`Error creando producto original: ${await createOriginalResponse.text()}`);
            const originalResult = await createOriginalResponse.json();
            allTranslations[sourceLangSlug] = originalResult.data.id;
            
            // 5. Handle Translations
            const targetLangs = product.csvData.traducir_a ? product.csvData.traducir_a.split(',').map((l: string) => l.trim()).filter(Boolean) : [];
            let langProgress = 0;
            const totalLangSteps = targetLangs.length;
            
            for (const lang of targetLangs) {
                const stepProgress = 60 + (30 * (langProgress / totalLangSteps));
                updateProductProcessingStatus(product.id, 'processing', `Traduciendo a ${lang}...`, stepProgress);
                const translateResponse = await fetch('/api/translate', { 
                    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, 
                    body: JSON.stringify({ content: { name: originalProductData.name, short_description: originalProductData.shortDescription, long_description: originalProductData.longDescription }, targetLanguage: lang })
                });
                if (!translateResponse.ok) throw new Error(`Error al traducir a ${lang}`);
                const translatedContent = (await translateResponse.json()).content;

                updateProductProcessingStatus(product.id, 'processing', `Creando producto en ${lang}...`, stepProgress + (15 / totalLangSteps));
                const targetLangInfo = ALL_LANGUAGES.find(l => l.name === lang || l.code === lang);
                if (!targetLangInfo) throw new Error(`Idioma desconocido: ${lang}`);
                
                const translatedProductData: ProductData = {
                    ...originalProductData,
                    name: translatedContent.name, shortDescription: translatedContent.short_description, longDescription: translatedContent.long_description,
                    sku: `${originalProductData.sku}-${targetLangInfo.slug.toUpperCase()}`
                };
                const translatedApiPayload = { productData: createBasePayload(translatedProductData), lang: targetLangInfo.slug };

                const createTranslatedResponse = await fetch('/api/woocommerce/products', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(translatedApiPayload) });
                if (!createTranslatedResponse.ok) throw new Error(`Error creando producto en ${lang}: ${await createTranslatedResponse.text()}`);
                const translatedResult = await createTranslatedResponse.json();
                allTranslations[targetLangInfo.slug] = translatedResult.data.id;
                langProgress++;
            }
            
            // 6. Link Translations
            if (Object.keys(allTranslations).length > 1) {
                updateProductProcessingStatus(product.id, 'processing', 'Enlazando traducciones...', 95);
                await fetch('/api/wordpress/posts/link-translations', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ translations: allTranslations }) });
            }
            
            updateProductProcessingStatus(product.id, 'completed', '¡Producto(s) creado(s) con éxito!', 100);
            successes++;

        } catch (error: any) {
            failures++;
            const productState = stagedProducts.find(p => p.id === product.id);
            updateProductProcessingStatus(product.id, 'error', error.message, productState?.progress);
        }
    }

    toast({
        title: 'Proceso de lote finalizado',
        description: `${successes} productos procesados, ${failures} fallaron.`,
    });
    setIsBatchProcessing(false);
  };

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
                   <li><strong>Traducciones:</strong> Usa la columna <code>traducir_a</code> para indicar los idiomas de destino, separados por coma. Ej: <code>English,French</code>.</li>
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
          <Button onClick={handleDownloadTemplate} disabled={isBatchProcessing}>
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
                isImageDragActive ? "border-primary bg-primary/10" : "border-border hover:border-primary/50",
                isBatchProcessing && "cursor-not-allowed bg-muted/50"
              )}
            >
              <input {...getImageInputProps()} disabled={isBatchProcessing} />
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
                isCsvDragActive ? "border-primary bg-primary/10" : "border-border hover:border-primary/50",
                 isBatchProcessing && "cursor-not-allowed bg-muted/50"
              )}
            >
              <input {...getCsvInputProps()} disabled={isBatchProcessing} />
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
        <CardHeader className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
           <div>
            <CardTitle>3. Verificación y Procesamiento</CardTitle>
            <CardDescription>Revisa los productos identificados antes de generar contenido y crearlos en tu tienda.</CardDescription>
           </div>
           <div className="flex flex-col items-start md:items-end gap-3">
            <div className="flex items-center space-x-2">
                <Checkbox 
                    id="save-sku" 
                    checked={saveSkuInWoo} 
                    onCheckedChange={(checked) => setSaveSkuInWoo(!!checked)}
                    disabled={isBatchProcessing}
                />
                <Label htmlFor="save-sku" className="text-sm font-normal cursor-pointer">
                    Guardar SKUs en WooCommerce
                </Label>
            </div>
            <div className="flex gap-2">
                <Button variant="destructive" onClick={clearFiles} disabled={isBatchProcessing || (imageFiles.length === 0 && !csvFile)}>
                    Limpiar Todo
                </Button>
                <Button onClick={handleProcessBatch} disabled={isBatchProcessing || readyProductsCount === 0}>
                    {isBatchProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {isBatchProcessing ? 'Procesando...' : `Procesar ${readyProductsCount} Productos`}
                </Button>
            </div>
           </div>
        </CardHeader>
        <CardContent>
            {isProcessingFiles && (
                 <div className="min-h-[200px] flex items-center justify-center text-center text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin mr-2"/>
                    <p>{isVerifying ? 'Verificando productos existentes en WooCommerce...' : 'Procesando y cruzando datos...'}</p>
                </div>
            )}
            {!isProcessingFiles && stagedProducts.length === 0 && (
                <div className="min-h-[200px] flex items-center justify-center text-center text-muted-foreground border border-dashed rounded-md">
                    <p>Aquí aparecerá la lista de productos detectados al subir imágenes y el archivo CSV.</p>
                </div>
            )}
            {!isProcessingFiles && stagedProducts.length > 0 && (
                <ScrollArea className="max-h-[600px] border rounded-md">
                    <div className="p-4 space-y-3">
                    {stagedProducts.map((product) => {
                        const statusInfo = getStatusInfo(product);
                        const StatusIcon = statusInfo.icon;
                        const previewImage = product.images.length > 0 ? URL.createObjectURL(product.images[0]) : "https://placehold.co/80x80.png";
                        const message = product.processingStatus !== 'pending' ? product.processingMessage : product.statusMessage;

                        return (
                            <div key={product.id} className="flex items-start gap-4 p-3 border rounded-lg bg-card hover:bg-muted/50 transition-colors">
                                <Image
                                    src={previewImage}
                                    alt={`Previsualización de ${product.name}`}
                                    width={80}
                                    height={80}
                                    className="rounded-md object-cover h-20 w-20 flex-shrink-0"
                                    onLoad={() => {
                                        if (product.images.length > 0 && previewImage.startsWith('blob:')) {
                                           // Optional: URL.revokeObjectURL(previewImage) if it causes memory issues, but usually fine for previews.
                                        }
                                    }}
                                />
                                <div className="flex-1 min-w-0 space-y-1">
                                    <h3 className="font-semibold truncate">{product.name}</h3>
                                    <p className="text-sm text-muted-foreground">SKU: <code className="bg-muted px-1 py-0.5 rounded">{product.id}</code></p>
                                    <p className="text-sm text-muted-foreground">Imágenes encontradas: <Badge variant="secondary">{product.images.length}</Badge></p>
                                </div>
                                <div className="flex-1 max-w-xs space-y-2">
                                    <div className="flex items-center gap-2">
                                        <StatusIcon className={cn("h-5 w-5 flex-shrink-0", statusInfo.color, product.processingStatus === 'processing' && 'animate-spin')} />
                                        <div className="flex flex-col">
                                        <span className={cn("font-medium", statusInfo.color)}>{statusInfo.label}</span>
                                        <p className="text-xs text-muted-foreground">{message}</p>
                                        </div>
                                    </div>
                                    {product.processingStatus === 'processing' && product.progress !== undefined && (
                                        <div className="w-full">
                                            <Progress value={product.progress} className="h-2" />
                                            <p className="text-xs text-right font-medium">{product.progress}%</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    </div>
                </ScrollArea>
            )}
        </CardContent>
      </Card>
    </div>
  );
}
