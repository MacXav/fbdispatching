import { NextResponse } from 'next/server';

interface GeocodeRequestBody {
  address?: string;
}

interface GoogleAddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

interface GoogleGeocodeResult {
  formatted_address: string;
  geometry: {
    location: {
      lat: number;
      lng: number;
    };
  };
  address_components: GoogleAddressComponent[];
}

interface GoogleGeocodeResponse {
  status: string;
  error_message?: string;
  results: GoogleGeocodeResult[];
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

    const body = (await request.json()) as GeocodeRequestBody;
    const address = body.address?.trim();

    if (!address) {
      return NextResponse.json(
        {
          error: 'Address is required.',
        },
        { status: 400 }
      );
    }

    const searchParams = new URLSearchParams({
      address,
      key: apiKey,
    });

    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?${searchParams.toString()}`,
      {
        method: 'GET',
        cache: 'no-store',
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        {
          error: `Google Geocoding request failed with status ${response.status}.`,
        },
        { status: 500 }
      );
    }

    const data = (await response.json()) as GoogleGeocodeResponse;

    if (data.status !== 'OK' || data.results.length === 0) {
      return NextResponse.json(
        {
          error:
            data.error_message ||
            `Google could not geocode this address. Status: ${data.status}`,
          google_status: data.status,
        },
        { status: 400 }
      );
    }

    const bestResult = data.results[0];
    const countryComponent = bestResult.address_components.find((component) =>
      component.types.includes('country')
    );

    return NextResponse.json({
      latitude: bestResult.geometry.location.lat,
      longitude: bestResult.geometry.location.lng,
      formatted_address: bestResult.formatted_address,
      country: countryComponent?.long_name || null,
      country_code: countryComponent?.short_name || null,
    });
  } catch (error) {
    console.error('Error geocoding company:', error);

    return NextResponse.json(
      {
        error: 'Something went wrong while geocoding this company.',
      },
      { status: 500 }
    );
  }
}