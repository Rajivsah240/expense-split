import { Schema, model, models } from 'mongoose';

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    displayName: { type: String, required: true, trim: true },
    username: { type: String, required: true, trim: true },
    usernameLower: { type: String, required: true, unique: true, lowercase: true, trim: true },
    photoURL: { type: String }
  },
  { timestamps: true }
);

const otpSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    lastSentAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 }
  },
  { timestamps: true }
);

const teamSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    creatorId: { type: String, required: true, index: true },
    memberIds: { type: [String], required: true, index: true },
    membersInfo: { type: Schema.Types.Mixed, required: true },
    createdAt: { type: Number, required: true }
  },
  { versionKey: false }
);

const expenseSchema = new Schema(
  {
    teamId: { type: String, required: true, index: true },
    type: { type: String, default: 'session' },
    shopName: String,
    notes: String,
    sessionDate: Number,
    paidBy: { type: String, required: true },
    paidTo: String,
    createdBy: String,
    items: { type: Schema.Types.Mixed },
    totalAmount: { type: Number, required: true },
    shares: { type: Schema.Types.Mixed, required: true },
    createdAt: { type: Number, required: true },
    updatedAt: Number
  },
  { versionKey: false }
);

// Mongoose model instances are cached in serverless runtimes. The API layer
// validates request data before writing, so keeping these as flexible document
// models avoids leaking database-specific types into the application contract.
export type UserRecord = any;
export const User: any = models.User || model('User', userSchema);
export const Otp: any = models.Otp || model('Otp', otpSchema);
export const Team: any = models.Team || model('Team', teamSchema);
export const Expense: any = models.Expense || model('Expense', expenseSchema);
