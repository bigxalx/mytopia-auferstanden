import { CloudTasksClient } from '@google-cloud/tasks';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { getStorage } from 'firebase-admin/storage';
import { OAuth2Client } from 'google-auth-library';
initializeApp();

export const firestore = getFirestore();
export const auth = getAuth();
export const messaging = getMessaging();
export const storage = getStorage();
export const tasksClient = new CloudTasksClient();
export const oidcClient = new OAuth2Client();
