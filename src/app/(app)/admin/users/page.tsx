
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";
import { UserManagementTable } from './user-management-table';

export default function AdminUsersPage() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-3">
            <Users className="h-8 w-8 text-primary" />
            <div>
              <CardTitle>Gestión de Usuarios</CardTitle>
              <CardDescription>
                Aprueba, rechaza y gestiona los roles de los usuarios de la aplicación.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>
      
      <UserManagementTable />

    </div>
  );
}
