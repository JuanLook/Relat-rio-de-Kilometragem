import { initializeApp } from 'firebase/app';
import {
  AuthError,
  browserPopupRedirectResolver,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  User,
} from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

export const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets',
];

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

// Standard Google Sign-In provider (profile + email only) for fast, friction-free app login
// without triggering sensitive Workspace scope consent screens on initial entry.
const loginProvider = new GoogleAuthProvider();
loginProvider.setCustomParameters({
  prompt: 'select_account',
});

// Google Workspace provider with Drive & Sheets scopes (invoked on-demand when syncing Sheets)
const workspaceProvider = new GoogleAuthProvider();
for (const scope of SCOPES) {
  workspaceProvider.addScope(scope);
}

let isSigningIn = false;
let cachedAccessToken: string | null = null;

/**
 * Validates connection to Firestore on startup to detect offline / config issues early.
 */
async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((p) => ({
          providerId: p.providerId,
          email: p.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Maps Firebase Auth error codes into clear, actionable Portuguese instructions.
 */
export function formatFirebaseAuthError(error: unknown): {
  code: string;
  message: string;
  suggestNewTab: boolean;
} {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as AuthError).code)
      : '';

  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    const inIframe = typeof window !== 'undefined' && window.self !== window.top;
    return {
      code,
      message: inIframe
        ? 'A janela de login foi fechada ou bloqueada pelo isolamento de cookies da pré-visualização. Tente novamente selecionando sua conta até o fim ou abra o aplicativo em uma nova guia.'
        : 'A janela de login do Google foi fechada antes da conclusão. Clique novamente em Entrar com Google e aguarde o fechamento automático após escolher sua conta.',
      suggestNewTab: inIframe,
    };
  }

  if (code === 'auth/popup-blocked') {
    return {
      code,
      message:
        'O navegador bloqueou a janela de login (pop-up). Permita pop-ups para este site na barra de endereço ou abra o aplicativo em uma nova guia.',
      suggestNewTab: true,
    };
  }

  if (code === 'auth/unauthorized-domain') {
    const currentHost =
      typeof window !== 'undefined' ? window.location.hostname : 'seu-dominio';
    return {
      code,
      message: `O domínio "${currentHost}" precisa ser autorizado no Firebase Console (Authentication → Settings → Authorized domains) do projeto gen-lang-client-0667816129.`,
      suggestNewTab: false,
    };
  }

  return {
    code,
    message:
      error instanceof Error
        ? error.message
        : 'Não foi possível concluir a autenticação com o Google.',
    suggestNewTab: typeof window !== 'undefined' && window.self !== window.top,
  };
}

export const initAuth = (
  onUserChanged: (user: User | null, token: string | null) => void,
) => {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user) {
      if (!cachedAccessToken && !isSigningIn) {
        cachedAccessToken = null;
      }
      onUserChanged(user, cachedAccessToken);
    } else {
      cachedAccessToken = null;
      onUserChanged(null, null);
    }
  });
};

/**
 * Primary app sign-in using standard Google identity (no sensitive Workspace scopes),
 * ensuring smooth login for both owner and collaborators without unverified-app warnings.
 */
export const googleSignIn = async (): Promise<{ user: User }> => {
  if (isSigningIn) {
    throw { code: 'auth/cancelled-popup-request' };
  }
  try {
    isSigningIn = true;
    const result = await signInWithPopup(
      auth,
      loginProvider,
      browserPopupRedirectResolver,
    );
    return { user: result.user };
  } catch (error) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

/**
 * Incremental OAuth authorization specifically for Google Sheets & Drive sync.
 * Caches the resulting access token strictly in memory.
 */
export const authorizeGoogleWorkspace = async (): Promise<string> => {
  try {
    isSigningIn = true;
    if (auth.currentUser?.email) {
      workspaceProvider.setCustomParameters({
        login_hint: auth.currentUser.email,
      });
    }
    const result = await signInWithPopup(
      auth,
      workspaceProvider,
      browserPopupRedirectResolver,
    );
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error(
        'Permissão do Google Sheets/Drive não concedida. Marque as caixas de permissão ao autorizar.',
      );
    }
    cachedAccessToken = credential.accessToken;
    return cachedAccessToken;
  } catch (error) {
    console.error('Workspace OAuth error:', error);
    const formatted = formatFirebaseAuthError(error);
    throw new Error(formatted.message);
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = (): string | null => {
  return cachedAccessToken;
};

export const clearAccessToken = (): void => {
  cachedAccessToken = null;
};

export const logout = async (): Promise<void> => {
  await auth.signOut();
  cachedAccessToken = null;
};
