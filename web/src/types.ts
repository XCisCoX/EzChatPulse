export interface UserDTO {
  id: number;
  username: string;
  displayName: string;
  createdAt: number;
  online: boolean;
  lastSeenAt: number | null;
}

export interface MemberInfo {
  userId: number;
  username: string;
  displayName: string;
  role: 'member' | 'admin';
  online: boolean;
  lastSeenAt: number | null;
}

export interface FileDTO {
  id: number;
  name: string;
  mime: string;
  size: number;
  url: string;
}

export interface MessageDTO {
  id: number;
  chatId: number;
  senderId: number;
  kind: 'text' | 'image' | 'file';
  text: string | null;
  file: FileDTO | null;
  replyTo: number | null;
  createdAt: number;
}

export interface ChatSummary {
  id: number;
  type: 'private' | 'group';
  name: string | null;
  createdAt: number;
  members: MemberInfo[];
}

export interface ChatDTO extends ChatSummary {
  lastMessage: MessageDTO | null;
  unread: number;
}

/** Client-side message: optimistic sends carry tempId/pending/failed. */
export interface UIMessage extends MessageDTO {
  tempId?: string;
  pending?: boolean;
  failed?: boolean;
}

export interface UIChat extends ChatDTO {
  messages: UIMessage[];
  hasMore: boolean;
  loadingHistory: boolean;
  /** userId → expiry timestamp of their typing indicator */
  typingUsers: Map<number, number>;
  /** userId → highest message id they've read */
  readBy: Map<number, number>;
}

export interface Session {
  token: string;
  user: UserDTO;
}
