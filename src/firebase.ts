import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';

// Configuração pública da app Web "Portal CAF" (projeto cclx-caf-portal).
// Estes valores não são segredos: a segurança está nas regras do Firestore.
const firebaseConfig = {
  apiKey: 'AIzaSyBe00tbhzMJrl9PNViPYGpl88yhPP7F03M',
  authDomain: 'cclx-caf-portal.firebaseapp.com',
  projectId: 'cclx-caf-portal',
  storageBucket: 'cclx-caf-portal.firebasestorage.app',
  messagingSenderId: '816196009574',
  appId: '1:816196009574:web:68e11f0a085f135179f7a7',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// ignoreUndefinedProperties: campos opcionais por preencher não bloqueiam a gravação.
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true });
