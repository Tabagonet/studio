
// src/app/api/user/verify/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb, admin } from '@/lib/firebase-admin';
import { z } from 'zod';

const userSchema = z.object({
  uid: z.string(),
  email: z.string().email().or(z.literal('')),
  displayName: z.string().nullable(),
  photoURL: z.string().url().nullable(),
  role: z.enum(['admin', 'user', 'pending']),
  status: z.enum(['active', 'rejected', 'pending_approval']),
  termsAccepted: z.boolean(),
});

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
      const validatedData = userSchema.safeParse(userData);
      if (!validatedData.success) {
        // This could happen if the DB schema is manually changed. We should handle it gracefully.
        console.error("User data in DB is invalid:", validatedData.error);
        return NextResponse.json({ error: "Invalid user data in database." }, { status: 500 });
      }
      return NextResponse.json(validatedData.data);
    } else {
      // User does not exist, create a new pending user
      const newUser = {
        uid: uid,
        email: email || '',
        displayName: name || null,
        photoURL: picture || null,
        role: 'pending',
        status: 'pending_approval',
        termsAccepted: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      
      await userRef.set(newUser);
      
      const { createdAt, ...returnData } = newUser;
      const validatedNewData = userSchema.safeParse(returnData);
      if (!validatedNewData.success) {
        // Should not happen, but as a safeguard
         console.error("Newly created user data is invalid:", validatedNewData.error);
         return NextResponse.json({ error: "Failed to create valid user data." }, { status: 500 });
      }

      return NextResponse.json(validatedNewData.data, { status: 201 });
    }
  } catch (dbError) {
    console.error("Firestore error in /api/user/verify:", dbError);
    return NextResponse.json({ error: 'Database error occurred.' }, { status: 500 });
  }
}
