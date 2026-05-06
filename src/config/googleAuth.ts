// Google OAuth Configuration for GeoCheckr
// Project: geocheckr-490409
// Client Secret loaded from env: GOOGLE_CLIENT_SECRET

export const GOOGLE_CONFIG = {
  clientId: '967678944535-7i4cocl37ddcpmgi93lb3490q7lme2i5.apps.googleusercontent.com',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  redirectUri: 'https://auth.expo.io/@tboese/geocheckr',
  scopes: [
    'https://www.googleapis.com/auth/spreadsheets',
    'https://www.googleapis.com/auth/drive',
  ],
};
