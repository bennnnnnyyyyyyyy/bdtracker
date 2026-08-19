import fs from 'fs';
import path from 'path';
import { Firestore } from '@google-cloud/firestore';
import { CallRecord, MeetingRecord, AgentMapping } from '../types/dashboard';

let firestoreInstance: Firestore | null = null;

export function getFirestoreClient(): Firestore | null {
  if (firestoreInstance) return firestoreInstance;

  const databaseId = process.env.FIRESTORE_DATABASE_ID || '(default)';

  // 1. Try local service account file (google2.json)
  const saPath = path.join(process.cwd(), 'google2.json');
  if (fs.existsSync(saPath)) {
    try {
      const saKey = JSON.parse(fs.readFileSync(saPath, 'utf8'));
      firestoreInstance = new Firestore({
        projectId: saKey.project_id || 'tribal-quest-484611-j3',
        databaseId: databaseId,
        credentials: {
          client_email: saKey.client_email,
          private_key: saKey.private_key,
        },
      });
      return firestoreInstance;
    } catch (e) {
      console.warn('Error initializing Firestore from google2.json:', e);
    }
  }

  // 2. Fall back to Environment Variables (Vercel / Production)
  const projectId = process.env.GOOGLE_PROJECT_ID || 'tribal-quest-484611-j3';
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (clientEmail && privateKey) {
    firestoreInstance = new Firestore({
      projectId,
      databaseId: databaseId,
      credentials: {
        client_email: clientEmail,
        private_key: privateKey,
      },
    });
    return firestoreInstance;
  }

  return null;
}

/**
 * Saves or updates all dashboard raw data into Firestore collections.
 * Uses batch writes (chunks of 400 documents max per batch).
 */
export async function saveRawDataToFirestore(data: {
  calls: CallRecord[];
  meetings: MeetingRecord[];
  trackerCounts: Record<string, Record<string, number>>;
  agentMappings: AgentMapping[];
}): Promise<{ callsCount: number; meetingsCount: number; timestamp: string }> {
  const db = getFirestoreClient();
  if (!db) throw new Error('Firestore client could not be initialized.');

  const clearCollection = async (collectionName: string) => {
    while (true) {
      const snapshot = await db.collection(collectionName).limit(400).get();
      if (snapshot.empty) break;
      const batch = db.batch();
      snapshot.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }
  };

  // Replace each mirrored collection so Firestore exactly matches the Sheets snapshot.
  await Promise.all([
    clearCollection('agent_mappings'),
    clearCollection('meetings'),
    clearCollection('calls'),
  ]);

  const timestamp = new Date().toISOString();

  // 1. Save Agent Mappings
  const mappingsBatch = db.batch();
  data.agentMappings.forEach((m, idx) => {
    const ref = db.collection('agent_mappings').doc(`map_${idx}_${encodeURIComponent(m.agent)}`);
    mappingsBatch.set(ref, m);
  });
  await mappingsBatch.commit();

  // 2. Save Tracker Counts Document
  await db.collection('metadata').doc('tracker_counts').set({
    counts: data.trackerCounts,
    updatedAt: timestamp,
  });

  // 3. Save Meetings in chunked batches
  const BATCH_SIZE = 400;
  for (let i = 0; i < data.meetings.length; i += BATCH_SIZE) {
    const chunk = data.meetings.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    chunk.forEach((m, idx) => {
      const docId = `meeting_${i + idx}_${m.dateAdded || 'na'}`;
      const ref = db.collection('meetings').doc(docId);
      batch.set(ref, m);
    });
    await batch.commit();
  }

  // 4. Save Calls in chunked batches
  for (let i = 0; i < data.calls.length; i += BATCH_SIZE) {
    const chunk = data.calls.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    chunk.forEach((c) => {
      // Use callId as document ID if unique, or fallback
      const docId = c.callId ? `call_${c.callId}` : `call_${c.callDate}_${c.from}_${c.to}`;
      const ref = db.collection('calls').doc(docId);
      batch.set(ref, c);
    });
    await batch.commit();
  }

  // 5. Update Metadata Sync Status
  await db.collection('metadata').doc('sync_status').set({
    lastSynced: timestamp,
    totalCalls: data.calls.length,
    totalMeetings: data.meetings.length,
    totalMappings: data.agentMappings.length,
  });

  return {
    callsCount: data.calls.length,
    meetingsCount: data.meetings.length,
    timestamp,
  };
}

/**
 * Reads raw dashboard records directly from Firestore.
 */
export async function getRawDataFromFirestore(): Promise<{
  calls: CallRecord[];
  meetings: MeetingRecord[];
  trackerCounts: Record<string, Record<string, number>>;
  agentMappings: AgentMapping[];
  lastUpdated: string;
} | null> {
  const db = getFirestoreClient();
  if (!db) return null;

  try {
    const syncDoc = await db.collection('metadata').doc('sync_status').get();
    if (!syncDoc.exists) return null;

    const lastUpdated = syncDoc.data()?.lastSynced || new Date().toISOString();

    // Fetch collections in parallel
    const [callsSnap, meetingsSnap, mappingsSnap, trackerDoc] = await Promise.all([
      db.collection('calls').get(),
      db.collection('meetings').get(),
      db.collection('agent_mappings').get(),
      db.collection('metadata').doc('tracker_counts').get(),
    ]);

    const calls = callsSnap.docs.map((d) => d.data() as CallRecord);
    const meetings = meetingsSnap.docs.map((d) => d.data() as MeetingRecord);
    const agentMappings = mappingsSnap.docs.map((d) => d.data() as AgentMapping);
    const trackerCounts = (trackerDoc.data()?.counts as Record<string, Record<string, number>>) || {};

    return {
      calls,
      meetings,
      trackerCounts,
      agentMappings,
      lastUpdated,
    };
  } catch (error) {
    console.error('Error loading data from Firestore:', error);
    return null;
  }
}
