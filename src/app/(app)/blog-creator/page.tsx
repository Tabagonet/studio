
import { BlogCreator } from "@/app/(app)/blog-creator/blog-creator";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Newspaper } from "lucide-react";

export default function BlogCreatorPage() {
  return (
    <div className="container mx-auto py-8">
       <Card className="mb-8">
        <CardHeader>
            <div className="flex items-center space-x-3">
                <Newspaper className="h-8 w-8 text-primary" />
                <div>
                    <CardTitle>Asistente de Creación de Entradas</CardTitle>
                    <CardDescription>Usa el asistente y la IA para crear nuevo contenido para tu blog de WordPress.</CardDescription>
                </div>
            </div>
        </CardHeader>
      </Card>
      <BlogCreator />
    </div>
  );
}
