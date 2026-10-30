import 'dotenv/config';

const required = ['MONGODB_URI', 'JWT_SECRET', 'TEAM_SIGNUP_CODE'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  throw new Error(`Missing environment variables: ${missing.join(', ')}. See server/.env.example.`);
}

export const env = {
  // API_PORT, not PORT: tools that launch `npm run dev` often set PORT for the web
  // client, which would move the API away from the address the dev proxy expects.
  port: Number(process.env.API_PORT) || (process.env.NODE_ENV === 'production' && Number(process.env.PORT)) || 5050,
  isProduction: process.env.NODE_ENV === 'production',
  mongodbUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  signupCode: process.env.TEAM_SIGNUP_CODE,
  timezone: process.env.APP_TIMEZONE || 'Asia/Kolkata',
  trustProxy: Number(process.env.TRUST_PROXY) || 0,
  clientOrigins: (process.env.CLIENT_ORIGIN ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean),
};
