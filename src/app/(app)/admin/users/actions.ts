

'use server';

import { adminAuth, adminDb, admin } from '@/lib/firebase-admin';
import { z } from 'zod';

export async function inviteUserAction(email: string, token: string): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
        if (!adminAuth || !adminDb) throw new Error("Firebase Admin not initialized");
        const decodedToken = await adminAuth.verifyIdToken(token);
        const inviterUid = decodedToken.uid;
        
        const inviterDoc = await adminDb.collection('users').doc(inviterUid).get();
        if (!inviterDoc.exists) {
            return { success: false, error: "El usuario que invita no existe." };
        }
        const inviterData = inviterDoc.data()!;
        const companyIdToAssign = inviterData.companyId;

        if (inviterData.role !== 'super_admin' && !companyIdToAssign) {
            return { success: false, error: 'Debes pertenecer a una empresa para poder invitar a otros usuarios.' };
        }
        
        const lowercasedEmail = email.toLowerCase();
        const usersQuery = await adminDb.collection('users').where('email', '==', lowercasedEmail).limit(1).get();
        if (!usersQuery.empty) {
            return { success: false, error: `Un usuario con el email ${email} ya existe en la plataforma.` };
        }
        
        const invitationsQuery = await adminDb.collection('invitations').where('email', '==', lowercasedEmail).limit(1).get();
        if (!invitationsQuery.empty) {
            return { success: false, error: `Ya existe una invitación pendiente para el email ${email}.` };
        }
        
        // --- Plan Limit Check ---
        if (inviterData.role !== 'super_admin' && companyIdToAssign) {
            const companyDoc = await adminDb.collection('companies').doc(companyIdToAssign).get();
            const plansDoc = await adminDb.collection('config').doc('plans').get();
            if (companyDoc.exists && plansDoc.exists) {
                const companyData = companyDoc.data()!;
                const allPlans = plansDoc.data()!.plans;
                const currentPlan = allPlans.find((p: any) => p.id === companyData.plan) || allPlans.find((p: any) => p.id === 'lite');
                
                const companyUsersSnapshot = await adminDb.collection('users').where('companyId', '==', companyIdToAssign).get();
                if (companyUsersSnapshot.size >= currentPlan.users) {
                     return { success: false, error: 'Límite de usuarios alcanzado para tu plan. Mejora tu plan para añadir más usuarios.' };
                }
            }
        }
        
        const invitationRef = adminDb.collection('invitations').doc();
        await invitationRef.set({
            email: lowercasedEmail,
            companyId: companyIdToAssign,
            invitedBy: inviterUid,
            createdAt: new Date(),
        });
        
        return { success: true, message: `Se ha creado una invitación para ${email}. El usuario podrá registrarse y se unirá automáticamente a tu equipo.` };

    } catch (error: any) {
        return { success: false, error: error.message || 'Ocurrió un error desconocido.' };
    }
}

export async function deleteUserAction(targetUid: string, token: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!adminAuth || !adminDb) throw new Error("Firebase Admin not initialized");
    const decodedToken = await adminAuth.verifyIdToken(token);
    const adminUid = decodedToken.uid;
    
    if (targetUid === adminUid) {
        return { success: false, error: 'Los administradores no pueden eliminar su propia cuenta.' };
    }

    const adminUserDoc = await adminDb.collection('users').doc(adminUid).get();
    const adminRole = adminUserDoc.data()?.role;

    const targetUserDoc = await adminDb.collection('users').doc(targetUid).get();
    if (!targetUserDoc.exists) {
        return { success: true }; // Already deleted from DB
    }
    const targetUserRole = targetUserDoc.data()?.role;

    // Permission check
    if (adminRole !== 'super_admin' && (targetUserRole === 'admin' || targetUserRole === 'super_admin')) {
      return { success: false, error: 'Los administradores no pueden eliminar a otros administradores o superadministradores.' };
    }
    
    // Delete Firestore data in a batch
    const batch = adminDb.batch();
    const userRef = adminDb.collection('users').doc(targetUid);
    const userSettingsRef = adminDb.collection('user_settings').doc(targetUid);
    const apiKey = targetUserDoc.data()?.apiKey;
    if (apiKey) {
      batch.delete(adminDb.collection('api_keys').doc(apiKey));
    }
    batch.delete(userRef);
    batch.delete(userSettingsRef);
    await batch.commit();

    // Delete from Firebase Auth
    await adminAuth.deleteUser(targetUid);
    
    return { success: true };
  } catch (error: any) {
    console.error(`Error deleting user ${targetUid}:`, error);
    return { success: false, error: error.message || 'Error desconocido al eliminar.' };
  }
}

const addCreditsSchema = z.object({
  entityId: z.string(),
  entityType: z.enum(['user', 'company']),
  credits: z.number().int().min(1, 'La cantidad de créditos debe ser al menos 1.'),
  source: z.string().optional().default('Manual Admin Add'),
});

export async function addCreditsAction(data: z.input<typeof addCreditsSchema>, token: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!adminAuth || !adminDb) throw new Error("Firebase Admin not initialized");
    const decodedToken = await adminAuth.verifyIdToken(token);
    const adminUserDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
    if (adminUserDoc.data()?.role !== 'super_admin') {
      return { success: false, error: 'Forbidden: Only super admins can add credits.' };
    }

    const validatedData = addCreditsSchema.parse(data);
    const { entityId, entityType, credits, source } = validatedData;
    
    const collectionName = entityType === 'company' ? 'companies' : 'user_settings';
    const entityRef = adminDb.collection(collectionName).doc(entityId);

    const newCreditEntry = {
      amount: credits,
      source: source,
      addedAt: new Date().toISOString(),
    };

    // Use FieldValue.arrayUnion to add to the array without overwriting existing entries.
    await entityRef.set({
      oneTimeCredits: admin.firestore.FieldValue.arrayUnion(newCreditEntry),
    }, { merge: true }); // Use set with merge to create the field if it doesn't exist.

    return { success: true };
  } catch (error: any) {
    console.error('Error in addCreditsAction:', error);
    if (error instanceof z.ZodError) {
        return { success: false, error: JSON.stringify(error.flatten()) };
    }
    return { success: false, error: error.message || 'An unknown error occurred while adding credits.' };
  }
}
