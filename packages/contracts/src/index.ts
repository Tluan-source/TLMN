export type Gender = 'UNSPECIFIED' | 'MALE' | 'FEMALE' | 'OTHER';

export type UserProfile = {
  id: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  gender?: Gender;
  chatNickname?: string | null;
  chatIcon?: string;
};

export type CoupleWorkspace = {
  id: string;
  name: string;
  timezone?: string;
  chatBackground?: string;
  chatBackgroundImageUrl?: string | null;
  members: UserProfile[];
  inviteCode?: string;
};

export const CHAT_ICONS = ['💗', '🌸', '🐰', '🧸', '🍓', '🌙', '🐱', '✨'] as const;
export const MESSAGE_REACTIONS = ['❤️', '🥰', '😂', '😮', '😢', '🙌'] as const;
export type MessageReaction = { emoji: string; count: number; reacted: boolean };
export type ReminderItem = { id: string; title: string; scheduledAt: string; status: 'PENDING' | 'COMPLETED'; notifiedAt: string | null };

export type Entry = {
  id: string;
  content: string;
  createdAt: string;
  media: { id: string; url: string; mimeType: string }[];
  reactions: MessageReaction[];
};

export type CommentItem = {
  id: string;
  content: string;
  createdAt: string;
  author: UserProfile;
  replies: CommentItem[];
};

export type DailyStory = {
  id: string;
  date: string;
  status: 'DRAFT' | 'PUBLISHED';
  author: UserProfile;
  entries: Entry[];
  comments: CommentItem[];
};

export type CalendarMemory = {
  date: string;
  coverUrl: string | null;
};

export type AnniversaryItem = {
  id: string;
  title: string;
  date: string;
  originalDate: string;
  note: string | null;
  annual: boolean;
};

export type AnniversarySuggestion = {
  anniversaryId: string;
  title: string;
  date: string;
  message: string;
  reminderDate: string | null;
  reminderTime: string | null;
};

export type DailySummary = {
  summary: string;
  sourceHash: string;
  updatedAt: string;
  stale: boolean;
};

export type StreakStatus = {
  current: number;
  best: number;
  todayComplete: boolean;
  month: string;
  monthStreakDays: number;
  progress: number;
  target: number;
};
