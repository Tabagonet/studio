
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductData } from "@/lib/types";
import Image from 'next/image';
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

interface Step2PreviewProps {
  productData: ProductData;
}

export function Step2Preview({ productData }: Step2PreviewProps) {
  const { 
    name, sku, productType, regularPrice, salePrice, category, 
    keywords, shortDescription, longDescription, attributes, photos,
    variations,
  } = productData;

  const primaryPhoto = photos.find(p => p.isPrimary) || photos[0];

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Paso 2: Vista Previa</CardTitle>
          <CardDescription>Revisa que toda la información del producto sea correcta antes de continuar.</CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{name || "Producto sin nombre"}</CardTitle>
          {sku && <CardDescription>SKU: {sku}</CardDescription>}
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-1">
              {primaryPhoto ? (
                <Image 
                  src={primaryPhoto.previewUrl} 
                  alt={name || 'Vista previa del producto'} 
                  width={300} 
                  height={300} 
                  className="rounded-lg w-full h-auto"
                />
              ) : (
                <div className="w-full aspect-square bg-muted rounded-lg flex items-center justify-center">
                  <p className="text-muted-foreground">Sin imagen principal</p>
                </div>
              )}
            </div>
            <div className="md:col-span-2 space-y-4">
              <div>
                <h4 className="font-semibold text-lg">Descripción Corta</h4>
                <div
                  className="text-muted-foreground prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: shortDescription || "No especificada." }}
                />
              </div>

              {productType !== 'grouped' && productType !== 'variable' && (
                <div>
                  <h4 className="font-semibold text-lg">Precios</h4>
                  <p>
                    <span className={cn("font-bold text-xl", salePrice && "line-through text-muted-foreground")}>
                      {regularPrice ? `${regularPrice}€` : "No especificado"}
                    </span>
                    {salePrice && <span className="ml-2 font-bold text-xl text-primary">{`${salePrice}€`}</span>}
                  </p>
                </div>
              )}
              {(productType === 'grouped' || productType === 'variable') && (
                 <div>
                    <h4 className="font-semibold text-lg">Precios</h4>
                    <p className="text-muted-foreground italic">
                      {productType === 'grouped' 
                        ? 'Los productos agrupados no tienen precio.'
                        : 'El precio se define en cada variación.'}
                    </p>
                </div>
              )}


              <div>
                <h4 className="font-semibold text-lg">Detalles</h4>
                <ul className="list-disc list-inside text-muted-foreground">
                  <li>Tipo: <Badge variant="outline">{productType}</Badge></li>
                  <li>Categoría: <Badge variant="outline">{category?.name || 'No especificada'}</Badge></li>
                </ul>
              </div>
            </div>
          </div>
          
          <div className="space-y-4">
            <div>
              <h4 className="font-semibold text-lg">Descripción Larga</h4>
              <div 
                className="text-muted-foreground whitespace-pre-wrap prose prose-sm max-w-none [&_strong]:text-foreground [&_em]:text-foreground"
                dangerouslySetInnerHTML={{ __html: longDescription || "No especificada." }}
              />
            </div>
            
            {attributes && attributes.length > 0 && attributes.some(attr => attr.name) && (
                <div>
                    <h4 className="font-semibold text-lg">Atributos</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {attributes.filter(attr => attr.name).map((attr, index) => (
                           <div key={index} className="p-2 border rounded-md">
                                <p className="font-medium text-sm">{attr.name}</p>
                                <p className="text-xs text-muted-foreground">{attr.value}</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {productType === 'variable' && variations && variations.length > 0 && (
              <div>
                <h4 className="font-semibold text-lg">Variaciones Generadas</h4>
                  <Accordion type="single" collapsible className="w-full">
                    {variations.map(variation => (
                      <AccordionItem value={variation.id} key={variation.id}>
                        <AccordionTrigger>
                          <div className="flex flex-wrap gap-x-4 gap-y-1">
                             {variation.attributes.map(attr => (
                                <span key={attr.name} className="text-sm">
                                  <span className="font-medium">{attr.name}:</span>
                                  <span className="text-muted-foreground ml-1">{attr.value}</span>
                                </span>
                              ))}
                          </div>
                        </AccordionTrigger>
                        <AccordionContent>
                           <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>SKU</TableHead>
                                  <TableHead>Precio Regular</TableHead>
                                  <TableHead>Precio de Oferta</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                <TableRow>
                                  <TableCell>{variation.sku || "N/A"}</TableCell>
                                  <TableCell>{variation.regularPrice ? `${variation.regularPrice}€` : 'N/A'}</TableCell>
                                  <TableCell>{variation.salePrice ? `${variation.salePrice}€` : 'N/A'}</TableCell>
                                </TableRow>
                              </TableBody>
                            </Table>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
              </div>
            )}
            
            {keywords && (
              <div>
                <h4 className="font-semibold text-lg">Palabras Clave/Etiquetas</h4>
                <div className="flex flex-wrap gap-2">
                  {keywords.split(',').map(k => k.trim()).filter(k => k).map((keyword, index) => (
                    <Badge key={index} variant="secondary">{keyword}</Badge>
                  ))}
                </div>
              </div>
            )}

            {photos.length > 1 && (
              <div>
                <h4 className="font-semibold text-lg">Otras Imágenes</h4>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                  {photos.filter(p => !p.isPrimary).map(photo => (
                    <Image 
                      key={photo.id}
                      src={photo.previewUrl} 
                      alt={`Imagen secundaria de ${name}`}
                      width={100}
                      height={100}
                      className="rounded-md w-full h-auto"
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

    