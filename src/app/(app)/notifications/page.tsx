
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Bell, Trash2, CheckCircle, AlertTriangle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";

// Example notification data structure
interface ExampleNotification {
  id: string;
  icon: React.ElementType;
  iconColor?: string;
  title: string;
  description: string;
  timestamp: string;
  variant: "default" | "destructive";
}

const exampleNotifications: ExampleNotification[] = [
  {
    id: "1",
    icon: CheckCircle,
    iconColor: "text-green-500",
    title: "Lote 'batch_1678886400000' completado",
    description: "Se procesaron 15 imágenes. 14 exitosas, 1 con error.",
    timestamp: "Hace 5 minutos",
    variant: "default",
  },
  {
    id: "2",
    icon: AlertTriangle,
    iconColor: "text-yellow-500",
    title: "Error de API WooCommerce",
    description: "No se pudo conectar a la API de WooCommerce. Revisa tus claves API en Configuración.",
    timestamp: "Hace 1 hora",
    variant: "destructive",
  },
  {
    id: "3",
    icon: Info,
    iconColor: "text-blue-500",
    title: "Actualización de Plantilla",
    description: "La plantilla 'Ropa Verano SEO' ha sido actualizada por un administrador.",
    timestamp: "Hace 3 horas",
    variant: "default",
  },
];

export default function NotificationsPage() {
  const hasNotifications = exampleNotifications.length > 0;

  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-8">
        <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground font-headline">Notificaciones</h1>
            <p className="text-muted-foreground">Historial de notificaciones sobre procesos, errores y actualizaciones importantes.</p>
        </div>
        <Button variant="outline" disabled>
            <Trash2 className="mr-2 h-4 w-4" /> Limpiar Todas las Notificaciones
        </Button>
      </div>

      <Card className="shadow-lg rounded-lg">
        <CardHeader className="border-b">
          <CardTitle>Bandeja de Entrada</CardTitle>
          <CardDescription>Aquí se mostrarán las notificaciones importantes de la aplicación.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {hasNotifications ? (
            <ul className="divide-y divide-border">
              {exampleNotifications.map((notification) => (
                <li key={notification.id} className="p-4 hover:bg-muted/50 transition-colors">
                  <Alert variant={notification.variant} className="border-0 p-0">
                     <div className="flex items-start space-x-3">
                        <notification.icon className={`mt-1 h-5 w-5 flex-shrink-0 ${notification.iconColor || 'text-foreground'}`} />
                        <div className="flex-1">
                            <AlertTitle className="font-semibold">{notification.title}</AlertTitle>
                            <AlertDescription className="text-sm text-muted-foreground">
                                {notification.description}
                            </AlertDescription>
                            <p className="text-xs text-muted-foreground/80 mt-1">{notification.timestamp}</p>
                        </div>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" title="Marcar como leída (funcionalidad futura)">
                            <Bell className="h-4 w-4" />
                        </Button>
                     </div>
                  </Alert>
                </li>
              ))}
            </ul>
          ) : (
            <div className="min-h-[200px] flex flex-col items-center justify-center text-center p-6">
                <Bell className="h-16 w-16 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No hay notificaciones recientes.</p>
              <p className="text-sm text-muted-foreground">Las alertas importantes sobre tu actividad aparecerán aquí.</p>
            </div>
          )}
        </CardContent>
        {hasNotifications && (
            <CardFooter className="border-t pt-4 flex justify-end">
                 <p className="text-xs text-muted-foreground">Mostrando {exampleNotifications.length} notificaciones de ejemplo.</p>
            </CardFooter>
        )}
      </Card>
    </div>
  );
}
