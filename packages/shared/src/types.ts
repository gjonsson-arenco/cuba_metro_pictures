// Photo entity
export interface Photo {
  photoId: string;
  filename: string;
  s3Key: string;
  s3KeyThumb?: string;
  tags: string[];
  uploadedBy: string;
  uploadedAt: string;
  metadata?: PhotoMetadata;
  isDeleted: boolean;
  urls?: PhotoUrls;
  /** Cumulative rotation applied on top of the EXIF-normalized original, in degrees (0/90/180/270). */
  rotation?: number;
  sailingClass?: SailingClass;
  day?: RegattaDay;
}

export interface PhotoMetadata {
  width?: number;
  height?: number;
  size?: number;
  mimeType?: string;
}

export interface PhotoUrls {
  original: string;
  thumbnail?: string;
  medium?: string;
}

// API Request/Response types
export interface ListPhotosRequest {
  limit?: number;
  offset?: number;
  tags?: string[];
}

export interface ListPhotosResponse {
  photos: Photo[];
  /**
   * Cuántas fotos pasan el filtro en total, no cuántas trae esta página.
   * Sólo viene en la primera página (la que no manda `lastKey`): contarlas
   * cuesta un scan entero, y el número no cambia mientras se pagina.
   */
  total?: number;
  hasMore: boolean;
  lastKey?: string;
}

export interface PresignedUploadRequest {
  filenames: string[];
}

export interface PresignedUploadItem {
  filename: string;
  presignedUrl: string;
  photoId: string;
  s3Key: string;
  expiresIn: number;
}

export interface PresignedUploadResponse {
  uploads: PresignedUploadItem[];
}

export interface TagPhotosRequest {
  photoIds: string[];
  tags?: string[];
  sailingClass?: SailingClass | null;
  day?: RegattaDay | null;
}

export interface TagPhotosResponse {
  success: boolean;
  updatedCount: number;
}

export interface UpdatePhotoMetadataRequest {
  tags?: string[];
  sailingClass?: SailingClass | null;
  day?: RegattaDay | null;
}

export interface UpdatePhotoMetadataResponse {
  success: boolean;
}

export interface DeletePhotoResponse {
  success: boolean;
}

export interface RotatePhotoRequest {
  direction: 'cw' | 'ccw';
}

export interface RotatePhotoResponse {
  success: boolean;
  rotation: number;
}

export interface DownloadPhotoResponse {
  url: string;
  filename: string;
  expiresIn: number;
}

// ── App settings ──────────────────────────────────────────────────────────
// Site-wide switches an admin can flip at runtime. Stored as a single
// DynamoDB item so no redeploy is needed to change them.
export interface AppSettings {
  /** When true, visitors who are not logged in can download originals too. */
  publicDownloads: boolean;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  publicDownloads: false
};

export interface GetSettingsResponse {
  settings: AppSettings;
}

export type UpdateSettingsRequest = Partial<AppSettings>;

export interface UpdateSettingsResponse {
  settings: AppSettings;
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}

// Auth
export interface AuthUser {
  userId: string;
  email: string;
  groups: string[];
}

// ── Roles ─────────────────────────────────────────────────────────────────
// A role maps to a Cognito group. `viewer` is the absence of any group: a
// logged-in user with no group can browse and download, nothing else.
export const ADMIN_GROUP = 'admin';
export const EDITOR_GROUP = 'editor';

export type UserRole = 'admin' | 'editor' | 'viewer';

export const USER_ROLES: UserRole[] = ['admin', 'editor', 'viewer'];

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  editor: 'Editor',
  viewer: 'Visitante'
};

export const USER_ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  admin: 'Gestiona fotos y usuarios',
  editor: 'Gestiona fotos, no usuarios',
  viewer: 'Sólo ver y descargar'
};

export function isUserRole(v: unknown): v is UserRole {
  return typeof v === 'string' && (USER_ROLES as string[]).includes(v);
}

export function roleFromGroups(groups: string[]): UserRole {
  if (groups.includes(ADMIN_GROUP)) return 'admin';
  if (groups.includes(EDITOR_GROUP)) return 'editor';
  return 'viewer';
}

/** The Cognito group backing a role, or null for `viewer` (no group). */
export function groupForRole(role: UserRole): string | null {
  if (role === 'admin') return ADMIN_GROUP;
  if (role === 'editor') return EDITOR_GROUP;
  return null;
}

/** Upload, tag, edit, rotate and delete photos. */
export function canManagePhotos(groups: string[]): boolean {
  return groups.includes(ADMIN_GROUP) || groups.includes(EDITOR_GROUP);
}

/** Create, edit and delete users. Admin only. */
export function canManageUsers(groups: string[]): boolean {
  return groups.includes(ADMIN_GROUP);
}

// ── User management (ABM) ─────────────────────────────────────────────────
export interface ManagedUser {
  username: string;
  email: string;
  role: UserRole;
  enabled: boolean;
  status: string;
  createdAt: string;
  lastModifiedAt: string;
}

export interface ListUsersResponse {
  users: ManagedUser[];
}

export interface CreateUserRequest {
  email: string;
  role: UserRole;
}

export interface CreateUserResponse {
  user: ManagedUser;
  /** Shown once so the admin can pass it on. Never stored anywhere. */
  temporaryPassword: string;
}

export interface UpdateUserRequest {
  role?: UserRole;
  enabled?: boolean;
}

export interface UpdateUserResponse {
  user: ManagedUser;
}

export interface DeleteUserResponse {
  success: boolean;
}

export interface ResetUserPasswordResponse {
  username: string;
  password: string;
}

/** Must match UserPool.Policies.PasswordPolicy.MinimumLength in the SAM template. */
export const PASSWORD_MIN_LENGTH = 8;
export const MAX_TAGS_PER_PHOTO = 10;
export const MAX_TAG_LENGTH = 50;
/** 0 disables the client/shared size check. */
export const MAX_FILE_SIZE_MB = 0;
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Sailing metadata
export type SailingClass = 'optimist' | 'ilca' | '29er' | '420';
export type RegattaDay = 'day1' | 'day2' | 'day3' | 'day4';

export const SAILING_CLASSES: SailingClass[] = ['optimist', 'ilca', '29er', '420'];
export const REGATTA_DAYS: RegattaDay[] = ['day1', 'day2', 'day3', 'day4'];

export const SAILING_CLASS_LABELS: Record<SailingClass, string> = {
  optimist: 'Optimist',
  ilca: 'ILCA',
  '29er': '29er',
  '420': '420'
};

export const REGATTA_DAY_LABELS: Record<RegattaDay, string> = {
  day1: 'Día 1',
  day2: 'Día 2',
  day3: 'Día 3',
  day4: 'Día 4'
};

export function isSailingClass(v: unknown): v is SailingClass {
  return typeof v === 'string' && (SAILING_CLASSES as string[]).includes(v);
}

export function isRegattaDay(v: unknown): v is RegattaDay {
  return typeof v === 'string' && (REGATTA_DAYS as string[]).includes(v);
}
