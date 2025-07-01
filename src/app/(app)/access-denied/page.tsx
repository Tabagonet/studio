
"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { auth, firebaseSignOut } from "@/lib/firebase";
import { ShieldAlert, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import { APP_NAME } from "@/lib/constants";

export default function AccessDeniedPage() {
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
                     <div className="mx-auto bg-destructive/10 p-3 rounded-full w-fit">
                        <ShieldAlert className="h-10 w-10 text-destructive" />
                    </div>
                    <CardTitle className="mt-4">Acceso Denegado</CardTitle>
                    <CardDescription>
                        Tu solicitud de acceso a {APP_NAME} ha sido rechazada por un administrador.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                       Si crees que esto es un error, por favor contacta con el soporte para más información.
                    </p>
                    <Button variant="outline" onClick={handleSignOut}>
                        <LogOut className="mr-2 h-4 w-4" />
                        Cerrar Sesión
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
}
