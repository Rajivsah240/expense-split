import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { connectToDatabase } from './database';
import { Otp, User, UserRecord } from './models';

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_MS = 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;

export const normalizeEmail = (value: unknown) => String(value || '').trim().toLowerCase();

export const serializeUser = (user: UserRecord) => ({
  uid: user._id.toString(),
  displayName: user.displayName,
  username: user.username,
  usernameLower: user.usernameLower,
  email: user.email,
  photoURL: user.photoURL || undefined
});

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be set to a random value of at least 32 characters.');
  }
  return secret;
}

function hashOtp(email: string, otp: string) {
  return crypto.createHmac('sha256', getJwtSecret()).update(`${email}:${otp}`).digest('hex');
}

function getMailer() {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) {
    throw new Error('SMTP_USER and SMTP_PASS must be configured to send login codes.');
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: process.env.SMTP_SECURE !== 'false',
    auth: { user, pass }
  });
}

export async function requestOtp(email: string) {
  await connectToDatabase();
  const existing = await Otp.findOne({ email });
  if (existing && Date.now() - existing.lastSentAt.getTime() < OTP_RESEND_MS) {
    throw new Error('Please wait one minute before requesting another code.');
  }

  const otp = crypto.randomInt(100000, 1000000).toString();
  const now = new Date();
  await Otp.findOneAndUpdate(
    { email },
    {
      email,
      codeHash: hashOtp(email, otp),
      expiresAt: new Date(now.getTime() + OTP_TTL_MS),
      lastSentAt: now,
      attempts: 0
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await getMailer().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email,
    subject: 'Your Expense Split sign-in code',
    text: `Your Expense Split sign-in code is ${otp}. It expires in 10 minutes.`,
    html: `<p>Your Expense Split sign-in code is:</p><p style="font-size: 24px; font-weight: 700; letter-spacing: 4px">${otp}</p><p>This code expires in 10 minutes.</p>`
  });
}

function usernameBase(email: string) {
  const base = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').slice(0, 15).toLowerCase();
  return base.length >= 3 ? base : 'user';
}

async function createUser(email: string) {
  const displayName = email.split('@')[0] || 'User';
  const base = usernameBase(email);

  for (let attempt = 0; attempt < 10; attempt++) {
    const suffix = attempt === 0 ? '' : `_${crypto.randomInt(10, 100)}`;
    const username = `${base}${suffix}`;
    try {
      return await User.create({ email, displayName, username, usernameLower: username.toLowerCase() });
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
      const existing = await User.findOne({ email });
      if (existing) return existing;
    }
  }

  throw new Error('Could not create a unique username. Please try again.');
}

export async function verifyOtp(email: string, otp: string) {
  await connectToDatabase();
  const record = await Otp.findOne({ email });
  if (!record || record.expiresAt.getTime() < Date.now()) {
    throw new Error('This code has expired. Request a new one.');
  }
  if (record.attempts >= MAX_OTP_ATTEMPTS) {
    await Otp.deleteOne({ _id: record._id });
    throw new Error('Too many incorrect attempts. Request a new code.');
  }
  if (!/^[0-9]{6}$/.test(otp) || !crypto.timingSafeEqual(Buffer.from(record.codeHash), Buffer.from(hashOtp(email, otp)))) {
    await Otp.updateOne({ _id: record._id }, { $inc: { attempts: 1 } });
    throw new Error('That code is incorrect.');
  }

  await Otp.deleteOne({ _id: record._id });
  const user = (await User.findOne({ email })) || (await createUser(email));
  const token = jwt.sign({ sub: user._id.toString() }, getJwtSecret(), { expiresIn: '30d' });
  return { token, user: serializeUser(user) };
}

export async function getAuthenticatedUser(authorization?: string) {
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
  if (!token) throw new Error('Authentication is required.');

  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, getJwtSecret()) as jwt.JwtPayload;
  } catch {
    throw new Error('Your session has expired. Please sign in again.');
  }

  await connectToDatabase();
  const user = await User.findById(payload.sub);
  if (!user) throw new Error('Your account no longer exists.');
  return user;
}
