import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Bell, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotificationsPage() {
  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground font-headline">Notificaciones</h1>
            <p className="text-muted-foreground">Historial de notificaciones sobre procesos y errores.</p>
        </div>
        <Button variant="outline" disabled>
            <Trash2 className="mr-2 h-4 w-4" /> Limpiar Notificaciones
        </Button>
      </div>


      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle>Historial de Notificaciones</CardTitle>
        </CardHeader>
        <CardContent className="min-h-[200px] flex flex-col items-center justify-center text-center">
            <Bell className="h-16 w-16 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No hay notificaciones recientes.</p>
        </CardContent>
      </Card>
    </div>
  );
}
