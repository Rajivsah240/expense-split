import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { DEFAULT_NOTIFICATION_PREFS, type Me, type NotificationPrefs } from '../shared/types.js';
import { connectToDatabase } from './db.js';
import { HttpError, badRequest, tooMany, unauthorized } from './http.js';
import { sendOtpEmail } from './mail.js';
import { Otp, User, type UserDoc } from './models.js';

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_MS = 45 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const TOKEN_TTL = '60d';

export const normalizeEmail = (value: unknown) => String(value ?? '').trim().toLowerCase();

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const USERNAME_PATTERN = /^[a-zA-Z0-9_]{3,20}$/;

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new HttpError(500, 'JWT_SECRET must be set to a random value of at least 32 characters.');
  }
  return secret;
}

function hashOtp(email: string, code: string): string {
  return crypto.createHmac('sha256', getJwtSecret()).update(`${email}:${code}`).digest('hex');
}

export function serializeMe(user: UserDoc): Me {
  const prefs = (user.notificationPrefs ?? {}) as Partial<NotificationPrefs>;
  return {
    userId: user._id.toString(),
    email: user.email,
    displayName: user.displayName || '',
    username: user.username || '',
    profileComplete: Boolean(user.profileComplete && user.displayName && user.username),
    notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS, ...prefs },
    createdAt: user.createdAt ?? Date.now(),
  };
}

export async function requestOtp(email: string): Promise<{ resendAfter: number }> {
  if (!EMAIL_PATTERN.test(email)) throw badRequest('Enter a valid email address.');
  await connectToDatabase();

  const existing = await Otp.findOne({ email });
  if (existing) {
    const elapsed = Date.now() - existing.lastSentAt.getTime();
    if (elapsed < OTP_RESEND_MS) {
      throw tooMany(`Please wait ${Math.ceil((OTP_RESEND_MS - elapsed) / 1000)}s before asking for another code.`);
    }
  }

  const code = crypto.randomInt(100000, 1000000).toString();
  const now = new Date();

  await Otp.findOneAndUpdate(
    { email },
    {
      email,
      codeHash: hashOtp(email, code),
      expiresAt: new Date(now.getTime() + OTP_TTL_MS),
      lastSentAt: now,
      attempts: 0,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // Local development escape hatch when SMTP is unavailable. Never enable in production.
  if (process.env.OTP_DEV_LOG === 'true') {
    console.log(`[auth] sign-in code for ${email}: ${code}`);
  }

  try {
    await sendOtpEmail(email, code);
  } catch (error) {
    if (process.env.OTP_DEV_LOG !== 'true') {
      // Don't leave a live code behind if the user never received it.
      await Otp.deleteOne({ email });
      throw error;
    }
  }

  return { resendAfter: OTP_RESEND_MS };
}

export async function verifyOtp(email: string, code: string): Promise<{ token: string; user: Me }> {
  if (!EMAIL_PATTERN.test(email)) throw badRequest('Enter a valid email address.');
  await connectToDatabase();

  const record = await Otp.findOne({ email });
  if (!record || record.expiresAt.getTime() < Date.now()) {
    throw badRequest('That code has expired. Ask for a new one.');
  }
  if (record.attempts >= MAX_OTP_ATTEMPTS) {
    await Otp.deleteOne({ _id: record._id });
    throw badRequest('Too many incorrect attempts. Ask for a new code.');
  }

  const expected = Buffer.from(record.codeHash, 'utf8');
  const supplied = Buffer.from(/^\d{6}$/.test(code) ? hashOtp(email, code) : 'x'.repeat(64), 'utf8');
  if (expected.length !== supplied.length || !crypto.timingSafeEqual(expected, supplied)) {
    await Otp.updateOne({ _id: record._id }, { $inc: { attempts: 1 } });
    throw badRequest('That code is incorrect.');
  }

  await Otp.deleteOne({ _id: record._id });

  let user = await User.findOne({ email });
  if (!user) {
    // Profile stays empty until onboarding, so nothing is ever auto-named for the user.
    user = await User.create({
      email,
      displayName: '',
      profileComplete: false,
      notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }

  const token = jwt.sign({ sub: user._id.toString() }, getJwtSecret(), { expiresIn: TOKEN_TTL });
  return { token, user: serializeMe(user) };
}

export async function getAuthenticatedUser(authorization: string | undefined): Promise<UserDoc> {
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token) throw unauthorized('Sign in to continue.');

  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, getJwtSecret()) as jwt.JwtPayload;
  } catch {
    throw unauthorized('Your session expired. Please sign in again.');
  }

  await connectToDatabase();
  const user = await User.findById(payload.sub);
  if (!user) throw unauthorized('That account no longer exists.');
  return user;
}
