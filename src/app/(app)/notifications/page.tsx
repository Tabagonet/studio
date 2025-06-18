
"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Bell, Trash2, CheckCircle, AlertTriangle, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AppNotification } from '@/lib/types';
import { db } from '@/lib/firebase'; // Firebase client SDK
import { collection, query, orderBy, onSnapshot, Timestamp } from 'firebase/firestore';
import { APP_NOTIFICATIONS_COLLECTION } from '@/lib/constants';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import Link from 'next/link';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // const userId = 'temp_user_id'; // TODO: Replace with actual authenticated user ID

  useEffect(() => {
    setIsLoading(true);
    // In a real app with authentication, you would filter by userId:
    // const q = query(collection(db, APP_NOTIFICATIONS_COLLECTION), where("userId", "==", userId), orderBy("timestamp", "desc"));
    const q = query(collection(db, APP_NOTIFICATIONS_COLLECTION), orderBy("timestamp", "desc"));
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const fetchedNotifications: AppNotification[] = [];
      querySnapshot.forEach((doc) => {
        fetchedNotifications.push({ id: doc.id, ...doc.data() } as AppNotification);
      });
      setNotifications(fetchedNotifications);
      setIsLoading(false);
    }, (error) => {
      console.error("Error fetching notifications: ", error);
      // Consider adding a toast notification for this error
      setIsLoading(false);
    });

    return () => unsubscribe(); // Cleanup listener
  }, []); // Add userId to dependency array if using it in query

  const getNotificationIcon = (type: AppNotification['type']) => {
    switch (type) {
      case 'success': return CheckCircle;
      case 'error': return AlertTriangle;
      case 'warning': return AlertTriangle; // Or a different icon for warning
      case 'info': return Info;
      default: return Bell;
    }
  };

  const getNotificationIconColor = (type: AppNotification['type']) => {
    switch (type) {
      case 'success': return "text-green-500";
      case 'error': return "text-destructive";
      case 'warning': return "text-yellow-500";
      case 'info': return "text-blue-500";
      default: return "text-foreground";
    }
  };
  
  const getAlertVariant = (type: AppNotification['type']): "default" | "destructive" => {
    return type === 'error' ? 'destructive' : 'default';
  }

  const formatDate = (timestamp: Timestamp | undefined | null): string => {
    if (!timestamp) return 'Fecha desconocida';
    try {
      return formatDistanceToNow(timestamp.toDate(), { addSuffix: true, locale: es });
    } catch (error) {
      console.error("Error formatting date:", error);
      return 'Fecha inválida';
    }
  };


  return (
    <div className="container mx-auto py-8 space-y-8">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 mb-8">
        <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground font-headline">Notificaciones</h1>
            <p className="text-muted-foreground">Historial de notificaciones sobre procesos, errores y actualizaciones importantes.</p>
        </div>
        <Button variant="outline" disabled> {/* Functionality to be implemented */}
            <Trash2 className="mr-2 h-4 w-4" /> Limpiar Todas las Notificaciones
        </Button>
      </div>

      <Card className="shadow-lg rounded-lg">
        <CardHeader className="border-b">
          <CardTitle>Bandeja de Entrada</CardTitle>
          <CardDescription>Aquí se mostrarán las notificaciones importantes de la aplicación.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="min-h-[200px] flex items-center justify-center">
              <Loader2 className="h-12 w-12 text-primary animate-spin" />
              <p className="ml-3 text-muted-foreground">Cargando notificaciones...</p>
            </div>
          ) : notifications.length > 0 ? (
            <ul className="divide-y divide-border">
              {notifications.map((notification) => {
                const IconComponent = getNotificationIcon(notification.type);
                return (
                  <li key={notification.id} className={`p-4 hover:bg-muted/50 transition-colors ${!notification.isRead ? 'bg-accent/30' : ''}`}>
                    <Alert variant={getAlertVariant(notification.type)} className="border-0 p-0">
                       <div className="flex items-start space-x-3">
                          <IconComponent className={`mt-1 h-5 w-5 flex-shrink-0 ${getNotificationIconColor(notification.type)}`} />
                          <div className="flex-1">
                              <AlertTitle className="font-semibold">{notification.title}</AlertTitle>
                              <AlertDescription className="text-sm text-muted-foreground">
                                  {notification.description}
                              </AlertDescription>
                              <div className="flex items-center justify-between">
                                <p className="text-xs text-muted-foreground/80 mt-1">{formatDate(notification.timestamp)}</p>
                                {notification.linkTo && (
                                  <Button variant="link" size="sm" asChild className="text-xs px-0 h-auto py-0 mt-1">
                                    <Link href={notification.linkTo}>Ver detalles</Link>
                                  </Button>
                                )}
                              </div>
                          </div>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" title="Marcar como leída (funcionalidad futura)" disabled>
                              <Bell className="h-4 w-4" />
                          </Button>
                       </div>
                    </Alert>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="min-h-[200px] flex flex-col items-center justify-center text-center p-6">
                <Bell className="h-16 w-16 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No hay notificaciones recientes.</p>
              <p className="text-sm text-muted-foreground">Las alertas importantes sobre tu actividad aparecerán aquí.</p>
            </div>
          )}
        </CardContent>
        {!isLoading && notifications.length > 0 && (
            <CardFooter className="border-t pt-4 flex justify-end">
                 <p className="text-xs text-muted-foreground">Mostrando {notifications.length} notificaciones.</p>
            </CardFooter>
        )}
      </Card>
    </div>
  );
}
