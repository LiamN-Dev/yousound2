import fs from 'fs';
import path from 'path';
import { sql } from 'drizzle-orm';
import { db, checkSqlAvailability } from './index.ts';
import { users, popups, songRequests, systemSettings, songs } from './schema.ts';
import {
  INITIAL_USERS,
  INITIAL_POPUPS,
  INITIAL_REQUESTS,
  INITIAL_MAINTENANCE,
  INITIAL_BANNER,
} from '../data/initialData.ts';
import { generateSupabaseMigrationSql } from '../services/supabaseMigration.ts';

function hashPassword(pass: string): string {
  let hash = 0;
  for (let i = 0; i < pass.length; i++) {
    const char = pass.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `hash_v2_${Math.abs(hash).toString(16)}_${btoa(pass).slice(0, 8)}`;
}

function generateWavBuffer(durationSeconds: number, freq: number, type: 'lofi' | 'ambient' | 'synthwave' | 'acoustic'): Buffer {
  const sampleRate = 22050;
  const numSamples = sampleRate * durationSeconds;
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;

    if (type === 'lofi') {
      sample = Math.sin(2 * Math.PI * freq * t) * 0.25;
      sample += Math.sin(2 * Math.PI * (freq * 1.5) * t) * 0.15;
      sample += (Math.random() - 0.5) * 0.03;
    } else if (type === 'ambient') {
      sample = Math.sin(2 * Math.PI * freq * t) * 0.2;
      sample += Math.sin(2 * Math.PI * (freq * 1.25) * t) * 0.15;
      sample += Math.sin(2 * Math.PI * (freq * 0.75) * t) * 0.1;
    } else if (type === 'synthwave') {
      sample = Math.sin(2 * Math.PI * freq * t) * 0.3;
      sample += Math.sin(2 * Math.PI * (freq * 2) * t) * 0.15;
      sample = Math.sin(sample * 1.2) * 0.35;
    } else {
      sample = Math.sin(2 * Math.PI * freq * t) * 0.3;
      sample += Math.sin(2 * Math.PI * (freq * 2.5) * t) * 0.1;
    }

    const intSample = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
    buffer.writeInt16LE(intSample, 44 + i * 2);
  }

  return buffer;
}

export async function seedDatabaseIfEmpty() {
  const isAvailable = await checkSqlAvailability();
  if (!isAvailable) {
    console.log('[Seed] SQL Database not connected; localStore active.');
    return;
  }

  try {
    // 1. Verify if 'users' table exists in the connected database
    const checkRes = await db.execute(sql`
      SELECT to_regclass('public.users') as tbl_exists;
    `);

    const tableExists = checkRes.rows[0]?.tbl_exists !== null && checkRes.rows[0]?.tbl_exists !== undefined;

    if (!tableExists) {
      console.log('[Seed] Database tables do not exist. Automatically executing initial schema creation...');
      const initSql = generateSupabaseMigrationSql();
      await db.execute(sql.raw(initSql));
      console.log('[Seed] Database tables successfully created and seeded on PostgreSQL / Supabase!');
      return;
    }

    // 2. If tables already exist, ensure seed records exist if empty
    const existingUsers = await db.select().from(users).limit(1);
    if (existingUsers.length === 0) {
      console.log('Seeding initial users into SQL...');
      for (const u of INITIAL_USERS) {
        const passwordHash = hashPassword(u.username === 'admin' ? 'admin123' : 'password123');
        await db.insert(users).values({
          uid: u.id,
          username: u.username,
          email: `${u.username}@yousong.app`,
          passwordHash,
          role: u.role,
          isApproved: u.isApproved,
          note: u.note || null,
        });
      }
    }

    const existingSettings = await db.select().from(systemSettings).limit(1);
    if (existingSettings.length === 0) {
      console.log('Seeding initial system settings into SQL...');
      await db.insert(systemSettings).values([
        { key: 'maintenance', value: JSON.stringify(INITIAL_MAINTENANCE) },
        { key: 'banner', value: JSON.stringify(INITIAL_BANNER) },
        { key: 'auto_tag_rules', value: JSON.stringify([]) },
      ]);
    }

    const existingRequests = await db.select().from(songRequests).limit(1);
    if (existingRequests.length === 0) {
      console.log('Seeding initial requests into SQL...');
      for (const r of INITIAL_REQUESTS) {
        await db.insert(songRequests).values({
          id: r.id,
          songTitle: r.songTitle,
          artist: r.artist || null,
          webLink: r.webLink || null,
          notes: r.notes || null,
          requestedByUserId: r.requestedByUserId || null,
          requestedByUsername: r.requestedByUsername,
          createdAt: r.createdAt,
          status: r.status,
        });
      }
    }

    const audioDir = path.resolve(process.cwd(), 'uploads/audio');
    if (!fs.existsSync(audioDir)) {
      fs.mkdirSync(audioDir, { recursive: true });
    }

    const existingSongs = await db.select().from(songs).limit(1);
    if (existingSongs.length === 0) {
      console.log('Generating seed audio files and populating songs...');
      const starterTracks = [
        {
          id: 'song-seed-lofi-1',
          title: 'Late Night Study Desk',
          artist: 'Lofi Records',
          album: 'Midnight Study Sessions',
          genre: 'Lo-Fi',
          tags: ['lo-fi', 'study', 'focus'],
          typeMood: 'Instrumental',
          duration: 180,
          filename: 'seed_lofi.wav',
          type: 'lofi' as const,
          freq: 261.63,
          coverUrl: 'https://images.unsplash.com/photo-1518495973542-4542c06a5843?w=500&auto=format&fit=crop&q=80',
        },
        {
          id: 'song-seed-ambient-2',
          title: 'Crystal Waters Relaxation',
          artist: 'Ambient Academy',
          album: 'Quiet Prep',
          genre: 'Ambient',
          tags: ['ambient', 'peaceful', 'calm'],
          typeMood: 'Atmospheric',
          duration: 210,
          filename: 'seed_ambient.wav',
          type: 'ambient' as const,
          freq: 220.0,
          coverUrl: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=500&auto=format&fit=crop&q=80',
        },
        {
          id: 'song-seed-synth-3',
          title: 'Synthwave Prism Flow',
          artist: 'Cyber Study Club',
          album: 'Neon Focus',
          genre: 'Synthwave',
          tags: ['synthwave', 'coding', 'energy'],
          typeMood: 'Electronic',
          duration: 195,
          filename: 'seed_synthwave.wav',
          type: 'synthwave' as const,
          freq: 293.66,
          coverUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&auto=format&fit=crop&q=80',
        },
        {
          id: 'song-seed-acoustic-4',
          title: 'Acoustic Classroom Calm',
          artist: 'Gentle Notes',
          album: 'Library Chimes',
          genre: 'Acoustic',
          tags: ['acoustic', 'guitar', 'reading'],
          typeMood: 'Calm',
          duration: 165,
          filename: 'seed_acoustic.wav',
          type: 'acoustic' as const,
          freq: 329.63,
          coverUrl: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=500&auto=format&fit=crop&q=80',
        },
      ];

      for (const track of starterTracks) {
        const filePath = path.join(audioDir, track.filename);
        if (!fs.existsSync(filePath)) {
          fs.writeFileSync(filePath, generateWavBuffer(20, track.freq, track.type));
        }

        await db.insert(songs).values({
          id: track.id,
          title: track.title,
          artist: track.artist,
          album: track.album,
          genre: track.genre,
          tags: track.tags,
          typeMood: track.typeMood,
          duration: track.duration,
          audioUrl: `/api/media/audio/${track.filename}`,
          coverUrl: track.coverUrl,
          addedAt: new Date().toISOString(),
          plays: 0,
          featured: true,
          description: 'Official school-safe track.',
        });
      }
    }
    console.log('Database seeding check complete.');
  } catch (err) {
    console.warn('Database seeding notice (using localStore fallback):', err);
  }
}
