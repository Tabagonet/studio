
// src/app/api/user/verify/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb, admin } from '@/lib/firebase-admin';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const userSchema = z.object({
  uid: z.string(),
  email: z.string().email().or(z.literal('')),
  displayName: z.string().nullable(),
  photoURL: z.string().url().nullable(),
  role: z.enum(['admin', 'user', 'pending']),
  status: z.enum(['active', 'rejected', 'pending_approval']),
  termsAccepted: z.boolean(),
});

const ADMIN_EMAIL = 'tabagonet@gmail.com';

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
      // User exists, return their data
      const userData = userDoc.data();

      // --- Admin Override ---
      // This ensures the primary admin user always has the correct role and status.
      if (userData?.email === ADMIN_EMAIL && (userData?.role !== 'admin' || userData?.status !== 'active')) {
          console.log(`Applying admin override for ${ADMIN_EMAIL}`);
          const adminUpdate = { role: 'admin', status: 'active' };
          await userRef.update(adminUpdate);
          
          const updatedUserData = { ...userData, ...adminUpdate };
          const validatedData = userSchema.safeParse(updatedUserData);
          
          if (!validatedData.success) {
               console.error("Admin override user data is invalid:", validatedData.error);
               return NextResponse.json({ error: "Invalid admin override data." }, { status: 500 });
          }
          return NextResponse.json(validatedData.data);
      }
      // --- End Admin Override ---

      const validatedData = userSchema.safeParse(userData);
      if (!validatedData.success) {
        console.error("User data in DB is invalid:", validatedData.error);
        return NextResponse.json({ error: "Invalid user data in database." }, { status: 500 });
      }
      return NextResponse.json(validatedData.data);

    } else {
      // User does not exist, create a new user.
      const isAdmin = email === ADMIN_EMAIL;

      const newUser = {
        uid: uid,
        email: email || '',
        displayName: name || null,
        photoURL: picture || null,
        role: isAdmin ? 'admin' : 'pending',
        status: isAdmin ? 'active' : 'pending_approval',
        termsAccepted: isAdmin, // Admins auto-accept terms
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      
      await userRef.set(newUser);
      
      // --- Create notification for admins ---
      if (newUser.status === 'pending_approval') {
          const adminsSnapshot = await adminDb.collection('users').where('role', '==', 'admin').get();
          if (!adminsSnapshot.empty) {
              const batch = adminDb.batch();
              adminsSnapshot.forEach(adminDoc => {
                  const notificationRef = adminDb!.collection('notifications').doc();
                  batch.set(notificationRef, {
                      recipientUid: adminDoc.id,
                      type: 'new_user_pending',
                      title: 'Nuevo Usuario Registrado',
                      message: `El usuario ${newUser.displayName || newUser.email} está pendiente de aprobación.`,
                      link: '/admin/users',
                      read: false,
                      createdAt: admin.firestore.FieldValue.serverTimestamp(),
                  });
              });
              await batch.commit();
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
