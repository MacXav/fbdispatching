import { NextResponse } from 'next/server';

const HOME_OFFICE_ADDRESS = '146 Cushman Road, St. Catharines, ON, Canada';

interface GoogleRouteStop {
  shipmentId: string;
  label: string;
  latitude: number;
  longitude: number;
  routeBucket?: string;
  routeBucketLabel?: string;
  address?: string | null;
  city?: string | null;
}

interface GoogleTruckRouteRequest {
  stops: GoogleRouteStop[];
}

interface GoogleComputeRoutesResponse {
  routes?: {
    distanceMeters?: number;
    duration?: string;
    staticDuration?: string;
    optimizedIntermediateWaypointIndex?: number[];
    localizedValues?: {
      distance?: {
        text?: string;
      };
      duration?: {
        text?: string;
      };
      staticDuration?: {
        text?: string;
      };
    };
  }[];
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

interface CandidateRoute {
  route: NonNullable<GoogleComputeRoutesResponse['routes']>[number];
  orderedStops: GoogleRouteStop[];
  durationSeconds: number;
  distanceMeters: number;
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            'Missing GOOGLE_MAPS_API_KEY in .env.local. Add it, then restart npm run dev.',
        },
        { status: 500 }
      );
    }

    const body = (await request.json()) as GoogleTruckRouteRequest;
    const stops = Array.isArray(body.stops) ? body.stops : [];

    const validStops = stops.filter((stop) => {
      return (
        stop &&
        Number.isFinite(Number(stop.latitude)) &&
        Number.isFinite(Number(stop.longitude))
      );
    });

    if (validStops.length < 1) {
      return NextResponse.json(
        {
          error: 'At least one GPS-ready delivery stop is required to calculate a Google route.',
        },
        { status: 400 }
      );
    }

    if (validStops.length > 26) {
      return NextResponse.json(
        {
          error:
            'Google route calculation supports up to 26 delivery stops here because the home office is always used as the fixed start.',
        },
        { status: 400 }
      );
    }

    if (validStops.length === 1) {
      const singleStop = validStops[0];

      const googleResponse = await callGoogleRoute({
        apiKey,
        destination: singleStop,
        intermediateStops: [],
      });

      const data = googleResponse.data;

      if (!googleResponse.ok) {
        return NextResponse.json(
          {
            error:
              data.error?.message ||
              'Google Routes API could not calculate this truck route.',
          },
          { status: googleResponse.status }
        );
      }

      const route = data.routes?.[0];

      if (!route) {
        return NextResponse.json(
          {
            error: 'Google Routes API returned no route for this stop.',
          },
          { status: 404 }
        );
      }

      return NextResponse.json(buildRouteResponse(route, [singleStop]));
    }

    let bestCandidate: CandidateRoute | null = null;

    for (const possibleDestination of validStops) {
      const intermediateStops = validStops.filter(
        (stop) => stop.shipmentId !== possibleDestination.shipmentId
      );

      const googleResponse = await callGoogleRoute({
        apiKey,
        destination: possibleDestination,
        intermediateStops,
      });

      const data = googleResponse.data;

      if (!googleResponse.ok) {
        console.error('Google route candidate failed:', data.error?.message);
        continue;
      }

      const route = data.routes?.[0];

      if (!route) {
        continue;
      }

      const optimizedIndexes = route.optimizedIntermediateWaypointIndex || [];

      const orderedIntermediateStops =
        optimizedIndexes.length > 0
          ? optimizedIndexes
              .map((index) => intermediateStops[index])
              .filter(Boolean)
          : intermediateStops;

      const orderedStops = [...orderedIntermediateStops, possibleDestination];

      const durationSeconds = parseGoogleDurationSeconds(
        route.duration || route.staticDuration || ''
      );

      const distanceMeters = route.distanceMeters || 0;

      const candidate: CandidateRoute = {
        route,
        orderedStops,
        durationSeconds,
        distanceMeters,
      };

      if (
        !bestCandidate ||
        candidate.durationSeconds < bestCandidate.durationSeconds ||
        (candidate.durationSeconds === bestCandidate.durationSeconds &&
          candidate.distanceMeters < bestCandidate.distanceMeters)
      ) {
        bestCandidate = candidate;
      }
    }

    if (!bestCandidate) {
      return NextResponse.json(
        {
          error: 'Google Routes API could not calculate any valid route option.',
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      buildRouteResponse(bestCandidate.route, bestCandidate.orderedStops)
    );
  } catch (error) {
    console.error('Google truck route error:', error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not calculate Google truck route.',
      },
      { status: 500 }
    );
  }
}

async function callGoogleRoute({
  apiKey,
  destination,
  intermediateStops,
}: {
  apiKey: string;
  destination: GoogleRouteStop;
  intermediateStops: GoogleRouteStop[];
}) {
  const googleResponse = await fetch(
    'https://routes.googleapis.com/directions/v2:computeRoutes',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask':
          'routes.distanceMeters,routes.duration,routes.staticDuration,routes.optimizedIntermediateWaypointIndex,routes.localizedValues',
      },
      body: JSON.stringify({
        origin: {
          address: HOME_OFFICE_ADDRESS,
        },
        destination: {
          location: {
            latLng: {
              latitude: Number(destination.latitude),
              longitude: Number(destination.longitude),
            },
          },
        },
        intermediates: intermediateStops.map((stop) => ({
          location: {
            latLng: {
              latitude: Number(stop.latitude),
              longitude: Number(stop.longitude),
            },
          },
        })),
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE',
        optimizeWaypointOrder: intermediateStops.length > 1,
        units: 'IMPERIAL',
        languageCode: 'en',
        regionCode: 'CA',
      }),
    }
  );

  const data = (await googleResponse.json()) as GoogleComputeRoutesResponse;

  return {
    ok: googleResponse.ok,
    status: googleResponse.status,
    data,
  };
}

function buildRouteResponse(
  route: NonNullable<GoogleComputeRoutesResponse['routes']>[number],
  orderedStops: GoogleRouteStop[]
) {
  return {
    originAddress: HOME_OFFICE_ADDRESS,
    distanceMeters: route.distanceMeters || 0,
    distanceKm: Math.round(((route.distanceMeters || 0) / 1000) * 10) / 10,
    distanceText:
      route.localizedValues?.distance?.text ||
      `${Math.round(((route.distanceMeters || 0) / 1000) * 10) / 10} km`,
    duration: route.duration || '',
    durationText:
      route.localizedValues?.duration?.text ||
      formatGoogleDuration(route.duration || route.staticDuration || ''),
    staticDuration: route.staticDuration || '',
    staticDurationText:
      route.localizedValues?.staticDuration?.text ||
      formatGoogleDuration(route.staticDuration || ''),
    orderedStops,
  };
}

function parseGoogleDurationSeconds(value: string) {
  if (!value || !value.endsWith('s')) {
    return Number.POSITIVE_INFINITY;
  }

  const seconds = Number(value.replace('s', ''));

  if (!Number.isFinite(seconds)) {
    return Number.POSITIVE_INFINITY;
  }

  return seconds;
}

function formatGoogleDuration(value: string) {
  if (!value || !value.endsWith('s')) {
    return 'Unknown';
  }

  const seconds = Number(value.replace('s', ''));

  if (!Number.isFinite(seconds)) {
    return 'Unknown';
  }

  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) {
    return `${minutes} min`;
  }

  if (minutes === 0) {
    return `${hours} hr`;
  }

  return `${hours} hr ${minutes} min`;
}