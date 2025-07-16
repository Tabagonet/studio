
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Edit } from "lucide-react";
import { InventoryTable } from "./inventory-table";


export default function InventoryEditorPage() {
  return (
    <div className="container mx-auto py-8 space-y-6">
      <Card>
        <CardHeader>
            <div className="flex items-center space-x-3">
                <Edit className="h-8 w-8 text-primary" />
                <div>
                    <CardTitle>Editor Rápido de Inventario</CardTitle>
                    <CardDescription>Visualiza y edita los precios y el stock de tus productos de forma masiva y eficiente.</CardDescription>
                </div>
            </div>
        </CardHeader>
      </Card>
      
      <InventoryTable />

    </div>
  );
}
