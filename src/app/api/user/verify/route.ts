
// src/app/api/user/verify/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb, admin } from '@/lib/firebase-admin';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

export const dynamic = 'force-dynamic';

const userSchema = z.object({
  uid: z.string(),
  email: z.string().email().or(z.literal('')),
  displayName: z.string().nullable(),
  photoURL: z.string().url().nullable(),
  role: z.enum(['super_admin', 'admin', 'content_manager', 'product_manager', 'seo_analyst', 'pending', 'user']),
  status: z.enum(['active', 'rejected', 'pending_approval']),
  termsAccepted: z.boolean(),
  siteLimit: z.number().optional(),
  apiKey: z.string().uuid().optional(),
  companyId: z.string().nullable().optional(),
  companyName: z.string().nullable().optional(),
  companyPlan: z.enum(['lite', 'pro', 'agency']).optional().nullable(),
  plan: z.enum(['lite', 'pro', 'agency']).optional().nullable(), // Plan individual del usuario
  platform: z.enum(['woocommerce', 'shopify']).optional().nullable(),
  companyPlatform: z.enum(['woocommerce', 'shopify']).optional().nullable(),
});

const SUPER_ADMIN_EMAIL = 'tabagonet@gmail.com';

async function ensureApiKeyExists(uid: string, apiKey: string | undefined): Promise<string> {
    if (!adminDb) throw new Error("Firestore not configured.");
    if (apiKey) {
        const apiKeyRef = adminDb.collection('api_keys').doc(apiKey);
        const apiKeyDoc = await apiKeyRef.get();
        if (!apiKeyDoc.exists) {
            await apiKeyRef.set({ userId: uid, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        }
        return apiKey;
    } else {
        const newApiKey = uuidv4();
        await adminDb.collection('users').doc(uid).update({ apiKey: newApiKey });
        await adminDb.collection('api_keys').doc(newApiKey).set({ userId: uid, createdAt: admin.firestore.FieldValue.serverTimestamp() });
        return newApiKey;
    }
}


export async function GET(req: NextRequest) {
  let decodedToken;
  try {
    const token = req.headers.get('Authorization')?.split('Bearer ')[1];
    if (!token) {
      return NextResponse.json({ error: 'No auth token provided.' }, { status: 401 });
    }
    if (!adminAuth) throw new Error("Firebase Admin Auth is not initialized.");
    decodedToken = await adminAuth.verifyIdToken(token);
  } catch (error) {
    console.error("Auth error in /api/user/verify:", error);
    return NextResponse.json({ error: 'Invalid or expired auth token.' }, { status: 401 });
  }

  const { uid, email, name, picture } = decodedToken;
  
  if (!adminDb || !admin.firestore.FieldValue) {
      return NextResponse.json({ error: 'Firestore not configured on server' }, { status: 503 });
  }

  const userRef = adminDb.collection('users').doc(uid);

  try {
    const userDoc = await userRef.get();

    if (userDoc.exists) {
      const userData = userDoc.data()!;
      let finalUserData = { ...userData };

      finalUserData.apiKey = await ensureApiKeyExists(uid, userData.apiKey);

      const isSuperAdmin = finalUserData.email === SUPER_ADMIN_EMAIL;
      const needsSuperAdminUpdate = isSuperAdmin && (finalUserData.role !== 'super_admin' || finalUserData.status !== 'active');
      if (needsSuperAdminUpdate) {
          const adminUpdate = { role: 'super_admin', status: 'active', siteLimit: 999 };
          await userRef.update(adminUpdate);
          await adminAuth.setCustomUserClaims(uid, { role: 'super_admin' });
          finalUserData = { ...finalUserData, ...adminUpdate };
      }
      
      if (finalUserData.companyId) {
          const companyDoc = await adminDb.collection('companies').doc(finalUserData.companyId).get();
          if (companyDoc.exists) {
              const companyData = companyDoc.data();
              finalUserData.companyName = companyData?.name || null;
              finalUserData.companyPlatform = companyData?.platform || null;
              finalUserData.companyPlan = companyData?.plan || null;
          }
      }
      
      const roleToReturn = finalUserData.role || 'pending';
      const validatedData = userSchema.safeParse({...finalUserData, role: roleToReturn});
      if (!validatedData.success) {
        console.error("User data in DB is invalid:", validatedData.error);
        return NextResponse.json({ error: "Invalid user data in database." }, { status: 500 });
      }
      return NextResponse.json(validatedData.data);

    } else {
        const lowercasedEmail = email?.toLowerCase() || '';
        const invitationsQuery = await adminDb.collection('invitations').where('email', '==', lowercasedEmail).limit(1).get();

        const isInvited = !invitationsQuery.empty;
        const invitationData = isInvited ? invitationsQuery.docs[0].data() : null;
        
        const isSuperAdmin = email === SUPER_ADMIN_EMAIL;
        const newApiKey = uuidv4();
        let role: string;
        let status: string;
        let companyIdToAssign: string | null = null;
        
        if (isSuperAdmin) {
            role = 'super_admin';
            status = 'active';
        } else if (isInvited) {
            role = 'content_manager'; // Default role for invited users
            status = 'active';
            companyIdToAssign = invitationData?.companyId || null;
        } else {
            role = 'pending';
            status = 'pending_approval';
        }

        const newUser = {
            uid: uid,
            email: lowercasedEmail,
            displayName: name || null,
            photoURL: picture || null,
            role: role,
            status: status,
            termsAccepted: true,
            apiKey: newApiKey,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            companyId: companyIdToAssign,
        };
        
        const batch = adminDb.batch();
        batch.set(userRef, newUser);
        batch.set(adminDb.collection('api_keys').doc(newApiKey), { userId: uid, createdAt: newUser.createdAt });
        
        if(isInvited) {
            batch.delete(invitationsQuery.docs[0].ref);
        }

        await batch.commit();

        await adminAuth.setCustomUserClaims(uid, { role: role });
        
        if (newUser.status === 'pending_approval') {
            const adminsSnapshot = await adminDb.collection('users').where('role', 'in', ['admin', 'super_admin']).get();
            if (!adminsSnapshot.empty) {
                const notificationBatch = adminDb.batch();
                for (const adminDoc of adminsSnapshot.docs) {
                    if (adminDoc.id === uid) continue;
                    const notificationRef = adminDb.collection('notifications').doc();
                    notificationBatch.set(notificationRef, {
                        recipientUid: adminDoc.id, type: 'new_user_pending', title: 'Nuevo Usuario Registrado',
                        message: `El usuario ${newUser.displayName || newUser.email} está pendiente de aprobación.`,
                        link: '/admin/users', read: false, createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                }
                await notificationBatch.commit();
            }
        }
        
        const { createdAt, ...returnData } = newUser;
        const validatedNewData = userSchema.safeParse(returnData);
        if (!validatedNewData.success) {
            console.error("Newly created user data is invalid:", validatedNewData.error);
            return NextResponse.json({ error: "Failed to create valid user data." }, { status: 500 });
        }

        return NextResponse.json(validatedNewData.data, { status: 201 });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    console.error("Firestore error in /api/user/verify:", error);
    return NextResponse.json({ error: `Database error occurred: ${errorMessage}` }, { status: 500 });
  }
}
