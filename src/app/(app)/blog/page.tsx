
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClipboardList } from "lucide-react";
import { BlogDataTable } from "./blog-data-table";

export default function BlogManagementPage() {
  return (
    <div className="container mx-auto py-8 space-y-6">
      <Card>
        <CardHeader>
            <div className="flex items-center space-x-3">
                <ClipboardList className="h-8 w-8 text-primary" />
                <div>
                    <CardTitle>Gestión de Entradas del Blog</CardTitle>
                    <CardDescription>Visualiza, filtra y gestiona todas las entradas de tu blog de WordPress.</CardDescription>
                </div>
            </div>
        </CardHeader>
      </Card>
      
      <BlogDataTable />

    </div>
  );
}
