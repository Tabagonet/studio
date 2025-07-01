
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { auth, firebaseSignOut } from "@/lib/firebase";
import { Clock, LogOut, Mail } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { APP_NAME, SUPPORT_EMAIL } from "@/lib/constants";
import Link from "next/link";

export default function PendingApprovalPage() {
    const router = useRouter();
    const { toast } = useToast();

    const handleSignOut = async () => {
        try {
          await firebaseSignOut(auth);
          toast({ title: "Sesión Cerrada" });
          router.push('/login'); 
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Ocurrió un error desconocido.";
          toast({
            title: "Error al Cerrar Sesión",
            description: errorMessage,
            variant: "destructive",
          });
        }
    };

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
            <Card className="w-full max-w-md text-center">
                <CardHeader>
                    <div className="mx-auto bg-primary/10 p-3 rounded-full w-fit">
                        <Clock className="h-10 w-10 text-primary" />
                    </div>
                    <CardTitle className="mt-4">Cuenta Pendiente de Aprobación</CardTitle>
                    <CardDescription>
                        Gracias por registrarte en {APP_NAME}. Un administrador revisará tu solicitud de acceso pronto.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                        Si tienes alguna pregunta, por favor contacta con el soporte.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2 justify-center">
                        <Button variant="outline" onClick={handleSignOut}>
                            <LogOut className="mr-2 h-4 w-4" />
                            Cerrar Sesión
                        </Button>
                        <Button asChild>
                           <Link href={`mailto:${SUPPORT_EMAIL}`}>
                                <Mail className="mr-2 h-4 w-4" />
                                Contactar con Soporte
                            </Link>
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
