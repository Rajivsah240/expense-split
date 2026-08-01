import { getAuthenticatedUser, normalizeEmail, requestOtp, serializeUser, verifyOtp } from './auth';
import { Expense, Team, User } from './models';

type ApiRequest = { method?: string; headers: Record<string, string | string[] | undefined>; body?: any };
type ApiResponse = { status(code: number): ApiResponse; json(value: unknown): unknown };

const isUsername = (value: string) => /^[a-zA-Z0-9_]{3,20}$/.test(value);
const id = (value: { _id: { toString(): string } }) => value._id.toString();
const profile = (user: any) => serializeUser(user);
const teamJson = (team: any) => ({ ...team.toObject(), id: id(team), _id: undefined });
const expenseJson = (expense: any) => ({ ...expense.toObject(), id: id(expense), _id: undefined, teamId: undefined });

function errorStatus(message: string) {
  if (message.includes('Authentication') || message.includes('session')) return 401;
  if (message.includes('not found')) return 404;
  if (message.includes('not allowed')) return 403;
  if (message.includes('incorrect') || message.includes('expired') || message.includes('wait') || message.includes('valid')) return 400;
  return 500;
}

async function requireTeam(userId: string, teamId: string) {
  const team = await Team.findOne({ _id: teamId, memberIds: userId });
  if (!team) throw new Error('Team not found or access is not allowed.');
  return team;
}

export async function handleApi(req: ApiRequest, res: ApiResponse, path: string[]) {
  try {
    const method = (req.method || 'GET').toUpperCase();
    const route = path.join('/');

    if (route === 'auth/request-otp' && method === 'POST') {
      const email = normalizeEmail(req.body?.email);
      if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter a valid email address.');
      await requestOtp(email);
      return res.status(200).json({ message: 'A sign-in code has been sent.' });
    }
    if (route === 'auth/verify-otp' && method === 'POST') {
      const email = normalizeEmail(req.body?.email);
      const otp = String(req.body?.otp || '').trim();
      return res.status(200).json(await verifyOtp(email, otp));
    }

    const currentUser = await getAuthenticatedUser(
      Array.isArray(req.headers.authorization) ? req.headers.authorization[0] : req.headers.authorization
    );
    const currentUserId = id(currentUser);

    if (route === 'auth/me' && method === 'GET') {
      return res.status(200).json({ user: profile(currentUser) });
    }
    if (route === 'auth/username' && method === 'PATCH') {
      const username = String(req.body?.username || '').trim().replace(/^@/, '');
      if (!isUsername(username)) throw new Error('Username must be 3-20 letters, numbers, or underscores.');
      const update: Record<string, string> = {
        username,
        usernameLower: username.toLowerCase()
      };
      // Backfill displayName if it was never set, so the required field is always present.
      if (!currentUser.displayName) {
        update.displayName = currentUser.email?.split('@')[0] || 'User';
      }
      let updatedUser;
      try {
        updatedUser = await User.findByIdAndUpdate(
          currentUserId,
          { $set: update },
          { new: true, runValidators: true }
        );
      } catch (error: any) {
        if (error?.code === 11000) return res.status(409).json({ error: `Username @${username} is already taken.` });
        throw error;
      }
      if (!updatedUser) throw new Error('Your account no longer exists.');
      const userProfile = profile(updatedUser);
      await Team.updateMany(
        { memberIds: currentUserId },
        { $set: { [`membersInfo.${currentUserId}`]: userProfile } }
      );
      return res.status(200).json({ user: userProfile });
    }

    if (route === 'teams' && method === 'GET') {
      const teams = await Team.find({ memberIds: currentUserId }).sort({ createdAt: -1 });
      return res.status(200).json({ teams: teams.map(teamJson) });
    }
    if (route === 'teams' && method === 'POST') {
      const name = String(req.body?.name || '').trim();
      if (!name) throw new Error('Enter a team name.');
      const userProfile = profile(currentUser);
      const team = await Team.create({
        name,
        creatorId: currentUserId,
        memberIds: [currentUserId],
        membersInfo: { [currentUserId]: userProfile },
        createdAt: Date.now()
      });
      return res.status(201).json({ team: teamJson(team) });
    }

    const [group, teamId, child, childId] = path;
    if (group === 'teams' && teamId && child === 'members' && method === 'POST') {
      const team = await requireTeam(currentUserId, teamId);
      if (team.creatorId !== currentUserId) throw new Error('Only the team leader can add members.');
      const username = String(req.body?.username || '').trim().replace(/^@/, '').toLowerCase();
      const member = await User.findOne({ usernameLower: username });
      if (!member) throw new Error('Username not found.');
      const memberId = id(member);
      if (!team.memberIds.includes(memberId)) {
        team.memberIds.push(memberId);
        team.membersInfo = { ...team.membersInfo, [memberId]: profile(member) };
        await team.save();
      }
      return res.status(200).json({ team: teamJson(team) });
    }
    if (group === 'teams' && teamId && child === 'members' && childId && method === 'DELETE') {
      const team = await requireTeam(currentUserId, teamId);
      if (team.creatorId !== currentUserId) throw new Error('Only the team leader can remove members.');
      if (childId === currentUserId) throw new Error('The team leader cannot remove themselves.');
      team.memberIds = team.memberIds.filter((memberId: string) => memberId !== childId);
      const membersInfo = { ...team.membersInfo };
      delete membersInfo[childId];
      team.membersInfo = membersInfo;
      await team.save();
      return res.status(200).json({ team: teamJson(team) });
    }
    if (group === 'teams' && teamId && child === 'expenses' && method === 'GET') {
      await requireTeam(currentUserId, teamId);
      const expenses = await Expense.find({ teamId }).sort({ createdAt: -1 });
      return res.status(200).json({ expenses: expenses.map(expenseJson) });
    }
    if (group === 'teams' && teamId && child === 'expenses' && method === 'POST') {
      await requireTeam(currentUserId, teamId);
      const payload = req.body || {};
      const expense = await Expense.create({ ...payload, teamId, createdAt: payload.createdAt || Date.now() });
      return res.status(201).json({ expense: expenseJson(expense) });
    }
    if (group === 'teams' && teamId && child === 'expenses' && childId && method === 'PATCH') {
      await requireTeam(currentUserId, teamId);
      const expense = await Expense.findOneAndUpdate(
        { _id: childId, teamId },
        { ...req.body, updatedAt: Date.now() },
        { new: true }
      );
      if (!expense) throw new Error('Expense not found.');
      return res.status(200).json({ expense: expenseJson(expense) });
    }
    if (group === 'teams' && teamId && child === 'expenses' && childId && method === 'DELETE') {
      await requireTeam(currentUserId, teamId);
      await Expense.deleteOne({ _id: childId, teamId });
      return res.status(204).json({});
    }

    return res.status(404).json({ error: 'API route not found.' });
  } catch (error: any) {
    const message = error?.message || 'Server error.';
    console.error('API error:', message);
    return res.status(errorStatus(message)).json({ error: message });
  }
}
