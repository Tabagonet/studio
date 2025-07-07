
'use client';

import { GoogleReCaptchaProvider } from 'react-google-recaptcha-v3';
import React from 'react';

export default function ReCaptchaProvider({ children }: { children: React.ReactNode }) {
  const recaptchaKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

  if (!recaptchaKey) {
    console.error("reCAPTCHA site key not found. Please set NEXT_PUBLIC_RECAPTCHA_SITE_KEY in your environment variables.");
    // Render children without provider if key is missing, allowing chatbot to function in local dev without it.
    return <>{children}</>;
  }

  return (
    <GoogleReCaptchaProvider reCaptchaKey={recaptchaKey}>
      {children}
    </GoogleReCaptchaProvider>
  );
}
