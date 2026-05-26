import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

interface ShipmentRow {
  id: string;
  work_order_id: string | null;
  work_order_number: string | null;

  pickup_company_name: string | null;
  pickup_address: string | null;
  pickup_city: string | null;
  pickup_postal_code: string | null;
  pickup_contact_name: string | null;
  pickup_contact_phone: string | null;

  delivery_company_name: string | null;
  delivery_address: string | null;
  delivery_city: string | null;
  delivery_postal_code: string | null;
  delivery_contact_name: string | null;
  delivery_contact_phone: string | null;

  delivery_latitude: number | null;
  delivery_longitude: number | null;
  delivery_geocoded_at: string | null;

  status: string | null;
  assigned_truck_id: string | null;
  dispatch_task_type: string | null;
}

interface WorkOrderRow {
  id: string;
  work_order_number: string | null;

  delivery_company_name: string | null;
  delivery_address: string | null;
  delivery_city: string | null;
  delivery_postal_code: string | null;
  delivery_contact_name: string | null;
  delivery_contact_phone: string | null;
}

interface CompanyRow {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  latitude: number | null;
  longitude: number | null;
  geocoded_at: string | null;
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

interface GeocodeLogItem {
  shipmentId: string;
  label: string;
  address: string;
  status: 'success' | 'error' | 'skipped';
  message: string;
}

interface PreparedShipment {
  shipment: ShipmentRow;
  address: string;
  source:
    | 'shipment_delivery'
    | 'work_order_delivery'
    | 'delivery_company'
    | 'pickup_company';
  copiedFields: Partial<ShipmentRow>;
  companyGps?: {
    latitude: number;
    longitude: number;
  } | null;
}

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

export async function POST() {
  const logs: GeocodeLogItem[] = [];

  try {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            'Missing GOOGLE_MAPS_API_KEY in .env.local. Add it, then restart npm run dev.',
          logs,
        },
        { status: 500 }
      );
    }

    const supabase = getServerSupabaseClient();

    const shipmentsResult = await supabase
      .from('shipments')
      .select(
        `
        id,
        work_order_id,
        work_order_number,

        pickup_company_name,
        pickup_address,
        pickup_city,
        pickup_postal_code,
        pickup_contact_name,
        pickup_contact_phone,

        delivery_company_name,
        delivery_address,
        delivery_city,
        delivery_postal_code,
        delivery_contact_name,
        delivery_contact_phone,

        delivery_latitude,
        delivery_longitude,
        delivery_geocoded_at,

        status,
        assigned_truck_id,
        dispatch_task_type
      `
      )
      .neq('status', 'delivered')
      .not('assigned_truck_id', 'is', null)
      .or('dispatch_task_type.is.null,dispatch_task_type.neq.board_stop')
      .order('created_at', { ascending: false });

    if (shipmentsResult.error) {
      throw shipmentsResult.error;
    }

    const activeShipments = (shipmentsResult.data || []) as ShipmentRow[];

    const workOrderIds = Array.from(
      new Set(
        activeShipments
          .map((shipment) => shipment.work_order_id)
          .filter(Boolean) as string[]
      )
    );

    const workOrderNumbers = Array.from(
      new Set(
        activeShipments
          .map((shipment) => shipment.work_order_number)
          .filter(Boolean) as string[]
      )
    );

    const companyNames = Array.from(
      new Set(
        activeShipments
          .flatMap((shipment) => [
            shipment.delivery_company_name,
            shipment.pickup_company_name,
          ])
          .filter(Boolean)
          .map((name) => normalizeName(name as string))
      )
    );

    const workOrdersById = new Map<string, WorkOrderRow>();
    const workOrdersByNumber = new Map<string, WorkOrderRow>();
    const companiesByName = new Map<string, CompanyRow>();

    if (workOrderIds.length > 0) {
      const workOrdersByIdResult = await supabase
        .from('work_orders')
        .select(
          `
          id,
          work_order_number,
          delivery_company_name,
          delivery_address,
          delivery_city,
          delivery_postal_code,
          delivery_contact_name,
          delivery_contact_phone
        `
        )
        .in('id', workOrderIds);

      if (workOrdersByIdResult.error) {
        throw workOrdersByIdResult.error;
      }

      for (const workOrder of (workOrdersByIdResult.data || []) as WorkOrderRow[]) {
        workOrdersById.set(workOrder.id, workOrder);

        if (workOrder.work_order_number) {
          workOrdersByNumber.set(workOrder.work_order_number, workOrder);
        }
      }
    }

    if (workOrderNumbers.length > 0) {
      const missingWorkOrderNumbers = workOrderNumbers.filter(
        (workOrderNumber) => !workOrdersByNumber.has(workOrderNumber)
      );

      if (missingWorkOrderNumbers.length > 0) {
        const workOrdersByNumberResult = await supabase
          .from('work_orders')
          .select(
            `
            id,
            work_order_number,
            delivery_company_name,
            delivery_address,
            delivery_city,
            delivery_postal_code,
            delivery_contact_name,
            delivery_contact_phone
          `
          )
          .in('work_order_number', missingWorkOrderNumbers);

        if (workOrdersByNumberResult.error) {
          throw workOrdersByNumberResult.error;
        }

        for (const workOrder of (workOrdersByNumberResult.data || []) as WorkOrderRow[]) {
          workOrdersById.set(workOrder.id, workOrder);

          if (workOrder.work_order_number) {
            workOrdersByNumber.set(workOrder.work_order_number, workOrder);
          }
        }
      }
    }

    if (companyNames.length > 0) {
      const companiesResult = await supabase
        .from('companies')
        .select(
          `
          id,
          name,
          address,
          city,
          postal_code,
          contact_name,
          contact_phone,
          latitude,
          longitude,
          geocoded_at
        `
        );

      if (companiesResult.error) {
        throw companiesResult.error;
      }

      for (const company of (companiesResult.data || []) as CompanyRow[]) {
        companiesByName.set(normalizeName(company.name), company);
      }
    }

    const preparedShipments: PreparedShipment[] = [];

    for (const shipment of activeShipments) {
      if (hasShipmentGps(shipment)) {
        continue;
      }

      const preparedShipment = prepareShipmentForGeocoding({
        shipment,
        workOrdersById,
        workOrdersByNumber,
        companiesByName,
      });

      if (!preparedShipment) {
        logs.push({
          shipmentId: shipment.id,
          label: getShipmentLabel(shipment),
          address: '',
          status: 'skipped',
          message:
            'No delivery address was found on shipment, work order, delivery company, or pickup company.',
        });

        continue;
      }

      preparedShipments.push(preparedShipment);
    }

    let successCount = 0;
    let failCount = 0;
    let skippedCount = logs.filter((log) => log.status === 'skipped').length;

    for (const prepared of preparedShipments) {
      const { shipment, address, source, copiedFields, companyGps } = prepared;
      const label = getShipmentLabel(shipment);
      const geocodedAt = new Date().toISOString();

      try {
        const fieldsToCopy = {
          ...copiedFields,
          updated_at: geocodedAt,
        };

        if (Object.keys(copiedFields).length > 0) {
          const copyResult = await supabase
            .from('shipments')
            .update(fieldsToCopy)
            .eq('id', shipment.id);

          if (copyResult.error) {
            failCount++;

            logs.push({
              shipmentId: shipment.id,
              label,
              address,
              status: 'error',
              message: `Could not copy address fields from ${source}: ${copyResult.error.message}`,
            });

            continue;
          }

          logs.push({
            shipmentId: shipment.id,
            label,
            address,
            status: 'success',
            message: `Copied address fields from ${formatSource(source)}.`,
          });
        }

        if (companyGps) {
          const gpsUpdateResult = await supabase
            .from('shipments')
            .update({
              delivery_latitude: companyGps.latitude,
              delivery_longitude: companyGps.longitude,
              delivery_geocoded_at: geocodedAt,
              updated_at: geocodedAt,
            })
            .eq('id', shipment.id);

          if (gpsUpdateResult.error) {
            failCount++;

            logs.push({
              shipmentId: shipment.id,
              label,
              address,
              status: 'error',
              message: `Could not save company GPS: ${gpsUpdateResult.error.message}`,
            });

            continue;
          }

          successCount++;

          logs.push({
            shipmentId: shipment.id,
            label,
            address,
            status: 'success',
            message: `Saved existing company GPS from ${formatSource(source)}.`,
          });

          continue;
        }

        const searchParams = new URLSearchParams({
          address,
          key: apiKey,
        });

        const googleResponse = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?${searchParams.toString()}`,
          {
            method: 'GET',
            cache: 'no-store',
          }
        );

        if (!googleResponse.ok) {
          failCount++;

          logs.push({
            shipmentId: shipment.id,
            label,
            address,
            status: 'error',
            message: `Google request failed with status ${googleResponse.status}.`,
          });

          continue;
        }

        const googleData =
          (await googleResponse.json()) as GoogleGeocodeResponse;

        if (googleData.status !== 'OK' || googleData.results.length === 0) {
          failCount++;

          logs.push({
            shipmentId: shipment.id,
            label,
            address,
            status: 'error',
            message:
              googleData.error_message ||
              `Google could not geocode this address. Status: ${googleData.status}`,
          });

          continue;
        }

        const bestResult = googleData.results[0];

        const updateGpsResult = await supabase
          .from('shipments')
          .update({
            delivery_latitude: bestResult.geometry.location.lat,
            delivery_longitude: bestResult.geometry.location.lng,
            delivery_geocoded_at: geocodedAt,
            updated_at: geocodedAt,
          })
          .eq('id', shipment.id);

        if (updateGpsResult.error) {
          failCount++;

          logs.push({
            shipmentId: shipment.id,
            label,
            address,
            status: 'error',
            message: `Supabase GPS update failed: ${updateGpsResult.error.message}`,
          });

          continue;
        }

        successCount++;

        logs.push({
          shipmentId: shipment.id,
          label,
          address,
          status: 'success',
          message: `Saved Google GPS ${bestResult.geometry.location.lat.toFixed(
            6
          )}, ${bestResult.geometry.location.lng.toFixed(6)} from ${formatSource(source)}.`,
        });

        await wait(250);
      } catch (error) {
        failCount++;

        logs.push({
          shipmentId: shipment.id,
          label,
          address,
          status: 'error',
          message:
            error instanceof Error
              ? error.message
              : 'Unexpected error while geocoding.',
        });
      }
    }

    return NextResponse.json({
      successCount,
      failCount,
      skippedCount,
      totalChecked: activeShipments.length,
      totalNeedingGps: preparedShipments.length,
      logs,
    });
  } catch (error) {
    console.error('Error geocoding shipment deliveries:', error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Could not geocode shipment deliveries.',
        logs,
      },
      { status: 500 }
    );
  }
}

function prepareShipmentForGeocoding({
  shipment,
  workOrdersById,
  workOrdersByNumber,
  companiesByName,
}: {
  shipment: ShipmentRow;
  workOrdersById: Map<string, WorkOrderRow>;
  workOrdersByNumber: Map<string, WorkOrderRow>;
  companiesByName: Map<string, CompanyRow>;
}): PreparedShipment | null {
  const shipmentDeliveryAddress = buildShipmentDeliveryAddress(shipment);

  if (shipmentDeliveryAddress) {
    return {
      shipment,
      address: shipmentDeliveryAddress,
      source: 'shipment_delivery',
      copiedFields: {},
      companyGps: null,
    };
  }

  const matchingWorkOrder = findMatchingWorkOrder(
    shipment,
    workOrdersById,
    workOrdersByNumber
  );

  if (matchingWorkOrder && buildWorkOrderDeliveryAddress(matchingWorkOrder)) {
    return {
      shipment,
      address: buildWorkOrderDeliveryAddress(matchingWorkOrder),
      source: 'work_order_delivery',
      copiedFields: {
        delivery_company_name:
          shipment.delivery_company_name ||
          matchingWorkOrder.delivery_company_name,
        delivery_address:
          shipment.delivery_address || matchingWorkOrder.delivery_address,
        delivery_city:
          shipment.delivery_city || matchingWorkOrder.delivery_city,
        delivery_postal_code:
          shipment.delivery_postal_code ||
          matchingWorkOrder.delivery_postal_code,
        delivery_contact_name:
          shipment.delivery_contact_name ||
          matchingWorkOrder.delivery_contact_name,
        delivery_contact_phone:
          shipment.delivery_contact_phone ||
          matchingWorkOrder.delivery_contact_phone,
      },
      companyGps: null,
    };
  }

  const deliveryCompany = shipment.delivery_company_name
    ? companiesByName.get(normalizeName(shipment.delivery_company_name))
    : null;

  if (deliveryCompany && buildCompanyAddress(deliveryCompany)) {
    return {
      shipment,
      address: buildCompanyAddress(deliveryCompany),
      source: 'delivery_company',
      copiedFields: {
        delivery_company_name:
          shipment.delivery_company_name || deliveryCompany.name,
        delivery_address:
          shipment.delivery_address || deliveryCompany.address,
        delivery_city:
          shipment.delivery_city || deliveryCompany.city,
        delivery_postal_code:
          shipment.delivery_postal_code || deliveryCompany.postal_code,
        delivery_contact_name:
          shipment.delivery_contact_name || deliveryCompany.contact_name,
        delivery_contact_phone:
          shipment.delivery_contact_phone || deliveryCompany.contact_phone,
      },
      companyGps: hasCompanyGps(deliveryCompany)
        ? {
            latitude: Number(deliveryCompany.latitude),
            longitude: Number(deliveryCompany.longitude),
          }
        : null,
    };
  }

  const pickupCompany = shipment.pickup_company_name
    ? companiesByName.get(normalizeName(shipment.pickup_company_name))
    : null;

  if (pickupCompany && buildCompanyAddress(pickupCompany)) {
    return {
      shipment,
      address: buildCompanyAddress(pickupCompany),
      source: 'pickup_company',
      copiedFields: {
        delivery_company_name:
          shipment.delivery_company_name || pickupCompany.name,
        delivery_address:
          shipment.delivery_address || pickupCompany.address,
        delivery_city:
          shipment.delivery_city || pickupCompany.city,
        delivery_postal_code:
          shipment.delivery_postal_code || pickupCompany.postal_code,
        delivery_contact_name:
          shipment.delivery_contact_name || pickupCompany.contact_name,
        delivery_contact_phone:
          shipment.delivery_contact_phone || pickupCompany.contact_phone,
      },
      companyGps: hasCompanyGps(pickupCompany)
        ? {
            latitude: Number(pickupCompany.latitude),
            longitude: Number(pickupCompany.longitude),
          }
        : null,
    };
  }

  return null;
}

function findMatchingWorkOrder(
  shipment: ShipmentRow,
  workOrdersById: Map<string, WorkOrderRow>,
  workOrdersByNumber: Map<string, WorkOrderRow>
) {
  if (shipment.work_order_id && workOrdersById.has(shipment.work_order_id)) {
    return workOrdersById.get(shipment.work_order_id) || null;
  }

  if (
    shipment.work_order_number &&
    workOrdersByNumber.has(shipment.work_order_number)
  ) {
    return workOrdersByNumber.get(shipment.work_order_number) || null;
  }

  return null;
}

function hasShipmentGps(shipment: ShipmentRow) {
  return (
    shipment.delivery_latitude !== null &&
    shipment.delivery_latitude !== undefined &&
    shipment.delivery_longitude !== null &&
    shipment.delivery_longitude !== undefined &&
    !Number.isNaN(Number(shipment.delivery_latitude)) &&
    !Number.isNaN(Number(shipment.delivery_longitude))
  );
}

function hasCompanyGps(company: CompanyRow) {
  return (
    company.latitude !== null &&
    company.latitude !== undefined &&
    company.longitude !== null &&
    company.longitude !== undefined &&
    !Number.isNaN(Number(company.latitude)) &&
    !Number.isNaN(Number(company.longitude))
  );
}

function buildShipmentDeliveryAddress(shipment: ShipmentRow) {
  const parts = [
    shipment.delivery_address,
    shipment.delivery_city,
    shipment.delivery_postal_code,
  ].filter((part) => part && String(part).trim() !== '');

  return parts.join(', ');
}

function buildWorkOrderDeliveryAddress(workOrder: WorkOrderRow) {
  const parts = [
    workOrder.delivery_address,
    workOrder.delivery_city,
    workOrder.delivery_postal_code,
  ].filter((part) => part && String(part).trim() !== '');

  return parts.join(', ');
}

function buildCompanyAddress(company: CompanyRow) {
  const parts = [
    company.address,
    company.city,
    company.postal_code,
  ].filter((part) => part && String(part).trim() !== '');

  return parts.join(', ');
}

function getShipmentLabel(shipment: ShipmentRow) {
  return (
    shipment.pickup_company_name ||
    shipment.delivery_company_name ||
    shipment.work_order_number ||
    shipment.id
  );
}

function normalizeName(value?: string | null) {
  if (!value) {
    return '';
  }

  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function formatSource(source: PreparedShipment['source']) {
  if (source === 'shipment_delivery') {
    return 'shipment delivery address';
  }

  if (source === 'work_order_delivery') {
    return 'work order delivery address';
  }

  if (source === 'delivery_company') {
    return 'delivery company address';
  }

  return 'pickup company address fallback';
}

function wait(milliseconds: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}