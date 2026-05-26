import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getServerSupabaseClient() {
  const supabaseUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL.');
  }

  if (!serviceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY in .env.local.');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

export async function GET() {
  try {
    const supabase = getServerSupabaseClient();

    const [trucksResult, shipmentsResult, companiesResult] = await Promise.all([
      supabase
        .from('trucks')
        .select('*')
        .order('truck_number', { ascending: true }),

      supabase
        .from('shipments')
        .select('*')
        .order('created_at', { ascending: false }),

      supabase
        .from('companies')
        .select('*')
        .order('name', { ascending: true }),
    ]);

    if (trucksResult.error) {
      throw trucksResult.error;
    }

    if (shipmentsResult.error) {
      throw shipmentsResult.error;
    }

    if (companiesResult.error) {
      throw companiesResult.error;
    }

    return NextResponse.json({
      trucks: trucksResult.data || [],
      shipments: shipmentsResult.data || [],
      companies: companiesResult.data || [],
    });
  } catch (error) {
    console.error('Error loading routing planner data:', error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not load routing planner data.',
      },
      { status: 500 }
    );
  }
}